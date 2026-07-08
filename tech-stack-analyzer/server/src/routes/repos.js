import express from 'express';
import { query } from '../db/pool.js';

const router = express.Router();

router.get('/repos', async (req, res, next) => {
  try {
    const { language, limit = 100 } = req.query;
    const params = [];
    let sql = `SELECT id, owner, name, primary_language, stars, last_pushed_at, fetched_at
               FROM repositories`;
    if (language) {
      params.push(language);
      sql += ` WHERE primary_language = $${params.length}`;
    }
    sql += ` ORDER BY stars DESC LIMIT $${params.length + 1}`;
    params.push(Number(limit));
    res.json(await query(sql, params));
  } catch (err) {
    next(err);
  }
});

router.get('/repos/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [repo] = await query('SELECT * FROM repositories WHERE id = $1', [id]);
    if (!repo) return res.status(404).json({ error: 'Not found' });

    const [languages, issueStats, dependencies, riskScores] = await Promise.all([
      query('SELECT language, byte_size FROM repo_languages WHERE repo_id = $1', [id]),
      query('SELECT label, state, count, period_start, period_end FROM issue_stats WHERE repo_id = $1 ORDER BY fetched_at DESC', [id]),
      query('SELECT package_name, ecosystem, version, is_deprecated, deprecation_checked FROM dependencies WHERE repo_id = $1', [id]),
      query('SELECT bug_ratio_score, maintenance_score, churn_score, total_score, calculated_at FROM risk_scores WHERE repo_id = $1 ORDER BY calculated_at DESC LIMIT 1', [id]),
    ]);

    res.json({ ...repo, languages, issueStats, dependencies, riskScore: riskScores[0] || null });
  } catch (err) {
    next(err);
  }
});

export default router;
