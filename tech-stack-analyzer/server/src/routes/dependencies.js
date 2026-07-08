import express from 'express';
import { query } from '../db/pool.js';

const router = express.Router();

router.get('/dependencies/:repoId', async (req, res, next) => {
  try {
    const repoId = Number(req.params.repoId);
    const { deprecated_only } = req.query;
    const params = [repoId];
    let sql = `SELECT id, package_name, ecosystem, version, is_deprecated, deprecation_checked, last_release_at
               FROM dependencies WHERE repo_id = $1`;
    if (deprecated_only === 'true') {
      sql += ' AND is_deprecated = 1';
    }
    sql += ' ORDER BY package_name';
    res.json(await query(sql, params));
  } catch (err) {
    next(err);
  }
});

export default router;
