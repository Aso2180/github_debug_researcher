import express from 'express';
import { query } from '../db/pool.js';

const router = express.Router();

// dependencies.ecosystem は SBOM の purl(pkg:<ecosystem>/...)由来の文字列で、primary_language
// の語彙とは表記が異なる(例: npm, pypi, gem, golang)。npmはJS/TSのどちらのパッケージも
// 単一エコシステムに集約されるため一意に決められず、実際のノード集合(primary_language)に
// 存在する方を候補順に採用する。
const ECOSYSTEM_LANGUAGE_CANDIDATES = {
  pypi: ['Python'],
  npm: ['TypeScript', 'JavaScript'],
  gem: ['Ruby'],
  golang: ['Go'],
  go: ['Go'],
  cargo: ['Rust'],
  maven: ['Java', 'Kotlin'],
  nuget: ['C#'],
  composer: ['PHP'],
};

router.get('/language-graph', async (req, res, next) => {
  try {
    // ノード: primary_languageごとの集計。平均リスクスコアは9章/14.1の教訓通り
    // MAX(calculated_at)相関サブクエリで最新行のみを対象にする。
    const nodeRows = await query(`
      SELECT r.primary_language AS language, COUNT(*) AS repo_count, AVG(rs.total_score) AS avg_risk
      FROM repositories r
      JOIN risk_scores rs ON rs.repo_id = r.id
        AND rs.calculated_at = (SELECT MAX(calculated_at) FROM risk_scores WHERE repo_id = r.id)
      WHERE r.primary_language IS NOT NULL
      GROUP BY r.primary_language
    `);
    const nodes = nodeRows.map((n) => ({
      language: n.language,
      repoCount: Number(n.repo_count),
      avgRisk: Number(n.avg_risk),
    }));
    const languageByLower = new Map(nodes.map((n) => [n.language.toLowerCase(), n.language]));

    function resolveEcosystemLanguage(ecosystem) {
      const candidates = ECOSYSTEM_LANGUAGE_CANDIDATES[ecosystem?.toLowerCase()] || [];
      for (const candidate of candidates) {
        const actual = languageByLower.get(candidate.toLowerCase());
        if (actual) return actual;
      }
      return null;
    }

    // エッジ: 依存関係テーブルの言語間の共起件数。dependenciesは収集のたびに洗い替え
    // (dependency_collector.pyが再収集前に既存行を削除)されるため、risk_scoresと違い
    // 履歴が積み上がる心配は無く、素朴なJOIN+GROUP BYでよい。
    const depRows = await query(`
      SELECT r.primary_language AS language, d.ecosystem AS ecosystem, COUNT(*) AS cnt
      FROM dependencies d
      JOIN repositories r ON r.id = d.repo_id
      WHERE r.primary_language IS NOT NULL
      GROUP BY r.primary_language, d.ecosystem
    `);

    const edgeWeights = new Map();
    for (const row of depRows) {
      const source = row.language;
      const target = resolveEcosystemLanguage(row.ecosystem);
      if (!target || target.toLowerCase() === source.toLowerCase()) continue; // 同一言語内は対象外
      const key = [source, target].sort((a, b) => a.localeCompare(b)).join('::');
      edgeWeights.set(key, (edgeWeights.get(key) || 0) + Number(row.cnt));
    }

    const edges = [...edgeWeights.entries()]
      .map(([key, weight]) => {
        const [source, target] = key.split('::');
        return { source, target, weight };
      })
      .sort((a, b) => b.weight - a.weight);

    res.json({ nodes, edges });
  } catch (err) {
    next(err);
  }
});

export default router;
