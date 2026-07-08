import React from 'react';

function riskColor(v) {
  if (v >= 0.7) return '#ef4444';
  if (v >= 0.4) return '#f59e0b';
  return '#22c55e';
}

const LANG_COLORS = {
  Python: '#3b7ebf', TypeScript: '#3178c6', JavaScript: '#f7df1e',
  Ruby: '#cc342d', Go: '#00add8', Rust: '#ce422b', Java: '#ed8b00',
};

export default function LanguageSummaryCard({ data, onClick }) {
  const { language, repoCount, avgRisk } = data;
  const color = LANG_COLORS[language] || '#64748b';
  const risk = Number(avgRisk);

  return (
    <div
      onClick={onClick}
      style={{
        background: '#1e293b', border: `1px solid #334155`, borderRadius: 10,
        padding: 20, cursor: 'pointer', transition: 'border-color 0.15s',
        borderTop: `3px solid ${color}`,
      }}
      onMouseEnter={(e) => e.currentTarget.style.borderColor = '#3b82f6'}
      onMouseLeave={(e) => e.currentTarget.style.borderColor = '#334155'}
    >
      <div style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9', marginBottom: 12 }}>{language}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>リポジトリ数</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#e2e8f0' }}>{repoCount}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>平均リスク</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: riskColor(risk) }}>{risk.toFixed(3)}</div>
        </div>
      </div>
    </div>
  );
}
