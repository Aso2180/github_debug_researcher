/**
 * POST /api/analyze のテスト。Anthropic SDKの下層(fetch)をモックし、実APIは一切呼ばない。
 * レート制限のデフォルト(分5回)に他テストが引っかからないよう、このファイルでは
 * ANALYZE_RATE_LIMIT_MAX を大きく設定する(429の専用テストは analyzeRateLimit.test.js)。
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'tsa-analyze-test-'));
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

  db.prepare(`INSERT INTO repositories VALUES (1,'org','python-repo','Python',5000,'2024-01-01','2024-01-02')`).run();
  db.prepare(`INSERT INTO repositories VALUES (2,'org','ts-repo','TypeScript',3000,'2023-06-01','2023-06-02')`).run();
  // repo 1 は2回分析されている想定 → 最新(calculated_at最大)のみが使われるべき
  db.prepare(`INSERT INTO risk_scores VALUES (1,1,0.30,0.20,0.30,0.27,'2024-01-01')`).run();
  db.prepare(`INSERT INTO risk_scores VALUES (2,1,0.18,0.00,0.30,0.163,'2024-02-01')`).run();
  db.prepare(`INSERT INTO risk_scores VALUES (3,2,0.05,0.50,0.20,0.192,'2023-06-02')`).run();
  db.prepare(`INSERT INTO qiita_tag_trends VALUES (1,'python',250,3000,'2024-01-01','2024-01-31','2024-02-01')`).run();
  db.prepare(`INSERT INTO qiita_tag_trends VALUES (2,'react',300,1200,'2024-01-01','2024-01-31','2024-02-01')`).run();
  db.close();
}

createFixture();

process.env.DATABASE_URL = `sqlite:///${FIXTURE_DB}`;
process.env.DASHBOARD_USER = 'testuser';
process.env.DASHBOARD_PASSWORD = 'testpass';
process.env.ANTHROPIC_API_KEY = 'test-key';
process.env.ANALYZE_RATE_LIMIT_MAX = '1000';
process.env.PORT = '0';

// ── fetch モック(Anthropic SDKはグローバル fetch 経由でHTTP呼び出しを行う) ──
// テスト自身がローカルサーバへ fetch する分は素通しし、api.anthropic.com 宛のみ差し替える。
const realFetch = globalThis.fetch;
const fetchCalls = [];
function mockAnthropicResponses(texts) {
  let call = 0;
  fetchCalls.length = 0;
  globalThis.fetch = async (url, opts) => {
    if (typeof url !== 'string' || !url.includes('api.anthropic.com')) {
      return realFetch(url, opts);
    }
    fetchCalls.push({ url, opts });
    const text = texts[Math.min(call, texts.length - 1)];
    call += 1;
    const body = {
      id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-sonnet-5',
      content: [{ type: 'text', text }],
      stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 },
    };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  };
}

const VALID_RESULT = {
  risks: [{ technology: 'Python', riskLevel: 'low', reason: 'stable', recommendation: 'none' }],
  effortEstimateMonthPerson: { min: 1, max: 2, basis: 'test' },
  ganttTasks: [{ id: 't1', name: 'setup', startOffsetDays: 0, durationDays: 5, dependsOn: [], role: 'dev' }],
  dataConfidenceNote: 'test note',
};

const { server } = await import('../src/app.js');

await new Promise((resolve) => {
  if (server.listening) return resolve();
  server.once('listening', resolve);
});

const { port } = server.address();
const BASE = `http://localhost:${port}`;
const AUTH = 'Basic ' + Buffer.from('testuser:testpass').toString('base64');

async function post(body) {
  return fetch(`${BASE}/api/analyze`, {
    method: 'POST',
    headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('POST /api/analyze は正常なJSONを返すAI応答をそのまま返す', async () => {
  mockAnthropicResponses([JSON.stringify(VALID_RESULT)]);
  const res = await post({ projectOverview: 'Pythonで作るWebアプリ', goals: '高速なAPIを作りたい' });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, VALID_RESULT);
});

test('POST /api/analyze はコードフェンス付きのAI応答も解析できる', async () => {
  mockAnthropicResponses(['```json\n' + JSON.stringify(VALID_RESULT) + '\n```']);
  const res = await post({ projectOverview: 'Pythonで作るWebアプリ', goals: '高速なAPIを作りたい' });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, VALID_RESULT);
});

test('POST /api/analyze はJSON解析に2回とも失敗すると502を返す', async () => {
  mockAnthropicResponses(['not json at all', 'still not json']);
  const res = await post({ projectOverview: 'Pythonで作るWebアプリ', goals: '高速なAPIを作りたい' });
  assert.equal(res.status, 502);
  const body = await res.json();
  assert.ok(body.error);
});

test('POST /api/analyze は1回目失敗・2回目成功ならリトライして200を返す', async () => {
  mockAnthropicResponses(['not json', JSON.stringify(VALID_RESULT)]);
  const res = await post({ projectOverview: 'Pythonで作るWebアプリ', goals: '高速なAPIを作りたい' });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, VALID_RESULT);
  assert.equal(fetchCalls.length, 2);
});

test('POST /api/analyze は projectOverview 未指定で400を返す', async () => {
  mockAnthropicResponses([JSON.stringify(VALID_RESULT)]);
  const res = await post({ goals: '高速なAPIを作りたい' });
  assert.equal(res.status, 400);
});

test('POST /api/analyze は goals 未指定で400を返す', async () => {
  mockAnthropicResponses([JSON.stringify(VALID_RESULT)]);
  const res = await post({ projectOverview: 'Pythonで作るWebアプリ' });
  assert.equal(res.status, 400);
});

test('POST /api/analyze は candidateStack が配列でない場合400を返す', async () => {
  mockAnthropicResponses([JSON.stringify(VALID_RESULT)]);
  const res = await post({ projectOverview: 'overview', goals: 'goals', candidateStack: 'Python' });
  assert.equal(res.status, 400);
});

test('POST /api/analyze は認証なしで401を返す', async () => {
  const res = await fetch(`${BASE}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectOverview: 'x', goals: 'y' }),
  });
  assert.equal(res.status, 401);
});

test('POST /api/analyze は同一リポジトリのrisk_scoresが複数あっても最新1件のみをAIへの根拠データに使う', async () => {
  mockAnthropicResponses([JSON.stringify(VALID_RESULT)]);
  const res = await post({ projectOverview: 'Pythonで作るWebアプリ', goals: '高速なAPIを作りたい' });
  assert.equal(res.status, 200);

  const sentBody = JSON.parse(fetchCalls[0].opts.body);
  const prompt = sentBody.messages[0].content;
  const occurrences = (prompt.match(/python-repo/g) || []).length;
  assert.equal(occurrences, 1, 'python-repo は根拠データ中に1回だけ出現するべき(重複排除)');
  assert.ok(prompt.includes('"total_score": 0.163'), '最新(calculated_at最大)のrisk_scoresが使われるべき');
});

test('POST /api/analyze は本文に含まれていなくてもcandidateStackで指定した語のQiitaトレンドを根拠データに含める', async () => {
  mockAnthropicResponses([JSON.stringify(VALID_RESULT)]);
  const res = await post({
    projectOverview: 'モバイルアプリを作りたい',
    goals: '高速に開発したい',
    candidateStack: ['react'],
  });
  assert.equal(res.status, 200);

  const sentBody = JSON.parse(fetchCalls[0].opts.body);
  const prompt = sentBody.messages[0].content;
  assert.ok(prompt.includes('"tag": "react"'), 'candidateStackで選んだ語のQiitaトレンドがプロンプトに含まれるべき');
});

after(() => {
  server.close();
  rmSync(tmpDir, { recursive: true, force: true });
});
