import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi, beforeEach } from 'vitest';
import * as apiClient from '../api/client.js';
import RepoDetail from '../pages/RepoDetail.jsx';

vi.mock('../api/client.js', () => ({
  getRepoDetail: vi.fn(),
  getRiskRanking: vi.fn(),
}));

const MOCK_REPO = {
  id: 1, owner: 'org', name: 'my-repo', primary_language: 'Python', stars: 8000,
  last_pushed_at: '2024-06-01T00:00:00Z',
  languages: [{ language: 'Python', byte_size: 80000 }, { language: 'C', byte_size: 20000 }],
  issueStats: [{ label: 'bug', state: 'all', count: 12 }],
  dependencies: [
    { package_name: 'requests', ecosystem: 'pypi', version: '2.31.0', is_deprecated: 0, deprecation_checked: 1 },
    { package_name: 'left-pad', ecosystem: 'npm', version: '1.0.0', is_deprecated: 1, deprecation_checked: 1 },
    { package_name: 'some-go-pkg', ecosystem: 'go', version: '1.0.0', is_deprecated: 0, deprecation_checked: 0 },
  ],
  riskScore: { total_score: 0.45, bug_ratio_score: 0.2, maintenance_score: 0.0, churn_score: 0.3 },
};

beforeEach(() => {
  vi.mocked(apiClient.getRepoDetail).mockResolvedValue(MOCK_REPO);
  vi.mocked(apiClient.getRiskRanking).mockResolvedValue([
    { id: 1, total_score: 0.45 },
  ]);
});

function renderDetail(id = '1') {
  return render(
    <MemoryRouter initialEntries={[`/repos/${id}`]}>
      <Routes>
        <Route path="/repos/:id" element={<RepoDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

test('リポジトリ名とメタ情報が表示される', async () => {
  renderDetail();
  await waitFor(() => expect(screen.getByText('org/my-repo')).toBeInTheDocument());
});

test('非推奨パッケージに「非推奨」バッジが表示される', async () => {
  renderDetail();
  await waitFor(() => expect(screen.getByText('非推奨')).toBeInTheDocument());
});

test('現役パッケージに「現役」バッジが表示される', async () => {
  renderDetail();
  await waitFor(() => expect(screen.getByText('現役')).toBeInTheDocument());
});

test('非推奨チェック未実行のパッケージには「未検証」バッジが表示される', async () => {
  renderDetail();
  await waitFor(() => expect(screen.getByText('未検証')).toBeInTheDocument());
});

test('API エラー時にエラーメッセージを表示する', async () => {
  vi.mocked(apiClient.getRepoDetail).mockRejectedValueOnce(new Error('API error: 500'));
  renderDetail('999');
  await waitFor(() => expect(screen.getByText(/エラー/)).toBeInTheDocument());
});
