import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import RiskTable from '../components/RiskTable.jsx';

const ROW_WITH_ARTICLES = {
  id: 1, owner: 'org', name: 'repo-a', primary_language: 'Python', stars: 5000,
  total_score: 0.8, bug_ratio_score: 0.9, maintenance_score: 0.6, churn_score: 0.7,
  qiitaArticles: [
    { tag: 'python', title: 'Pythonの型ヒント入門', url: 'https://qiita.com/a/items/q1', likes_count: 10 },
    { tag: 'python', title: 'asyncioまとめ', url: 'https://qiita.com/b/items/q2', likes_count: 5 },
  ],
};

const ROW_WITHOUT_ARTICLES = {
  id: 2, owner: 'org', name: 'repo-b', primary_language: 'Go', stars: 1000,
  total_score: 0.2, bug_ratio_score: 0.1, maintenance_score: 0.1, churn_score: 0.1,
  qiitaArticles: [],
};

test('関連記事がある行は件数バッジを表示する', () => {
  render(<RiskTable rows={[ROW_WITH_ARTICLES]} onRowClick={() => {}} />);
  expect(screen.getByText('関連Qiita記事 (2件)')).toBeInTheDocument();
});

test('関連記事が無い行は「関連記事なし」と表示する', () => {
  render(<RiskTable rows={[ROW_WITHOUT_ARTICLES]} onRowClick={() => {}} />);
  expect(screen.getByText('関連記事なし')).toBeInTheDocument();
});

test('バッジをクリックするとタイトル・リンクのポップオーバーが開き、行クリック(遷移)は発火しない', () => {
  const onRowClick = vi.fn();
  render(<RiskTable rows={[ROW_WITH_ARTICLES]} onRowClick={onRowClick} />);

  expect(screen.queryByText('Pythonの型ヒント入門')).not.toBeInTheDocument();

  fireEvent.click(screen.getByText('関連Qiita記事 (2件)'));

  const link = screen.getByText('Pythonの型ヒント入門');
  expect(link).toBeInTheDocument();
  expect(link.closest('a')).toHaveAttribute('href', 'https://qiita.com/a/items/q1');
  expect(onRowClick).not.toHaveBeenCalled();
});

test('ポップオーバーは記事本文を一切表示しない', () => {
  render(<RiskTable rows={[ROW_WITH_ARTICLES]} onRowClick={() => {}} />);
  fireEvent.click(screen.getByText('関連Qiita記事 (2件)'));
  expect(screen.queryByText(/body|本文/)).not.toBeInTheDocument();
});
