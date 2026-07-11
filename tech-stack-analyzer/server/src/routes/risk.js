import express from 'express';
import { query } from '../db/pool.js';

const router = express.Router();

const MAX_ARTICLES_PER_LANGUAGE = 3;

// primary_language と qiita_articles.tag を突き合わせる。タスク1-8(14.2 #8)で修正済みの
// matchedTags と同じ考え方で、大文字小文字の表記ゆれによるサイレントな0件ヒットを防ぐため
// 両辺をlower()で正規化して比較する。
async function fetchArticlesByLanguage(languages) {
  if (!languages.length) return {};
  const params = languages.map((l) => l.toLowerCase());
  const placeholders = params.map((_, i) => `$${i + 1}`).join(',');
  const sql = `SELECT tag, title, url, likes_count, article_created_at
               FROM qiita_articles
               WHERE LOWER(tag) IN (${placeholders})
               ORDER BY likes_count DESC`;
  const articles = await query(sql, params);
  const byLanguage = {};
  for (const article of articles) {
    const key = article.tag.toLowerCase();
    if (!byLanguage[key]) byLanguage[key] = [];
    if (byLanguage[key].length < MAX_ARTICLES_PER_LANGUAGE) byLanguage[key].push(article);
  }
  return byLanguage;
}

router.get('/risk-ranking', async (req, res, next) => {
  try {
    const { language, limit = 20 } = req.query;
    const params = [];
    let sql = `
      SELECT r.id, r.owner, r.name, r.primary_language, r.stars,
             rs.total_score, rs.bug_ratio_score, rs.maintenance_score, rs.churn_score
      FROM risk_scores rs
      JOIN repositories r ON r.id = rs.repo_id
        AND rs.calculated_at = (SELECT MAX(calculated_at) FROM risk_scores WHERE repo_id = r.id)`;
    if (language) {
      params.push(language);
      sql += ` WHERE r.primary_language = $${params.length}`;
    }
    sql += ` ORDER BY rs.total_score DESC LIMIT $${params.length + 1}`;
    params.push(Number(limit));
    const rows = await query(sql, params);

    const languages = [...new Set(rows.map((r) => r.primary_language).filter(Boolean))];
    const articlesByLanguage = await fetchArticlesByLanguage(languages);

    res.json(
      rows.map((r) => ({
        ...r,
        qiitaArticles: (r.primary_language && articlesByLanguage[r.primary_language.toLowerCase()]) || [],
      }))
    );
  } catch (err) {
    next(err);
  }
});

export default router;
