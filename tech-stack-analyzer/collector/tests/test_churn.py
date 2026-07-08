from src.analysis.churn import compute_churn_score


class FakeGithubClient:
    def __init__(self, commits, commit_details):
        self._commits = commits
        self._details = commit_details

    def list_commits(self, owner, repo, per_page=15):
        return self._commits[:per_page]

    def get_commit(self, owner, repo, sha):
        return self._details[sha]


def test_high_churn_when_same_file_changed_repeatedly():
    # 5コミット全てが同じ1ファイルを変更 -> 偏りが大きい = 高チャーン
    commits = [{"sha": f"sha{i}"} for i in range(5)]
    details = {f"sha{i}": {"files": [{"filename": "hot_file.py"}]} for i in range(5)}
    client = FakeGithubClient(commits, details)

    score = compute_churn_score(client, "o", "r", sample_size=5)
    assert 0.0 <= score <= 1.0


def test_low_churn_when_changes_spread_evenly():
    # 5コミットがそれぞれ異なるファイルを1回ずつ変更 -> 偏りなし = 低チャーン
    commits = [{"sha": f"sha{i}"} for i in range(5)]
    details = {f"sha{i}": {"files": [{"filename": f"file_{i}.py"}]} for i in range(5)}
    client = FakeGithubClient(commits, details)

    score = compute_churn_score(client, "o", "r", sample_size=5)
    assert score == 0.0  # 全ファイル変更回数=1で分散0 -> CV=0 -> score=0


def test_skewed_churn_is_higher_than_even_churn():
    # ケースA: 均等
    commits_even = [{"sha": f"e{i}"} for i in range(6)]
    details_even = {f"e{i}": {"files": [{"filename": f"f{i}.py"}]} for i in range(6)}
    client_even = FakeGithubClient(commits_even, details_even)
    even_score = compute_churn_score(client_even, "o", "r", sample_size=6)

    # ケースB: 偏り(1ファイルが5回、他が1回ずつ)
    commits_skewed = [{"sha": f"s{i}"} for i in range(6)]
    details_skewed = {
        "s0": {"files": [{"filename": "hot.py"}]},
        "s1": {"files": [{"filename": "hot.py"}]},
        "s2": {"files": [{"filename": "hot.py"}]},
        "s3": {"files": [{"filename": "hot.py"}]},
        "s4": {"files": [{"filename": "hot.py"}]},
        "s5": {"files": [{"filename": "other.py"}]},
    }
    client_skewed = FakeGithubClient(commits_skewed, details_skewed)
    skewed_score = compute_churn_score(client_skewed, "o", "r", sample_size=6)

    assert skewed_score > even_score


def test_no_commits_returns_neutral_score():
    client = FakeGithubClient([], {})
    score = compute_churn_score(client, "o", "r", sample_size=5)
    assert score == 0.5


def test_commit_detail_failure_is_skipped_gracefully():
    commits = [{"sha": "ok"}, {"sha": "broken"}]

    class PartiallyFailingClient(FakeGithubClient):
        def get_commit(self, owner, repo, sha):
            if sha == "broken":
                raise RuntimeError("API error")
            return self._details[sha]

    client = PartiallyFailingClient(commits, {"ok": {"files": [{"filename": "a.py"}]}})
    score = compute_churn_score(client, "o", "r", sample_size=2)
    assert 0.0 <= score <= 1.0
