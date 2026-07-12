import React, { useEffect, useState } from 'react';
import { getQiitaReviews, getQiitaReviewHistory } from '../api/client.js';

// 上昇=良い/下降=悪い、ではなく単なる関心度の方向性のため、riskMeta.jsのriskColor(危険度用)とは
// 別の意味の色を定義する(混同を避ける)。
const TREND_META = {
  rising: { label: '↑ 上昇傾向', color: '#22c55e' },
  falling: { label: '↓ 下降傾向', color: '#ef4444' },
  stable: { label: '→ 横ばい', color: '#64748b' },
};

const S = {
  page: { padding: 32, maxWidth: 860, margin: '0 auto' },
  title: { fontSize: 22, fontWeight: 700, color: '#f1f5f9', marginBottom: 4 },
  subtitle: { color: '#64748b', fontSize: 13, marginBottom: 24, lineHeight: 1.6 },
  card: {
    background: '#1e293b', border: '1px solid #334155', borderRadius: 10,
    padding: 20, marginBottom: 16, cursor: 'pointer',
  },
  cardHeader: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' },
  tagName: { fontSize: 16, fontWeight: 700, color: '#f1f5f9' },
  badge: (color) => ({
    fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 9999,
    color, background: `${color}22`,
  }),
  meta: { fontSize: 11, color: '#64748b', marginLeft: 'auto' },
  summary: { fontSize: 13, color: '#cbd5e1', lineHeight: 1.7 },
  history: { marginTop: 12, paddingLeft: 16, borderLeft: '2px solid #334155' },
  historyItem: { marginBottom: 12 },
  historyMeta: { fontSize: 11, color: '#64748b', marginBottom: 2 },
  historySummary: { fontSize: 13, color: '#94a3b8', lineHeight: 1.6 },
  err: { color: '#f87171', padding: 16 },
  empty: { color: '#475569', padding: 16, textAlign: 'center' },
};

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('ja-JP', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function QiitaReviews() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedTag, setExpandedTag] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    getQiitaReviews()
      .then(setReviews)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const toggleExpand = async (tag) => {
    if (expandedTag === tag) {
      setExpandedTag(null);
      return;
    }
    setExpandedTag(tag);
    setHistoryLoading(true);
    try {
      const body = await getQiitaReviewHistory(tag);
      // 最新1件は既にカードに表示済みのため、それ以前の履歴のみ展開表示する
      setHistory(body.slice(0, -1).reverse());
    } catch (e) {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  if (loading) return <p style={{ padding: 32, color: '#94a3b8' }}>読み込み中...</p>;
  if (error) return <p style={S.err}>エラー: {error}</p>;

  return (
    <div style={S.page}>
      <h1 style={S.title}>Qiitaトレンドレビュー</h1>
      <p style={S.subtitle}>
        週次で収集しているQiitaトレンドをAIが定点観測し、毎回過去の分析を踏まえて洞察を更新していきます。
        タグをクリックすると過去の観測履歴を確認できます。
      </p>

      {reviews.length === 0 ? (
        <p style={S.empty}>まだレビューがありません(週次収集の実行後に表示されます)</p>
      ) : (
        reviews.map((r) => {
          const trend = TREND_META[r.trend_direction] || TREND_META.stable;
          const expanded = expandedTag === r.tag;
          return (
            <div key={r.tag} style={S.card} onClick={() => toggleExpand(r.tag)}>
              <div style={S.cardHeader}>
                <span style={S.tagName}>{r.tag}</span>
                <span style={S.badge(trend.color)}>{trend.label}</span>
                <span style={S.meta}>
                  観測データ{r.data_points_count}件・{formatDate(r.created_at)}
                </span>
              </div>
              <div style={S.summary}>{r.summary}</div>

              {expanded && (
                <div style={S.history} onClick={(e) => e.stopPropagation()}>
                  {historyLoading ? (
                    <p style={{ color: '#94a3b8', fontSize: 12 }}>読み込み中...</p>
                  ) : history.length === 0 ? (
                    <p style={{ color: '#475569', fontSize: 12 }}>これより過去の観測はありません(初回観測)</p>
                  ) : (
                    history.map((h) => (
                      <div key={h.id} style={S.historyItem}>
                        <div style={S.historyMeta}>
                          {formatDate(h.created_at)}・観測データ{h.data_points_count}件・
                          {(TREND_META[h.trend_direction] || TREND_META.stable).label}
                        </div>
                        <div style={S.historySummary}>{h.summary}</div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
