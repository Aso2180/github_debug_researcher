import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, beforeEach } from 'vitest';
import * as apiClient from '../api/client.js';
import ProjectPlanner from '../pages/ProjectPlanner.jsx';

vi.mock('../api/client.js', () => ({
  postAnalyze: vi.fn(),
}));

// frappe-gantt はSVGをDOM操作で組み立てるため、jsdom上での描画検証はせず軽くモックする
vi.mock('../components/GanttChart.jsx', () => ({
  default: ({ tasks }) => <div data-testid="gantt-chart">{tasks.length}件のタスク</div>,
}));

const MOCK_RESULT = {
  risks: [
    { technology: 'Python', riskLevel: 'high', reason: '破壊的変更が多い', recommendation: 'バージョン固定を徹底する' },
  ],
  effortEstimateMonthPerson: { min: 2, max: 4, basis: '類似リポジトリの規模から推定' },
  ganttTasks: [
    { id: 't1', name: '要件定義', startOffsetDays: 0, durationDays: 5, dependsOn: [], role: 'PM' },
  ],
  dataConfidenceNote: '根拠データが少ないため参考値です',
};

beforeEach(() => {
  vi.mocked(apiClient.postAnalyze).mockReset();
});

async function fillAndSubmit(user, { overview = '概要', goals = 'ゴール' } = {}) {
  await user.type(screen.getByLabelText('プロジェクト概要'), overview);
  await user.type(screen.getByLabelText('ゴール'), goals);
  await user.click(screen.getByRole('button', { name: /分析する/ }));
}

test('フォーム送信で分析結果(リスク・工数・ガントチャート)が表示される', async () => {
  vi.mocked(apiClient.postAnalyze).mockResolvedValue(MOCK_RESULT);
  const user = userEvent.setup();
  render(<ProjectPlanner />);

  await fillAndSubmit(user);

  await waitFor(() => expect(screen.getByText('Python')).toBeInTheDocument());
  expect(screen.getByText('破壊的変更が多い')).toBeInTheDocument();
  expect(screen.getByText(/2〜4 人月/)).toBeInTheDocument();
  expect(screen.getByText(/根拠データが少ないため参考値です/)).toBeInTheDocument();
  expect(screen.getByTestId('gantt-chart')).toBeInTheDocument();
});

test('送信中はローディング表示になる', async () => {
  let resolvePromise;
  vi.mocked(apiClient.postAnalyze).mockReturnValue(new Promise((resolve) => { resolvePromise = resolve; }));
  const user = userEvent.setup();
  render(<ProjectPlanner />);

  await fillAndSubmit(user);
  expect(screen.getByRole('button', { name: /AIが分析中/ })).toBeInTheDocument();

  resolvePromise(MOCK_RESULT);
  await waitFor(() => expect(screen.getByText('Python')).toBeInTheDocument());
});

test('API エラー時にエラーメッセージを表示する', async () => {
  vi.mocked(apiClient.postAnalyze).mockRejectedValue(new Error('リクエストが多すぎます'));
  const user = userEvent.setup();
  render(<ProjectPlanner />);

  await fillAndSubmit(user);

  await waitFor(() => expect(screen.getByText(/エラー/)).toBeInTheDocument());
  expect(screen.getByText(/リクエストが多すぎます/)).toBeInTheDocument();
});

test('candidateStack はカンマ区切りで配列に変換して送信する', async () => {
  vi.mocked(apiClient.postAnalyze).mockResolvedValue(MOCK_RESULT);
  const user = userEvent.setup();
  render(<ProjectPlanner />);

  await user.type(screen.getByLabelText('プロジェクト概要'), '概要');
  await user.type(screen.getByLabelText('ゴール'), 'ゴール');
  await user.type(screen.getByLabelText(/候補の技術スタック/), 'Python, React');
  await user.click(screen.getByRole('button', { name: /分析する/ }));

  await waitFor(() => expect(apiClient.postAnalyze).toHaveBeenCalledWith(
    expect.objectContaining({ candidateStack: ['Python', 'React'] })
  ));
});
