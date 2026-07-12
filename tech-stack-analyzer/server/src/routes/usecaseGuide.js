import express from 'express';
import { query } from '../db/pool.js';
import { fetchArticlesByTag } from '../services/qiitaArticles.js';

const router = express.Router();

const MAX_MATCHED_REPOS_PER_SIDE = 3;

// component_name(例: "React/TypeScript", "PostgreSQL (Supabase)", "Supabase Auth + RLS")を
// repositories.primary_language / qiita_articles.tag と突き合わせ可能な単語トークンへ分解する。
// 括弧書きの補足(Supabase等)は突き合わせ対象から除外し、"/"・"+"区切りの並記のみ分割する。
//
// 既知の制約: 収集対象言語(Python/TypeScript/Ruby/Go)やdependencies.ecosystemの語彙には
// Vercel/Docker/Kubernetes/Zapier/UiPath等のインフラ・SaaSツール名は存在しないため、
// これらのコンポーネントは実データ0件(該当リポジトリ・記事なし)になるのが正常な結果である。
export function extractTokens(componentName) {
  const withoutParens = componentName.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  return withoutParens
    .split(/[/+]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

async function fetchMatchedRepos(tokens) {
  if (!tokens.length) return [];
  const params = tokens.map((t) => t.toLowerCase());
  const placeholders = params.map((_, i) => `$${i + 1}`).join(',');
  const sql = `
    SELECT r.id, r.owner, r.name, r.primary_language, r.stars, rs.total_score
    FROM risk_scores rs
    JOIN repositories r ON r.id = rs.repo_id
      AND rs.calculated_at = (SELECT MAX(calculated_at) FROM risk_scores WHERE repo_id = r.id)
    WHERE LOWER(r.primary_language) IN (${placeholders})
  `;
  return query(sql, params);
}

// 該当リポジトリをリスク上位/下位に分けて返す。件数が少ない場合に上位と下位で同じリポジトリが
// 重複表示されないよう、上位に含めたIDは下位の候補から除外する。
function splitTopBottom(rows) {
  const byRiskDesc = [...rows].sort((a, b) => Number(b.total_score) - Number(a.total_score));
  const top = byRiskDesc.slice(0, MAX_MATCHED_REPOS_PER_SIDE);
  const topIds = new Set(top.map((r) => r.id));
  const bottom = [...rows]
    .sort((a, b) => Number(a.total_score) - Number(b.total_score))
    .filter((r) => !topIds.has(r.id))
    .slice(0, MAX_MATCHED_REPOS_PER_SIDE);
  return { top, bottom };
}

async function fetchKnownLanguages() {
  const rows = await query('SELECT DISTINCT primary_language FROM repositories WHERE primary_language IS NOT NULL');
  return rows.map((r) => r.primary_language);
}

// パターン全体として「実際に収集済みの言語と一致するもの」を1回だけ算出する。下流(プランナー/
// 言語関係グラフ/リスクランキング/ダッシュボード)がこの値をそのままハイライト対象言語として使い、
// 突き合わせロジックを再実装しなくて済むようにする。
function matchLanguages(components, knownLanguages) {
  const knownByLower = new Map(knownLanguages.map((l) => [l.toLowerCase(), l]));
  const matched = new Set();
  for (const component of components) {
    for (const token of extractTokens(component.component_name)) {
      const actual = knownByLower.get(token.toLowerCase());
      if (actual) matched.add(actual);
    }
  }
  return [...matched];
}

async function attachRealData(component) {
  const tokens = extractTokens(component.component_name);
  const [matchedRepos, articlesByTag] = await Promise.all([
    fetchMatchedRepos(tokens),
    fetchArticlesByTag(tokens),
  ]);
  const { top, bottom } = splitTopBottom(matchedRepos);
  const qiitaArticles = tokens
    .flatMap((t) => articlesByTag[t.toLowerCase()] || [])
    .slice(0, MAX_MATCHED_REPOS_PER_SIDE);
  return { ...component, topRiskRepos: top, bottomRiskRepos: bottom, qiitaArticles };
}

router.get('/usecase-categories', async (req, res, next) => {
  try {
    const categories = await query(
      'SELECT id, slug, name, description, display_order FROM use_case_categories ORDER BY display_order'
    );
    res.json(categories);
  } catch (err) {
    next(err);
  }
});

router.get('/usecase-categories/:slug/patterns', async (req, res, next) => {
  try {
    const categories = await query('SELECT id, slug, name FROM use_case_categories WHERE slug = $1', [
      req.params.slug,
    ]);
    if (!categories.length) return res.status(404).json({ error: 'category not found' });
    const category = categories[0];

    const patterns = await query(
      `SELECT id, slug, name, tier, summary, risk_notes, display_order
       FROM architecture_patterns WHERE category_id = $1 ORDER BY display_order`,
      [category.id]
    );
    if (!patterns.length) return res.json({ category, patterns: [] });

    const components = await query(
      `SELECT pattern_id, id, layer, component_name, description FROM architecture_pattern_components
       WHERE pattern_id IN (${patterns.map((_, i) => `$${i + 1}`).join(',')}) ORDER BY id`,
      patterns.map((p) => p.id)
    );
    const componentsByPattern = {};
    for (const c of components) {
      if (!componentsByPattern[c.pattern_id]) componentsByPattern[c.pattern_id] = [];
      componentsByPattern[c.pattern_id].push(c);
    }

    res.json({
      category,
      patterns: patterns.map((p) => ({
        ...p,
        components: componentsByPattern[p.id] || [],
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/architecture-patterns/:slug', async (req, res, next) => {
  try {
    const patterns = await query(
      `SELECT id, category_id, slug, name, tier, summary, risk_notes, display_order
       FROM architecture_patterns WHERE slug = $1`,
      [req.params.slug]
    );
    if (!patterns.length) return res.status(404).json({ error: 'pattern not found' });
    const pattern = patterns[0];

    const categories = await query('SELECT id, slug, name FROM use_case_categories WHERE id = $1', [
      pattern.category_id,
    ]);

    const components = await query(
      `SELECT id, layer, component_name, description FROM architecture_pattern_components
       WHERE pattern_id = $1 ORDER BY id`,
      [pattern.id]
    );
    const [componentsWithData, knownLanguages] = await Promise.all([
      Promise.all(components.map(attachRealData)),
      fetchKnownLanguages(),
    ]);

    res.json({
      id: pattern.id,
      slug: pattern.slug,
      name: pattern.name,
      tier: pattern.tier,
      summary: pattern.summary,
      risk_notes: pattern.risk_notes,
      category: categories[0] || null,
      components: componentsWithData,
      matchedLanguages: matchLanguages(components, knownLanguages),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
