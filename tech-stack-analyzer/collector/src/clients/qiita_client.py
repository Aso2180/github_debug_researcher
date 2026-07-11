"""Qiita API v2 クライアント

重要:
- Qiitaはスクレイピングを規約で禁止しているため、本クライアントは
  必ず公式API v2(https://qiita.com/api/v2/*)のみを呼び出す。
- 著作権配慮のため、記事本文(body/rendered_body)は一切保持しない。
  id/タイトル/URL/タグ名・いいね数・投稿日時などのメタデータのみを抽出して返す
  (本文ではないため著作権上の懸念はない)。
"""
import time

import requests

QIITA_API_BASE = "https://qiita.com/api/v2"


class QiitaClient:
    def __init__(self, token: str = "", session: requests.Session | None = None):
        self.session = session or requests.Session()
        if token:
            self.session.headers.update({"Authorization": f"Bearer {token}"})

    def get_tag_items_metadata(self, tag: str, page: int = 1, per_page: int = 100) -> list[dict]:
        """指定タグの記事一覧からメタデータのみ抽出して返す(本文は破棄する)"""
        resp = self.session.get(
            f"{QIITA_API_BASE}/tags/{tag}/items",
            params={"page": page, "per_page": per_page},
            timeout=30,
        )
        resp.raise_for_status()
        items = resp.json()
        return [
            {
                "id": item.get("id"),
                "title": item.get("title"),
                "url": item.get("url"),
                "likes_count": item.get("likes_count", 0),
                "created_at": item.get("created_at"),
                "tags": [t["name"] for t in item.get("tags", [])],
            }
            for item in items
        ]

    def get_tag_summary(self, tag: str, max_pages: int = 3, per_page: int = 100, sleep_sec: float = 1.0) -> dict:
        """複数ページを走査し、記事数・いいね合計を集計して返す。

        記事単位のメタデータ(items)も併せて返す。トレンド集計用と記事単位保存用とで
        Qiita APIへの呼び出しを重複させないため、同じページ走査結果を両方の用途に使い回す。
        """
        total_articles = 0
        total_likes = 0
        items: list[dict] = []
        for page in range(1, max_pages + 1):
            metadata = self.get_tag_items_metadata(tag, page=page, per_page=per_page)
            if not metadata:
                break
            total_articles += len(metadata)
            total_likes += sum(m["likes_count"] for m in metadata)
            items.extend(metadata)
            if len(metadata) < per_page:
                break
            time.sleep(sleep_sec)
        return {"tag": tag, "article_count": total_articles, "total_likes": total_likes, "items": items}
