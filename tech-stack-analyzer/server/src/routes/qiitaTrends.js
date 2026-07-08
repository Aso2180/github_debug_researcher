import express from 'express';
import { query } from '../db/pool.js';

const router = express.Router();

router.get('/qiita-trends', async (req, res, next) => {
  try {
    const { tag } = req.query;
    const params = [];
    let sql = `SELECT id, tag, article_count, total_likes, period_start, period_end, fetched_at
               FROM qiita_tag_trends`;
    if (tag) {
      params.push(tag);
      sql += ` WHERE tag = $${params.length}`;
    }
    sql += ' ORDER BY fetched_at DESC';
    res.json(await query(sql, params));
  } catch (err) {
    next(err);
  }
});

export default router;
