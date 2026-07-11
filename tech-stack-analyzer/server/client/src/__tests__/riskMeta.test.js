import { riskColor, RISK_THRESHOLDS } from '../riskMeta.js';

// RiskBubbleChart・RiskTableはいずれもこのriskColor()で色分けする。
// recharts の ResponsiveContainer は jsdom 上ではサイズ0のため実SVGを描画しない
// (ResizeObserverポリフィルがresizeを発火しない既存の環境制約)ため、
// 境界値の色分けはチャート描画ではなくこの共通関数で直接検証する。
test('リスク0付近(閾値未満)は低リスク色', () => {
  expect(riskColor(0)).toBe('#22c55e');
  expect(riskColor(RISK_THRESHOLDS.medium - 0.001)).toBe('#22c55e');
});

test('中間の閾値ちょうどは注意色', () => {
  expect(riskColor(RISK_THRESHOLDS.medium)).toBe('#f59e0b');
  expect(riskColor(RISK_THRESHOLDS.high - 0.001)).toBe('#f59e0b');
});

test('リスク1付近(高閾値以上)は要注意色', () => {
  expect(riskColor(RISK_THRESHOLDS.high)).toBe('#ef4444');
  expect(riskColor(1)).toBe('#ef4444');
});
