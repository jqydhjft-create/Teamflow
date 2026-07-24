# FastAPI Project Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a runnable FastAPI starter project with SQLAlchemy 2.0, Alembic, pydantic-settings, MySQL pool configuration, centralized exceptions, logging, and Docker Compose services for backend, MySQL, and Redis.

**Architecture:** Keep the application as a small single-service API under `app/`, with `core` for infrastructure concerns and focused `routers`, `models`, and `schemas` packages. Use synchronous SQLAlchemy and a minimal health endpoint to verify configuration and dependency wiring without adding premature business layers.

**Tech Stack:** Python 3.11+, FastAPI, SQLAlchemy 2.0, Alembic, Pydantic Settings, PyMySQL, Uvicorn, pytest

---

## File Structure

- Create: `app/__init__.py`
- Create: `app/main.py`
- Create: `app/core/__init__.py`
- Create: `app/core/config.py`
- Create: `app/core/database.py`
- Create: `app/core/exceptions.py`
- Create: `app/core/logging.py`
- Create: `app/models/__init__.py`
- Create: `app/models/base.py`
- Create: `app/models/user.py`
- Create: `app/routers/__init__.py`
- Create: `app/routers/root.py`
- Create: `app/schemas/__init__.py`
- Create: `app/schemas/common.py`
- Create: `app/schemas/user.py`
- Create: `alembic/env.py`
- Create: `alembic/script.py.mako`
- Create: `alembic/versions/.gitkeep`
- Create: `alembic.ini`
- Create: `requirements.txt`
- Create: `.env.example`
- Create: `docker-compose.yml`
- Create: `Dockerfile`
- Create: `tests/conftest.py`
- Create: `tests/test_app.py`

### Task 1: Lock In The Minimal HTTP Contract

**Files:**
- Create: `tests/conftest.py`
- Create: `tests/test_app.py`

- [ ] **Step 1: Write the failing tests**

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_app.py -v`
Expected: FAIL because `app.main` does not exist yet

- [ ] **Step 3: Write minimal implementation**

Create the application factory, register the root and health endpoints, and return the expected JSON payloads.

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_app.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

Because this workspace is not a git repository, skip commit for now.

### Task 2: Add Settings, Logging, Database, And Exception Infrastructure

**Files:**
- Create: `app/core/config.py`
- Create: `app/core/database.py`
- Create: `app/core/exceptions.py`
- Create: `app/core/logging.py`
- Modify: `app/main.py`
- Modify: `tests/test_app.py`

- [ ] **Step 1: Write the failing test**

```python
def test_health_exposes_database_configuration() -> None:
    client = TestClient(create_app())

    response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["database"]["driver"] == "mysql+pymysql"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_app.py::test_health_exposes_database_configuration -v`
Expected: FAIL because the health payload does not yet include the driver details

- [ ] **Step 3: Write minimal implementation**

Implement a `Settings` class using `pydantic-settings`, build the SQLAlchemy engine/session factory with pool settings, register exception handlers, and expand the health endpoint to expose shallow infrastructure metadata.

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_app.py::test_health_exposes_database_configuration -v`
Expected: PASS

- [ ] **Step 5: Commit**

Because this workspace is not a git repository, skip commit for now.

### Task 3: Add ORM, Alembic, And Environment Templates

**Files:**
- Create: `app/models/base.py`
- Create: `app/models/user.py`
- Create: `app/models/__init__.py`
- Create: `app/schemas/common.py`
- Create: `app/schemas/user.py`
- Create: `alembic/env.py`
- Create: `alembic/script.py.mako`
- Create: `alembic/versions/.gitkeep`
- Create: `alembic.ini`
- Create: `.env.example`
- Create: `requirements.txt`
- Create: `Dockerfile`
- Create: `docker-compose.yml`

- [ ] **Step 1: Write the failing test**

```python
def test_app_settings_include_api_prefix() -> None:
    from app.core.config import get_settings

    settings = get_settings()

    assert settings.api_v1_prefix == "/api/v1"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_app.py::test_app_settings_include_api_prefix -v`
Expected: FAIL until the settings module exists and is wired correctly

- [ ] **Step 3: Write minimal implementation**

Add the base model and example `User` model, wire Alembic metadata imports, generate the dependency list and environment template, and create container definitions for backend, MySQL, and Redis.

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_app.py::test_app_settings_include_api_prefix -v`
Expected: PASS

- [ ] **Step 5: Commit**

Because this workspace is not a git repository, skip commit for now.
