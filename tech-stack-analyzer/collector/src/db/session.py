"""DBエンジン・セッション管理"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.config import DATABASE_URL
from src.db.models import Base


def get_engine(database_url: str = DATABASE_URL):
    connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}
    return create_engine(database_url, connect_args=connect_args)


def init_db(engine):
    """テーブルが無ければ作成する"""
    Base.metadata.create_all(engine)


def get_session_factory(engine):
    return sessionmaker(bind=engine)
