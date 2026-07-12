import React, { useMemo, useRef, useState } from 'react';
import { riskColor, RISK_THRESHOLDS } from '../riskMeta.js';

// グラフ描画ライブラリを新規導入せず、素のSVGで手組みする(9章のfrappe-gantt前例のように
// バンドルサイズへ影響する重量級ライブラリは今回のノード数・エッジ数の規模には見合わないため)。
//
// レイアウトはノードを円周上に等間隔配置するだけでは、ノード数が少ない(4〜8言語程度)場合に
// 単なる正多角形にしか見えず、ネットワーク図としての説得力に欠ける。知識グラフ可視化の定石である
// force-directed layout(ノード同士は反発し、エッジで繋がったノードは引き合う物理シミュレーション)を
// 軽量に自前実装し、有機的な配置にする。乱数はノード集合から決定的にシードするため、
// 同じデータであれば毎回同じレイアウトになる(親の再レンダリングで無関係に揺れ動かない)。

const WIDTH = 640;
const HEIGHT = 420;
const NODE_RADIUS_RANGE = [22, 56];
const EDGE_WIDTH_RANGE = [1.5, 9];
const MARGIN = 64;

function scale(value, [inMin, inMax], [outMin, outMax]) {
  if (inMax === inMin) return (outMin + outMax) / 2;
  const t = (value - inMin) / (inMax - inMin);
  return outMin + t * (outMax - outMin);
}

function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return h || 1;
}

// ノード同士の反発・エッジのバネ引力・中心への弱い吸引を数十回反復して落ち着かせる
// 簡易force-directedレイアウト。共起件数(weight)が大きいエッジほど静止長を短くし、
// 関係が強い言語ほど近くに配置されるようにしている。
function computeForceLayout(nodes, edges) {
  const seed = hashString(nodes.map((n) => n.language).join('|'));
  const rand = mulberry32(seed);
  const center = { x: WIDTH / 2, y: HEIGHT / 2 };

  const positions = new Map(
    nodes.map((n) => [
      n.language,
      {
        x: center.x + (rand() - 0.5) * (WIDTH - MARGIN * 2),
        y: center.y + (rand() - 0.5) * (HEIGHT - MARGIN * 2),
      },
    ])
  );

  const edgeList = edges
    .map((e) => ({ ...e }))
    .filter((e) => positions.has(e.source) && positions.has(e.target));

  const REPULSION = 14000;
  const SPRING_LENGTH = 150;
  const SPRING_STRENGTH = 0.02;
  const CENTER_STRENGTH = 0.01;
  const ITERATIONS = 260;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const cooling = 1 - iter / ITERATIONS;
    const forces = new Map(nodes.map((n) => [n.language, { x: 0, y: 0 }]));

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i].language;
        const b = nodes[j].language;
        const pa = positions.get(a);
        const pb = positions.get(b);
        const dx = pa.x - pb.x;
        const dy = pa.y - pb.y;
        const distSq = dx * dx + dy * dy || 0.01;
        const dist = Math.sqrt(distSq);
        const force = REPULSION / distSq;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        forces.get(a).x += fx;
        forces.get(a).y += fy;
        forces.get(b).x -= fx;
        forces.get(b).y -= fy;
      }
    }

    for (const e of edgeList) {
      const ps = positions.get(e.source);
      const pt = positions.get(e.target);
      const dx = pt.x - ps.x;
      const dy = pt.y - ps.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const restLength = SPRING_LENGTH / (1 + Math.log10(1 + e.weight) * 0.6);
      const diff = dist - restLength;
      const force = diff * SPRING_STRENGTH;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      forces.get(e.source).x += fx;
      forces.get(e.source).y += fy;
      forces.get(e.target).x -= fx;
      forces.get(e.target).y -= fy;
    }

    for (const n of nodes) {
      const p = positions.get(n.language);
      forces.get(n.language).x += (center.x - p.x) * CENTER_STRENGTH;
      forces.get(n.language).y += (center.y - p.y) * CENTER_STRENGTH;
    }

    for (const n of nodes) {
      const p = positions.get(n.language);
      const f = forces.get(n.language);
      p.x = Math.min(WIDTH - MARGIN, Math.max(MARGIN, p.x + f.x * cooling * 0.12));
      p.y = Math.min(HEIGHT - MARGIN, Math.max(MARGIN, p.y + f.y * cooling * 0.12));
    }
  }

  return positions;
}

