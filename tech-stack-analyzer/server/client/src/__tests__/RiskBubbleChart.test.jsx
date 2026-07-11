import React from 'react';
import { render, screen } from '@testing-library/react';
import RiskBubbleChart from '../components/RiskBubbleChart.jsx';

const ROWS = [
  { id: 1, owner: 'org', name: 'repo-low', primary_language: 'Python', stars: 1000, total_score: 0.1, bug_ratio_score: 0.2, maintenance_score: 0.1, churn_score: 0.2 },
  { id: 2, owner: 'org', name: 'repo-high', primary_language: 'Ruby', stars: 2000, total_score: 0.9, bug_ratio_score: 0.8, maintenance_score: 0.5, churn_score: 0.7 },
];

test('タイトル・凡例・注記が表示される', () => {
  render(<RiskBubbleChart rows={ROWS} />);
  expect(screen.getByText('リスク分布バブルチャート')).toBeInTheDocument();
  expect(screen.getByText(/低リスク/)).toBeInTheDocument();
  expect(screen.getByText(/要注意/)).toBeInTheDocument();
});

test('データが無い場合は「データがありません」を表示する', () => {
  render(<RiskBubbleChart rows={[]} />);
  expect(screen.getByText('データがありません')).toBeInTheDocument();
});

test('churn_score/bug_ratio_scoreが無い行は描画対象から除外される(エラーにならない)', () => {
  render(<RiskBubbleChart rows={[{ id: 1, owner: 'org', name: 'x', total_score: 0.5 }]} />);
  expect(screen.getByText('データがありません')).toBeInTheDocument();
});
