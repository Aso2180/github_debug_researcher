"""環境変数・定数管理モジュール"""
import os
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")
QIITA_TOKEN = os.getenv("QIITA_TOKEN", "")

# 開発時はSQLite、本番はDATABASE_URL(PostgreSQL)を環境変数で上書きする
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./tech_stack.db")

# GitHub Search APIのレート制限(認証済みで30req/分) -> 安全マージンを取り2秒間隔
GITHUB_SEARCH_MIN_INTERVAL_SEC = 2.0

# リスクスコアの重み(合計1.0になるよう調整すること)
RISK_WEIGHTS = {
    "bug": 0.4,
    "maintenance": 0.3,
    "churn": 0.3,
}
