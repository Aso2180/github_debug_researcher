import express from 'express';
import rateLimit from 'express-rate-limit';
import { query } from '../db/pool.js';
import { getClient, ANALYZE_MODEL } from '../services/anthropicClient.js';

const router = express.Router();

const MAX_REPOS = 20;

const analyzeRateLimiter = rateLimit({
  windowMs: Number(process.env.ANALYZE_RATE_LIMIT_WINDOW_MS) || 60_000,
  max: Number(process.env.ANALYZE_RATE_LIMIT_MAX) || 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'リクエストが多すぎます。しばらく待ってから再試行してください。' },
});

const RESPONSE_SCHEMA_HINT = `{
  "risks": [
    {"technology": "string", "riskLevel": "low|medium|high", "reason": "string", "recommendation": "string"}
  ],
  "effortEstimateMonthPerson": {"min": 0, "max": 0, "basis": "string"},
  "ganttTasks": [
    {"id": "string", "name": "string", "startOffsetDays": 0, "durationDays": 0, "dependsOn": ["id"], "role": "string"}
  ],
  "dataConfidenceNote": "string"
}`;

function extractKeywords(text, vocabulary) {
  const lower = text.toLowerCase();
  return vocabulary.filter((word) => lower.includes(word.toLowerCase()));
}

function stripCodeFence(text) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function buildPrompt({ projectOverview, goals, matchedLanguages, repos, qiitaTrends }) {
  return `あなたは技術スタック選定のリスク分析アシスタントです。
以下の「ユーザー入力」と「収集済み実データ」だけを根拠に分析してください。Web検索や一般知識のみでの推測は避け、
根拠データが薄い箇所は必ず dataConfidenceNote でその旨を明示してください。

# ユーザー入力
プロジェクト概要: ${projectOverview}
ゴール: ${goals}
検出/指定された技術キーワード: ${matchedLanguages.length ? matchedLanguages.join(', ') : '(該当なし)'}

# 収集済み実データ(リポジトリのメンテナンス状況・リスクスコア、上位${MAX_REPOS}件まで)
${JSON.stringify(repos, null, 2)}

# 収集済み実データ(Qiitaトレンド)
${JSON.stringify(qiitaTrends, null, 2)}

# 出力形式
前置き・説明文・Markdownのコードフェンスを一切含めず、以下のスキーマに厳密に従うJSONのみを出力してください:
${RESPONSE_SCHEMA_HINT}`;
}

async function callAnthropic(prompt, { retry = false } = {}) {
  const client = getClient();
  const finalPrompt = retry
    ? `${prompt}\n\n(前回の応答はJSONとして解析できませんでした。必ず有効なJSONのみを出力してください。前置き・コードフェンスは禁止です。)`
    : prompt;

  const response = await client.messages.create({
    model: ANALYZE_MODEL,
    max_tokens: 4096,
    messages: [{ role: 'user', content: finalPrompt }],
  });

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');

  return JSON.parse(stripCodeFence(text));
}

router.post('/analyze', analyzeRateLimiter, async (req, res, next) => {
  try {
    const { projectOverview, goals, candidateStack } = req.body || {};

    if (typeof projectOverview !== 'string' || !projectOverview.trim()) {
      return res.status(400).json({ error: 'projectOverview is required' });
    }
    if (typeof goals !== 'string' || !goals.trim()) {
      return res.status(400).json({ error: 'goals is required' });
    }
    if (candidateStack !== undefined && !Array.isArray(candidateStack)) {
      return res.status(400).json({ error: 'candidateStack must be an array of strings' });
    }

    const [languageRows, tagRows] = await Promise.all([
      query('SELECT DISTINCT primary_language FROM repositories WHERE primary_language IS NOT NULL'),
      query('SELECT DISTINCT tag FROM qiita_tag_trends'),
    ]);
    const knownLanguages = languageRows.map((r) => r.primary_language);
    const knownTags = tagRows.map((r) => r.tag);

    const combinedText = `${projectOverview} ${goals}`;
    const matchedLanguages = Array.isArray(candidateStack) && candidateStack.length
      ? candidateStack.filter((s) => typeof s === 'string' && s.trim()).slice(0, 10)
      : extractKeywords(combinedText, knownLanguages);
    // candidateStack は「候補の技術スタック」欄で選ばれた語(実在のprimary_language/qiitaタグ由来)。
    // 本文からの抽出だけでなくcandidateStackもQiitaタグ照合の対象にしないと、
    // 「候補にReactを選んだのに本文に書き忘れるとReactのQiitaトレンドが一切分析に使われない」
    // という非対称なサイレント失敗が起きる。
    const candidateStackText = Array.isArray(candidateStack) ? candidateStack.join(' ') : '';
    const matchedTags = extractKeywords(`${combinedText} ${candidateStackText}`, knownTags);

    const params = [];
    let repoSql = `SELECT r.id, r.owner, r.name, r.primary_language, r.stars, r.last_pushed_at,
                          rs.total_score, rs.bug_ratio_score, rs.maintenance_score, rs.churn_score
                   FROM repositories r
                   LEFT JOIN risk_scores rs ON rs.repo_id = r.id
                     AND rs.calculated_at = (SELECT MAX(calculated_at) FROM risk_scores WHERE repo_id = r.id)`;
    if (matchedLanguages.length) {
      params.push(...matchedLanguages);
      repoSql += ` WHERE r.primary_language IN (${matchedLanguages.map((_, i) => `$${i + 1}`).join(',')})`;
    }
    repoSql += ` ORDER BY r.stars DESC LIMIT ${MAX_REPOS}`;
    const repos = await query(repoSql, params);

    let qiitaTrends = [];
    if (matchedTags.length) {
      const tagParams = matchedTags;
      const tagSql = `SELECT tag, article_count, total_likes, period_start, period_end
                      FROM qiita_tag_trends WHERE tag IN (${matchedTags.map((_, i) => `$${i + 1}`).join(',')})
                      ORDER BY fetched_at DESC`;
      qiitaTrends = await query(tagSql, tagParams);
    }

    const prompt = buildPrompt({ projectOverview, goals, matchedLanguages, repos, qiitaTrends });

    let result;
    try {
      result = await callAnthropic(prompt);
    } catch (parseErr) {
      try {
        result = await callAnthropic(prompt, { retry: true });
      } catch (retryErr) {
        console.error('AI応答の解析に失敗しました', retryErr.message);
        return res.status(502).json({ error: 'AI応答の解析に失敗しました' });
      }
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
