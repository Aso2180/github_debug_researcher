/**
 * Qiita週次AIレビュー(定点観測)API テスト (node:test + fetch)
 * routes.test.jsと同じ「mkdtempしたsqliteフィクスチャ+実サーバ起動」方式。専用の独立したフィクスチャDBを使う。
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'tsa-test-qiita-reviews-'));
const FIXTURE_DB = path.join(tmpDir, 'fixture.db');

function createFixture() {
  const db = new Database(FIXTURE_DB);
  db.exec(`
    CREATE TABLE qiita_ai_reviews (
      id INTEGER PRIMARY KEY, tag TEXT NOT NULL, summary TEXT NOT NULL,
      trend_direction TEXT, data_points_count INTEGER,
      previous_review_id INTEGER, created_at TEXT
    );
  `);

  // reactタグは2回観測(定点観測の履歴)。最新行(id=2)がrisk-rankingと同種のMAX(created_at)パターンで
  // 返るべき。vueタグは1回のみ観測。
  db.prepare(`
    INSERT INTO qiita_ai_reviews VALUES
    (1,'react','初回:横ばい','stable',5,NULL,'2026-01-05T03:00:00Z')
  `).run();
  db.prepare(`
    INSERT INTO qiita_ai_reviews VALUES
    (2,'react','2回目:上昇傾向に転じた','rising',10,1,'2026-01-12T03:00:00Z')
  `).run();
  db.prepare(`
    INSERT INTO qiita_ai_reviews VALUES
    (3,'vue','初回:横ばい','stable',3,NULL,'2026-01-12T03:00:00Z')
  `).run();
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

test('GET /api/qiita-reviews は認証なしで401を返す', async () => {
  const res = await fetch(`${BASE}/api/qiita-reviews`);
  assert.equal(res.status, 401);
});

test('GET /api/qiita-reviews はタグごとの最新レビューのみを返す(履歴行が複数あっても重複しない)', async () => {
  const res = await get('/api/qiita-reviews');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.length, 2);
  const react = body.find((r) => r.tag === 'react');
  assert.equal(react.summary, '2回目:上昇傾向に転じた');
  assert.equal(react.trend_direction, 'rising');
});

test('GET /api/qiita-reviews/:tag は指定タグの全履歴を観測日時昇順で返す', async () => {
  const res = await get('/api/qiita-reviews/react');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.length, 2);
  assert.equal(body[0].summary, '初回:横ばい');
  assert.equal(body[1].summary, '2回目:上昇傾向に転じた');
  assert.equal(body[1].previous_review_id, body[0].id);
});

test('GET /api/qiita-reviews/:tag は該当データが無いタグに対して空配列を返す(エラーにしない)', async () => {
  const res = await get('/api/qiita-reviews/nonexistent-tag');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, []);
});

after(() => {
  server.close();
  rmSync(tmpDir, { recursive: true, force: true });
});
