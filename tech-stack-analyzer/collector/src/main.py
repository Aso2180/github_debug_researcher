"""バッチ実行エントリポイント

使い方:
    python -m src.main --languages python,typescript --min-stars 1000 --max-repos 5
"""
import argparse
import logging

from src.clients.github_client import GitHubClient
from src.clients.qiita_client import QiitaClient
from src.collectors.repo_collector import collect_repositories_for_language
from src.collectors.dependency_collector import collect_dependencies
from src.collectors.qiita_trend_collector import collect_qiita_trends_for_tags
from src.analysis.risk_score import calculate_and_save_risk_score
from src.config import GITHUB_TOKEN, QIITA_TOKEN, GITHUB_SEARCH_MIN_INTERVAL_SEC
from src.db.session import get_engine, init_db, get_session_factory

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def parse_args():
    parser = argparse.ArgumentParser(description="技術スタック解析データ収集バッチ")
    parser.add_argument("--languages", required=True, help="カンマ区切りの対象言語 (例: python,typescript)")
    parser.add_argument("--min-stars", type=int, default=1000)
    parser.add_argument("--max-repos", type=int, default=10, help="言語あたりの最大収集リポジトリ数")
    parser.add_argument("--max-packages", type=int, default=20, help="1リポジトリあたりの依存関係収集上限")
    parser.add_argument("--churn-sample-size", type=int, default=15, help="チャーン計算に使う直近コミット数")
    parser.add_argument("--skip-dependencies", action="store_true", help="SBOM/依存関係収集をスキップ")
    parser.add_argument("--skip-deprecation-check", action="store_true", help="npm/PyPIへの非推奨チェックをスキップ")
    parser.add_argument("--qiita-tags", default="", help="カンマ区切りのQiitaタグ (例: rails,django)。空なら収集しない")
    parser.add_argument("--qiita-max-pages", type=int, default=3, help="Qiitaタグ1件あたりの最大ページ数")
    return parser.parse_args()


def run(languages: list[str], min_stars: int, max_repos: int, max_packages: int = 20,
        churn_sample_size: int = 15, skip_dependencies: bool = False, skip_deprecation_check: bool = False,
        qiita_tags: list[str] | None = None, qiita_max_pages: int = 3):
    engine = get_engine()
    init_db(engine)
    session_factory = get_session_factory(engine)
    session = session_factory()

    # 未認証の場合、Search APIのレート制限は10req/分とさらに厳しいため間隔を広げる
    min_interval = GITHUB_SEARCH_MIN_INTERVAL_SEC if GITHUB_TOKEN else 6.5
    client = GitHubClient(token=GITHUB_TOKEN, min_search_interval_sec=min_interval)

    try:
        for language in languages:
            logger.info("=== 言語 '%s' の収集を開始 ===", language)
            repos = collect_repositories_for_language(
                session, client, language=language, min_stars=min_stars, max_repos=max_repos
            )
            for repo in repos:
                if not skip_dependencies:
                    try:
                        collect_dependencies(
                            session, client, repo,
                            max_packages=max_packages,
                            check_deprecation=not skip_deprecation_check,
                        )
                    except Exception as e:
                        logger.warning("%s: 依存関係収集に失敗(スキップして続行): %s", repo.full_name, e)

                risk = calculate_and_save_risk_score(
                    session, repo, github_client=client, churn_sample_size=churn_sample_size
                )
                logger.info(
                    "リスクスコア算出: %s -> total=%.3f (bug=%.3f, maintenance=%.3f, churn=%.3f)",
                    repo.full_name, risk.total_score, risk.bug_ratio_score,
                    risk.maintenance_score, risk.churn_score,
                )

        if qiita_tags:
            logger.info("=== Qiitaトレンド収集を開始: %s ===", qiita_tags)
            qiita_client = QiitaClient(token=QIITA_TOKEN)
            collect_qiita_trends_for_tags(session, qiita_client, qiita_tags, max_pages=qiita_max_pages)
    finally:
        session.close()

    logger.info("バッチ処理完了")


if __name__ == "__main__":
    args = parse_args()
    langs = [lang.strip() for lang in args.languages.split(",") if lang.strip()]
    tags = [tag.strip() for tag in args.qiita_tags.split(",") if tag.strip()]
    run(langs, args.min_stars, args.max_repos, args.max_packages,
        args.churn_sample_size, args.skip_dependencies, args.skip_deprecation_check,
        tags, args.qiita_max_pages)
