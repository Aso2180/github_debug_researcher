"""Qiita週次AIレビュー(定点観測)

qiita_tag_trends(週次collect.ymlで蓄積される、タグごとの記事数・いいね数の時系列スナップショット)を
Anthropic APIにレビューさせ、qiita_ai_reviewsに履歴として保存する。

「AIが学習して定点観測により解像度を上げていく」という要望への対応として、プロンプトには
そのタグの直前のレビュー(自分の過去の分析結果)を含める。これによりAIは今回のデータで
結論がどう変化・補強されたかを踏まえた分析を書くことになり、単発の分析ではなく
回を重ねるごとに洞察が積み上がっていく構造になる。
"""
import logging

from sqlalchemy.orm import Session

from src.clients.anthropic_client import AnthropicClient
from src.db.models import QiitaAIReview, QiitaTagTrend

logger = logging.getLogger(__name__)

RESPONSE_SCHEMA_HINT = '{"summary": "string(日本語、200字程度)", "trend_direction": "rising|falling|stable"}'


def build_prompt(tag: str, trends: list[QiitaTagTrend], previous_review: QiitaAIReview | None) -> str:
    history_lines = "\n".join(
        f"- {t.fetched_at}: article_count={t.article_count}, total_likes={t.total_likes}"
        for t in trends
    )
    previous_section = (
        f"# 前回(第{previous_review.id}回)のレビュー\n{previous_review.summary}\n"
        "(今回のデータで、この結論がどう変化・補強・修正されたかを踏まえて分析してください)\n"
        if previous_review is not None
        else "(初回の観測のため、前回のレビューはありません)\n"
    )
    return f"""あなたはQiitaの技術トレンドを定点観測するアナリストです。
以下はQiitaタグ「{tag}」の週次収集データ(記事数・いいね合計の時系列)です。このデータのみを根拠に、
関心の高まり/停滞/減退の傾向を分析してください。Web検索や一般知識のみでの推測は避けてください。

# 観測データ({len(trends)}件、収集日時昇順)
{history_lines}

{previous_section}
# 出力形式
前置き・説明文・Markdownのコードフェンスを一切含めず、以下のスキーマに厳密に従うJSONのみを出力してください:
{RESPONSE_SCHEMA_HINT}"""


def generate_review_for_tag(session: Session, tag: str, client: AnthropicClient) -> QiitaAIReview | None:
    trends = (
        session.query(QiitaTagTrend)
        .filter_by(tag=tag)
        .order_by(QiitaTagTrend.fetched_at)
        .all()
    )
    if not trends:
        logger.info("タグ '%s' の観測データが無いためAIレビューをスキップします", tag)
        return None

    previous_review = (
        session.query(QiitaAIReview)
        .filter_by(tag=tag)
        .order_by(QiitaAIReview.created_at.desc())
        .first()
    )

    prompt = build_prompt(tag, trends, previous_review)
    result = client.request_json(prompt)

    review = QiitaAIReview(
        tag=tag,
        summary=result["summary"],
        trend_direction=result["trend_direction"],
        data_points_count=len(trends),
        previous_review_id=previous_review.id if previous_review else None,
    )
    session.add(review)
    session.commit()
    return review


def generate_reviews_for_tags(session: Session, tags: list[str], client: AnthropicClient) -> list[QiitaAIReview]:
    """1タグの失敗が全体を止めないよう、collect_qiita_trends_for_tagsと同じtry/except継続方式を踏襲する"""
    reviews = []
    for tag in tags:
        try:
            review = generate_review_for_tag(session, tag, client)
            if review is not None:
                reviews.append(review)
        except Exception as e:
            logger.warning("タグ '%s' のAIレビュー生成に失敗(スキップして続行): %s", tag, e)
    return reviews
