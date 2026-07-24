from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings


settings = get_settings()

engine_kwargs: dict[str, object] = {}
if settings.resolved_database_url.startswith("sqlite"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    engine_kwargs.update(
        {
            "pool_pre_ping": settings.db_pool_pre_ping,
            "pool_recycle": settings.db_pool_recycle,
            "pool_size": settings.db_pool_size,
            "max_overflow": settings.db_max_overflow,
        }
    )

engine = create_engine(settings.resolved_database_url, **engine_kwargs)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, class_=Session)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
