"""Qiitaタグ別トレンドを収集し、DBに保存する(仕様書セクション6.3・Phase3に対応)

重要: QiitaClient.get_tag_summary() は既に本文を保持しないメタデータのみを
扱う設計になっている(dependency_collectorやgithub_clientと同様、著作権・規約遵守を徹底)。
"""
import logging
from datetime import date, timedelta

from sqlalchemy.orm import Session

from src.clients.qiita_client import QiitaClient
from src.db.models import QiitaTagTrend

logger = logging.getLogger(__name__)


def collect_qiita_trend_for_tag(
    session: Session,
    client: QiitaClient,
    tag: str,
    max_pages: int = 3,
    per_page: int = 100,
    period_days: int = 30,
) -> QiitaTagTrend:
    """指定タグの記事数・いいね合計を集計し、DBに保存する"""
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
