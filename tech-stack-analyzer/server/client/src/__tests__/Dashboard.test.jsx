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
