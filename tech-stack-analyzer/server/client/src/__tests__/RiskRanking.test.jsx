import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi, beforeEach } from 'vitest';
import * as apiClient from '../api/client.js';
import RiskRanking from '../pages/RiskRanking.jsx';

vi.mock('../api/client.js', () => ({
  getRiskRanking: vi.fn(),
  getArchitecturePattern: vi.fn(),
}));

const MOCK_ROWS = [
  { id: 1, owner: 'org', name: 'repo-a', primary_language: 'Python', stars: 5000, total_score: 0.8, bug_ratio_score: 0.9, maintenance_score: 0.6, churn_score: 0.7 },
  { id: 2, owner: 'org', name: 'repo-b', primary_language: 'TypeScript', stars: 3000, total_score: 0.3, bug_ratio_score: 0.2, maintenance_score: 0.4, churn_score: 0.3 },
];

beforeEach(() => {
  vi.mocked(apiClient.getRiskRanking).mockResolvedValue(MOCK_ROWS);
});

function renderWithRouter(search = '') {
  return render(
    <MemoryRouter initialEntries={[`/risk-ranking${search}`]}>
      <Routes>
        <Route path="/risk-ranking" element={<RiskRanking />} />
        <Route path="/repos/:id" element={<div>RepoDetail</div>} />
      </Routes>
    </MemoryRouter>
  );
}

test('リポジトリ一覧が表示される', async () => {
  renderWithRouter();
  await waitFor(() => expect(screen.getByText('org/repo-a')).toBeInTheDocument());
  expect(screen.getByText('org/repo-b')).toBeInTheDocument();
});

test('language パラメータがあると言語バッジを表示する', async () => {
  renderWithRouter('?language=Python');
  // language バッジは <span> として表示される
  await waitFor(() => expect(screen.getByText('Python', { selector: 'span' })).toBeInTheDocument());
});

test('API エラー時にエラーメッセージを表示する', async () => {
  vi.mocked(apiClient.getRiskRanking).mockRejectedValueOnce(new Error('API error: 401'));
  renderWithRouter();
  await waitFor(() => expect(screen.getByText(/エラー/)).toBeInTheDocument());
});

test('?patternがあればパターン名を含むバナーを表示する', async () => {
  vi.mocked(apiClient.getArchitecturePattern).mockResolvedValue({
    slug: 'efficiency-enterprise', name: 'チーム開発・エンタープライズ向け構成', matchedLanguages: ['TypeScript'],
  });
  renderWithRouter('?pattern=efficiency-enterprise&language=TypeScript');
  await waitFor(() =>
    expect(screen.getByText('「チーム開発・エンタープライズ向け構成」構成に基づくリスクランキングです。')).toBeInTheDocument()
  );
});
