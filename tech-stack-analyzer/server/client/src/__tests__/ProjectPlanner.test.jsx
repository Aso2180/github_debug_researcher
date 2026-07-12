import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { vi, beforeEach } from 'vitest';
import * as apiClient from '../api/client.js';
import ProjectPlanner from '../pages/ProjectPlanner.jsx';

vi.mock('../api/client.js', () => ({
  postAnalyze: vi.fn(),
  getRepos: vi.fn().mockResolvedValue([]),
  getQiitaTrends: vi.fn().mockResolvedValue([]),
  getArchitecturePattern: vi.fn(),
}));

// JourneyNav(useSearchParams/useLocation/useNavigate)がRouterコンテキストを必要とするため、
// 以前の「素のrender(<ProjectPlanner />)」ではエラーになる。MemoryRouterで包むヘルパーに統一する。
function renderPlanner(initialEntries = ['/planner']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/planner" element={<ProjectPlanner />} />
        <Route path="/language-graph" element={<div>言語関係グラフ画面</div>} />
      </Routes>
    </MemoryRouter>
  );
}

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
  vi.mocked(apiClient.getRepos).mockReset().mockResolvedValue([]);
  vi.mocked(apiClient.getQiitaTrends).mockReset().mockResolvedValue([]);
});

async function fillAndSubmit(user, { overview = '概要', goals = 'ゴール' } = {}) {
  await user.type(screen.getByLabelText('プロジェクト概要'), overview);
  await user.type(screen.getByLabelText('ゴール'), goals);
  await user.click(screen.getByRole('button', { name: /分析する/ }));
}

test('フォーム送信で分析結果(リスク・工数・ガントチャート)が表示される', async () => {
  vi.mocked(apiClient.postAnalyze).mockResolvedValue(MOCK_RESULT);
  const user = userEvent.setup();
  renderPlanner();

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
  renderPlanner();

  await fillAndSubmit(user);
  expect(screen.getByRole('button', { name: /AIが分析中/ })).toBeInTheDocument();

  resolvePromise(MOCK_RESULT);
  await waitFor(() => expect(screen.getByText('Python')).toBeInTheDocument());
});

test('API エラー時にエラーメッセージを表示する', async () => {
  vi.mocked(apiClient.postAnalyze).mockRejectedValue(new Error('リクエストが多すぎます'));
  const user = userEvent.setup();
  renderPlanner();

  await fillAndSubmit(user);

  await waitFor(() => expect(screen.getByText(/エラー/)).toBeInTheDocument());
  expect(screen.getByText(/リクエストが多すぎます/)).toBeInTheDocument();
});

test('候補の技術スタックは実在データ由来のチップから選び、選択した分だけ配列で送信する', async () => {
  vi.mocked(apiClient.postAnalyze).mockResolvedValue(MOCK_RESULT);
  vi.mocked(apiClient.getRepos).mockResolvedValue([
    { id: 1, primary_language: 'Python' },
    { id: 2, primary_language: 'TypeScript' },
  ]);
  vi.mocked(apiClient.getQiitaTrends).mockResolvedValue([{ tag: 'react' }]);
  const user = userEvent.setup();
  renderPlanner();

  await user.type(screen.getByLabelText('プロジェクト概要'), '概要');
  await user.type(screen.getByLabelText('ゴール'), 'ゴール');

  await waitFor(() => expect(screen.getByLabelText('Python')).toBeInTheDocument());
  await user.click(screen.getByLabelText('Python'));
  await user.click(screen.getByLabelText('react'));
  // 自由記述ではないため、実在しない語は選択肢にそもそも出てこない
  expect(screen.queryByLabelText('Rust')).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: /分析する/ }));

  await waitFor(() => expect(apiClient.postAnalyze).toHaveBeenCalledWith(
    expect.objectContaining({ candidateStack: ['Python', 'react'] })
  ));
});

test('?patternがあればバナーを表示し、matchedLanguagesを候補の技術スタックへ自動反映する', async () => {
  vi.mocked(apiClient.postAnalyze).mockResolvedValue(MOCK_RESULT);
  // チップは実在データ(stackOptions)からのみ選べる仕様のため、TypeScriptがチップとして
  // 描画されるにはgetRepos側にもTypeScriptの言語が実在している必要がある
  vi.mocked(apiClient.getRepos).mockResolvedValue([{ id: 1, primary_language: 'TypeScript' }]);
  vi.mocked(apiClient.getArchitecturePattern).mockResolvedValue({
    slug: 'efficiency-enterprise', name: 'チーム開発・エンタープライズ向け構成', matchedLanguages: ['TypeScript'],
  });
  const user = userEvent.setup();
  renderPlanner(['/planner?pattern=efficiency-enterprise']);

  await waitFor(() =>
    expect(screen.getByText(/チーム開発・エンタープライズ向け構成」を元に分析します/)).toBeInTheDocument()
  );
  await waitFor(() => expect(screen.getByLabelText('TypeScript')).toBeChecked());

  await user.type(screen.getByLabelText('プロジェクト概要'), '概要');
  await user.type(screen.getByLabelText('ゴール'), 'ゴール');
  await user.click(screen.getByRole('button', { name: /分析する/ }));

  await waitFor(() => expect(apiClient.postAnalyze).toHaveBeenCalledWith(
    expect.objectContaining({ candidateStack: ['TypeScript'] })
  ));
});

test('プランナーはスキップして言語関係グラフへ進める', async () => {
  const user = userEvent.setup();
  renderPlanner(['/planner?pattern=efficiency-enterprise']);
  await user.click(screen.getByText('スキップして言語関係グラフへ →'));
  expect(screen.getByText('言語関係グラフ画面')).toBeInTheDocument();
});

test('収集済みデータが無い場合は候補の技術スタックが無くても分析できる', async () => {
  vi.mocked(apiClient.postAnalyze).mockResolvedValue(MOCK_RESULT);
  const user = userEvent.setup();
  renderPlanner();

  await fillAndSubmit(user);

  await waitFor(() => expect(apiClient.postAnalyze).toHaveBeenCalledWith(
    expect.not.objectContaining({ candidateStack: expect.anything() })
  ));
});
