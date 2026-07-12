import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

// 「はじめに→ガイド→プランナー(スキップ可)→言語グラフ→リスクランキング→ダッシュボード」という
// 一連のストーリーを、どのページからでも同じ動線マップとして提示するための固定ステップ定義。
const STEPS = [
  { path: '/reading', label: 'はじめに' },
  { path: '/guide', label: 'アーキテクチャガイド' },
  { path: '/planner', label: 'プランナー' },
  { path: '/language-graph', label: '言語関係グラフ' },
  { path: '/risk-ranking', label: 'リスクランキング' },
  { path: '/', label: 'ダッシュボード' },
];

function buildQuery(pattern, language) {
  const params = new URLSearchParams();
  if (pattern) params.set('pattern', pattern);
  if (language) params.set('language', language);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

const S = {
  wrap: {
    background: '#1e293b', border: '1px solid #334155', borderRadius: 8,
    padding: '14px 20px', marginBottom: 24,
  },
  steps: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0, marginBottom: 12 },
  step: { display: 'flex', alignItems: 'center', cursor: 'pointer', background: 'none', border: 'none', padding: 0 },
  circle: (active) => ({
    width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 11, fontWeight: 700, flexShrink: 0,
    background: active ? '#2563eb' : '#334155', color: active ? '#f1f5f9' : '#94a3b8',
  }),
  label: (active) => ({
    fontSize: 12, marginLeft: 6, marginRight: 12, whiteSpace: 'nowrap',
    color: active ? '#f1f5f9' : '#94a3b8', fontWeight: active ? 700 : 400,
  }),
  connector: { width: 20, height: 2, background: '#334155', marginRight: 12, flexShrink: 0 },
  actions: { display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' },
  navButton: (disabled) => ({
    padding: '6px 14px', borderRadius: 6, border: '1px solid #334155', fontSize: 13,
    background: disabled ? 'transparent' : '#0f172a', color: disabled ? '#475569' : '#60a5fa',
    cursor: disabled ? 'not-allowed' : 'pointer',
  }),
  hint: { fontSize: 12, color: '#64748b' },
};

export default function JourneyNav({ pattern = null, language = null, nextLabel, nextDisabled = false, nextDisabledHint }) {
  const location = useLocation();
  const navigate = useNavigate();
  const currentIndex = STEPS.findIndex((s) => s.path === location.pathname);
  const query = buildQuery(pattern, language);

  const goToStep = (index) => navigate(STEPS[index].path + query);

  const isLast = currentIndex === STEPS.length - 1;
  const prevIndex = currentIndex > 0 ? currentIndex - 1 : null;
  const nextIndex = !isLast && currentIndex >= 0 ? currentIndex + 1 : null;

  return (
    <nav style={S.wrap} aria-label="ガイド付きストーリーの動線マップ">
      <div style={S.steps}>
        {STEPS.map((step, i) => {
          const active = i === currentIndex;
          return (
            <React.Fragment key={step.path}>
              <button type="button" style={S.step} onClick={() => goToStep(i)} aria-current={active ? 'step' : undefined}>
                <span style={S.circle(active)}>{i + 1}</span>
                <span style={S.label(active)}>{step.label}</span>
              </button>
              {i < STEPS.length - 1 && <span style={S.connector} aria-hidden="true" />}
            </React.Fragment>
          );
        })}
      </div>
      <div style={S.actions}>
        <button
          type="button"
          style={S.navButton(prevIndex === null)}
          disabled={prevIndex === null}
          onClick={() => prevIndex !== null && goToStep(prevIndex)}
        >
          ← 戻る
        </button>
        {isLast ? (
          <button type="button" style={S.navButton(false)} onClick={() => navigate('/reading')}>
            はじめに戻ってやり直す ↺
          </button>
        ) : (
          <button
            type="button"
            style={S.navButton(nextDisabled)}
            disabled={nextDisabled}
            onClick={() => !nextDisabled && nextIndex !== null && goToStep(nextIndex)}
          >
            {nextLabel || (nextIndex !== null ? `次へ: ${STEPS[nextIndex].label}へ →` : '次へ →')}
          </button>
        )}
        {nextDisabled && nextDisabledHint && <span style={S.hint}>{nextDisabledHint}</span>}
      </div>
    </nav>
  );
}
