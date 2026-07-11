import React from 'react';
import { riskColor } from '../riskMeta.js';

// グラフ描画ライブラリを新規導入せず、素のSVGで手組みする(9章のfrappe-gantt前例のように
// バンドルサイズへ影響する重量級ライブラリは今回のノード数・エッジ数の規模には見合わないため)。
// レイアウトはノードを円周上に等間隔配置するだけの単純な方式。

const WIDTH = 640;
const HEIGHT = 420;
const CENTER = { x: WIDTH / 2, y: HEIGHT / 2 };
const LAYOUT_RADIUS = 150;
const NODE_RADIUS_RANGE = [18, 42];
const EDGE_WIDTH_RANGE = [1.5, 10];

function scale(value, [inMin, inMax], [outMin, outMax]) {
  if (inMax === inMin) return (outMin + outMax) / 2;
  const t = (value - inMin) / (inMax - inMin);
  return outMin + t * (outMax - outMin);
}

export default function LanguageGraphChart({ nodes, edges, onNodeClick }) {
  if (!nodes || nodes.length === 0) {
    return <p style={{ color: '#475569', padding: 16, textAlign: 'center' }}>データがありません</p>;
  }

  const repoCounts = nodes.map((n) => n.repoCount);
  const repoCountRange = [Math.min(...repoCounts), Math.max(...repoCounts)];
  const weights = edges.map((e) => e.weight);
  const weightRange = weights.length ? [Math.min(...weights), Math.max(...weights)] : [0, 1];

  const positions = new Map(
    nodes.map((n, i) => {
      const angle = (i / nodes.length) * 2 * Math.PI - Math.PI / 2;
      return [
        n.language,
        {
          x: CENTER.x + LAYOUT_RADIUS * Math.cos(angle),
          y: CENTER.y + LAYOUT_RADIUS * Math.sin(angle),
        },
      ];
    })
  );

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="言語関係グラフ" style={{ width: '100%', height: 'auto' }}>
      {edges.map((e, i) => {
        const from = positions.get(e.source);
        const to = positions.get(e.target);
        if (!from || !to) return null;
        const strokeWidth = scale(e.weight, weightRange, EDGE_WIDTH_RANGE);
        return (
          <line
            key={i}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            stroke="#334155"
            strokeWidth={strokeWidth}
            strokeOpacity={0.6}
          >
            <title>{`${e.source} ⇔ ${e.target}(共起 ${e.weight}件)`}</title>
          </line>
        );
      })}
      {nodes.map((n) => {
        const pos = positions.get(n.language);
        const r = scale(n.repoCount, repoCountRange, NODE_RADIUS_RANGE);
        return (
          <g
            key={n.language}
            transform={`translate(${pos.x}, ${pos.y})`}
            style={{ cursor: 'pointer' }}
            onClick={() => onNodeClick && onNodeClick(n.language)}
          >
            <circle r={r} fill={riskColor(n.avgRisk)} fillOpacity={0.85} stroke="#0f172a" strokeWidth={2}>
              <title>{`${n.language}: ${n.repoCount}リポジトリ, 平均リスク ${n.avgRisk.toFixed(3)}`}</title>
            </circle>
            <text textAnchor="middle" dy={r + 16} fill="#e2e8f0" fontSize={13} fontWeight={600}>
              {n.language}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
