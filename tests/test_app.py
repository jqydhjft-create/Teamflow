from fastapi.testclient import TestClient

from app.main import create_app


def test_root_returns_project_metadata() -> None:
    client = TestClient(create_app())

    response = client.get("/")

    assert response.status_code == 200
    assert response.json()["message"] == "FastAPI project is running"


def test_health_returns_status_payload() -> None:
    client = TestClient(create_app())

    response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert "database" in body


def test_health_exposes_database_configuration() -> None:
    from app.core.config import get_settings

    client = TestClient(create_app())

    response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    expected_driver = get_settings().resolved_database_url.split("://", maxsplit=1)[0]
    assert body["database"]["driver"] == expected_driver


def test_app_settings_include_api_prefix() -> None:
    from app.core.config import get_settings

    settings = get_settings()

    assert settings.api_v1_prefix == "/api/v1"


def test_default_cors_origins_allow_the_documented_vite_frontend(monkeypatch) -> None:
    from app.core.config import Settings

    monkeypatch.delenv("BACKEND_CORS_ORIGINS", raising=False)

    settings = Settings(_env_file=None)

    assert "http://localhost:5173" in settings.backend_cors_origins
    assert "http://127.0.0.1:5173" in settings.backend_cors_origins


def test_database_url_can_be_overridden_with_sqlite(monkeypatch) -> None:
    from app.core.config import get_settings

    get_settings.cache_clear()
    monkeypatch.setenv("DATABASE_URL", "sqlite:///./teamflow.db")

    settings = get_settings()

    assert settings.resolved_database_url == "sqlite:///./teamflow.db"

    monkeypatch.delenv("DATABASE_URL", raising=False)
    get_settings.cache_clear()
