import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi, beforeEach } from 'vitest';
import * as apiClient from '../api/client.js';
import Guide from '../pages/Guide.jsx';

vi.mock('../api/client.js', () => ({
  getUseCaseCategories: vi.fn(),
  getPatternsForCategory: vi.fn(),
  getArchitecturePattern: vi.fn(),
}));

const CATEGORIES = [
  { slug: 'efficiency', name: '効率化・生産性向上', description: '生産性を高める構成' },
  { slug: 'automation', name: '業務自動化', description: '業務を自動化する構成' },
];

const PATTERNS_RESPONSE = {
  category: { slug: 'efficiency', name: '効率化・生産性向上' },
  patterns: [
    { slug: 'efficiency-light', name: '個人開発・MVP向け軽量構成', tier: 'light', summary: '軽量な構成' },
    { slug: 'efficiency-enterprise', name: 'チーム開発・エンタープライズ向け構成', tier: 'enterprise', summary: 'チーム向けの構成' },
  ],
};

const PATTERN_DETAIL = {
  slug: 'efficiency-enterprise',
  name: 'チーム開発・エンタープライズ向け構成',
  summary: 'チーム向けの構成',
  risk_notes: 'Kubernetesは学習コストが高い',
  components: [
    {
      id: 1,
      layer: 'frontend',
      component_name: 'React/TypeScript',
      description: null,
      topRiskRepos: [{ id: 1, owner: 'org', name: 'ts-repo-high', total_score: 0.8 }],
      bottomRiskRepos: [{ id: 2, owner: 'org', name: 'ts-repo-low', total_score: 0.1 }],
      qiitaArticles: [{ title: 'TSの型テクニック', url: 'https://qiita.com/x/items/1' }],
    },
    {
      id: 2,
      layer: 'infra',
      component_name: 'Docker',
      description: null,
      topRiskRepos: [],
      bottomRiskRepos: [],
      qiitaArticles: [],
    },
  ],
};

beforeEach(() => {
  vi.mocked(apiClient.getUseCaseCategories).mockReset().mockResolvedValue(CATEGORIES);
  vi.mocked(apiClient.getPatternsForCategory).mockReset().mockResolvedValue(PATTERNS_RESPONSE);
  vi.mocked(apiClient.getArchitecturePattern).mockReset().mockResolvedValue(PATTERN_DETAIL);
});

function renderWithRouter() {
  return render(
    <MemoryRouter initialEntries={['/guide']}>
      <Routes>
        <Route path="/guide" element={<Guide />} />
        <Route path="/" element={<div>ダッシュボード画面</div>} />
        <Route path="/risk-ranking" element={<div>RiskRanking画面</div>} />
        <Route path="/language-graph" element={<div>言語関係グラフ画面</div>} />
        <Route path="/planner" element={<div>プランナー画面</div>} />
        <Route path="/reading" element={<div>はじめに画面</div>} />
      </Routes>
    </MemoryRouter>
  );
}

test('Step1: カテゴリカードが表示される', async () => {
  renderWithRouter();
  await waitFor(() => expect(screen.getByText('効率化・生産性向上')).toBeInTheDocument());
  expect(screen.getByText('業務自動化')).toBeInTheDocument();
});

test('Step1→2→3と進み、コンポーネント・リスク文言・実データが表示される', async () => {
  renderWithRouter();
  await waitFor(() => expect(screen.getByText('効率化・生産性向上')).toBeInTheDocument());

  fireEvent.click(screen.getByText('効率化・生産性向上'));
  await waitFor(() => expect(screen.getByText('チーム開発・エンタープライズ向け構成')).toBeInTheDocument());
  expect(screen.getByText('個人開発・MVP向け軽量構成')).toBeInTheDocument();

  fireEvent.click(screen.getByText('チーム開発・エンタープライズ向け構成'));
  await waitFor(() => expect(screen.getByText('Kubernetesは学習コストが高い')).toBeInTheDocument());
  expect(screen.getByText('React/TypeScript')).toBeInTheDocument();
  expect(screen.getByText('org/ts-repo-high')).toBeInTheDocument();
  expect(screen.getByText('org/ts-repo-low')).toBeInTheDocument();
  expect(screen.getByText('TSの型テクニック')).toBeInTheDocument();
});

