import React, { Suspense, lazy, useEffect, useState } from 'react';
import { postAnalyze, getRepos, getQiitaTrends } from '../api/client.js';
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
  hint: { fontSize: 12, color: '#64748b', marginBottom: 8 },
  chipGroup: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  chip: (selected) => ({
    display: 'inline-flex', alignItems: 'center', padding: '6px 14px', borderRadius: 9999,
    fontSize: 13, cursor: 'pointer', userSelect: 'none',
    border: `1px solid ${selected ? '#2563eb' : '#334155'}`,
    background: selected ? '#1d4ed8' : 'transparent',
    color: selected ? '#f1f5f9' : '#94a3b8',
  }),
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

const initialForm = { projectOverview: '', goals: '', candidateStack: [] };

export default function ProjectPlanner() {
  const [form, setForm] = useState(initialForm);
  const [stackOptions, setStackOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  // 「候補の技術スタック」は自由記述にせず、実際にDBに存在する言語・Qiitaタグからのみ選ばせる。
  // 自由記述だと表記揺れ(例: "react" vs "React")で照合に失敗してもユーザーに何も伝わらない
  // (analyze.js側は完全一致でSQLのIN句に渡すため、サイレントに0件になる)。
  useEffect(() => {
    Promise.all([getRepos({ limit: 200 }), getQiitaTrends()])
      .then(([repos, trends]) => {
        const languages = repos.map((r) => r.primary_language).filter(Boolean);
        const tags = trends.map((t) => t.tag).filter(Boolean);
        setStackOptions([...new Set([...languages, ...tags])].sort());
      })
      .catch(() => setStackOptions([]));
  }, []);

  const onChange = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const toggleStack = (value) => {
    setForm((f) => ({
      ...f,
      candidateStack: f.candidateStack.includes(value)
        ? f.candidateStack.filter((v) => v !== value)
        : [...f.candidateStack, value],
    }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const body = await postAnalyze({
        projectOverview: form.projectOverview,
        goals: form.goals,
        ...(form.candidateStack.length ? { candidateStack: form.candidateStack } : {}),
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
            placeholder="例: 社内向けの経費精算SaaSを新規開発する。既存のExcel運用を置き換え、承認フローと領収書OCRを提供したい。"
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
            placeholder="例: 半年以内にMVPをリリースし、月間の経費精算件数1,000件を無停止で処理できるようにする。"
            required
          />
        </div>
        <div style={S.field}>
          <div style={S.label}>候補の技術スタック(任意)</div>
          {stackOptions.length > 0 ? (
            <>
              <p style={S.hint}>収集済みデータに存在する言語・技術のみ選べます(選ぶと分析結果の精度が上がります)</p>
              <div role="group" aria-label="候補の技術スタック(任意)" style={S.chipGroup}>
                {stackOptions.map((opt) => {
                  const selected = form.candidateStack.includes(opt);
                  return (
                    <label key={opt} style={S.chip(selected)}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleStack(opt)}
                        style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
                      />
                      {opt}
                    </label>
                  );
                })}
              </div>
            </>
          ) : (
            <p style={S.hint}>選択可能な候補を読み込み中、または収集済みデータがまだありません。未選択でも分析できます。</p>
          )}
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
