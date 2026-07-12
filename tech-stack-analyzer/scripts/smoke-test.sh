#!/usr/bin/env bash
# デプロイ後スモークテスト。
#
# HANDOFF.md 13章で手作業で行った調査(「本番のダッシュボードが真っ白」の原因が
# 「配信されているJSバンドルの中身が古い」ことだった件)を再発防止のためスクリプト化したもの。
# ポイントは「200が返ること」ではなく「バンドルの中身に期待する文字列が実際に含まれること」を
# 確認する点(304/200というステータスコードだけでは、配信されている内容が最新かどうか保証できない)。
#
# 使い方:
#   ./smoke-test.sh <base_url> <dashboard_user> <dashboard_password> [expected_string...]
#
# 例:
#   ./smoke-test.sh https://tech-stack-analyzer-server.blackocean-293be2f2.japaneast.azurecontainerapps.io \
#     "$DASHBOARD_USER" "$DASHBOARD_PASSWORD" "プランナー" "ダッシュボード"
#
#   docker-composeで起動したローカル環境の確認:
#   ./smoke-test.sh http://localhost:3000 devuser devpass "プランナー"

set -euo pipefail

BASE_URL="${1:?使い方: smoke-test.sh <base_url> <dashboard_user> <dashboard_password> [expected_string...]}"
DASHBOARD_USER="${2:?dashboard_user が必要です}"
DASHBOARD_PASSWORD="${3:?dashboard_password が必要です}"
shift 3
EXPECTED_STRINGS=("$@")
if [ ${#EXPECTED_STRINGS[@]} -eq 0 ]; then
  # Phase 2(Qiita記事リンク・バブルチャート・言語関係グラフ)・Phase 3(アーキテクチャガイド)で
  # 追加した画面のUI文字列も含める。13章の「本番だけ新画面が表示されない」事故の再発防止
  # (0.横断的な実装ルール参照)。
  # 注意: ここに入れるのはJSXにハードコードされた静的文字列のみ。カテゴリ名等のDB由来の
  # 動的コンテンツ(例:「効率化・生産性向上」)はバンドルに含まれないため対象外(実際にNGになって判明した)。
  EXPECTED_STRINGS=(
    "プランナー" "ダッシュボード" "リスクランキング"
    "関連Qiita記事" "リスク分布バブルチャート" "言語関係グラフ"
    "アーキテクチャガイド" "構成要素" "リスク・注意点"
    "作りたいものカタログ" "情報共有・ナレッジ共有"
    "Qiitaトレンドレビュー" "定点観測"
  )
fi

FAIL=0

check_status() {
  local desc="$1" expected="$2"; shift 2
  local actual
  actual=$(curl -s -o /dev/null -w "%{http_code}" "$@")
  if [ "$actual" != "$expected" ]; then
    echo "NG: $desc -> expected $expected, got $actual"
    FAIL=1
  else
    echo "OK: $desc ($actual)"
  fi
}

echo "=== 1. /api/health ==="
check_status "/api/health は200" 200 "$BASE_URL/api/health"

echo "=== 2. 認証まわり ==="
check_status "認証なし /api/repos は401" 401 "$BASE_URL/api/repos"
check_status "認証あり /api/repos は200" 200 -u "$DASHBOARD_USER:$DASHBOARD_PASSWORD" "$BASE_URL/api/repos"

echo "=== 3. フロントの配信ルート ==="
check_status "/ は200" 200 "$BASE_URL/"
check_status "/planner は200(SPAフォールバック)" 200 "$BASE_URL/planner"
check_status "/language-graph は200(SPAフォールバック)" 200 "$BASE_URL/language-graph"
check_status "/guide は200(SPAフォールバック)" 200 "$BASE_URL/guide"
check_status "/reading は200(SPAフォールバック)" 200 "$BASE_URL/reading"
check_status "/qiita-reviews は200(SPAフォールバック)" 200 "$BASE_URL/qiita-reviews"

echo "=== 4. 配信されているJSバンドルの中身を実際に検証(ステータスコードだけで判断しない) ==="
INDEX_HTML=$(curl -s "$BASE_URL/")
JS_PATH=$(echo "$INDEX_HTML" | grep -oE '/assets/index-[A-Za-z0-9_-]+\.js' | head -1 || true)
if [ -z "$JS_PATH" ]; then
  echo "NG: index.html から index-*.js への参照が見つからない(ビルド構成が変わった?)"
  FAIL=1
else
  BUNDLE=$(curl -s "$BASE_URL$JS_PATH")
  for s in "${EXPECTED_STRINGS[@]}"; do
    COUNT=$(echo "$BUNDLE" | grep -c "$s" || true)
    if [ "$COUNT" -lt 1 ]; then
      echo "NG: バンドル($JS_PATH)に \"$s\" が含まれていない(古いビルドが配信されている疑い)"
      FAIL=1
    else
      echo "OK: バンドルに \"$s\" が ${COUNT}件 含まれる"
    fi
  done
fi

echo "==="
if [ "$FAIL" -ne 0 ]; then
  echo "スモークテスト失敗"
  exit 1
fi
echo "スモークテスト成功"
