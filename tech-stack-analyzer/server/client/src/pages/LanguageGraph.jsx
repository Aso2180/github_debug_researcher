import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getLanguageGraph, getArchitecturePattern } from '../api/client.js';
import LanguageGraphChart from '../components/LanguageGraphChart.jsx';
import RiskLegend from '../components/RiskLegend.jsx';
import JourneyNav from '../components/JourneyNav.jsx';

const S = {
  page: { padding: 32 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 8 },
  title: { fontSize: 22, fontWeight: 700, color: '#f1f5f9', margin: 0 },
  sub: { color: '#64748b', marginBottom: 24, fontSize: 14 },
  err: { color: '#f87171', padding: 16 },
  chartWrap: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, padding: 16 },
  banner: {
    background: '#1e293b', border: '1px solid #334155', borderRadius: 8,
    padding: '12px 16px', fontSize: 13, color: '#93c5fd', marginBottom: 16, lineHeight: 1.6,
  },
};

export default function LanguageGraph() {
  const [searchParams] = useSearchParams();
  const patternSlug = searchParams.get('pattern');
  const [patternDetail, setPatternDetail] = useState(null);
  const [data, setData] = useState({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    getLanguageGraph()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!patternSlug) return;
    getArchitecturePattern(patternSlug).then(setPatternDetail).catch(() => {});
  }, [patternSlug]);

  if (loading) return <p style={{ padding: 32, color: '#94a3b8' }}>読み込み中...</p>;
  if (error) return <p style={S.err}>エラー: {error}</p>;

  const matchedLanguages = patternDetail?.matchedLanguages || [];
  const nextLanguage = matchedLanguages[0] || null;

  return (
    <div style={S.page}>
      <div style={S.header}>
        <h1 style={S.title}>言語関係グラフ</h1>
        <RiskLegend />
      </div>

      <JourneyNav pattern={patternSlug} language={nextLanguage} />

      {patternDetail && (
        <div style={S.banner}>
          {matchedLanguages.length > 0
            ? `「${patternDetail.name}」構成に含まれる言語(${matchedLanguages.join('、')})を青いリングでハイライトしています。`
            : `「${patternDetail.name}」構成に一致する収集対象言語は現在ありません。全体のグラフを表示しています。`}
        </div>
      )}

      <p style={S.sub}>
        円の大きさはリポジトリ数、色は平均リスク、線の太さは依存関係を通じた言語間の共起件数を表します。
        破線の赤いリングは、平均は低くても要注意リポジトリが混ざっていることを示します(平均値だけでは
        個々のリポジトリのばらつきが見えなくなるため)。ノードをクリックするとその言語のリスクランキングへ移動します。
      </p>
      <div style={S.chartWrap}>
        <LanguageGraphChart
          nodes={data.nodes}
          edges={data.edges}
          highlightLanguages={matchedLanguages}
          onNodeClick={(language) => navigate(`/risk-ranking?language=${encodeURIComponent(language)}`)}
        />
      </div>
    </div>
  );
}
