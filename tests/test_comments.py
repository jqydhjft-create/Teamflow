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


def create_task(client: TestClient, project_id: int, token: str) -> dict[str, object]:
    response = client.post(
        f"/api/projects/{project_id}/tasks",
        json={"title": "Task A", "description": "First", "status": "todo", "priority": "medium"},
        headers={"Authorization": f"Bearer {token}"},
    )
    return response.json()["data"]


def test_create_comment_requires_project_membership(client: TestClient) -> None:
    _, owner_token = create_user(client, "alice", "alice@example.com")
    _, outsider_token = create_user(client, "bob", "bob@example.com")
    project = create_project(client, owner_token)
    task = create_task(client, project["id"], owner_token)

    response = client.post(
        f"/api/tasks/{task['id']}/comments",
        json={"content": "hello"},
        headers={"Authorization": f"Bearer {outsider_token}"},
    )

    assert response.status_code == 403


def test_create_and_list_comments(client: TestClient) -> None:
    _, owner_token = create_user(client, "alice", "alice@example.com")
    member, member_token = create_user(client, "bob", "bob@example.com")
    project = create_project(client, owner_token)
    task = create_task(client, project["id"], owner_token)

    client.post(
        f"/api/projects/{project['id']}/join",
        json={"invite_code": project["invite_code"]},
        headers={"Authorization": f"Bearer {member_token}"},
    )

    create_response = client.post(
        f"/api/tasks/{task['id']}/comments",
        json={"content": "Looks good"},
        headers={"Authorization": f"Bearer {member_token}"},
    )

    assert create_response.status_code == 200
    assert create_response.json()["data"]["content"] == "Looks good"
    assert create_response.json()["data"]["user_id"] == member.id

    list_response = client.get(
        f"/api/tasks/{task['id']}/comments",
        headers={"Authorization": f"Bearer {owner_token}"},
    )

    assert list_response.status_code == 200
    items = list_response.json()["data"]["items"]
    assert len(items) == 1
    assert items[0]["content"] == "Looks good"
    assert items[0]["username"] == "bob"

    task_list_response = client.get(
        f"/api/projects/{project['id']}/tasks",
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert task_list_response.status_code == 200
    assert task_list_response.json()["data"]["items"][0]["comment_count"] == 1


def test_comment_author_can_delete_comment(client: TestClient) -> None:
    _, owner_token = create_user(client, "alice", "alice@example.com")
    member, member_token = create_user(client, "bob", "bob@example.com")
    project = create_project(client, owner_token)
    task = create_task(client, project["id"], owner_token)

    client.post(
        f"/api/projects/{project['id']}/join",
        json={"invite_code": project["invite_code"]},
        headers={"Authorization": f"Bearer {member_token}"},
    )

    created = client.post(
        f"/api/tasks/{task['id']}/comments",
        json={"content": "Looks good"},
        headers={"Authorization": f"Bearer {member_token}"},
    )
    comment_id = created.json()["data"]["id"]

    delete_response = client.delete(
        f"/api/tasks/{task['id']}/comments/{comment_id}",
        headers={"Authorization": f"Bearer {member_token}"},
    )

    assert delete_response.status_code == 200
    assert delete_response.json()["data"]["deleted"] is True


def test_project_owner_can_delete_other_users_comment(client: TestClient) -> None:
    _, owner_token = create_user(client, "alice", "alice@example.com")
    _, member_token = create_user(client, "bob", "bob@example.com")
    project = create_project(client, owner_token)
    task = create_task(client, project["id"], owner_token)

    client.post(
        f"/api/projects/{project['id']}/join",
        json={"invite_code": project["invite_code"]},
        headers={"Authorization": f"Bearer {member_token}"},
    )

    created = client.post(
        f"/api/tasks/{task['id']}/comments",
        json={"content": "Looks good"},
        headers={"Authorization": f"Bearer {member_token}"},
    )
    comment_id = created.json()["data"]["id"]

    delete_response = client.delete(
        f"/api/tasks/{task['id']}/comments/{comment_id}",
        headers={"Authorization": f"Bearer {owner_token}"},
    )

    assert delete_response.status_code == 200
    assert delete_response.json()["data"]["deleted"] is True


def test_non_author_non_owner_cannot_delete_comment(client: TestClient) -> None:
    _, owner_token = create_user(client, "alice", "alice@example.com")
    _, author_token = create_user(client, "bob", "bob@example.com")
    _, third_token = create_user(client, "charlie", "charlie@example.com")
    project = create_project(client, owner_token)
    task = create_task(client, project["id"], owner_token)

    client.post(
        f"/api/projects/{project['id']}/join",
        json={"invite_code": project["invite_code"]},
        headers={"Authorization": f"Bearer {author_token}"},
    )
    client.post(
        f"/api/projects/{project['id']}/join",
        json={"invite_code": project["invite_code"]},
        headers={"Authorization": f"Bearer {third_token}"},
    )

    created = client.post(
        f"/api/tasks/{task['id']}/comments",
        json={"content": "Looks good"},
        headers={"Authorization": f"Bearer {author_token}"},
    )
    comment_id = created.json()["data"]["id"]

    delete_response = client.delete(
        f"/api/tasks/{task['id']}/comments/{comment_id}",
        headers={"Authorization": f"Bearer {third_token}"},
    )

    assert delete_response.status_code == 403
