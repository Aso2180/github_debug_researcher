import responses

from src.clients.qiita_client import QiitaClient
from src.collectors.qiita_trend_collector import (
    collect_qiita_trend_for_tag,
    collect_qiita_trends_for_tags,
)
from src.db.models import QiitaTagTrend
from src.db.session import get_engine, init_db, get_session_factory


def make_session():
    engine = get_engine("sqlite:///:memory:")
    init_db(engine)
    return get_session_factory(engine)()


@responses.activate
def test_collect_qiita_trend_for_tag_saves_row():
    responses.add(
        responses.GET,
        "https://qiita.com/api/v2/tags/rails/items",
        json=[{"likes_count": 3, "created_at": "2026-01-01", "tags": [{"name": "Rails"}]}],
        status=200,
    )
    session = make_session()
    client = QiitaClient()

    trend = collect_qiita_trend_for_tag(session, client, "rails", max_pages=1, per_page=100)

    assert trend.id is not None
    assert trend.tag == "rails"
    assert trend.article_count == 1
    assert trend.total_likes == 3

    saved = session.query(QiitaTagTrend).filter_by(tag="rails").one()
    assert saved.article_count == 1


@responses.activate
def test_collect_qiita_trends_for_tags_continues_after_one_failure():
    # rails: 正常応答
    responses.add(
        responses.GET,
        "https://qiita.com/api/v2/tags/rails/items",
        json=[{"likes_count": 1, "created_at": "2026-01-01", "tags": []}],
        status=200,
    )
    # django: 500エラー(失敗させる)
    responses.add(
        responses.GET,
        "https://qiita.com/api/v2/tags/django/items",
        json={"message": "error"},
        status=500,
    )
    session = make_session()
    client = QiitaClient()

    results = collect_qiita_trends_for_tags(session, client, ["rails", "django"], max_pages=1)

    # railsのみ成功し、djangoは失敗してスキップされる(全体は止まらない)
    assert len(results) == 1
    assert results[0].tag == "rails"
