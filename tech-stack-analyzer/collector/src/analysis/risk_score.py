"""手戻りリスクスコア計算(仕様書セクション6.4に対応)"""
from datetime import datetime, UTC

from sqlalchemy.orm import Session

from src.config import RISK_WEIGHTS
from src.db.models import Repository, IssueStat, RiskScore
from src.analysis.churn import compute_churn_score


def calculate_bug_ratio_score(session: Session, repo: Repository) -> float:
    """bugラベルの件数を基にスコア化。単純化のため件数を対数的にスケールし0〜1に丸める"""
    stats = session.query(IssueStat).filter_by(repo_id=repo.id, label="bug").all()
    bug_count = sum(s.count or 0 for s in stats)
    # 0件=0, 50件以上でほぼ1に近づく単調増加関数(実運用ではリポジトリ規模で正規化する)
    import math
    score = 1 - math.exp(-bug_count / 50)
    return round(min(max(score, 0.0), 1.0), 4)


def calculate_maintenance_score(repo: Repository) -> float:
    """最終pushからの経過日数が長いほどリスクを高くする"""
    if repo.last_pushed_at is None:
        return 1.0  # 情報が無い場合は最大リスク扱い
    last_pushed = repo.last_pushed_at
    if last_pushed.tzinfo is None:
        last_pushed = last_pushed.replace(tzinfo=UTC)
    days_since_push = (datetime.now(UTC) - last_pushed).days
    # 30日以内なら低リスク、365日超でほぼ最大リスク
    score = min(days_since_push / 365, 1.0)
    return round(score, 4)


def calculate_and_save_risk_score(session: Session, repo: Repository, github_client=None,
                                   churn_sample_size: int = 15) -> RiskScore:
    bug_score = calculate_bug_ratio_score(session, repo)
    maintenance_score = calculate_maintenance_score(repo)

    if github_client is not None:
        churn_score = compute_churn_score(github_client, repo.owner, repo.name, sample_size=churn_sample_size)
    else:
        # クライアント未指定時はPhase1同様プレースホルダ(中立値)を使う
        churn_score = 0.5

    total = (
        bug_score * RISK_WEIGHTS["bug"]
        + maintenance_score * RISK_WEIGHTS["maintenance"]
        + churn_score * RISK_WEIGHTS["churn"]
    )

    risk = RiskScore(
        repo_id=repo.id,
        bug_ratio_score=bug_score,
        maintenance_score=maintenance_score,
        churn_score=churn_score,
        total_score=round(total, 4),
    )
    session.add(risk)
    session.commit()
    return risk
