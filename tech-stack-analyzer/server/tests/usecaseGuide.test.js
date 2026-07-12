/**
 * Phase3 アーキテクチャガイドAPI テスト (node:test + fetch)
 * routes.test.js と同じ「mkdtempしたsqliteフィクスチャ+実サーバ起動」方式。既存フィクスチャの
 * 大量のテストへ影響を及ぼさないよう、本ファイル専用の独立したフィクスチャDBを用意する。
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'tsa-test-guide-'));
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
    CREATE TABLE qiita_articles (
      id INTEGER PRIMARY KEY, qiita_id TEXT, tag TEXT, title TEXT, url TEXT,
      likes_count INTEGER, article_created_at TEXT, fetched_at TEXT,
      UNIQUE(qiita_id, tag)
    );
    CREATE TABLE use_case_categories (
      id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
      description TEXT, display_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE architecture_patterns (
      id INTEGER PRIMARY KEY, category_id INTEGER NOT NULL, slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL, tier TEXT NOT NULL, summary TEXT, risk_notes TEXT,
      display_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE architecture_pattern_components (
      id INTEGER PRIMARY KEY, pattern_id INTEGER NOT NULL, layer TEXT NOT NULL,
      component_name TEXT NOT NULL, description TEXT
    );
  `);

  // topRiskRepos/bottomRiskReposが重複せず分かれることを検証するため、上位2件・下位1件が
  // はっきり分離できるよう4件のTypeScriptリポジトリを用意する(2件だと上位3件枠に全件収まってしまい、
  // 下位が空になる)。
  db.prepare(`INSERT INTO repositories VALUES (1,'org','ts-repo-high','TypeScript',5000,'2024-01-01','2024-01-02')`).run();
  db.prepare(`INSERT INTO repositories VALUES (2,'org','ts-repo-low','TypeScript',3000,'2024-01-01','2024-01-02')`).run();
  db.prepare(`INSERT INTO repositories VALUES (3,'org','ts-repo-mid1','TypeScript',2000,'2024-01-01','2024-01-02')`).run();
  db.prepare(`INSERT INTO repositories VALUES (4,'org','ts-repo-mid2','TypeScript',1000,'2024-01-01','2024-01-02')`).run();
  db.prepare(`INSERT INTO risk_scores VALUES (1,1,0.90,0.90,0.90,0.900,'2024-01-02')`).run();
  db.prepare(`INSERT INTO risk_scores VALUES (2,2,0.10,0.10,0.10,0.100,'2024-01-02')`).run();
  db.prepare(`INSERT INTO risk_scores VALUES (3,3,0.60,0.60,0.60,0.600,'2024-01-02')`).run();
  db.prepare(`INSERT INTO risk_scores VALUES (4,4,0.40,0.40,0.40,0.400,'2024-01-02')`).run();
  db.prepare(`INSERT INTO qiita_articles VALUES (1,'q1','typescript','TSの型テクニック','https://qiita.com/x/items/q1',20,'2024-01-01','2024-01-02')`).run();

  db.prepare(`INSERT INTO use_case_categories VALUES (1,'efficiency','効率化・生産性向上','説明文',1)`).run();
  db.prepare(`
    INSERT INTO architecture_patterns VALUES
    (1,1,'efficiency-enterprise','チーム開発・エンタープライズ向け構成','enterprise','サマリ文','リスク注意文',1)
  `).run();
  db.prepare(`INSERT INTO architecture_pattern_components VALUES (1,1,'frontend','React/TypeScript',NULL)`).run();
  // Dockerは収集対象言語(primary_language)にもdependencies.ecosystemにも存在しない語彙なので、
  // 実データ0件になるのが正しい挙動(usecaseGuide.jsのコメント参照)。
  db.prepare(`INSERT INTO architecture_pattern_components VALUES (2,1,'infra','Docker',NULL)`).run();
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

async function get(path, auth = AUTH) {
  return fetch(BASE + path, { headers: { Authorization: auth } });
}

test('GET /api/usecase-categories は認証なしで401を返す', async () => {
  const res = await fetch(`${BASE}/api/usecase-categories`);
  assert.equal(res.status, 401);
});

test('GET /api/usecase-categories はカテゴリ一覧を返す', async () => {
  const res = await get('/api/usecase-categories');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.length, 1);
  assert.equal(body[0].slug, 'efficiency');
  assert.equal(body[0].name, '効率化・生産性向上');
});

test('GET /api/usecase-categories/:slug/patterns は存在しないslugで404を返す', async () => {
  const res = await get('/api/usecase-categories/nonexistent/patterns');
  assert.equal(res.status, 404);
});

test('GET /api/usecase-categories/:slug/patterns はパターンとコンポーネントを返す', async () => {
  const res = await get('/api/usecase-categories/efficiency/patterns');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.category.slug, 'efficiency');
  assert.equal(body.patterns.length, 1);
  assert.equal(body.patterns[0].slug, 'efficiency-enterprise');
  assert.equal(body.patterns[0].components.length, 2);
});

test('GET /api/architecture-patterns/:slug は存在しないslugで404を返す', async () => {
  const res = await get('/api/architecture-patterns/nonexistent');
  assert.equal(res.status, 404);
});

test('GET /api/architecture-patterns/:slug はcomponent_nameを実リポジトリ・Qiita記事と突き合わせる', async () => {
  const res = await get('/api/architecture-patterns/efficiency-enterprise');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.slug, 'efficiency-enterprise');
  assert.equal(body.category.slug, 'efficiency');
  assert.equal(body.components.length, 2);

  const reactTs = body.components.find((c) => c.component_name === 'React/TypeScript');
  assert.ok(reactTs.topRiskRepos.some((r) => r.name === 'ts-repo-high'));
  assert.ok(reactTs.bottomRiskRepos.some((r) => r.name === 'ts-repo-low'));
  assert.ok(reactTs.qiitaArticles.some((a) => a.title === 'TSの型テクニック'));
});

test('GET /api/architecture-patterns/:slug は実データが無いコンポーネントを空配列で返す(エラーにしない)', async () => {
  const res = await get('/api/architecture-patterns/efficiency-enterprise');
  const body = await res.json();
  const docker = body.components.find((c) => c.component_name === 'Docker');
  assert.deepEqual(docker.topRiskRepos, []);
  assert.deepEqual(docker.bottomRiskRepos, []);
  assert.deepEqual(docker.qiitaArticles, []);
});

after(() => {
  server.close();
  rmSync(tmpDir, { recursive: true, force: true });
});
