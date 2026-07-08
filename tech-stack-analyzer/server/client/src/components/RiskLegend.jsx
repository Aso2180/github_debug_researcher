import React from 'react';
import { RISK_THRESHOLDS } from '../riskMeta.js';

const S = {
  wrap: { display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', fontSize: 12, color: '#94a3b8' },
  item: { display: 'flex', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: '50%', display: 'inline-block' },
};

export default function RiskLegend() {
  return (
    <div style={S.wrap}>
      <span style={S.item}><span style={{ ...S.dot, background: '#22c55e' }} /> 低リスク (&lt; {RISK_THRESHOLDS.medium})</span>
      <span style={S.item}><span style={{ ...S.dot, background: '#f59e0b' }} /> 注意 ({RISK_THRESHOLDS.medium}〜{RISK_THRESHOLDS.high})</span>
      <span style={S.item}><span style={{ ...S.dot, background: '#ef4444' }} /> 要注意 (&ge; {RISK_THRESHOLDS.high})</span>
    </div>
  );
}
