import React from 'react';
import { READING_SECTIONS, READING_SUMMARY, READING_REFERENCES } from '../data/readingGuide.js';
import JourneyNav from '../components/JourneyNav.jsx';

const S = {
  page: { padding: 32, maxWidth: 860, margin: '0 auto' },
  title: { fontSize: 22, fontWeight: 700, color: '#f1f5f9', marginBottom: 4 },
  subtitle: { color: '#64748b', fontSize: 13, marginBottom: 24, lineHeight: 1.6 },
  section: { marginBottom: 28 },
  sectionHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' },
  sectionTitle: { fontSize: 17, fontWeight: 700, color: '#f1f5f9' },
  intro: { fontSize: 14, color: '#cbd5e1', lineHeight: 1.7, marginBottom: 12 },
  table: { width: '100%', borderCollapse: 'collapse', marginBottom: 12, fontSize: 13 },
  th: { textAlign: 'left', color: '#94a3b8', borderBottom: '1px solid #334155', padding: '6px 10px' },
  td: { color: '#cbd5e1', borderBottom: '1px solid #1e293b', padding: '6px 10px' },
  bullets: { paddingLeft: 20, margin: 0 },
  bullet: { fontSize: 13, color: '#cbd5e1', lineHeight: 1.7, marginBottom: 8 },
  summary: {
    background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '18px 20px', marginBottom: 28,
  },
  references: { fontSize: 12, color: '#64748b', lineHeight: 1.8 },
  refLink: { color: '#60a5fa' },
};

export default function Reading() {
  return (
    <div style={S.page}>
      <h1 style={S.title}>はじめに:エンジニアのための「作りたいものカタログ」</h1>
      <p style={S.subtitle}>
        「こういうシステムを作りたい」という相談の多くは、実は典型的な6つのシーンに当てはまります。
        技術選定を始める前に、代表的な構成と現場でよく聞く「あるある」な落とし穴を確認しておきましょう。
      </p>
      {READING_SECTIONS.map((section) => (
        <div key={section.slug} style={S.section}>
          <div style={S.sectionHeader}>
            <h2 style={S.sectionTitle}>{section.title}</h2>
          </div>
          <p style={S.intro}>{section.intro}</p>
          {section.table && (
            <table style={S.table}>
              <thead>
                <tr>
                  {section.table.headers.map((h) => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {section.table.rows.map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (
                      <td key={j} style={S.td}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <ul style={S.bullets}>
            {section.bullets.map((b, i) => (
              <li key={i} style={S.bullet}>{b}</li>
            ))}
          </ul>
        </div>
      ))}

      <div style={S.summary}>
        <h2 style={S.sectionTitle}>{READING_SUMMARY.title}</h2>
        <p style={S.intro}>{READING_SUMMARY.intro}</p>
        <ul style={S.bullets}>
          {READING_SUMMARY.bullets.map((b, i) => (
            <li key={i} style={S.bullet}>{b}</li>
          ))}
        </ul>
        <p style={S.intro}>{READING_SUMMARY.outro}</p>
      </div>

      <div style={{ ...S.section, marginBottom: 32 }}>
        <h2 style={{ ...S.sectionTitle, fontSize: 14, marginBottom: 8 }}>参考にした情報源</h2>
        <ul style={{ ...S.bullets, ...S.references }}>
          {READING_REFERENCES.map((ref) => (
            <li key={ref.url}>
              <a href={ref.url} target="_blank" rel="noreferrer" style={S.refLink}>{ref.label}</a>
            </li>
          ))}
        </ul>
      </div>

      <JourneyNav />
    </div>
  );
}
