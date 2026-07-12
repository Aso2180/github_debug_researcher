import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getUseCaseCategories,
  getPatternsForCategory,
  getArchitecturePattern,
} from '../api/client.js';
import { riskColor, SCORE_META } from '../riskMeta.js';
import JourneyNav from '../components/JourneyNav.jsx';
import RiskLegend from '../components/RiskLegend.jsx';

const LAYER_LABELS = {
  frontend: 'フロントエンド',
  backend: 'バックエンド',
  datastore: 'データストア',
  infra: 'インフラ',
  security: 'セキュリティ',
};

const TIER_LABELS = { light: '軽量構成', enterprise: 'エンタープライズ構成' };

const S = {
  page: { padding: 32, maxWidth: 960, margin: '0 auto' },
  title: { fontSize: 22, fontWeight: 700, color: '#f1f5f9', marginBottom: 4 },
  subtitle: { color: '#64748b', fontSize: 13, marginBottom: 24 },
  back: { color: '#60a5fa', fontSize: 13, cursor: 'pointer', marginBottom: 16, display: 'inline-block' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 },
  card: {
    background: '#1e293b', border: '1px solid #334155', borderRadius: 10,
    padding: 20, cursor: 'pointer', transition: 'border-color 0.15s',
  },
  cardTitle: { fontSize: 16, fontWeight: 700, color: '#f1f5f9', marginBottom: 8 },
  cardDesc: { fontSize: 13, color: '#94a3b8', lineHeight: 1.5 },
  tierBadge: {
    display: 'inline-block', fontSize: 11, fontWeight: 600, padding: '2px 8px',
    borderRadius: 4, marginBottom: 8, color: '#f1f5f9',
  },
  section: { marginTop: 28 },
  sectionTitle: { fontSize: 15, fontWeight: 700, color: '#94a3b8', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 },
  layerGroup: { marginBottom: 16 },
  layerLabel: { fontSize: 12, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  componentCard: {
    background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '12px 16px', marginBottom: 8,
  },
  componentName: { fontWeight: 700, color: '#f1f5f9', marginBottom: 4 },
  componentDesc: { fontSize: 12, color: '#94a3b8', lineHeight: 1.5, marginBottom: 8 },
  repoGroupLabel: { fontSize: 11, color: '#64748b', marginTop: 6, marginBottom: 2 },
  repoRow: { display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0', color: '#cbd5e1' },
  emptyNote: { fontSize: 12, color: '#475569', fontStyle: 'italic' },
  scoreNote: {
    display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
    fontSize: 12, color: '#94a3b8', marginBottom: 16, lineHeight: 1.6,
  },
  riskNotes: {
    background: '#1e293b', border: '1px solid #334155', borderRadius: 8,
    padding: '14px 16px', fontSize: 13, color: '#cbd5e1', lineHeight: 1.7, whiteSpace: 'pre-wrap',
  },
  linkRow: { display: 'flex', gap: 16, marginTop: 32, flexWrap: 'wrap' },
  link: { color: '#60a5fa', fontSize: 13, cursor: 'pointer' },
  err: { color: '#f87171', padding: 16 },
  articleLink: { color: '#60a5fa', fontSize: 12 },
};

export default function Guide() {
  const [step, setStep] = useState(1);
  const [categories, setCategories] = useState([]);
  const [patterns, setPatterns] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [patternDetail, setPatternDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    getUseCaseCategories()
      .then(setCategories)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const openCategory = async (category) => {
    setLoading(true);
    setError(null);
    try {
      const body = await getPatternsForCategory(category.slug);
      setSelectedCategory(category);
      setPatterns(body.patterns || []);
      setStep(2);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const openPattern = async (pattern) => {
    setLoading(true);
    setError(null);
    try {
      const detail = await getArchitecturePattern(pattern.slug);
      setPatternDetail(detail);
      setStep(3);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const backToStep1 = () => {
    setStep(1);
    setSelectedCategory(null);
    setPatterns([]);
  };

  const backToStep2 = () => {
    setStep(2);
    setPatternDetail(null);
  };

  if (loading) return <p style={{ padding: 32, color: '#94a3b8' }}>読み込み中...</p>;

  const componentsByLayer = {};
  if (patternDetail) {
    for (const c of patternDetail.components) {
      if (!componentsByLayer[c.layer]) componentsByLayer[c.layer] = [];
      componentsByLayer[c.layer].push(c);
    }
  }

  return (
    <div style={S.page}>
      <h1 style={S.title}>アーキテクチャガイド</h1>
      <p style={S.subtitle}>
        ユースケースを選ぶと、代表的なアーキテクチャパターンと、収集済みの実データに基づくリスク傾向を確認できます。
      </p>

      <JourneyNav
        pattern={patternDetail?.slug || null}
        nextDisabled={!patternDetail}
        nextDisabledHint={!patternDetail ? 'パターンを選択してください' : undefined}
      />

      {error && <p style={S.err}>エラー: {error}</p>}

      {step === 1 && (
        <div style={S.grid}>
          {categories.map((c) => (
            <div key={c.slug} style={S.card} onClick={() => openCategory(c)}>
              <div style={S.cardTitle}>{c.name}</div>
              <div style={S.cardDesc}>{c.description}</div>
            </div>
          ))}
        </div>
      )}

      {step === 2 && (
        <>
          <span style={S.back} onClick={backToStep1}>← カテゴリ選択に戻る</span>
          <h2 style={{ ...S.cardTitle, marginBottom: 16 }}>{selectedCategory?.name}</h2>
          <div style={S.grid}>
            {patterns.map((p) => (
              <div key={p.slug} style={S.card} onClick={() => openPattern(p)}>
                <span
                  style={{
                    ...S.tierBadge,
                    background: p.tier === 'enterprise' ? '#7c3aed' : '#0891b2',
                  }}
                >
                  {TIER_LABELS[p.tier] || p.tier}
                </span>
                <div style={S.cardTitle}>{p.name}</div>
                <div style={S.cardDesc}>{p.summary}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {step === 3 && patternDetail && (
        <>
          <span style={S.back} onClick={backToStep2}>← パターン選択に戻る</span>
          <h2 style={{ ...S.cardTitle, marginBottom: 4 }}>{patternDetail.name}</h2>
          <p style={S.cardDesc}>{patternDetail.summary}</p>

          <div style={S.section}>
            <div style={S.sectionTitle}>構成要素</div>
            <div style={S.scoreNote}>
              <span>
                各コンポーネントの下にある数値は、実際に収集したGitHubリポジトリの<b>総合リスクスコア</b>
                (0〜1、{SCORE_META.total_score.description})です。上段は該当言語のリスク上位、下段はリスク下位の
                実例で、あくまで実在するリポジトリのサンプルです(そのコンポーネント自体の評価ではありません)。
              </span>
              <RiskLegend />
            </div>
            {Object.entries(componentsByLayer).map(([layer, comps]) => (
              <div key={layer} style={S.layerGroup}>
                <div style={S.layerLabel}>{LAYER_LABELS[layer] || layer}</div>
                {comps.map((c) => (
                  <div key={c.id} style={S.componentCard}>
                    <div style={S.componentName}>{c.component_name}</div>
                    {c.description && <div style={S.componentDesc}>{c.description}</div>}
                    {c.topRiskRepos.length === 0 && c.bottomRiskRepos.length === 0 ? (
                      <div style={S.emptyNote}>
                        該当する実リポジトリデータはまだありません(収集対象言語に一致するものが現時点で無いため)
                      </div>
                    ) : (
                      <>
                        {c.topRiskRepos.length > 0 && (
                          <>
                            <div style={S.repoGroupLabel}>実データ: 該当リポジトリ(リスク上位)</div>
                            {c.topRiskRepos.map((r) => (
                              <div key={`top-${r.id}`} style={S.repoRow}>
                                <span>{r.owner}/{r.name}</span>
                                <span style={{ color: riskColor(Number(r.total_score)) }}>
                                  {Number(r.total_score).toFixed(3)}
                                </span>
                              </div>
                            ))}
                          </>
                        )}
                        {c.bottomRiskRepos.length > 0 && (
                          <>
                            <div style={S.repoGroupLabel}>実データ: 該当リポジトリ(リスク下位)</div>
                            {c.bottomRiskRepos.map((r) => (
                              <div key={`bottom-${r.id}`} style={S.repoRow}>
                                <span>{r.owner}/{r.name}</span>
                                <span style={{ color: riskColor(Number(r.total_score)) }}>
                                  {Number(r.total_score).toFixed(3)}
                                </span>
                              </div>
                            ))}
                          </>
                        )}
                      </>
                    )}
                    {c.qiitaArticles.length > 0 && (
                      <div style={{ marginTop: 6 }}>
                        {c.qiitaArticles.map((a) => (
                          <div key={a.url}>
                            <a href={a.url} target="_blank" rel="noreferrer" style={S.articleLink}>
                              {a.title}
                            </a>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div style={S.section}>
            <div style={S.sectionTitle}>リスク・注意点</div>
            <div style={S.riskNotes}>{patternDetail.risk_notes}</div>
          </div>

          <div style={S.linkRow}>
            <span
              style={{ ...S.link, fontWeight: 700 }}
              onClick={() => navigate(`/planner?pattern=${patternDetail.slug}`)}
            >
              → プランナーで分析する
            </span>
            <span style={S.link} onClick={() => navigate('/')}>ダッシュボードへ</span>
            <span style={S.link} onClick={() => navigate('/risk-ranking')}>リスクランキングへ</span>
            <span style={S.link} onClick={() => navigate('/language-graph')}>言語関係グラフへ</span>
          </div>
        </>
      )}
    </div>
  );
}
