from urllib.parse import urlparse, parse_qs

import responses

from src.clients.github_client import GitHubClient


@responses.activate
def test_search_repositories_returns_items():
    responses.add(
        responses.GET,
        "https://api.github.com/search/repositories",
        json={"total_count": 1, "items": [{"name": "react", "owner": {"login": "facebook"}}]},
        status=200,
    )
    client = GitHubClient(min_search_interval_sec=0)
    result = client.search_repositories(language="javascript", min_stars=1000)
    assert result["total_count"] == 1
    assert result["items"][0]["name"] == "react"


@responses.activate
def test_get_languages():
    responses.add(
        responses.GET,
        "https://api.github.com/repos/facebook/react/languages",
        json={"JavaScript": 1000, "TypeScript": 500},
        status=200,
    )
    client = GitHubClient()
    result = client.get_languages("facebook", "react")
    assert result["JavaScript"] == 1000


@responses.activate
def test_search_issue_count():
    responses.add(
        responses.GET,
        "https://api.github.com/search/issues",
        json={"total_count": 42, "items": []},
        status=200,
    )
    client = GitHubClient(min_search_interval_sec=0)
    count = client.search_issue_count("facebook", "react", label="bug")
    assert count == 42
    # GitHubは "is:issue" か "is:pull-request" を含まないクエリを422で拒否するため、
    # 実APIとの疎通確認(live_smoke_test.py)で発覚した回帰を検知できるよう明示的に検証する
    sent_url = responses.calls[0].request.url
    sent_query = parse_qs(urlparse(sent_url).query)["q"][0]
    assert "is:issue" in sent_query


@responses.activate
def test_rate_limit_retry_then_success(monkeypatch):
    # 1回目はレート制限(403), 2回目で成功するケースをシミュレート
    responses.add(
        responses.GET,
        "https://api.github.com/repos/o/r",
        json={"message": "rate limit"},
        status=403,
        headers={"X-RateLimit-Remaining": "0", "X-RateLimit-Reset": "0"},
    )
    responses.add(
        responses.GET,
        "https://api.github.com/repos/o/r",
        json={"name": "r", "stargazers_count": 10},
        status=200,
    )
    # time.sleepを高速化してテストを待たせない
    import src.clients.github_client as gc
    monkeypatch.setattr(gc.time, "sleep", lambda s: None)

    client = GitHubClient()
    result = client.get_repo("o", "r")
    assert result["name"] == "r"
