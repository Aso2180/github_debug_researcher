import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getRiskRanking, getArchitecturePattern } from '../api/client.js';
import LanguageSummaryCard from '../components/LanguageSummaryCard.jsx';
import RiskBubbleChart from '../components/RiskBubbleChart.jsx';
import { RISK_THRESHOLDS } from '../riskMeta.js';
import JourneyNav from '../components/JourneyNav.jsx';

const S = {
  page: { padding: 32 },
  title: { fontSize: 22, fontWeight: 700, marginBottom: 8, color: '#f1f5f9' },
  sub: { color: '#64748b', marginBottom: 24, fontSize: 14 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16, marginBottom: 32 },
  err: { color: '#f87171', padding: 16 },
  banner: {
    background: '#1e293b', border: '1px solid #334155', borderRadius: 8,
    padding: '12px 16px', fontSize: 13, color: '#93c5fd', marginBottom: 16, lineHeight: 1.6,
  },
};

export default function Dashboard() {
  const [searchParams] = useSearchParams();
  const patternSlug = searchParams.get('pattern');
  const language = searchParams.get('language') || '';
  const [patternDetail, setPatternDetail] = useState(null);
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!patternSlug) return;
    getArchitecturePattern(patternSlug).then(setPatternDetail).catch(() => {});
  }, [patternSlug]);

  useEffect(() => {
    getRiskRanking({ limit: 200 })
      .then((rows) => {
        setRows(rows);
        const map = {};
        rows.forEach((r) => {
          const lang = r.primary_language || '(不明)';
          if (!map[lang]) map[lang] = { language: lang, repos: [], totalScore: 0 };
          map[lang].repos.push(r);
          map[lang].totalScore += Number(r.total_score);
        });
        // 平均値だけだと個々のリポジトリのばらつきが見えなくなる(16章で判明した「最大公約数」問題)ため、
        // min/maxと要注意件数も併せて算出し、平均が低くても要注意リポジトリがあればカードで気づけるようにする。
        const cards = Object.values(map).map((m) => {
          const scores = m.repos.map((r) => Number(r.total_score));
          return {
            language: m.language,
            repoCount: m.repos.length,
            avgRisk: m.totalScore / m.repos.length,
            minRisk: Math.min(...scores),
            maxRisk: Math.max(...scores),
            highRiskCount: scores.filter((s) => s >= RISK_THRESHOLDS.high).length,
          };
        });
        cards.sort((a, b) => b.avgRisk - a.avgRisk);
        setSummary(cards);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ padding: 32, color: '#94a3b8' }}>読み込み中...</p>;
  if (error) return <p style={S.err}>エラー: {error}</p>;

  const matchedLanguages = patternDetail?.matchedLanguages || [];

  return (
    <div style={S.page}>
      <h1 style={S.title}>言語別リスクサマリ</h1>
      <p style={S.sub}>カードをクリックすると言語別のリスクランキングを表示します</p>

      <JourneyNav pattern={patternSlug} language={language || null} />

      {patternDetail && (
        <div style={S.banner}>
          {matchedLanguages.length > 0
            ? `「${patternDetail.name}」構成に含まれる言語(${matchedLanguages.join('、')})をハイライトしています。`
            : `「${patternDetail.name}」構成に一致する収集対象言語は現在ありません。全体を表示しています。`}
        </div>
      )}

      <div style={S.grid}>
        {summary.map((s) => (
          <LanguageSummaryCard
            key={s.language}
            data={s}
            highlighted={matchedLanguages.includes(s.language)}
            onClick={() => navigate(`/risk-ranking?language=${encodeURIComponent(s.language)}`)}
          />
        ))}
      </div>
      <RiskBubbleChart rows={rows} highlightLanguages={matchedLanguages} />
    </div>
  );
}
