from fastapi.testclient import TestClient

from app.core.security import create_access_token, hash_password
from app.models.user import User


def create_user(client: TestClient, username: str, email: str) -> tuple[User, str]:
    session_local = client.app.state.testing_session_local
    db = session_local()
    user = User(
        username=username,
        email=email,
        password_hash=hash_password("secret123"),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    db.close()
    return user, create_access_token(user.id)


def create_project(client: TestClient, token: str) -> dict[str, object]:
    response = client.post(
        "/api/projects",
        json={"name": "Alpha", "description": "First project"},
        headers={"Authorization": f"Bearer {token}"},
    )
    return response.json()["data"]


def test_project_activity_logs_require_membership(client: TestClient) -> None:
    _, owner_token = create_user(client, "alice", "alice@example.com")
    _, outsider_token = create_user(client, "bob", "bob@example.com")
    project = create_project(client, owner_token)

    response = client.get(
        f"/api/projects/{project['id']}/activity-logs",
        headers={"Authorization": f"Bearer {outsider_token}"},
    )

    assert response.status_code == 403


def test_activity_logs_record_task_and_comment_events(client: TestClient) -> None:
    _, owner_token = create_user(client, "alice", "alice@example.com")
    project = create_project(client, owner_token)

    created_task = client.post(
        f"/api/projects/{project['id']}/tasks",
        json={"title": "Task A", "description": "First", "status": "todo", "priority": "medium"},
        headers={"Authorization": f"Bearer {owner_token}"},
    ).json()["data"]

    client.put(
        f"/api/tasks/{created_task['id']}",
        json={"title": "Task A", "description": "Updated", "status": "done", "priority": "high"},
        headers={"Authorization": f"Bearer {owner_token}"},
    )

    client.post(
        f"/api/tasks/{created_task['id']}/comments",
        json={"content": "Looks good"},
        headers={"Authorization": f"Bearer {owner_token}"},
    )

    response = client.get(
        f"/api/projects/{project['id']}/activity-logs",
        headers={"Authorization": f"Bearer {owner_token}"},
    )

    assert response.status_code == 200
    items = response.json()["data"]["items"]
    actions = [item["action"] for item in items]
    assert "task_created" in actions
    assert "task_updated" in actions
    assert "comment_created" in actions
    assert all(item["project_id"] == project["id"] for item in items)
