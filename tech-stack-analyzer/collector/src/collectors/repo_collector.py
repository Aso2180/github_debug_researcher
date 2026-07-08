"""GitHub上のリポジトリ検索 + 言語構成 + issue統計をDBに保存する"""
import logging
from datetime import datetime, date, UTC

from sqlalchemy.orm import Session

from src.clients.github_client import GitHubClient
from src.db.models import Repository, RepoLanguage, IssueStat

logger = logging.getLogger(__name__)


def _parse_dt(value: str | None):
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def upsert_repository(session: Session, repo_json: dict) -> Repository:
    owner = repo_json["owner"]["login"]
    name = repo_json["name"]

    repo = (
        session.query(Repository)
        .filter_by(owner=owner, name=name)
        .one_or_none()
    )
    if repo is None:
        repo = Repository(owner=owner, name=name)
        session.add(repo)

    repo.primary_language = repo_json.get("language")
    repo.stars = repo_json.get("stargazers_count", 0)
    repo.last_pushed_at = _parse_dt(repo_json.get("pushed_at"))
    repo.fetched_at = datetime.now(UTC)
    session.flush()  # repo.id を確定させる
    return repo


def collect_languages(session: Session, client: GitHubClient, repo: Repository):
    langs = client.get_languages(repo.owner, repo.name)
    # 同一リポジトリの古いレコードは削除してから最新を挿入(再取得のたびに洗い替え)
    session.query(RepoLanguage).filter_by(repo_id=repo.id).delete()
    for lang, byte_size in langs.items():
        session.add(RepoLanguage(repo_id=repo.id, language=lang, byte_size=byte_size))


def collect_issue_stats(session: Session, client: GitHubClient, repo: Repository, labels=("bug", "regression")):
    today = date.today()
    for label in labels:
        count = client.search_issue_count(repo.owner, repo.name, label=label, state="all")
        session.add(
            IssueStat(
                repo_id=repo.id,
                label=label,
                state="all",
                count=count,
                period_start=today,
                period_end=today,
            )
        )


def collect_repositories_for_language(
    session: Session,
    client: GitHubClient,
    language: str,
    min_stars: int = 1000,
    max_repos: int = 10,
) -> list[Repository]:
    """指定言語の主要リポジトリを検索し、DBに保存して返す"""
    collected: list[Repository] = []
    page = 1
    per_page = min(max_repos, 30)

    while len(collected) < max_repos:
        result = client.search_repositories(language=language, min_stars=min_stars, page=page, per_page=per_page)
        items = result.get("items", [])
        if not items:
            break

        for item in items:
            if len(collected) >= max_repos:
                break
            repo = upsert_repository(session, item)
            collect_languages(session, client, repo)
            try:
                collect_issue_stats(session, client, repo)
            except Exception as e:
                logger.warning("%s: issue統計収集に失敗(スキップして続行): %s", repo.full_name, e)
            session.commit()
            collected.append(repo)
            logger.info("収集完了: %s (stars=%s)", repo.full_name, repo.stars)

        page += 1

    return collected
