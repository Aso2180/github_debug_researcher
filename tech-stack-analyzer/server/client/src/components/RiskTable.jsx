import React, { useState } from 'react';
import { riskColor, SCORE_META } from '../riskMeta.js';

const COLS = [
  { key: 'owner', label: 'リポジトリ', render: (r) => `${r.owner}/${r.name}` },
  { key: 'primary_language', label: '言語' },
  { key: 'stars', label: 'Stars', render: (r) => r.stars?.toLocaleString() },
  // 色分け(riskColor)は総合リスクのみに適用する。Bug/メンテ/チャーンは個別の意味・閾値が
  // 未整理なため、総合リスク用の閾値を流用した色付けはミスリードになる(中立色で数値のみ表示)。
  { key: 'total_score', label: '総合リスク', risk: true, numeric: true, meta: 'total_score' },
  { key: 'bug_ratio_score', label: 'Bug', numeric: true, meta: 'bug_ratio_score' },
  { key: 'maintenance_score', label: 'メンテ', numeric: true, meta: 'maintenance_score' },
  { key: 'churn_score', label: 'チャーン', numeric: true, meta: 'churn_score' },
];

const S = {
  wrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    textAlign: 'left', padding: '10px 14px', fontSize: 12, color: '#64748b',
    borderBottom: '2px solid #334155', cursor: 'pointer', whiteSpace: 'nowrap',
    userSelect: 'none',
  },
  td: { padding: '10px 14px', fontSize: 13, borderBottom: '1px solid #1e293b' },
  row: { cursor: 'pointer' },
};

export default function RiskTable({ rows, onRowClick }) {
  const [sort, setSort] = useState({ key: 'total_score', dir: -1 });

  const sorted = [...rows].sort((a, b) => {
    const av = a[sort.key] ?? '';
    const bv = b[sort.key] ?? '';
    return (av < bv ? -1 : av > bv ? 1 : 0) * sort.dir;
  });

  function toggleSort(key) {
    setSort((s) => ({ key, dir: s.key === key ? -s.dir : -1 }));
  }

  return (
    <div style={S.wrap}>
      <table style={S.table}>
        <thead>
          <tr>
            <th style={{ ...S.th, width: 32, textAlign: 'center' }}>#</th>
            {COLS.map((c) => (
              <th
                key={c.key}
                style={S.th}
                onClick={() => toggleSort(c.key)}
                title={c.meta ? SCORE_META[c.meta].description : undefined}
              >
                {c.label} {sort.key === c.key ? (sort.dir < 0 ? '▼' : '▲') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr
              key={r.id}
              style={S.row}
              onClick={() => onRowClick(r)}
              onMouseEnter={(e) => e.currentTarget.style.background = '#1e293b'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <td style={{ ...S.td, color: '#475569', textAlign: 'center' }}>{i + 1}</td>
              {COLS.map((c) => (
                <td key={c.key} style={{ ...S.td, color: c.risk ? riskColor(r[c.key]) : '#e2e8f0' }}>
                  {c.render ? c.render(r) : c.risk ? Number(r[c.key]).toFixed(3) : r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <p style={{ padding: 16, color: '#475569', textAlign: 'center' }}>データがありません</p>
      )}
    </div>
  );
}
