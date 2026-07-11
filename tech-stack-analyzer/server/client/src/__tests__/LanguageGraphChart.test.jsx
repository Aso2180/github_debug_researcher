import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import LanguageGraphChart from '../components/LanguageGraphChart.jsx';

const NODES = [
  { language: 'Python', repoCount: 10, avgRisk: 0.1 },
  { language: 'TypeScript', repoCount: 5, avgRisk: 0.8 },
];
const EDGES = [{ source: 'Python', target: 'TypeScript', weight: 3 }];

test('ノードラベルが表示される', () => {
  render(<LanguageGraphChart nodes={NODES} edges={EDGES} onNodeClick={() => {}} />);
  expect(screen.getByText('Python')).toBeInTheDocument();
  expect(screen.getByText('TypeScript')).toBeInTheDocument();
});

test('ノードをクリックするとonNodeClickに言語名が渡される', () => {
  const onNodeClick = vi.fn();
  render(<LanguageGraphChart nodes={NODES} edges={EDGES} onNodeClick={onNodeClick} />);
  fireEvent.click(screen.getByText('Python'));
  expect(onNodeClick).toHaveBeenCalledWith('Python');
});

test('データが無い場合は「データがありません」を表示する', () => {
  render(<LanguageGraphChart nodes={[]} edges={[]} onNodeClick={() => {}} />);
  expect(screen.getByText('データがありません')).toBeInTheDocument();
});

test('エッジ本数分だけline要素が描画される', () => {
  const { container } = render(<LanguageGraphChart nodes={NODES} edges={EDGES} onNodeClick={() => {}} />);
  expect(container.querySelectorAll('line').length).toBe(1);
  expect(container.querySelectorAll('circle').length).toBe(2);
});
