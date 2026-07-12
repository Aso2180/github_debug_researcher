import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getRiskRanking, getArchitecturePattern } from '../api/client.js';
import RiskTable from '../components/RiskTable.jsx';
import RiskLegend from '../components/RiskLegend.jsx';
import JourneyNav from '../components/JourneyNav.jsx';

const S = {
  page: { padding: 32 },
  header: { display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, flexWrap: 'wrap' },
  title: { fontSize: 22, fontWeight: 700, color: '#f1f5f9' },
  badge: {
    background: '#1d4ed8', color: '#bfdbfe', fontSize: 12,
    padding: '2px 10px', borderRadius: 9999, fontWeight: 600,
  },
  err: { color: '#f87171', padding: 16 },
  banner: {
    background: '#1e293b', border: '1px solid #334155', borderRadius: 8,
    padding: '12px 16px', fontSize: 13, color: '#93c5fd', marginBottom: 16, lineHeight: 1.6,
  },
};

export default function RiskRanking() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const language = searchParams.get('language') || '';
  const patternSlug = searchParams.get('pattern');
  const [patternDetail, setPatternDetail] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getRiskRanking({ language, limit: 50 })
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [language]);

  useEffect(() => {
    if (!patternSlug) return;
    getArchitecturePattern(patternSlug).then(setPatternDetail).catch(() => {});
  }, [patternSlug]);

  if (loading) return <p style={{ padding: 32, color: '#94a3b8' }}>読み込み中...</p>;
  if (error) return <p style={S.err}>エラー: {error}</p>;

  return (
    <div style={S.page}>
      <div style={S.header}>
        <h1 style={S.title}>リスクランキング</h1>
        {language && <span style={S.badge}>{language}</span>}
      </div>

      <JourneyNav pattern={patternSlug} language={language || null} />

      {patternDetail && (
        <div style={S.banner}>「{patternDetail.name}」構成に基づくリスクランキングです。</div>
      )}

      <div style={{ marginBottom: 16 }}><RiskLegend /></div>
      <RiskTable rows={rows} onRowClick={(r) => navigate(`/repos/${r.id}`)} />
    </div>
  );
}
