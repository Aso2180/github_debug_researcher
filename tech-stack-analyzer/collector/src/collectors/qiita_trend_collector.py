"""Qiitaタグ別トレンドを収集し、DBに保存する(仕様書セクション6.3・Phase3に対応)

重要: QiitaClient.get_tag_summary() は既に本文を保持しないメタデータのみを
扱う設計になっている(dependency_collectorやgithub_clientと同様、著作権・規約遵守を徹底)。
"""
import logging
from datetime import date, datetime, timedelta, UTC

from sqlalchemy.orm import Session

from src.clients.qiita_client import QiitaClient
from src.db.models import QiitaArticle, QiitaTagTrend

logger = logging.getLogger(__name__)


def _parse_dt(value: str | None):
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _save_qiita_articles(session: Session, tag: str, items: list[dict]) -> list[QiitaArticle]:
    """記事単位のメタデータを保存する。

    collect.ymlは週次cronで繰り返し実行されるため、(qiita_id, tag)で既存行を検索し、
    見つかればlikes_countのみ更新(UPSERT相当)、無ければ新規作成する。これを怠ると
    実行のたびに同一記事が重複挿入され、9章/14.1のrisk_scores重複と同種の問題になる。
    """
    saved = []
    for item in items:
        qiita_id = item.get("id")
        if not qiita_id:
            continue
        article = (
            session.query(QiitaArticle)
            .filter_by(qiita_id=qiita_id, tag=tag)
            .one_or_none()
        )
        if article:
            article.likes_count = item.get("likes_count", 0)
            article.fetched_at = datetime.now(UTC)
        else:
            article = QiitaArticle(
                qiita_id=qiita_id,
                tag=tag,
                title=item.get("title"),
                url=item.get("url"),
                likes_count=item.get("likes_count", 0),
                article_created_at=_parse_dt(item.get("created_at")),
            )
            session.add(article)
        saved.append(article)
    session.commit()
    return saved


def collect_qiita_trend_for_tag(
    session: Session,
    client: QiitaClient,
    tag: str,
    max_pages: int = 3,
    per_page: int = 100,
    period_days: int = 30,
) -> QiitaTagTrend:
    """指定タグの記事数・いいね合計を集計してDBに保存し、記事単位のメタデータも保存する"""
    summary = client.get_tag_summary(tag, max_pages=max_pages, per_page=per_page)

    today = date.today()
    period_start = today - timedelta(days=period_days)

    trend = QiitaTagTrend(
        tag=summary["tag"],
        article_count=summary["article_count"],
        total_likes=summary["total_likes"],
        period_start=period_start,
        period_end=today,
    )
    session.add(trend)
    session.commit()
    logger.info(
        "Qiitaトレンド保存: tag=%s article_count=%d total_likes=%d",
        trend.tag, trend.article_count, trend.total_likes,
    )

    articles = _save_qiita_articles(session, tag, summary.get("items", []))
    logger.info("Qiita記事メタデータ保存: tag=%s count=%d", tag, len(articles))

    return trend


def collect_qiita_trends_for_tags(
    session: Session,
    client: QiitaClient,
    tags: list[str],
    max_pages: int = 3,
    per_page: int = 100,
) -> list[QiitaTagTrend]:
    """複数タグをまとめて収集する。1タグの失敗で全体を止めない"""
    results = []
    for tag in tags:
        try:
            trend = collect_qiita_trend_for_tag(session, client, tag, max_pages=max_pages, per_page=per_page)
            results.append(trend)
        except Exception as e:
            logger.warning("Qiitaタグ '%s' の収集に失敗(スキップして続行): %s", tag, e)
    return results
