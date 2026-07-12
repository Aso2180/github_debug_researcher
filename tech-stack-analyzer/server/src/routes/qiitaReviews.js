import express from 'express';
import { query } from '../db/pool.js';

const router = express.Router();

router.get('/qiita-reviews', async (req, res, next) => {
  try {
    const rows = await query(`
      SELECT r.id, r.tag, r.summary, r.trend_direction, r.data_points_count, r.created_at
      FROM qiita_ai_reviews r
      WHERE r.created_at = (SELECT MAX(created_at) FROM qiita_ai_reviews WHERE tag = r.tag)
      ORDER BY r.tag
    `);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/qiita-reviews/:tag', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT id, tag, summary, trend_direction, data_points_count, previous_review_id, created_at
       FROM qiita_ai_reviews WHERE tag = $1 ORDER BY created_at ASC`,
      [req.params.tag]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

export default router;
