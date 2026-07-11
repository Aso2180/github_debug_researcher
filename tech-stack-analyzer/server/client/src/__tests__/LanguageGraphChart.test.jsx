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

test('エッジ本数分だけpath要素(曲線)が描画される', () => {
  const { container } = render(<LanguageGraphChart nodes={NODES} edges={EDGES} onNodeClick={() => {}} />);
  expect(container.querySelectorAll('path').length).toBe(1);
  expect(container.querySelectorAll('circle').length).toBe(2);
});

test('ノードにホバーするとツールチップが表示され、離れると消える', () => {
  render(<LanguageGraphChart nodes={NODES} edges={EDGES} onNodeClick={() => {}} />);
  const pythonLabel = screen.getByText('Python');
  fireEvent.mouseEnter(pythonLabel.closest('g'), { clientX: 100, clientY: 100 });
  expect(screen.getByText('リポジトリ数: 10')).toBeInTheDocument();
  fireEvent.mouseLeave(pythonLabel.closest('g'));
  expect(screen.queryByText('リポジトリ数: 10')).not.toBeInTheDocument();
});

function parseTranslate(g) {
  const m = g.getAttribute('transform').match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
  return { x: Number(m[1]), y: Number(m[2]) };
}

test('force-directedレイアウトにより、正円周上の等間隔配置(単純な正多角形)にはならない', () => {
  const manyNodes = [
    { language: 'Python', repoCount: 10, avgRisk: 0.1 },
    { language: 'TypeScript', repoCount: 10, avgRisk: 0.2 },
    { language: 'Ruby', repoCount: 10, avgRisk: 0.3 },
    { language: 'Go', repoCount: 10, avgRisk: 0.4 },
  ];
  const manyEdges = [
    { source: 'Python', target: 'TypeScript', weight: 5 },
    { source: 'Ruby', target: 'TypeScript', weight: 3 },
    { source: 'Go', target: 'Python', weight: 2 },
  ];
  const { container } = render(<LanguageGraphChart nodes={manyNodes} edges={manyEdges} onNodeClick={() => {}} />);
  const nodeGroups = Array.from(container.querySelectorAll('svg > g')).filter((g) =>
    manyNodes.some((n) => g.textContent === n.language)
  );
  expect(nodeGroups.length).toBe(4);
  const positions = nodeGroups.map(parseTranslate);
  const center = { x: 320, y: 210 };
  const distances = positions.map((p) => Math.hypot(p.x - center.x, p.y - center.y));
  // 単純な円周上の等間隔配置(旧実装)なら中心からの距離が4点とも同じ(150px)になるが、
  // force-directedレイアウトではエッジの重みに応じて中心からの距離にばらつきが出るはず
  const maxDist = Math.max(...distances);
  const minDist = Math.min(...distances);
  expect(maxDist - minDist).toBeGreaterThan(5);
});

function nodeGroupsOf(container, languages) {
  return Array.from(container.querySelectorAll('svg > g')).filter((g) =>
    languages.some((lang) => g.textContent === lang)
  );
}

test('同じノード・エッジの入力なら、再レンダリングしてもレイアウトは決定的(揺れない)', () => {
  const manyNodes = [
    { language: 'Python', repoCount: 10, avgRisk: 0.1 },
    { language: 'TypeScript', repoCount: 10, avgRisk: 0.2 },
    { language: 'Ruby', repoCount: 10, avgRisk: 0.3 },
  ];
  const manyEdges = [{ source: 'Python', target: 'TypeScript', weight: 5 }];
  const languages = manyNodes.map((n) => n.language);
  const { container: c1 } = render(<LanguageGraphChart nodes={manyNodes} edges={manyEdges} onNodeClick={() => {}} />);
  const { container: c2 } = render(<LanguageGraphChart nodes={manyNodes} edges={manyEdges} onNodeClick={() => {}} />);
  const positions1 = nodeGroupsOf(c1, languages).map(parseTranslate);
  const positions2 = nodeGroupsOf(c2, languages).map(parseTranslate);
  expect(positions1).toEqual(positions2);
});
