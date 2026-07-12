import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RiskBubbleChart from '../components/RiskBubbleChart.jsx';

// useNavigate()(バブルクリックでリスクランキングへ遷移する機能)がRouterコンテキストを要求するため
// MemoryRouterで包む。
function renderChart(props) {
  return render(
    <MemoryRouter>
      <RiskBubbleChart {...props} />
    </MemoryRouter>
  );
}

const ROWS = [
  { id: 1, owner: 'org', name: 'repo-low', primary_language: 'Python', stars: 1000, total_score: 0.1, bug_ratio_score: 0.2, maintenance_score: 0.1, churn_score: 0.2 },
  { id: 2, owner: 'org', name: 'repo-high', primary_language: 'Ruby', stars: 2000, total_score: 0.9, bug_ratio_score: 0.8, maintenance_score: 0.5, churn_score: 0.7 },
];

test('タイトル・凡例・注記が表示される', () => {
  renderChart({ rows: ROWS });
  expect(screen.getByText('リスク分布バブルチャート')).toBeInTheDocument();
  expect(screen.getByText(/低リスク/)).toBeInTheDocument();
  expect(screen.getByText(/要注意/)).toBeInTheDocument();
});

test('データが無い場合は「データがありません」を表示する', () => {
  renderChart({ rows: [] });
  expect(screen.getByText('データがありません')).toBeInTheDocument();
});

test('churn_score/bug_ratio_scoreが無い行は描画対象から除外される(エラーにならない)', () => {
  renderChart({ rows: [{ id: 1, owner: 'org', name: 'x', total_score: 0.5 }] });
  expect(screen.getByText('データがありません')).toBeInTheDocument();
});

test('バブルクリックでリスクランキングへ遷移する旨の案内文が表示される', () => {
  // rechartsのResponsiveContainerはjsdomで実SVGを描画しないため(15.2の既知の制約)、
  // 実際のバブルクリックの検証はできない。クリック可能であることの案内文表示のみ検証する。
  renderChart({ rows: ROWS });
  expect(screen.getByText(/バブルをクリックするとその言語のリスクランキングへ移動します/)).toBeInTheDocument();
});
