import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getRiskRanking } from '../api/client.js';
import LanguageSummaryCard from '../components/LanguageSummaryCard.jsx';

const S = {
  page: { padding: 32 },
  title: { fontSize: 22, fontWeight: 700, marginBottom: 8, color: '#f1f5f9' },
  sub: { color: '#64748b', marginBottom: 24, fontSize: 14 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 },
  err: { color: '#f87171', padding: 16 },
};

export default function Dashboard() {
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    getRiskRanking({ limit: 200 })
      .then((rows) => {
        const map = {};
        rows.forEach((r) => {
          const lang = r.primary_language || '(不明)';
          if (!map[lang]) map[lang] = { language: lang, repos: [], totalScore: 0 };
          map[lang].repos.push(r);
          map[lang].totalScore += Number(r.total_score);
        });
        const cards = Object.values(map).map((m) => ({
          language: m.language,
          repoCount: m.repos.length,
          avgRisk: m.totalScore / m.repos.length,
        }));
        cards.sort((a, b) => b.avgRisk - a.avgRisk);
        setSummary(cards);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ padding: 32, color: '#94a3b8' }}>読み込み中...</p>;
  if (error) return <p style={S.err}>エラー: {error}</p>;

  return (
    <div style={S.page}>
      <h1 style={S.title}>言語別リスクサマリ</h1>
      <p style={S.sub}>カードをクリックすると言語別のリスクランキングを表示します</p>
      <div style={S.grid}>
        {summary.map((s) => (
          <LanguageSummaryCard
            key={s.language}
            data={s}
            onClick={() => navigate(`/risk-ranking?language=${encodeURIComponent(s.language)}`)}
          />
        ))}
      </div>
    </div>
  );
}
