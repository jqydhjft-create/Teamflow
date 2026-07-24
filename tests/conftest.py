import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import Session, sessionmaker

from app.core.database import get_db
from app.main import create_app
from app.models.base import Base

os.environ.setdefault("APP_NAME", "TeamFlow API")
os.environ.setdefault("APP_VERSION", "0.1.0")
os.environ.setdefault("DEBUG", "false")
os.environ.setdefault("API_V1_PREFIX", "/api/v1")
os.environ.setdefault("BACKEND_CORS_ORIGINS", '["http://localhost:3000","http://127.0.0.1:3000"]')
os.environ.setdefault("LOG_LEVEL", "INFO")
os.environ.setdefault("MYSQL_HOST", "localhost")
os.environ.setdefault("MYSQL_PORT", "3306")
os.environ.setdefault("MYSQL_USER", "teamflow")
os.environ.setdefault("MYSQL_PASSWORD", "teamflow")
os.environ.setdefault("MYSQL_DATABASE", "teamflow")
os.environ.setdefault("DB_POOL_SIZE", "5")
os.environ.setdefault("DB_MAX_OVERFLOW", "10")
os.environ.setdefault("DB_POOL_RECYCLE", "3600")
os.environ.setdefault("DB_POOL_PRE_PING", "true")
os.environ.setdefault("REDIS_HOST", "localhost")
os.environ.setdefault("REDIS_PORT", "6379")


@pytest.fixture
def client() -> TestClient:
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, class_=Session)
    Base.metadata.create_all(bind=engine)

    app = create_app()
    app.state.testing_session_local = TestingSessionLocal

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)
