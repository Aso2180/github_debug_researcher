import React from 'react';
import { riskColor } from '../riskMeta.js';

const LANG_COLORS = {
  Python: '#3b7ebf', TypeScript: '#3178c6', JavaScript: '#f7df1e',
  Ruby: '#cc342d', Go: '#00add8', Rust: '#ce422b', Java: '#ed8b00',
};

export default function LanguageSummaryCard({ data, onClick, highlighted = false }) {
  const { language, repoCount, avgRisk, minRisk, maxRisk, highRiskCount } = data;
  const color = LANG_COLORS[language] || '#64748b';
  const risk = Number(avgRisk);
  const hasRange = minRisk !== undefined && maxRisk !== undefined;

  return (
    <div
      onClick={onClick}
      style={{
        background: '#1e293b', border: `1px solid ${highlighted ? '#60a5fa' : '#334155'}`, borderRadius: 10,
        padding: 20, cursor: 'pointer', transition: 'border-color 0.15s',
        boxShadow: highlighted ? '0 0 0 1px #60a5fa' : 'none',
      }}
      onMouseEnter={(e) => e.currentTarget.style.borderColor = '#3b82f6'}
      onMouseLeave={(e) => e.currentTarget.style.borderColor = highlighted ? '#60a5fa' : '#334155'}
    >
      {/* アーキテクチャガイドで選択した構成に含まれる言語をアクセント枠+タグでハイライトする
          (ジャーニーのストーリーをダッシュボードでも追えるようにする)。 */}
      {highlighted && (
        <div style={{ fontSize: 10, fontWeight: 700, color: '#60a5fa', marginBottom: 8 }}>
          🎯 選択中の構成に含まれる言語
        </div>
      )}
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
      {/* 平均だけだと個々のリポジトリのばらつきが隠れてしまう(「最大公約数」化)ため、
          min〜maxの範囲バーと、平均の色に関わらず要注意リポジトリの有無を示すバッジを追加する。 */}
      {hasRange && (
        <div style={{ marginTop: 10 }}>
          <div style={{ position: 'relative', height: 4, borderRadius: 2, background: '#334155' }}>
            <div
              style={{
                position: 'absolute', left: `${minRisk * 100}%`, width: `${Math.max(2, (maxRisk - minRisk) * 100)}%`,
                height: 4, borderRadius: 2, background: '#64748b',
              }}
            />
            <div
              style={{
                position: 'absolute', left: `${risk * 100}%`, top: -2, width: 8, height: 8, borderRadius: '50%',
                background: riskColor(risk), border: '1px solid #0f172a', transform: 'translateX(-50%)',
              }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#475569', marginTop: 3 }}>
            <span>min {minRisk.toFixed(2)}</span>
            <span>max {maxRisk.toFixed(2)}</span>
          </div>
        </div>
      )}
      {highRiskCount > 0 && (
        <div
          style={{
            marginTop: 8, fontSize: 11, fontWeight: 600, color: '#ef4444',
            background: '#ef444422', borderRadius: 4, padding: '3px 8px', display: 'inline-block',
          }}
        >
          ⚠ {highRiskCount}件が要注意
        </div>
      )}
    </div>
  );
}
