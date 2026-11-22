"""Подключение к базе данных.

По умолчанию — SQLite-файл ``shop.db`` рядом с пакетом ``app``
(запуск без настройки). Через переменную окружения ``DATABASE_URL``
можно указать другую базу, например PostgreSQL
(см. ``db/schema_postgres.sql``).
"""

import os
from datetime import datetime, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./shop.db")

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def utcnow() -> datetime:
    """Текущее время UTC как naive datetime (без deprecation-warning).

    В SQLite храним naive-значения, поэтому везде в проекте
    используется именно эта функция вместо datetime.utcnow().
    """
    return datetime.now(timezone.utc).replace(tzinfo=None)


def get_db():
    """Зависимость FastAPI: сессия БД на один запрос."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Создать все таблицы (если их ещё нет)."""
    try:
        from app import models  # noqa: F401  (регистрация моделей)
    except ModuleNotFoundError as _exc:
        if _exc.name != "app":
            raise
        import models  # noqa: F401  (регистрация моделей)

    Base.metadata.create_all(bind=engine)
