import json
from datetime import datetime, UTC

import responses

from src.analysis.qiita_ai_review import generate_review_for_tag, generate_reviews_for_tags
from src.clients.anthropic_client import AnthropicClient, ANTHROPIC_API_URL
from src.db.models import QiitaAIReview, QiitaTagTrend
from src.db.session import get_engine, init_db, get_session_factory


def make_session():
    engine = get_engine("sqlite:///:memory:")
    init_db(engine)
    return get_session_factory(engine)()


def add_trend(session, tag, article_count, total_likes):
    trend = QiitaTagTrend(
        tag=tag, article_count=article_count, total_likes=total_likes,
        fetched_at=datetime.now(UTC),
    )
    session.add(trend)
    session.commit()
    return trend


def mock_anthropic_response(summary, trend_direction):
    responses.add(
        responses.POST,
        ANTHROPIC_API_URL,
        json={"content": [{"type": "text", "text": json.dumps({
            "summary": summary, "trend_direction": trend_direction,
        })}]},
        status=200,
    )


def test_generate_review_for_tag_returns_none_when_no_trends():
    session = make_session()
    client = AnthropicClient(api_key="test-key")

    review = generate_review_for_tag(session, "react", client)

    assert review is None


@responses.activate
def test_generate_review_for_tag_creates_first_review_with_no_previous():
    session = make_session()
    add_trend(session, "react", 10, 50)
    mock_anthropic_response("reactタグは初回観測です", "stable")
    client = AnthropicClient(api_key="test-key")

    review = generate_review_for_tag(session, "react", client)

    assert review.tag == "react"
    assert review.trend_direction == "stable"
    assert review.data_points_count == 1
    assert review.previous_review_id is None


@responses.activate
def test_generate_review_for_tag_chains_previous_review_on_second_call():
    # 「定点観測により解像度を上げていく」の中核: 2回目の呼び出しで1回目のレビューをprevious_review_idで
    # 連鎖させ、AIに前回の分析を踏まえさせる構造になっていることを検証する。
    session = make_session()
    add_trend(session, "react", 10, 50)
    mock_anthropic_response("初回:横ばい", "stable")
    client = AnthropicClient(api_key="test-key")
    first_review = generate_review_for_tag(session, "react", client)

    add_trend(session, "react", 20, 120)
    mock_anthropic_response("2回目:いいね数の伸びが加速しており上昇傾向に転じた", "rising")
    second_review = generate_review_for_tag(session, "react", client)

    assert second_review.previous_review_id == first_review.id
    assert second_review.data_points_count == 2
    assert second_review.trend_direction == "rising"

    # プロンプトに前回のsummaryが含まれ、AIが過去の分析を踏まえられる構造になっていること
    second_request_body = json.loads(responses.calls[-1].request.body)
    assert "初回:横ばい" in second_request_body["messages"][0]["content"]


@responses.activate
def test_generate_reviews_for_tags_continues_after_one_failure():
    session = make_session()
    add_trend(session, "react", 10, 50)
    add_trend(session, "vue", 5, 20)

    # react: 500エラーで失敗
    responses.add(responses.POST, ANTHROPIC_API_URL, json={"error": "boom"}, status=500)
    # vue: 正常応答
    mock_anthropic_response("vueは横ばい", "stable")
    client = AnthropicClient(api_key="test-key")

    reviews = generate_reviews_for_tags(session, ["react", "vue"], client)

    assert len(reviews) == 1
    assert reviews[0].tag == "vue"