// 直線ではなく二次ベジェで軽く弧を描く。始点・終点はレイアウトの実座標から決まるため
// カーブの向きも決定的(再描画のたびに揺れない)。
function edgePath(from, to, curvature) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const perpX = -dy / dist;
  const perpY = dx / dist;
  const offset = Math.min(40, dist * curvature);
  const cx = mx + perpX * offset;
  const cy = my + perpY * offset;
  return { d: `M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`, mid: { x: cx, y: cy } };
}

const S = {
  wrap: { position: 'relative' },
  tooltip: {
    position: 'absolute', pointerEvents: 'none', zIndex: 10,
    background: '#1e293b', border: '1px solid #334155', borderRadius: 6,
    padding: '8px 10px', fontSize: 12, color: '#e2e8f0', minWidth: 160,
    boxShadow: '0 8px 20px rgba(0,0,0,0.4)', transform: 'translate(-50%, calc(-100% - 12px))',
  },
  tooltipTitle: { fontWeight: 700, marginBottom: 4, color: '#f1f5f9' },
  tooltipRow: { color: '#94a3b8' },
};

export default function LanguageGraphChart({ nodes, edges, onNodeClick, highlightLanguages = [] }) {
  const highlightSet = new Set(highlightLanguages.map((l) => l.toLowerCase()));
  const wrapRef = useRef(null);
  const [hoverLanguage, setHoverLanguage] = useState(null);
  const [tooltip, setTooltip] = useState(null);

  const positions = useMemo(() => computeForceLayout(nodes || [], edges || []), [nodes, edges]);

  if (!nodes || nodes.length === 0) {
    return <p style={{ color: '#475569', padding: 16, textAlign: 'center' }}>データがありません</p>;
  }

  const repoCounts = nodes.map((n) => n.repoCount);
  const repoCountRange = [Math.min(...repoCounts), Math.max(...repoCounts)];
  const weights = edges.map((e) => e.weight);
  const weightRange = weights.length ? [Math.min(...weights), Math.max(...weights)] : [0, 1];
  // 全エッジに数値ラベルを付けると煩雑になるため、上位3件のみ数値を直接表示する(選択的ラベリング)
  const topEdgeKeys = new Set(
    [...edges]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 3)
      .map((e) => `${e.source}::${e.target}`)
  );

  const connected = hoverLanguage
    ? new Set(
        edges
          .filter((e) => e.source === hoverLanguage || e.target === hoverLanguage)
          .flatMap((e) => [e.source, e.target])
          .concat(hoverLanguage)
      )
    : null;

  function moveTooltip(e, content) {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, content });
  }

  return (
    <div ref={wrapRef} style={S.wrap}>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="言語関係グラフ" style={{ width: '100%', height: 'auto' }}>
        <defs>
          <filter id="node-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000000" floodOpacity="0.45" />
          </filter>
        </defs>
        {edges.map((e, i) => {
          const from = positions.get(e.source);
          const to = positions.get(e.target);
          if (!from || !to) return null;
          const strokeWidth = scale(e.weight, weightRange, EDGE_WIDTH_RANGE);
          const dim = connected && !(connected.has(e.source) && connected.has(e.target));
          const { d, mid } = edgePath(from, to, 0.18);
          const key = `${e.source}::${e.target}`;
          return (
            <g key={i}>
              <path
                d={d}
                fill="none"
                stroke="#64748b"
                strokeWidth={strokeWidth}
                strokeOpacity={dim ? 0.12 : 0.55}
                strokeLinecap="round"
                onMouseMove={(ev) =>
                  moveTooltip(ev, { title: `${e.source} ⇔ ${e.target}`, lines: [`共起件数: ${e.weight}件`] })
                }
                onMouseLeave={() => setTooltip(null)}
                style={{ cursor: 'default', transition: 'stroke-opacity 150ms ease' }}
              />
              {topEdgeKeys.has(key) && !dim && (
                <text
                  x={mid.x}
                  y={mid.y}
                  textAnchor="middle"
                  fontSize={11}
                  fill="#cbd5e1"
                  style={{ paintOrder: 'stroke', stroke: '#0f172a', strokeWidth: 3 }}
                >
                  {e.weight}
                </text>
              )}
            </g>
          );
        })}
        {nodes.map((n) => {
          const pos = positions.get(n.language);
          const r = scale(n.repoCount, repoCountRange, NODE_RADIUS_RANGE);
          const dim = connected && !connected.has(n.language);
          const labelWidth = Math.max(36, n.language.length * 7.5 + 14);
          return (
            <g
              key={n.language}
              transform={`translate(${pos.x}, ${pos.y})`}
              style={{ cursor: 'pointer', opacity: dim ? 0.25 : 1, transition: 'opacity 150ms ease' }}
              onClick={() => onNodeClick && onNodeClick(n.language)}
              onMouseEnter={(e) => {
                setHoverLanguage(n.language);
                moveTooltip(e, {
                  title: n.language,
                  lines: [
                    `リポジトリ数: ${n.repoCount}`,
                    `平均リスク: ${n.avgRisk.toFixed(3)}`,
                    `最小〜最大: ${n.minRisk.toFixed(3)}〜${n.maxRisk.toFixed(3)}`,
                  ],
                });
              }}
              onMouseMove={(e) =>
                moveTooltip(e, {
                  title: n.language,
                  lines: [
                    `リポジトリ数: ${n.repoCount}`,
                    `平均リスク: ${n.avgRisk.toFixed(3)}`,
                    `最小〜最大: ${n.minRisk.toFixed(3)}〜${n.maxRisk.toFixed(3)}`,
                  ],
                })
              }
              onMouseLeave={() => {
                setHoverLanguage(null);
                setTooltip(null);
              }}
            >
              {/* アーキテクチャガイドで選択した構成に含まれる言語を、リスク色とは別の青いリングで
                  ハイライトする(ジャーニーのストーリーをグラフ上でも追えるようにする)。
                  要注意リング(赤)より外側に描画し、両方該当する場合も同心円で共存できるようにする。 */}
              {highlightSet.has(n.language.toLowerCase()) && (
                <circle r={r + 9} fill="none" stroke="#60a5fa" strokeWidth={2.5} strokeDasharray="2 3" />
              )}
              {/* 平均だけを見るとほぼ全言語が緑に見える(16章で判明した「最大公約数」問題)ため、
                  平均とは無関係に「この言語には要注意リポジトリが混ざっている」ことを示すリングを追加する。 */}
              {n.maxRisk >= RISK_THRESHOLDS.high && (
                <circle r={r + 5} fill="none" stroke={riskColor(n.maxRisk)} strokeWidth={2.5} strokeDasharray="4 3" />
              )}
              <circle r={r} fill={riskColor(n.avgRisk)} fillOpacity={0.9} stroke="#0f172a" strokeWidth={2.5} filter="url(#node-shadow)" />
              <rect
                x={-labelWidth / 2}
                y={r + 8}
                width={labelWidth}
                height={20}
                rx={10}
                fill="#0f172a"
                fillOpacity={0.75}
              />
              <text textAnchor="middle" y={r + 22} fill="#f1f5f9" fontSize={13} fontWeight={600}>
                {n.language}
              </text>
            </g>
          );
        })}
      </svg>
      {tooltip && (
        <div style={{ ...S.tooltip, left: tooltip.x, top: tooltip.y }}>
          <div style={S.tooltipTitle}>{tooltip.content.title}</div>
          {tooltip.content.lines.map((line, i) => (
            <div key={i} style={S.tooltipRow}>{line}</div>
          ))}
        </div>
      )}
    </div>
  );
}
