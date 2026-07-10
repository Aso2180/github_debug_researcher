import React, { Suspense, lazy, useState } from 'react';
import { postAnalyze } from '../api/client.js';
import { riskColor, riskLevelLabel } from '../riskMeta.js';

const GanttChart = lazy(() => import('../components/GanttChart.jsx'));

const S = {
  page: { padding: 32, maxWidth: 960, margin: '0 auto' },
  title: { fontSize: 22, fontWeight: 700, color: '#f1f5f9', marginBottom: 4 },
  subtitle: { color: '#64748b', fontSize: 13, marginBottom: 24 },
  field: { marginBottom: 16 },
  label: { display: 'block', fontSize: 13, color: '#94a3b8', marginBottom: 6 },
  textarea: {
    width: '100%', minHeight: 80, padding: '10px 12px', borderRadius: 8,
    background: '#0f172a', border: '1px solid #334155', color: '#f1f5f9', fontSize: 14,
    fontFamily: 'inherit', resize: 'vertical',
  },
  input: {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    background: '#0f172a', border: '1px solid #334155', color: '#f1f5f9', fontSize: 14,
  },
  button: {
    marginTop: 8, padding: '10px 20px', borderRadius: 8, border: 'none',
    background: '#2563eb', color: '#f1f5f9', fontSize: 14, fontWeight: 600, cursor: 'pointer',
  },
  buttonDisabled: { opacity: 0.6, cursor: 'not-allowed' },
  err: { color: '#f87171', padding: '12px 0' },
  section: { marginTop: 32 },
  sectionTitle: { fontSize: 15, fontWeight: 700, color: '#94a3b8', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 },
  banner: {
    background: '#1e293b', border: '1px solid #334155', borderRadius: 8,
    padding: '12px 16px', fontSize: 13, color: '#cbd5e1', marginTop: 24, lineHeight: 1.6,
  },
  riskCard: {
    background: '#1e293b', borderRadius: 8, padding: '14px 16px', border: '1px solid #334155', marginBottom: 10,
  },
  riskHeader: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 },
  riskTech: { fontWeight: 700, color: '#f1f5f9' },
  riskLevel: { fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4 },
  riskReason: { fontSize: 13, color: '#94a3b8', marginBottom: 4, lineHeight: 1.5 },
  riskRec: { fontSize: 13, color: '#cbd5e1', lineHeight: 1.5 },
  effortBox: {
    display: 'flex', alignItems: 'baseline', gap: 10, background: '#1e293b',
    border: '1px solid #334155', borderRadius: 8, padding: '14px 16px',
  },
  effortValue: { fontSize: 24, fontWeight: 700, color: '#f1f5f9' },
  effortBasis: { fontSize: 13, color: '#94a3b8' },
};

const initialForm = { projectOverview: '', goals: '', candidateStack: '' };

export default function ProjectPlanner() {
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const onChange = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const candidateStack = form.candidateStack
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const body = await postAnalyze({
        projectOverview: form.projectOverview,
        goals: form.goals,
        ...(candidateStack.length ? { candidateStack } : {}),
      });
      setResult(body);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={S.page}>
      <h1 style={S.title}>プロジェクトプランナー</h1>
      <p style={S.subtitle}>
        作りたいアプリの概要とゴールを入力すると、収集済みの実データを根拠に技術スタックのリスク・工数レンジ・WBSを提案します。
      </p>

      <form onSubmit={onSubmit}>
        <div style={S.field}>
          <label style={S.label} htmlFor="projectOverview">プロジェクト概要</label>
          <textarea
            id="projectOverview"
            style={S.textarea}
            value={form.projectOverview}
            onChange={onChange('projectOverview')}
            required
          />
        </div>
        <div style={S.field}>
          <label style={S.label} htmlFor="goals">ゴール</label>
          <textarea
            id="goals"
            style={S.textarea}
            value={form.goals}
            onChange={onChange('goals')}
            required
          />
        </div>
        <div style={S.field}>
          <label style={S.label} htmlFor="candidateStack">候補の技術スタック(任意、カンマ区切り)</label>
          <input
            id="candidateStack"
            style={S.input}
            value={form.candidateStack}
            onChange={onChange('candidateStack')}
            placeholder="例: Python, React"
          />
        </div>
        <button type="submit" style={{ ...S.button, ...(loading ? S.buttonDisabled : {}) }} disabled={loading}>
          {loading ? 'AIが分析中...(数秒〜数十秒かかります)' : '分析する'}
        </button>
      </form>

      {error && <p style={S.err}>エラー: {error}</p>}

      {result && (
        <>
          {result.dataConfidenceNote && (
            <div style={S.banner}>ℹ️ {result.dataConfidenceNote}</div>
          )}

          <div style={S.section}>
            <div style={S.sectionTitle}>想定工数</div>
            <div style={S.effortBox}>
              <span style={S.effortValue}>
                {result.effortEstimateMonthPerson?.min}〜{result.effortEstimateMonthPerson?.max} 人月
              </span>
              <span style={S.effortBasis}>{result.effortEstimateMonthPerson?.basis}</span>
            </div>
          </div>

          <div style={S.section}>
            <div style={S.sectionTitle}>技術スタック別リスク</div>
            {(result.risks || []).map((risk, i) => {
              const level = risk.riskLevel === 'high' ? 0.9 : risk.riskLevel === 'medium' ? 0.5 : 0.1;
              const color = riskColor(level);
              return (
                <div key={i} style={S.riskCard}>
                  <div style={S.riskHeader}>
                    <span style={S.riskTech}>{risk.technology}</span>
                    <span style={{ ...S.riskLevel, color, background: `${color}22` }}>
                      {riskLevelLabel(level)}
                    </span>
                  </div>
                  <div style={S.riskReason}>{risk.reason}</div>
                  <div style={S.riskRec}>→ {risk.recommendation}</div>
                </div>
              );
            })}
          </div>

          {result.ganttTasks?.length > 0 && (
            <div style={S.section}>
              <div style={S.sectionTitle}>WBS / ガントチャート</div>
              <Suspense fallback={<p style={{ color: '#94a3b8' }}>ガントチャートを読み込み中...</p>}>
                <GanttChart tasks={result.ganttTasks} />
              </Suspense>
            </div>
          )}
        </>
      )}
    </div>
  );
}
