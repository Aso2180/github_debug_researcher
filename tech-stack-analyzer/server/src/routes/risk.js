import express from 'express';
import { query } from '../db/pool.js';
import { fetchArticlesByTag } from '../services/qiitaArticles.js';

const router = express.Router();

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
    const articlesByLanguage = await fetchArticlesByTag(languages);

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
