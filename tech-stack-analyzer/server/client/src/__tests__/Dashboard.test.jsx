import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi, beforeEach } from 'vitest';
import * as apiClient from '../api/client.js';
import Dashboard from '../pages/Dashboard.jsx';

vi.mock('../api/client.js', () => ({
  getRiskRanking: vi.fn(),
}));

const MOCK_ROWS = [
  { id: 1, primary_language: 'Python', total_score: 0.5 },
  { id: 2, primary_language: 'Python', total_score: 0.3 },
  { id: 3, primary_language: 'TypeScript', total_score: 0.2 },
];

beforeEach(() => {
  vi.mocked(apiClient.getRiskRanking).mockResolvedValue(MOCK_ROWS);
});

test('言語別サマリカードが表示される', async () => {
  render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/risk-ranking" element={<div>RiskRanking</div>} />
      </Routes>
    </MemoryRouter>
  );
  await waitFor(() => expect(screen.getAllByText('Python').length).toBeGreaterThan(0));
  expect(screen.getByText('TypeScript')).toBeInTheDocument();
});

test('API エラー時にエラーメッセージを表示する', async () => {
  vi.mocked(apiClient.getRiskRanking).mockRejectedValueOnce(new Error('API error: 500'));
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
      </Routes>
    </MemoryRouter>
  );
  await waitFor(() => expect(screen.getByText(/エラー/)).toBeInTheDocument());
});

test('平均は低くても要注意リポジトリが混ざっていれば「n件が要注意」バッジを表示する(平均値が分布を隠す問題への対応)', async () => {
  // Python: 平均は(0.1+0.2+0.85)/3≈0.383で低リスク帯に見えるが、0.85の1件は要注意(>=0.7)
  vi.mocked(apiClient.getRiskRanking).mockResolvedValue([
    { id: 1, primary_language: 'Python', total_score: 0.1 },
    { id: 2, primary_language: 'Python', total_score: 0.2 },
    { id: 3, primary_language: 'Python', total_score: 0.85 },
  ]);
  render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/risk-ranking" element={<div>RiskRanking</div>} />
      </Routes>
    </MemoryRouter>
  );
  await waitFor(() => expect(screen.getByText('Python')).toBeInTheDocument());
  expect(screen.getByText('⚠ 1件が要注意')).toBeInTheDocument();
});

test('要注意リポジトリが無い言語にはバッジを表示しない', async () => {
  vi.mocked(apiClient.getRiskRanking).mockResolvedValue([
    { id: 1, primary_language: 'Ruby', total_score: 0.1 },
    { id: 2, primary_language: 'Ruby', total_score: 0.2 },
  ]);
  render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/risk-ranking" element={<div>RiskRanking</div>} />
      </Routes>
    </MemoryRouter>
  );
  await waitFor(() => expect(screen.getByText('Ruby')).toBeInTheDocument());
  expect(screen.queryByText(/件が要注意/)).not.toBeInTheDocument();
});
