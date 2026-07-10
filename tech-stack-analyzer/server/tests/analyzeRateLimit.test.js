/**
 * POST /api/analyze のレート制限(指示書1.3節: エンドポイント専用のレート制限)のテスト。
 * 他の機能テストと分離し、ANALYZE_RATE_LIMIT_MAX を小さくして決定的に検証する。
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'tsa-analyze-ratelimit-test-'));
const FIXTURE_DB = path.join(tmpDir, 'fixture.db');

function createFixture() {
  const db = new Database(FIXTURE_DB);
  db.exec(`
    CREATE TABLE repositories (
      id INTEGER PRIMARY KEY, owner TEXT NOT NULL, name TEXT NOT NULL,
      primary_language TEXT, stars INTEGER, last_pushed_at TEXT, fetched_at TEXT,
      UNIQUE(owner, name)
    );
    CREATE TABLE risk_scores (
      id INTEGER PRIMARY KEY, repo_id INTEGER,
      bug_ratio_score REAL, maintenance_score REAL, churn_score REAL,
      total_score REAL, calculated_at TEXT
    );
    CREATE TABLE qiita_tag_trends (
      id INTEGER PRIMARY KEY, tag TEXT, article_count INTEGER, total_likes INTEGER,
      period_start TEXT, period_end TEXT, fetched_at TEXT
    );
  `);
  db.close();
}

createFixture();

process.env.DATABASE_URL = `sqlite:///${FIXTURE_DB}`;
process.env.DASHBOARD_USER = 'testuser';
process.env.DASHBOARD_PASSWORD = 'testpass';
process.env.ANTHROPIC_API_KEY = 'test-key';
process.env.ANALYZE_RATE_LIMIT_MAX = '2';
process.env.ANALYZE_RATE_LIMIT_WINDOW_MS = '60000';
process.env.PORT = '0';

globalThis.fetch = (() => {
  const realFetch = globalThis.fetch;
  return async (url, opts) => {
    if (typeof url === 'string' && url.includes('api.anthropic.com')) {
      const body = {
        id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-sonnet-5',
        content: [{ type: 'text', text: JSON.stringify({
          risks: [], effortEstimateMonthPerson: { min: 0, max: 0, basis: '' },
          ganttTasks: [], dataConfidenceNote: '',
        }) }],
        stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 },
      };
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return realFetch(url, opts);
  };
})();

const { server } = await import('../src/app.js');

await new Promise((resolve) => {
  if (server.listening) return resolve();
  server.once('listening', resolve);
});

const { port } = server.address();
const BASE = `http://localhost:${port}`;
const AUTH = 'Basic ' + Buffer.from('testuser:testpass').toString('base64');

async function post() {
  return fetch(`${BASE}/api/analyze`, {
    method: 'POST',
    headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectOverview: 'overview', goals: 'goals' }),
  });
}

test('POST /api/analyze は設定した上限(ANALYZE_RATE_LIMIT_MAX=2)を超えると429を返す', async () => {
  const first = await post();
  const second = await post();
  const third = await post();
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(third.status, 429);
});

after(() => {
  server.close();
  rmSync(tmpDir, { recursive: true, force: true });
});
