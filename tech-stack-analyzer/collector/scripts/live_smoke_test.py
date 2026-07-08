"""実際のGitHub公開APIに対する軽量疎通確認スクリプト

この時点でsandbox共有IPのcore APIレート制限(60/h)が枯渇していたため、
別枠であるSearch API(search_repositories, search_issue_count)のみを使い、
DB保存〜リスクスコア計算までのパイプラインが実データで動くことを確認する。
"""
import logging
import sys

sys.path.insert(0, ".")

from src.clients.github_client import GitHubClient
from src.collectors.repo_collector import upsert_repository, collect_issue_stats
from src.analysis.risk_score import calculate_and_save_risk_score
from src.db.session import get_engine, init_db, get_session_factory

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def main():
    engine = get_engine("sqlite:///./tech_stack.db")
    init_db(engine)
    session = get_session_factory(engine)()

    client = GitHubClient(min_search_interval_sec=6.5)  # 未認証: 10req/分に合わせる

    logger.info("Search APIで実際のGitHubリポジトリを検索します(language:python, stars>=100000)")
    result = client.search_repositories(language="python", min_stars=100000, per_page=1)
    logger.info("total_count(条件に合致する件数) = %s", result.get("total_count"))
    repo_json = result["items"][0]
    logger.info("取得したリポジトリ: %s (stars=%s)", repo_json["full_name"], repo_json["stargazers_count"])

    repo = upsert_repository(session, repo_json)
    session.commit()
    logger.info("DBに保存しました: id=%s full_name=%s", repo.id, repo.full_name)

    collect_issue_stats(session, client, repo, labels=("bug",))
    session.commit()
    logger.info("issue統計(bugラベル)をDBに保存しました")

    risk = calculate_and_save_risk_score(session, repo)
    logger.info(
        "リスクスコア算出結果: total=%.3f (bug=%.3f, maintenance=%.3f, churn=%.3f[プレースホルダ])",
        risk.total_score, risk.bug_ratio_score, risk.maintenance_score, risk.churn_score,
    )


if __name__ == "__main__":
    main()
