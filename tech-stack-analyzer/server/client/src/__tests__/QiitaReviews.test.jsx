import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi, beforeEach } from 'vitest';
import * as apiClient from '../api/client.js';
import QiitaReviews from '../pages/QiitaReviews.jsx';

vi.mock('../api/client.js', () => ({
  getQiitaReviews: vi.fn(),
  getQiitaReviewHistory: vi.fn(),
}));

const LATEST_REVIEWS = [
  {
    id: 2, tag: 'react', summary: '2回目:いいね数の伸びが加速しており上昇傾向に転じた',
    trend_direction: 'rising', data_points_count: 2, created_at: '2026-01-12T03:00:00Z',
  },
  {
    id: 3, tag: 'vue', summary: 'vueは横ばいで安定して推移している',
    trend_direction: 'stable', data_points_count: 1, created_at: '2026-01-12T03:00:00Z',
  },
];

const REACT_HISTORY = [
  {
    id: 1, tag: 'react', summary: '初回:横ばい', trend_direction: 'stable',
    data_points_count: 1, previous_review_id: null, created_at: '2026-01-05T03:00:00Z',
  },
  {
    id: 2, tag: 'react', summary: '2回目:いいね数の伸びが加速しており上昇傾向に転じた',
    trend_direction: 'rising', data_points_count: 2, previous_review_id: 1, created_at: '2026-01-12T03:00:00Z',
  },
];

beforeEach(() => {
  vi.mocked(apiClient.getQiitaReviews).mockReset().mockResolvedValue(LATEST_REVIEWS);
  vi.mocked(apiClient.getQiitaReviewHistory).mockReset().mockResolvedValue(REACT_HISTORY);
});

test('タグごとの最新レビューがトレンドバッジ付きで表示される', async () => {
  render(<QiitaReviews />);
  await waitFor(() => expect(screen.getByText('react')).toBeInTheDocument());
  expect(screen.getByText('vue')).toBeInTheDocument();
  expect(screen.getByText('↑ 上昇傾向')).toBeInTheDocument();
  expect(screen.getByText('→ 横ばい')).toBeInTheDocument();
  expect(screen.getByText('2回目:いいね数の伸びが加速しており上昇傾向に転じた')).toBeInTheDocument();
});

test('タグをクリックすると過去の観測履歴(最新を除く)が展開表示される', async () => {
  render(<QiitaReviews />);
  await waitFor(() => expect(screen.getByText('react')).toBeInTheDocument());

  fireEvent.click(screen.getByText('react'));

  await waitFor(() => expect(screen.getByText('初回:横ばい')).toBeInTheDocument());
  // 最新(id=2)のsummaryはカード本体に既に表示されているため、履歴展開部分には重複して出ないはず
  expect(screen.getAllByText('2回目:いいね数の伸びが加速しており上昇傾向に転じた').length).toBe(1);
});

test('もう一度クリックすると履歴が閉じる', async () => {
  render(<QiitaReviews />);
  await waitFor(() => expect(screen.getByText('react')).toBeInTheDocument());

  fireEvent.click(screen.getByText('react'));
  await waitFor(() => expect(screen.getByText('初回:横ばい')).toBeInTheDocument());

  fireEvent.click(screen.getByText('react'));
  await waitFor(() => expect(screen.queryByText('初回:横ばい')).not.toBeInTheDocument());
});

test('レビューが無い場合はその旨を表示する', async () => {
  vi.mocked(apiClient.getQiitaReviews).mockResolvedValue([]);
  render(<QiitaReviews />);
  await waitFor(() =>
    expect(screen.getByText(/まだレビューがありません/)).toBeInTheDocument()
  );
});

test('APIエラー時にエラーメッセージを表示する', async () => {
  vi.mocked(apiClient.getQiitaReviews).mockRejectedValueOnce(new Error('API error: 500'));
  render(<QiitaReviews />);
  await waitFor(() => expect(screen.getByText(/エラー/)).toBeInTheDocument());
});
