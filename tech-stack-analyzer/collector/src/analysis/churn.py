"""コードチャーン計算(仕様書セクション3・6.4に対応)

直近コミットで「同じファイルが繰り返し変更されている度合い」を数値化する。
API呼び出しコストが高いため(1コミットにつき1リクエスト)、sample_sizeで
サンプリング数を絞れるようにしてある。将来的に規模を拡大する場合は
GH Archive/BigQuery側の集計に切り替えることを推奨(仕様書セクション3参照)。
"""
import logging
import math
from collections import Counter

logger = logging.getLogger(__name__)


def compute_churn_score(github_client, owner: str, repo: str, sample_size: int = 15) -> float:
    """直近sample_size件のコミットにおけるファイル変更回数の偏りをスコア化する。

    - ファイル変更回数の変動係数(標準偏差/平均)を計算し、0〜1に正規化する。
    - 同じファイルばかりが変更されている(偏りが大きい)ほどスコアが高くなる。
    - データが少なすぎる場合は中立値0.5を返す。
    """
    try:
        commits = github_client.list_commits(owner, repo, per_page=sample_size)
    except Exception as e:
        logger.warning("%s/%s: コミット一覧取得に失敗、中立値を返します: %s", owner, repo, e)
        return 0.5

    if not commits:
        return 0.5

    file_change_counter: Counter[str] = Counter()
    fetched = 0
    for commit in commits:
        sha = commit.get("sha")
        if not sha:
            continue
        try:
            detail = github_client.get_commit(owner, repo, sha)
        except Exception as e:
            logger.warning("%s/%s: コミット詳細取得に失敗(sha=%s): %s", owner, repo, sha, e)
            continue
        for f in detail.get("files", []):
            filename = f.get("filename")
            if filename:
                file_change_counter[filename] += 1
        fetched += 1

    if fetched == 0 or not file_change_counter:
        return 0.5

    counts = list(file_change_counter.values())
    mean = sum(counts) / len(counts)
    if mean == 0:
        return 0.5
    variance = sum((c - mean) ** 2 for c in counts) / len(counts)
    std_dev = math.sqrt(variance)
    coefficient_of_variation = std_dev / mean

    # CVをそのまま使うと発散するため 1 - exp(-x) で0〜1に押し込める
    score = 1 - math.exp(-coefficient_of_variation)
    return round(min(max(score, 0.0), 1.0), 4)
