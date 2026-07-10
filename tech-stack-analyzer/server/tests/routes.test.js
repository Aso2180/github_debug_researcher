/**
 * Phase4 API テスト (node:test + fetch)
 * better-sqlite3 でフィクスチャDBを作成し、Express サーバを起動して各エンドポイントを検証する。
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ── フィクスチャ DB 作成 ───────────────────────────────────────
const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'tsa-test-'));
const FIXTURE_DB = path.join(tmpDir, 'fixture.db');

function createFixture() {
  const db = new Database(FIXTURE_DB);
  db.exec(`
    CREATE TABLE repositories (
      id INTEGER PRIMARY KEY, owner TEXT NOT NULL, name TEXT NOT NULL,
      primary_language TEXT, stars INTEGER, last_pushed_at TEXT, fetched_at TEXT,
      UNIQUE(owner, name)
    );
    CREATE TABLE repo_languages (
      id INTEGER PRIMARY KEY, repo_id INTEGER, language TEXT, byte_size INTEGER, fetched_at TEXT
    );
    CREATE TABLE issue_stats (
      id INTEGER PRIMARY KEY, repo_id INTEGER, label TEXT, state TEXT,
      count INTEGER, period_start TEXT, period_end TEXT, fetched_at TEXT
    );
    CREATE TABLE dependencies (
      id INTEGER PRIMARY KEY, repo_id INTEGER, package_name TEXT, ecosystem TEXT,
      version TEXT, is_deprecated INTEGER DEFAULT 0, deprecation_checked INTEGER DEFAULT 0,
      last_release_at TEXT, fetched_at TEXT
    );
    CREATE TABLE qiita_tag_trends (
      id INTEGER PRIMARY KEY, tag TEXT, article_count INTEGER, total_likes INTEGER,
      period_start TEXT, period_end TEXT, fetched_at TEXT
    );
    CREATE TABLE risk_scores (
      id INTEGER PRIMARY KEY, repo_id INTEGER,
      bug_ratio_score REAL, maintenance_score REAL, churn_score REAL,
      total_score REAL, calculated_at TEXT
    );
  `);

  db.prepare(`INSERT INTO repositories VALUES (1,'org','python-repo','Python',5000,'2024-01-01','2024-01-02')`).run();
  db.prepare(`INSERT INTO repositories VALUES (2,'org','ts-repo','TypeScript',3000,'2023-06-01','2023-06-02')`).run();
  db.prepare(`INSERT INTO repo_languages VALUES (1,1,'Python',80000,'2024-01-02')`).run();
  db.prepare(`INSERT INTO repo_languages VALUES (2,1,'C',20000,'2024-01-02')`).run();
  db.prepare(`INSERT INTO issue_stats VALUES (1,1,'bug','all',10,'2024-01-01','2024-01-01','2024-01-02')`).run();
  db.prepare(`INSERT INTO dependencies VALUES (1,1,'requests','pypi','2.31.0',0,1,NULL,'2024-01-02')`).run();
  db.prepare(`INSERT INTO dependencies VALUES (2,1,'left-pad','npm','1.0.0',1,1,NULL,'2024-01-02')`).run();
  db.prepare(`INSERT INTO dependencies VALUES (3,1,'unchecked-pkg','go','1.0.0',0,0,NULL,'2024-01-02')`).run();
  // repo 1 は collector が複数回実行された想定で risk_scores に履歴行が積み上がっている。
  // 最新(calculated_at が最大)の1行だけが /api/risk-ranking 等に返るべき。
  db.prepare(`INSERT INTO risk_scores VALUES (1,1,0.50,0.40,0.10,0.300,'2023-12-01')`).run();
  db.prepare(`INSERT INTO risk_scores VALUES (3,1,0.18,0.00,0.30,0.163,'2024-01-02')`).run();
  db.prepare(`INSERT INTO risk_scores VALUES (2,2,0.05,0.50,0.20,0.192,'2023-06-02')`).run();
  db.prepare(`INSERT INTO qiita_tag_trends VALUES (1,'python',250,3000,'2024-01-01','2024-01-31','2024-02-01')`).run();
  db.close();
}

// ── サーバ起動 ────────────────────────────────────────────────
createFixture();

process.env.DATABASE_URL = `sqlite:///${FIXTURE_DB}`;
process.env.DASHBOARD_USER = 'testuser';
process.env.DASHBOARD_PASSWORD = 'testpass';
process.env.PORT = '0'; // ランダムポート

const { server } = await import('../src/app.js');

await new Promise((resolve) => {
  if (server.listening) return resolve();
  server.once('listening', resolve);
});

const { port } = server.address();
const BASE = `http://localhost:${port}`;
const AUTH = 'Basic ' + Buffer.from('testuser:testpass').toString('base64');
const BAD_AUTH = 'Basic ' + Buffer.from('wrong:wrong').toString('base64');

// ── ヘルパー ──────────────────────────────────────────────────
async function get(path, auth = AUTH) {
  return fetch(BASE + path, { headers: { Authorization: auth } });
}

// ── テスト ────────────────────────────────────────────────────
test('GET /api/health は認証なしで 200 を返す', async () => {
  const res = await fetch(`${BASE}/api/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'ok');
});

test('GET /api/repos は認証なしで 401 を返す', async () => {
  const res = await fetch(`${BASE}/api/repos`);
  assert.equal(res.status, 401);
});

test('GET /api/repos は認証ありで全リポジトリを返す', async () => {
  const res = await get('/api/repos');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.length, 2);
});

test('GET /api/repos?language=Python は Python リポジトリのみ返す', async () => {
  const res = await get('/api/repos?language=Python');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.length, 1);
  assert.equal(body[0].primary_language, 'Python');
});

test('GET /api/repos/:id はリポジトリ詳細(言語構成・issue統計・依存関係)を返す', async () => {
  const res = await get('/api/repos/1');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.id, 1);
  assert.ok(Array.isArray(body.languages));
  assert.ok(body.languages.length >= 1);
  assert.ok(Array.isArray(body.issueStats));
  assert.ok(Array.isArray(body.dependencies));
  assert.ok(body.riskScore !== undefined);
});

test('GET /api/repos/9999 は 404 を返す', async () => {
  const res = await get('/api/repos/9999');
  assert.equal(res.status, 404);
});

test('GET /api/risk-ranking は total_score 降順で返す', async () => {
  const res = await get('/api/risk-ranking');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.length >= 2);
  assert.ok(Number(body[0].total_score) >= Number(body[1].total_score));
});

test('GET /api/risk-ranking?language=Python は Python リポジトリのみ返す', async () => {
  const res = await get('/api/risk-ranking?language=Python');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.every((r) => r.primary_language === 'Python'));
});

test('GET /api/risk-ranking は risk_scores に履歴行が複数あっても重複を返さず最新行のみ返す', async () => {
  const res = await get('/api/risk-ranking');
  assert.equal(res.status, 200);
  const body = await res.json();
  const repo1Rows = body.filter((r) => r.id === 1);
  assert.equal(repo1Rows.length, 1, 'repo 1 は risk_scores に2行あるが結果は1行のみであるべき');
  assert.equal(Number(repo1Rows[0].total_score), 0.163, '最新(calculated_at最大)の行の値が返るべき');
});

test('GET /api/dependencies/:repoId は依存関係を返す', async () => {
  const res = await get('/api/dependencies/1');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.length >= 3);
});

test('GET /api/dependencies/:repoId はdeprecation_checkedで未検証を区別する', async () => {
  const res = await get('/api/dependencies/1');
  const body = await res.json();
  const unchecked = body.find((d) => d.package_name === 'unchecked-pkg');
  assert.equal(unchecked.deprecation_checked, 0);
  const checked = body.find((d) => d.package_name === 'requests');
  assert.equal(checked.deprecation_checked, 1);
});

test('GET /api/dependencies/:repoId?deprecated_only=true は非推奨のみ返す', async () => {
  const res = await get('/api/dependencies/1?deprecated_only=true');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.every((d) => d.is_deprecated === 1));
});

test('GET /api/qiita-trends は Qiita トレンドを返す', async () => {
  const res = await get('/api/qiita-trends');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.length >= 1);
});

test('GET /api/risk-ranking は不正な認証情報で 401 を返す', async () => {
  const res = await get('/api/risk-ranking', BAD_AUTH);
  assert.equal(res.status, 401);
});

// ── クリーンアップ ────────────────────────────────────────────
after(() => {
  server.close();
  rmSync(tmpDir, { recursive: true, force: true });
});
