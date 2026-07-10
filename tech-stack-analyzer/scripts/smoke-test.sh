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
  EXPECTED_STRINGS=("プランナー" "ダッシュボード" "リスクランキング")
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
