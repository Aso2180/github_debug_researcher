"""SQLAlchemyモデル定義(仕様書セクション5のDB設計に対応)"""
from datetime import datetime, UTC

from sqlalchemy import (
    Column, Integer, BigInteger, String, Boolean, Numeric,
    DateTime, Date, ForeignKey, UniqueConstraint
)
from sqlalchemy.orm import relationship, declarative_base

Base = declarative_base()


def utcnow():
    return datetime.now(UTC)


class Repository(Base):
    __tablename__ = "repositories"

    id = Column(Integer, primary_key=True)
    owner = Column(String(255), nullable=False)
    name = Column(String(255), nullable=False)
    primary_language = Column(String(100))
    stars = Column(Integer)
    last_pushed_at = Column(DateTime)
    fetched_at = Column(DateTime, default=utcnow)

    languages = relationship("RepoLanguage", back_populates="repository", cascade="all, delete-orphan")
    issue_stats = relationship("IssueStat", back_populates="repository", cascade="all, delete-orphan")
    dependencies = relationship("Dependency", back_populates="repository", cascade="all, delete-orphan")
    risk_scores = relationship("RiskScore", back_populates="repository", cascade="all, delete-orphan")

    __table_args__ = (UniqueConstraint("owner", "name", name="uq_owner_name"),)

    @property
    def full_name(self) -> str:
        return f"{self.owner}/{self.name}"


class RepoLanguage(Base):
    __tablename__ = "repo_languages"

    id = Column(Integer, primary_key=True)
    repo_id = Column(Integer, ForeignKey("repositories.id"))
    language = Column(String(100))
    byte_size = Column(BigInteger)
    fetched_at = Column(DateTime, default=utcnow)

    repository = relationship("Repository", back_populates="languages")


class IssueStat(Base):
    __tablename__ = "issue_stats"

    id = Column(Integer, primary_key=True)
    repo_id = Column(Integer, ForeignKey("repositories.id"))
    label = Column(String(100))
    state = Column(String(20))
    count = Column(Integer)
    period_start = Column(Date)
    period_end = Column(Date)
    fetched_at = Column(DateTime, default=utcnow)

    repository = relationship("Repository", back_populates="issue_stats")


class Dependency(Base):
    __tablename__ = "dependencies"

    id = Column(Integer, primary_key=True)
    repo_id = Column(Integer, ForeignKey("repositories.id"))
    package_name = Column(String(255))
    ecosystem = Column(String(50))
    version = Column(String(100))
    is_deprecated = Column(Boolean, default=False)
    # 非推奨チェックを実際に実行できたか。Falseの場合is_deprecatedは「非推奨ではない」ではなく「未検証」を意味する
    deprecation_checked = Column(Boolean, default=False)
    last_release_at = Column(DateTime)
    fetched_at = Column(DateTime, default=utcnow)

    repository = relationship("Repository", back_populates="dependencies")


class QiitaTagTrend(Base):
    __tablename__ = "qiita_tag_trends"

    id = Column(Integer, primary_key=True)
    tag = Column(String(100))
    article_count = Column(Integer)
    total_likes = Column(Integer)
    period_start = Column(Date)
    period_end = Column(Date)
    fetched_at = Column(DateTime, default=utcnow)


class RiskScore(Base):
    __tablename__ = "risk_scores"

    id = Column(Integer, primary_key=True)
    repo_id = Column(Integer, ForeignKey("repositories.id"))
    bug_ratio_score = Column(Numeric)
    maintenance_score = Column(Numeric)
    churn_score = Column(Numeric)
    total_score = Column(Numeric)
    calculated_at = Column(DateTime, default=utcnow)

    repository = relationship("Repository", back_populates="risk_scores")
