import React from 'react';
import { riskColor } from '../riskMeta.js';

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
      }}
      onMouseEnter={(e) => e.currentTarget.style.borderColor = '#3b82f6'}
      onMouseLeave={(e) => e.currentTarget.style.borderColor = '#334155'}
    >
      {/* 言語を示す色(ブランドカラー)はリスクの色とは無関係なので、太いボーダーではなく
          小さいドットに留めて「危険度の帯」に見えないようにする(前版1.2節参照)。 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <span style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>{language}</span>
      </div>
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
