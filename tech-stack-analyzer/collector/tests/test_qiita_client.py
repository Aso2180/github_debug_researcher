import responses

from src.clients.qiita_client import QiitaClient


@responses.activate
def test_get_tag_items_metadata_strips_body():
    responses.add(
        responses.GET,
        "https://qiita.com/api/v2/tags/rails/items",
        json=[
            {
                "id": "abc123",
                "body": "本文がここに入る(保存してはいけない)",
                "rendered_body": "<p>本文</p>",
                "likes_count": 5,
                "created_at": "2026-01-01T00:00:00+09:00",
                "tags": [{"name": "Rails", "versions": []}],
            }
        ],
        status=200,
    )
    client = QiitaClient()
    result = client.get_tag_items_metadata("rails")

    assert len(result) == 1
    item = result[0]
    # 本文を一切保持していないことを検証(著作権配慮の要件)
    assert "body" not in item
    assert "rendered_body" not in item
    assert item["likes_count"] == 5
    assert item["tags"] == ["Rails"]


@responses.activate
def test_get_tag_items_metadata_extracts_id_title_url():
    responses.add(
        responses.GET,
        "https://qiita.com/api/v2/tags/rails/items",
        json=[
            {
                "id": "abc123",
                "title": "Railsのメモ化まとめ",
                "url": "https://qiita.com/someone/items/abc123",
                "body": "本文(保存してはいけない)",
                "likes_count": 5,
                "created_at": "2026-01-01T00:00:00+09:00",
                "tags": [{"name": "Rails"}],
            }
        ],
        status=200,
    )
    client = QiitaClient()
    item = client.get_tag_items_metadata("rails")[0]

    assert item["id"] == "abc123"
    assert item["title"] == "Railsのメモ化まとめ"
    assert item["url"] == "https://qiita.com/someone/items/abc123"


@responses.activate
def test_get_tag_summary_aggregates_across_pages():
    # 1ページ目: per_page件フルで返す -> 2ページ目も取得される
    responses.add(
        responses.GET,
        "https://qiita.com/api/v2/tags/python/items",
        json=[{"likes_count": 1, "created_at": "2026-01-01", "tags": []} for _ in range(2)],
        status=200,
    )
    # 2ページ目: 空 -> ループ終了
    responses.add(
        responses.GET,
        "https://qiita.com/api/v2/tags/python/items",
        json=[],
        status=200,
    )
    client = QiitaClient()
    summary = client.get_tag_summary("python", max_pages=3, per_page=2, sleep_sec=0)
    assert summary["tag"] == "python"
    assert summary["article_count"] == 2
    assert summary["total_likes"] == 2
    # 記事単位テーブル保存用に、ページ走査で取得済みのitemsを追加API呼び出し無しで再利用できること
    assert len(summary["items"]) == 2
