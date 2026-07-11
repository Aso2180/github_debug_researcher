import responses

from src.clients.qiita_client import QiitaClient
from src.collectors.qiita_trend_collector import (
    collect_qiita_trend_for_tag,
    collect_qiita_trends_for_tags,
)
from src.db.models import QiitaArticle, QiitaTagTrend
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
def test_collect_qiita_trend_for_tag_saves_article_metadata():
    responses.add(
        responses.GET,
        "https://qiita.com/api/v2/tags/rails/items",
        json=[
            {
                "id": "abc123",
                "title": "Railsのメモ化まとめ",
                "url": "https://qiita.com/someone/items/abc123",
                "likes_count": 3,
                "created_at": "2026-01-01T00:00:00+09:00",
                "tags": [{"name": "Rails"}],
            }
        ],
        status=200,
    )
    session = make_session()
    client = QiitaClient()

    collect_qiita_trend_for_tag(session, client, "rails", max_pages=1, per_page=100)

    article = session.query(QiitaArticle).filter_by(qiita_id="abc123", tag="rails").one()
    assert article.title == "Railsのメモ化まとめ"
    assert article.url == "https://qiita.com/someone/items/abc123"
    assert article.likes_count == 3
    assert article.article_created_at is not None


@responses.activate
def test_collect_qiita_trend_for_tag_does_not_duplicate_articles_on_rerun():
    # 週次cronで同じ記事が再度返ってきても行が重複しないこと(9章/14.1と同種のバグの再発防止)
    responses.add(
        responses.GET,
        "https://qiita.com/api/v2/tags/rails/items",
        json=[
            {
                "id": "abc123",
                "title": "Railsのメモ化まとめ",
                "url": "https://qiita.com/someone/items/abc123",
                "likes_count": 3,
                "created_at": "2026-01-01T00:00:00+09:00",
                "tags": [{"name": "Rails"}],
            }
        ],
        status=200,
    )
    responses.add(
        responses.GET,
        "https://qiita.com/api/v2/tags/rails/items",
        json=[
            {
                "id": "abc123",
                "title": "Railsのメモ化まとめ",
                "url": "https://qiita.com/someone/items/abc123",
                "likes_count": 10,
                "created_at": "2026-01-01T00:00:00+09:00",
                "tags": [{"name": "Rails"}],
            }
        ],
        status=200,
    )
    session = make_session()
    client = QiitaClient()

    collect_qiita_trend_for_tag(session, client, "rails", max_pages=1, per_page=100)
    collect_qiita_trend_for_tag(session, client, "rails", max_pages=1, per_page=100)

    articles = session.query(QiitaArticle).filter_by(qiita_id="abc123", tag="rails").all()
    assert len(articles) == 1
    # likes_countは再収集時に最新値へ更新される
    assert articles[0].likes_count == 10


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
