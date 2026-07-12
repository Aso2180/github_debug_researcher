import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import LanguageGraphChart from '../components/LanguageGraphChart.jsx';

// maxRiskはいずれもRISK_THRESHOLDS.high(0.7)未満にし、既存の「circle要素数」系アサーションが
// 要注意リング(maxRisk>=0.7で追加されるcircle)の影響を受けないようにする。リング自体は専用テストで検証する。
const NODES = [
  { language: 'Python', repoCount: 10, avgRisk: 0.1, minRisk: 0.05, maxRisk: 0.2 },
  { language: 'TypeScript', repoCount: 5, avgRisk: 0.55, minRisk: 0.4, maxRisk: 0.65 },
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

test('ノードにホバーするとツールチップ(平均・最小〜最大)が表示され、離れると消える', () => {
  render(<LanguageGraphChart nodes={NODES} edges={EDGES} onNodeClick={() => {}} />);
  const pythonLabel = screen.getByText('Python');
  fireEvent.mouseEnter(pythonLabel.closest('g'), { clientX: 100, clientY: 100 });
  expect(screen.getByText('リポジトリ数: 10')).toBeInTheDocument();
  expect(screen.getByText('最小〜最大: 0.050〜0.200')).toBeInTheDocument();
  fireEvent.mouseLeave(pythonLabel.closest('g'));
  expect(screen.queryByText('リポジトリ数: 10')).not.toBeInTheDocument();
});

test('maxRiskが高いノードには要注意リングが描画される(平均が低くても分かるようにする)', () => {
  const nodes = [
    { language: 'Python', repoCount: 10, avgRisk: 0.2, minRisk: 0.1, maxRisk: 0.75 },
    { language: 'Ruby', repoCount: 5, avgRisk: 0.2, minRisk: 0.15, maxRisk: 0.25 },
  ];
  const { container } = render(<LanguageGraphChart nodes={nodes} edges={[]} onNodeClick={() => {}} />);
  // Python(maxRisk=0.75 >= RISK_THRESHOLDS.high)のgにはリング用の破線circleが余分に含まれる
  const pythonGroup = screen.getByText('Python').closest('g');
  const rubyGroup = screen.getByText('Ruby').closest('g');
  expect(pythonGroup.querySelectorAll('circle').length).toBe(2);
  expect(rubyGroup.querySelectorAll('circle').length).toBe(1);
});

test('highlightLanguagesに含まれる言語には青いジャーニーハイライトリングが描画される', () => {
  const nodes = [
    { language: 'Python', repoCount: 10, avgRisk: 0.2, minRisk: 0.1, maxRisk: 0.2 },
    { language: 'Ruby', repoCount: 5, avgRisk: 0.2, minRisk: 0.15, maxRisk: 0.25 },
  ];
  render(
    <LanguageGraphChart nodes={nodes} edges={[]} onNodeClick={() => {}} highlightLanguages={['Python']} />
  );
  const pythonGroup = screen.getByText('Python').closest('g');
  const rubyGroup = screen.getByText('Ruby').closest('g');
  // Pythonはハイライト対象なので基本circle+青リングの2つ、Rubyはハイライト対象外で1つのまま
  expect(pythonGroup.querySelectorAll('circle').length).toBe(2);
  expect(pythonGroup.querySelector('circle[stroke="#60a5fa"]')).not.toBeNull();
  expect(rubyGroup.querySelectorAll('circle').length).toBe(1);
});

function parseTranslate(g) {
  const m = g.getAttribute('transform').match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
  return { x: Number(m[1]), y: Number(m[2]) };
}

test('force-directedレイアウトにより、正円周上の等間隔配置(単純な正多角形)にはならない', () => {
  const manyNodes = [
    { language: 'Python', repoCount: 10, avgRisk: 0.1, minRisk: 0.05, maxRisk: 0.15 },
    { language: 'TypeScript', repoCount: 10, avgRisk: 0.2, minRisk: 0.1, maxRisk: 0.3 },
    { language: 'Ruby', repoCount: 10, avgRisk: 0.3, minRisk: 0.2, maxRisk: 0.4 },
    { language: 'Go', repoCount: 10, avgRisk: 0.4, minRisk: 0.3, maxRisk: 0.5 },
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
    { language: 'Python', repoCount: 10, avgRisk: 0.1, minRisk: 0.05, maxRisk: 0.15 },
    { language: 'TypeScript', repoCount: 10, avgRisk: 0.2, minRisk: 0.1, maxRisk: 0.3 },
    { language: 'Ruby', repoCount: 10, avgRisk: 0.3, minRisk: 0.2, maxRisk: 0.4 },
  ];
  const manyEdges = [{ source: 'Python', target: 'TypeScript', weight: 5 }];
  const languages = manyNodes.map((n) => n.language);
  const { container: c1 } = render(<LanguageGraphChart nodes={manyNodes} edges={manyEdges} onNodeClick={() => {}} />);
  const { container: c2 } = render(<LanguageGraphChart nodes={manyNodes} edges={manyEdges} onNodeClick={() => {}} />);
  const positions1 = nodeGroupsOf(c1, languages).map(parseTranslate);
  const positions2 = nodeGroupsOf(c2, languages).map(parseTranslate);
  expect(positions1).toEqual(positions2);
});
