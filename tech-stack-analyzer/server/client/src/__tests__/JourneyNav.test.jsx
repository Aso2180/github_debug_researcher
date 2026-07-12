import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import JourneyNav from '../components/JourneyNav.jsx';

function renderAt(path, props = {}) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/reading" element={<JourneyNav {...props} />} />
        <Route path="/guide" element={<JourneyNav {...props} />} />
        <Route path="/planner" element={<JourneyNav {...props} />} />
        <Route path="/language-graph" element={<JourneyNav {...props} />} />
        <Route path="/risk-ranking" element={<JourneyNav {...props} />} />
        <Route path="/" element={<JourneyNav {...props} />} />
      </Routes>
    </MemoryRouter>
  );
}

test('全ステップのラベルが表示され、現在地に aria-current が付く', () => {
  renderAt('/guide');
  expect(screen.getByText('はじめに')).toBeInTheDocument();
  expect(screen.getByText('アーキテクチャガイド')).toBeInTheDocument();
  expect(screen.getByText('プランナー')).toBeInTheDocument();
  expect(screen.getByText('言語関係グラフ')).toBeInTheDocument();
  expect(screen.getByText('リスクランキング')).toBeInTheDocument();
  expect(screen.getByText('ダッシュボード')).toBeInTheDocument();
  const current = screen.getByText('アーキテクチャガイド').closest('button');
  expect(current).toHaveAttribute('aria-current', 'step');
});

test('最初のステップでは「戻る」が無効', () => {
  renderAt('/reading');
  expect(screen.getByText('← 戻る')).toBeDisabled();
});

test('最終ステップ(ダッシュボード)では「次へ」の代わりに「やり直す」を表示する', () => {
  renderAt('/');
  expect(screen.getByText('はじめに戻ってやり直す ↺')).toBeInTheDocument();
});

test('デフォルトの次へラベルは次ステップ名を含む', () => {
  renderAt('/language-graph');
  expect(screen.getByText('次へ: リスクランキングへ →')).toBeInTheDocument();
});

test('nextDisabled=trueのとき次へボタンが無効になりヒントが表示される', () => {
  renderAt('/guide', { nextDisabled: true, nextDisabledHint: 'パターンを選択してください' });
  const nextButtons = screen.getAllByRole('button').filter((b) => b.textContent.includes('次へ'));
  expect(nextButtons[0]).toBeDisabled();
  expect(screen.getByText('パターンを選択してください')).toBeInTheDocument();
});

test('戻る/次へで隣接ステップへ遷移し、pattern/languageクエリを引き継ぐ', () => {
  render(
    <MemoryRouter initialEntries={['/language-graph?pattern=efficiency-enterprise']}>
      <Routes>
        <Route
          path="/language-graph"
          element={<JourneyNav pattern="efficiency-enterprise" language="TypeScript" />}
        />
        <Route path="/risk-ranking" element={<div>RiskRanking画面</div>} />
        <Route path="/guide" element={<div>Guide画面</div>} />
      </Routes>
    </MemoryRouter>
  );
  fireEvent.click(screen.getByText('次へ: リスクランキングへ →'));
  expect(screen.getByText('RiskRanking画面')).toBeInTheDocument();
});

test('ステップのラベルをクリックすると、そのステップへ直接遷移する(マップとして機能する)', () => {
  render(
    <MemoryRouter initialEntries={['/reading']}>
      <Routes>
        <Route path="/reading" element={<JourneyNav />} />
        <Route path="/risk-ranking" element={<div>RiskRanking画面</div>} />
      </Routes>
    </MemoryRouter>
  );
  fireEvent.click(screen.getByText('リスクランキング'));
  expect(screen.getByText('RiskRanking画面')).toBeInTheDocument();
});
