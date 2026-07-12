/**
 * 16章で判明した「平均値だけでは個々のリポジトリのばらつきを隠してしまう」問題への対応
 * (/api/language-graph へのMIN/MAX追加)専用のテスト。
 * 既存のroutes.test.jsのフィクスチャ(Python 1件)は平均のみの検証用データのため、
 * min/maxが平均と異なる値になることを確認するには同一言語の複数リポジトリが必要。
 * 既存フィクスチャに手を加えると多数の既存アサーションに影響するため、専用の独立したフィクスチャを用意する。
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'tsa-test-langgraph-'));
const FIXTURE_DB = path.join(tmpDir, 'fixture.db');

function createFixture() {
  const db = new Database(FIXTURE_DB);
  db.exec(`
    CREATE TABLE repositories (
      id INTEGER PRIMARY KEY, owner TEXT NOT NULL, name TEXT NOT NULL,
      primary_language TEXT, stars INTEGER, last_pushed_at TEXT, fetched_at TEXT,
      UNIQUE(owner, name)
    );
    CREATE TABLE dependencies (
      id INTEGER PRIMARY KEY, repo_id INTEGER, package_name TEXT, ecosystem TEXT,
      version TEXT, is_deprecated INTEGER DEFAULT 0, deprecation_checked INTEGER DEFAULT 0,
      last_release_at TEXT, fetched_at TEXT
    );
    CREATE TABLE risk_scores (
      id INTEGER PRIMARY KEY, repo_id INTEGER,
      bug_ratio_score REAL, maintenance_score REAL, churn_score REAL,
      total_score REAL, calculated_at TEXT
    );
  `);

  db.prepare(`INSERT INTO repositories VALUES (1,'org','py-repo-low','Python',5000,'2024-01-01','2024-01-02')`).run();
  db.prepare(`INSERT INTO repositories VALUES (2,'org','py-repo-high','Python',3000,'2024-01-01','2024-01-02')`).run();
  // repo1は履歴行が積み上がっている想定。MAX(calculated_at)で最新(0.150)が使われるべき。
  db.prepare(`INSERT INTO risk_scores VALUES (1,1,0.10,0.10,0.10,0.900,'2023-01-01')`).run();
  db.prepare(`INSERT INTO risk_scores VALUES (2,1,0.10,0.10,0.10,0.150,'2024-01-02')`).run();
  db.prepare(`INSERT INTO risk_scores VALUES (3,2,0.90,0.90,0.90,0.850,'2024-01-02')`).run();
  db.close();
}

createFixture();

process.env.DATABASE_URL = `sqlite:///${FIXTURE_DB}`;
process.env.DASHBOARD_USER = 'testuser';
process.env.DASHBOARD_PASSWORD = 'testpass';
process.env.PORT = '0';

const { server } = await import('../src/app.js');

await new Promise((resolve) => {
  if (server.listening) return resolve();
  server.once('listening', resolve);
});

const { port } = server.address();
const BASE = `http://localhost:${port}`;
const AUTH = 'Basic ' + Buffer.from('testuser:testpass').toString('base64');

async function get(path) {
  return fetch(BASE + path, { headers: { Authorization: AUTH } });
}

test('GET /api/language-graph はavgRiskだけでなくminRisk/maxRiskも返す', async () => {
  const res = await get('/api/language-graph');
  assert.equal(res.status, 200);
  const body = await res.json();
  const python = body.nodes.find((n) => n.language === 'Python');
  assert.ok(python);
  assert.equal(python.repoCount, 2);
  // 最新行(0.150)と0.850の平均。履歴行(0.900)はMAX(calculated_at)により除外されるべき。
  assert.equal(python.avgRisk, 0.5);
  assert.equal(python.minRisk, 0.15);
  assert.equal(python.maxRisk, 0.85);
});

after(() => {
  server.close();
  rmSync(tmpDir, { recursive: true, force: true });
});
