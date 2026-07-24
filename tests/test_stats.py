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


def create_task(
    client: TestClient,
    project_id: int,
    token: str,
    title: str,
    status: str,
    priority: str,
    assignee_id: int | None = None,
) -> dict[str, object]:
    response = client.post(
        f"/api/projects/{project_id}/tasks",
        json={
            "title": title,
            "description": title,
            "status": status,
            "priority": priority,
            "assignee_id": assignee_id,
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    return response.json()["data"]


def test_project_stats_requires_membership(client: TestClient) -> None:
    _, owner_token = create_user(client, "alice", "alice@example.com")
    _, outsider_token = create_user(client, "bob", "bob@example.com")
    project = create_project(client, owner_token)

    response = client.get(
        f"/api/projects/{project['id']}/stats",
        headers={"Authorization": f"Bearer {outsider_token}"},
    )

    assert response.status_code == 403


def test_project_stats_returns_overview_status_and_assignee_breakdown(client: TestClient) -> None:
    _, owner_token = create_user(client, "alice", "alice@example.com")
    member, member_token = create_user(client, "bob", "bob@example.com")
    project = create_project(client, owner_token)

    client.post(
        f"/api/projects/{project['id']}/join",
        json={"invite_code": project["invite_code"]},
        headers={"Authorization": f"Bearer {member_token}"},
    )

    create_task(client, project["id"], owner_token, "Task A", "todo", "high", assignee_id=member.id)
    create_task(client, project["id"], owner_token, "Task B", "in_progress", "medium", assignee_id=member.id)
    create_task(client, project["id"], owner_token, "Task C", "done", "low")

    response = client.get(
        f"/api/projects/{project['id']}/stats",
        headers={"Authorization": f"Bearer {owner_token}"},
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["overview"]["total_tasks"] == 3
    assert data["overview"]["completed_tasks"] == 1
    assert round(data["overview"]["completion_rate"], 2) == 33.33

    status_counts = {item["status"]: item["count"] for item in data["status_breakdown"]}
    assert status_counts == {"todo": 1, "in_progress": 1, "done": 1}

    assignee_counts = {item["username"]: item["count"] for item in data["assignee_breakdown"]}
    assert assignee_counts["bob"] == 2
