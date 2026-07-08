from datetime import datetime, timedelta, UTC

from src.db.models import Repository, IssueStat
from src.db.session import get_engine, init_db, get_session_factory
from src.analysis.risk_score import (
    calculate_bug_ratio_score,
    calculate_maintenance_score,
    calculate_and_save_risk_score,
)


def make_session():
    engine = get_engine("sqlite:///:memory:")
    init_db(engine)
    return get_session_factory(engine)()


def test_bug_ratio_score_increases_with_bug_count():
    session = make_session()
    repo = Repository(owner="o", name="low_bug", primary_language="python", stars=100)
    session.add(repo)
    session.flush()
    session.add(IssueStat(repo_id=repo.id, label="bug", state="all", count=1))
    session.commit()

    low_score = calculate_bug_ratio_score(session, repo)

    repo2 = Repository(owner="o", name="high_bug", primary_language="python", stars=100)
    session.add(repo2)
    session.flush()
    session.add(IssueStat(repo_id=repo2.id, label="bug", state="all", count=500))
    session.commit()

    high_score = calculate_bug_ratio_score(session, repo2)

    assert 0.0 <= low_score < high_score <= 1.0


def test_maintenance_score_recent_push_is_low_risk():
    session = make_session()
    recent_repo = Repository(
        owner="o", name="recent", primary_language="python", stars=10,
        last_pushed_at=datetime.now(UTC) - timedelta(days=1),
    )
    stale_repo = Repository(
        owner="o", name="stale", primary_language="python", stars=10,
        last_pushed_at=datetime.now(UTC) - timedelta(days=800),
    )
    session.add_all([recent_repo, stale_repo])
    session.commit()

    recent_score = calculate_maintenance_score(recent_repo)
    stale_score = calculate_maintenance_score(stale_repo)

    assert recent_score < stale_score
    assert stale_score == 1.0  # 365日超はキャップされ最大リスク


def test_calculate_and_save_risk_score_persists_row():
    session = make_session()
    repo = Repository(
        owner="o", name="repo", primary_language="python", stars=10,
        last_pushed_at=datetime.now(UTC),
    )
    session.add(repo)
    session.flush()
    session.add(IssueStat(repo_id=repo.id, label="bug", state="all", count=10))
    session.commit()

    risk = calculate_and_save_risk_score(session, repo)

    assert risk.id is not None
    assert 0.0 <= float(risk.total_score) <= 1.0
    assert float(risk.churn_score) == 0.5  # github_client未指定時はプレースホルダ


def test_calculate_and_save_risk_score_uses_real_churn_when_client_given():
    session = make_session()
    repo = Repository(
        owner="o", name="repo2", primary_language="python", stars=10,
        last_pushed_at=datetime.now(UTC),
    )
    session.add(repo)
    session.flush()
    session.commit()

    class FakeGithubClient:
        def list_commits(self, owner, repo_name, per_page=15):
            return [{"sha": "s1"}, {"sha": "s2"}]

        def get_commit(self, owner, repo_name, sha):
            # 2コミットとも同じファイルを変更 -> churnはある程度高くなる
            return {"files": [{"filename": "hot.py"}]}

    risk = calculate_and_save_risk_score(session, repo, github_client=FakeGithubClient())
    assert float(risk.churn_score) != 0.5
