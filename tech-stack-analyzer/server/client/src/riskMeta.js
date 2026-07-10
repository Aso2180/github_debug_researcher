export const RISK_THRESHOLDS = { high: 0.7, medium: 0.4 };

export function riskColor(value) {
  const n = Number(value);
  if (n >= RISK_THRESHOLDS.high) return '#ef4444';
  if (n >= RISK_THRESHOLDS.medium) return '#f59e0b';
  return '#22c55e';
}

export function riskLevelLabel(value) {
  const n = Number(value);
  if (n >= RISK_THRESHOLDS.high) return '要注意';
  if (n >= RISK_THRESHOLDS.medium) return '注意';
  return '低リスク';
}

// スコアの意味と、値が高いときに何を確認すべきかを1行で示す
export const SCORE_META = {
  total_score: {
    label: '総合リスク',
    description: 'Bug比率・メンテナンス状況・コードチャーンの加重平均(重み: bug40% / メンテ30% / チャーン30%)。',
    whenHigh: '個別スコアのどれが押し上げているかを確認する。',
  },
  bug_ratio_score: {
    label: 'Bugスコア',
    description: '"bug"ラベルissueの累計件数を対数的に0〜1へ正規化(50件前後で上限に近づく)。リポジトリ規模による正規化はまだ未対応。GitHub上のラベル名は完全一致で検索するため、"kind/bug"のような別名ラベルを使うリポジトリでは実態より低く出ることがある。',
    whenHigh: 'バグ報告の絶対数が多い。star数・活動量が大きいリポジトリでは相対的に見る。',
  },
  maintenance_score: {
    label: 'メンテナンス',
    description: '最終push日からの経過日数を0〜1へ正規化(365日以上でほぼ上限)。収集対象(更新の新しい人気リポジトリ)の性質上、ほぼ全リポジトリが0付近に集中しやすい指標。値がまとまって低い場合でも異常ではない。',
    whenHigh: '長期間更新されていない可能性。開発が停止していないか確認する。',
  },
  churn_score: {
    label: 'コードチャーン',
    description: '直近コミットの変更規模から算出。値が大きいほど変更が活発、または不安定。',
    whenHigh: '直近の変更が大きい。破壊的変更や大規模リファクタリングが起きていないか確認する。',
  },
};
