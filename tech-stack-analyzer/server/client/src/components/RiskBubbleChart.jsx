import React from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, Cell, ResponsiveContainer,
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import { riskColor, SCORE_META } from '../riskMeta.js';
import RiskLegend from './RiskLegend.jsx';

const S = {
  wrap: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, padding: 16 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 12 },
  title: { fontSize: 15, fontWeight: 700, color: '#f1f5f9', margin: 0 },
  note: { fontSize: 11, color: '#64748b', marginTop: 8 },
};

const axisTick = { fill: '#64748b', fontSize: 11 };

export default function RiskBubbleChart({ rows, highlightLanguages = [] }) {
  const navigate = useNavigate();
  const highlightSet = new Set(highlightLanguages.map((l) => l.toLowerCase()));
  const data = (rows || [])
    .filter((r) => r.churn_score != null && r.bug_ratio_score != null)
    .map((r) => ({
      x: Number(r.churn_score),
      y: Number(r.bug_ratio_score),
      z: Number(r.stars) || 0,
      total: Number(r.total_score),
      name: `${r.owner}/${r.name}`,
      language: r.primary_language,
    }));

  return (
    <div style={S.wrap}>
      <div style={S.header}>
        <h2 style={S.title}>リスク分布バブルチャート</h2>
        <RiskLegend />
      </div>
      {data.length === 0 ? (
        <p style={{ color: '#475569', padding: 16, textAlign: 'center' }}>データがありません</p>
      ) : (
        <ResponsiveContainer width="100%" height={360}>
          <ScatterChart margin={{ top: 8, right: 24, bottom: 24, left: 8 }}>
            <XAxis
              type="number"
              dataKey="x"
              name="コードチャーン"
              tick={axisTick}
              label={{ value: 'コードチャーン(変更頻度・0〜1)', position: 'insideBottom', offset: -12, fill: '#64748b', fontSize: 12 }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name="Bug比率"
              tick={axisTick}
              label={{ value: 'Bug比率(手戻り率相当・0〜1)', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 12 }}
            />
            <ZAxis type="number" dataKey="z" range={[60, 600]} name="Stars" />
            <Tooltip
              cursor={{ strokeDasharray: '3 3' }}
              contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, fontSize: 12 }}
              formatter={(value, key) => {
                if (key === 'x') return [value.toFixed(3), 'コードチャーン'];
                if (key === 'y') return [value.toFixed(3), 'Bug比率'];
                if (key === 'z') return [value.toLocaleString(), 'Stars'];
                return [value, key];
              }}
              labelFormatter={() => ''}
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null;
                const p = payload[0].payload;
                return (
                  <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, padding: 10, fontSize: 12, color: '#e2e8f0' }}>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>{p.name}</div>
                    <div>言語: {p.language}</div>
                    <div>総合リスク: {p.total.toFixed(3)}</div>
                    <div>コードチャーン: {p.x.toFixed(3)}</div>
                    <div>Bug比率: {p.y.toFixed(3)}</div>
                    <div>Stars: {p.z.toLocaleString()}</div>
                  </div>
                );
              }}
            />
            <Scatter
              data={data}
              fillOpacity={0.75}
              onClick={(point) => {
                if (point?.language) navigate(`/risk-ranking?language=${encodeURIComponent(point.language)}`);
              }}
            >
              {data.map((d, i) => {
                const isHighlighted = highlightSet.has((d.language || '').toLowerCase());
                return (
                  <Cell
                    key={i}
                    fill={riskColor(d.total)}
                    stroke={isHighlighted ? '#60a5fa' : 'none'}
                    strokeWidth={isHighlighted ? 2 : 0}
                    style={{ cursor: 'pointer' }}
                  />
                );
              })}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      )}
      <p style={S.note}>
        バブルの色は総合リスク({SCORE_META.total_score.description})、大きさはStars数を表します。
        コードチャーン・Bug比率はいずれも0〜1に正規化された値です({SCORE_META.churn_score.description} /
        {' '}{SCORE_META.bug_ratio_score.description})。バブルをクリックするとその言語のリスクランキングへ移動します。
      </p>
    </div>
  );
}