test('実データが無いコンポーネントは「該当する実リポジトリデータはまだありません」と表示する', async () => {
  renderWithRouter();
  await waitFor(() => expect(screen.getByText('効率化・生産性向上')).toBeInTheDocument());
  fireEvent.click(screen.getByText('効率化・生産性向上'));
  await waitFor(() => expect(screen.getByText('チーム開発・エンタープライズ向け構成')).toBeInTheDocument());
  fireEvent.click(screen.getByText('チーム開発・エンタープライズ向け構成'));
  await waitFor(() => expect(screen.getByText('Docker')).toBeInTheDocument());
  expect(screen.getByText('該当する実リポジトリデータはまだありません')).toBeInTheDocument();
});

test('戻るリンクでStep1・Step2へ戻れる', async () => {
  renderWithRouter();
  await waitFor(() => expect(screen.getByText('効率化・生産性向上')).toBeInTheDocument());
  fireEvent.click(screen.getByText('効率化・生産性向上'));
  await waitFor(() => expect(screen.getByText('チーム開発・エンタープライズ向け構成')).toBeInTheDocument());

  fireEvent.click(screen.getByText('チーム開発・エンタープライズ向け構成'));
  await waitFor(() => expect(screen.getByText('Kubernetesは学習コストが高い')).toBeInTheDocument());

  fireEvent.click(screen.getByText('← パターン選択に戻る'));
  await waitFor(() => expect(screen.getByText('個人開発・MVP向け軽量構成')).toBeInTheDocument());

  fireEvent.click(screen.getByText('← カテゴリ選択に戻る'));
  await waitFor(() => expect(screen.getByText('業務自動化')).toBeInTheDocument());
});

test('他画面への回遊リンクが機能する', async () => {
  renderWithRouter();
  await waitFor(() => expect(screen.getByText('効率化・生産性向上')).toBeInTheDocument());
  fireEvent.click(screen.getByText('効率化・生産性向上'));
  await waitFor(() => expect(screen.getByText('チーム開発・エンタープライズ向け構成')).toBeInTheDocument());
  fireEvent.click(screen.getByText('チーム開発・エンタープライズ向け構成'));
  await waitFor(() => expect(screen.getByText('言語関係グラフへ')).toBeInTheDocument());

  fireEvent.click(screen.getByText('言語関係グラフへ'));
  await waitFor(() => expect(screen.getByText('言語関係グラフ画面')).toBeInTheDocument());
});

test('JourneyNavの「次へ」はパターン選択まで無効化され、選択後にプランナーへ遷移できる', async () => {
  renderWithRouter();
  await waitFor(() => expect(screen.getByText('効率化・生産性向上')).toBeInTheDocument());

  const nextButtons = () => screen.getAllByRole('button').filter((b) => b.textContent.includes('次へ'));
  expect(nextButtons()[0]).toBeDisabled();
  expect(screen.getByText('パターンを選択してください')).toBeInTheDocument();

  fireEvent.click(screen.getByText('効率化・生産性向上'));
  await waitFor(() => expect(screen.getByText('チーム開発・エンタープライズ向け構成')).toBeInTheDocument());
  fireEvent.click(screen.getByText('チーム開発・エンタープライズ向け構成'));
  await waitFor(() => expect(screen.getByText('Kubernetesは学習コストが高い')).toBeInTheDocument());

  await waitFor(() => expect(nextButtons()[0]).not.toBeDisabled());
  fireEvent.click(nextButtons()[0]);
  await waitFor(() => expect(screen.getByText('プランナー画面')).toBeInTheDocument());
});

test('Step3の「→ プランナーで分析する」リンクでプランナーへ遷移する', async () => {
  renderWithRouter();
  await waitFor(() => expect(screen.getByText('効率化・生産性向上')).toBeInTheDocument());
  fireEvent.click(screen.getByText('効率化・生産性向上'));
  await waitFor(() => expect(screen.getByText('チーム開発・エンタープライズ向け構成')).toBeInTheDocument());
  fireEvent.click(screen.getByText('チーム開発・エンタープライズ向け構成'));
  await waitFor(() => expect(screen.getByText('→ プランナーで分析する')).toBeInTheDocument());

  fireEvent.click(screen.getByText('→ プランナーで分析する'));
  await waitFor(() => expect(screen.getByText('プランナー画面')).toBeInTheDocument());
});
