import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Reading from '../pages/Reading.jsx';

function renderWithRouter() {
  return render(
    <MemoryRouter initialEntries={['/reading']}>
      <Routes>
        <Route path="/reading" element={<Reading />} />
        <Route path="/guide" element={<div>Guide画面</div>} />
      </Routes>
    </MemoryRouter>
  );
}

test('6カテゴリの見出しが表示される', () => {
  renderWithRouter();
  // 冒頭の注記にもカテゴリ名(効率化・生産性向上/業務自動化)が登場するため、見出し(h2)として特定する
  expect(screen.getByRole('heading', { name: /情報共有・ナレッジ共有/ })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /効率化・生産性向上/ })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /業務自動化/ })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /データ分析・市場予測/ })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /省人化/ })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /リスク検知・不正検知/ })).toBeInTheDocument();
});

test('実際にガイドで選べる2カテゴリにのみ「ガイドで選択可」バッジが付く', () => {
  renderWithRouter();
  const badges = screen.getAllByText('ガイドで選択可');
  expect(badges.length).toBe(2);
});

test('選べるカテゴリが2つのみである旨の注記が表示される', () => {
  renderWithRouter();
  expect(screen.getByText(/効率化・生産性向上」「業務自動化」の\s*2カテゴリ/)).toBeInTheDocument();
});

test('まとめセクションと参考情報源が表示される', () => {
  renderWithRouter();
  expect(screen.getByText('まとめ: どのカテゴリにも共通する一つの教訓')).toBeInTheDocument();
  expect(screen.getByText('参考にした情報源')).toBeInTheDocument();
});

test('次へボタンでアーキテクチャガイドへ遷移する', () => {
  renderWithRouter();
  fireEvent.click(screen.getByText('次へ: アーキテクチャガイドへ →'));
  expect(screen.getByText('Guide画面')).toBeInTheDocument();
});
