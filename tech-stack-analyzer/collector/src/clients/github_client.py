"""GitHub REST/Search API クライアント

仕様書セクション6.2に対応。
- 通常REST APIとSearch API(30req/分)のレート制限を別管理する
- 403/429応答時は Retry-After / X-RateLimit-Reset を見て自動待機・リトライする
"""
import logging
import time

import requests
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

logger = logging.getLogger(__name__)

GITHUB_API_BASE = "https://api.github.com"


class GitHubRateLimitError(Exception):
    """レート制限に達し、リトライしても解消しなかった場合に送出する"""


class GitHubClient:
    def __init__(self, token: str = "", min_search_interval_sec: float = 2.0, session: requests.Session | None = None):
        self.session = session or requests.Session()
        headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        self.session.headers.update(headers)
        self._min_search_interval_sec = min_search_interval_sec
        self._last_search_call = 0.0

    # ------------------------------------------------------------------
    # 内部ユーティリティ
    # ------------------------------------------------------------------
    def _throttle_search(self):
        elapsed = time.time() - self._last_search_call
        if elapsed < self._min_search_interval_sec:
            wait = self._min_search_interval_sec - elapsed
            logger.debug("Search APIスロットリング: %.2f秒待機", wait)
            time.sleep(wait)
        self._last_search_call = time.time()

    def _handle_rate_limit(self, resp: requests.Response):
        """403/429でレート制限の場合は待機時間を計算して例外を送出(tenacityがリトライする)"""
        if resp.status_code in (403, 429):
            remaining = resp.headers.get("X-RateLimit-Remaining")
            if remaining == "0":
                reset = int(resp.headers.get("X-RateLimit-Reset", time.time() + 60))
                wait = max(reset - time.time(), 1)
                logger.warning("GitHub APIレート制限到達。%.0f秒待機します", wait)
                time.sleep(min(wait, 120))  # 安全のため最大2分でリトライに戻す
                raise GitHubRateLimitError("rate limited, retrying")

    @retry(
        retry=retry_if_exception_type(GitHubRateLimitError),
        wait=wait_exponential(multiplier=1, min=2, max=60),
        stop=stop_after_attempt(5),
    )
    def _get(self, url: str, params: dict | None = None) -> requests.Response:
        resp = self.session.get(url, params=params, timeout=30)
        self._handle_rate_limit(resp)
        resp.raise_for_status()
        return resp

    # ------------------------------------------------------------------
    # 公開メソッド
    # ------------------------------------------------------------------
    def search_repositories(self, language: str, min_stars: int = 100, page: int = 1, per_page: int = 30) -> dict:
        """言語・スター数でリポジトリを検索する(Search API: 30req/分制限)"""
        self._throttle_search()
        resp = self._get(
            f"{GITHUB_API_BASE}/search/repositories",
            params={
                "q": f"language:{language} stars:>={min_stars}",
                "sort": "updated",
                "order": "desc",
                "per_page": per_page,
                "page": page,
            },
        )
        return resp.json()

    def get_languages(self, owner: str, repo: str) -> dict:
        """言語構成(バイト数)を取得"""
        resp = self._get(f"{GITHUB_API_BASE}/repos/{owner}/{repo}/languages")
        return resp.json()

    def search_issue_count(self, owner: str, repo: str, label: str, state: str = "all") -> int:
        """Search Issues APIで特定ラベルのissue件数のみ取得(total_countで直接件数がわかる)"""
        self._throttle_search()
        query = f"repo:{owner}/{repo} is:issue label:{label}"
        if state != "all":
            query += f" state:{state}"
        resp = self._get(
            f"{GITHUB_API_BASE}/search/issues",
            params={"q": query, "per_page": 1},
        )
        return resp.json().get("total_count", 0)

    def get_repo(self, owner: str, repo: str) -> dict:
        """リポジトリ基本情報(stars, pushed_at等)を取得"""
        resp = self._get(f"{GITHUB_API_BASE}/repos/{owner}/{repo}")
        return resp.json()

    def get_sbom(self, owner: str, repo: str) -> dict:
        """依存関係グラフ(SBOM)を取得。仕様書セクション6.2に対応"""
        resp = self._get(f"{GITHUB_API_BASE}/repos/{owner}/{repo}/dependency-graph/sbom")
        return resp.json()

    def list_commits(self, owner: str, repo: str, per_page: int = 20) -> list[dict]:
        """直近のコミット一覧(sha)を取得。コードチャーン計算のサンプリング元として使う"""
        resp = self._get(
            f"{GITHUB_API_BASE}/repos/{owner}/{repo}/commits",
            params={"per_page": per_page},
        )
        return resp.json()

    def get_commit(self, owner: str, repo: str, sha: str) -> dict:
        """個別コミットの詳細(変更ファイル一覧を含む)を取得"""
        resp = self._get(f"{GITHUB_API_BASE}/repos/{owner}/{repo}/commits/{sha}")
        return resp.json()
