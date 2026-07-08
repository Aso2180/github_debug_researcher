import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getRepoDetail, getRiskRanking } from '../api/client.js';
import LanguagePieChart from '../components/LanguagePieChart.jsx';
import RiskLegend from '../components/RiskLegend.jsx';
import { riskColor, riskLevelLabel, SCORE_META } from '../riskMeta.js';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const S = {
  page: { padding: 32, maxWidth: 960, margin: '0 auto' },
  back: { color: '#60a5fa', cursor: 'pointer', marginBottom: 16, display: 'inline-block', fontSize: 14 },
  title: { fontSize: 22, fontWeight: 700, color: '#f1f5f9', marginBottom: 4 },
  meta: { color: '#64748b', fontSize: 13, marginBottom: 24 },
  section: { marginBottom: 32 },
  sectionTitle: { fontSize: 15, fontWeight: 700, color: '#94a3b8', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 },
  scoreGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 },
  scoreCard: { background: '#1e293b', borderRadius: 8, padding: '14px 16px', border: '1px solid #334155' },
  scoreLabel: { fontSize: 11, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  scoreValueRow: { display: 'flex', alignItems: 'baseline', gap: 8 },
  scoreValue: { fontSize: 22, fontWeight: 700 },
  scoreLevel: { fontSize: 11, fontWeight: 600 },
  scoreDesc: { fontSize: 12, color: '#64748b', marginTop: 6, lineHeight: 1.5 },
  scoreTip: { fontSize: 12, color: '#cbd5e1', marginTop: 4, lineHeight: 1.5 },
  rankBox: {
    display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28,
    fontSize: 13, color: '#94a3b8', background: '#1e293b', border: '1px solid #334155',
    borderRadius: 8, padding: '10px 16px',
  },
  rankValue: { fontWeight: 700, color: '#f1f5f9' },
  depTable: { width: '100%', borderCollapse: 'collapse' },
  depTh: { textAlign: 'left', padding: '8px 12px', fontSize: 12, color: '#64748b', borderBottom: '1px solid #334155' },
  depTd: { padding: '8px 12px', fontSize: 13, borderBottom: '1px solid #1e293b', verticalAlign: 'middle' },
  badge: { display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 },
  uncheckedNote: { fontSize: 12, color: '#94a3b8', marginBottom: 10 },
  err: { color: '#f87171', padding: 16 },
};

function ScoreCard({ metaKey, value }) {
  const n = Number(value);
  const meta = SCORE_META[metaKey];
  const level = riskLevelLabel(n);
  const color = riskColor(n);
  return (
    <div style={S.scoreCard}>
      <div style={S.scoreLabel}>{meta.label}</div>
      <div style={S.scoreValueRow}>
        <div style={{ ...S.scoreValue, color }}>{n.toFixed(3)}</div>
        <div style={{ ...S.scoreLevel, color }}>{level}</div>
      </div>
      <div style={S.scoreDesc}>{meta.description}</div>
      {level !== '低リスク' && <div style={S.scoreTip}>→ {meta.whenHigh}</div>}
    </div>
  );
}

export default function RepoDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [repo, setRepo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [peers, setPeers] = useState(null);

  useEffect(() => {
    getRepoDetail(id)
      .then(setRepo)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!repo?.primary_language) return;
    getRiskRanking({ language: repo.primary_language, limit: 500 })
      .then(setPeers)
      .catch(() => setPeers(null));
  }, [repo?.primary_language]);

  if (loading) return <p style={{ padding: 32, color: '#94a3b8' }}>読み込み中...</p>;
  if (error) return <p style={S.err}>エラー: {error}</p>;
  if (!repo) return null;

  const issueData = (repo.issueStats || []).map((s) => ({ name: s.label, count: s.count }));
  const uncheckedCount = (repo.dependencies || []).filter((d) => !d.deprecation_checked).length;

  let rankInfo = null;
  if (peers && peers.length > 0 && repo.riskScore) {
    const sorted = [...peers].sort((a, b) => Number(b.total_score) - Number(a.total_score));
    const rank = sorted.findIndex((r) => r.id === repo.id) + 1;
    if (rank > 0) {
      const percentile = Math.round((rank / sorted.length) * 100);
      rankInfo = { rank, total: sorted.length, percentile };
    }
  }

  return (
    <div style={S.page}>
      <span style={S.back} onClick={() => navigate(-1)}>← 戻る</span>
      <h1 style={S.title}>{repo.owner}/{repo.name}</h1>
      <p style={S.meta}>
        ⭐ {repo.stars?.toLocaleString()} | 言語: {repo.primary_language} | 最終push: {repo.last_pushed_at?.slice(0, 10)}
      </p>

      {repo.riskScore && (
        <>
          <div style={S.scoreGrid}>
            <ScoreCard metaKey="total_score" value={repo.riskScore.total_score} />
            <ScoreCard metaKey="bug_ratio_score" value={repo.riskScore.bug_ratio_score} />
            <ScoreCard metaKey="maintenance_score" value={repo.riskScore.maintenance_score} />
            <ScoreCard metaKey="churn_score" value={repo.riskScore.churn_score} />
          </div>
          <div style={{ marginBottom: 12 }}><RiskLegend /></div>
          {rankInfo && (
            <div style={S.rankBox}>
              <span>{repo.primary_language} 内の総合リスク順位:</span>
              <span style={S.rankValue}>{rankInfo.total}件中 {rankInfo.rank}位</span>
              <span>(リスクが高い側から上位{rankInfo.percentile}%)</span>
            </div>
          )}
        </>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 32 }}>
        <div style={S.section}>
          <div style={S.sectionTitle}>言語構成</div>
          <LanguagePieChart languages={repo.languages || []} />
        </div>
        {issueData.length > 0 && (
          <div style={S.section}>
            <div style={S.sectionTitle}>Issue 統計</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={issueData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155' }} />
                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div style={S.section}>
        <div style={S.sectionTitle}>依存関係 ({repo.dependencies?.length || 0}件)</div>
        {uncheckedCount > 0 && (
          <p style={S.uncheckedNote}>
            {uncheckedCount}件は非推奨チェックが未実行です。「未検証」は「現役」を意味しません。
          </p>
        )}
        <table style={S.depTable}>
          <thead>
            <tr>
              <th style={S.depTh}>パッケージ</th>
              <th style={S.depTh}>エコシステム</th>
              <th style={S.depTh}>バージョン</th>
              <th style={S.depTh}>ステータス</th>
            </tr>
          </thead>
          <tbody>
            {(repo.dependencies || []).map((d, i) => (
              <tr key={i} style={{ background: i % 2 ? '#0f172a' : 'transparent' }}>
                <td style={S.depTd}>{d.package_name}</td>
                <td style={S.depTd}>{d.ecosystem}</td>
                <td style={S.depTd}>{d.version}</td>
                <td style={S.depTd}>
                  {!d.deprecation_checked ? (
                    <span style={{ ...S.badge, background: '#1e293b', color: '#94a3b8' }}>未検証</span>
                  ) : d.is_deprecated ? (
                    <span style={{ ...S.badge, background: '#450a0a', color: '#fca5a5' }}>非推奨</span>
                  ) : (
                    <span style={{ ...S.badge, background: '#052e16', color: '#86efac' }}>現役</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
