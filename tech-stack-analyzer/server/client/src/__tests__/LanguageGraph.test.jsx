import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi, beforeEach } from 'vitest';
import * as apiClient from '../api/client.js';
import LanguageGraph from '../pages/LanguageGraph.jsx';

vi.mock('../api/client.js', () => ({
  getLanguageGraph: vi.fn(),
}));

const MOCK_DATA = {
  nodes: [
    { language: 'Python', repoCount: 10, avgRisk: 0.1 },
    { language: 'TypeScript', repoCount: 5, avgRisk: 0.8 },
  ],
  edges: [{ source: 'Python', target: 'TypeScript', weight: 3 }],
};

beforeEach(() => {
  vi.mocked(apiClient.getLanguageGraph).mockResolvedValue(MOCK_DATA);
});

function renderWithRouter() {
  return render(
    <MemoryRouter initialEntries={['/language-graph']}>
      <Routes>
        <Route path="/language-graph" element={<LanguageGraph />} />
        <Route path="/risk-ranking" element={<div>RiskRanking画面</div>} />
      </Routes>
    </MemoryRouter>
  );
}

test('見出しとノードが表示される', async () => {
  renderWithRouter();
  await waitFor(() => expect(screen.getByText('言語関係グラフ')).toBeInTheDocument());
  expect(screen.getByText('Python')).toBeInTheDocument();
  expect(screen.getByText('TypeScript')).toBeInTheDocument();
});

test('ノードクリックでリスクランキング画面(言語フィルタ付き)へ遷移する', async () => {
  renderWithRouter();
  await waitFor(() => expect(screen.getByText('Python')).toBeInTheDocument());
  fireEvent.click(screen.getByText('Python'));
  await waitFor(() => expect(screen.getByText('RiskRanking画面')).toBeInTheDocument());
});

test('API エラー時にエラーメッセージを表示する', async () => {
  vi.mocked(apiClient.getLanguageGraph).mockRejectedValueOnce(new Error('API error: 500'));
  renderWithRouter();
  await waitFor(() => expect(screen.getByText(/エラー/)).toBeInTheDocument());
});
