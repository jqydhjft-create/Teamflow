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


def test_create_task_requires_project_membership(client: TestClient) -> None:
    _, owner_token = create_user(client, "alice", "alice@example.com")
    _, outsider_token = create_user(client, "bob", "bob@example.com")
    project = create_project(client, owner_token)

    response = client.post(
        f"/api/projects/{project['id']}/tasks",
        json={"title": "Task A", "description": "Do something", "status": "todo", "priority": "medium"},
        headers={"Authorization": f"Bearer {outsider_token}"},
    )

    assert response.status_code == 403


def test_create_and_list_tasks(client: TestClient) -> None:
    _, owner_token = create_user(client, "alice", "alice@example.com")
    project = create_project(client, owner_token)

    create_response = client.post(
        f"/api/projects/{project['id']}/tasks",
        json={"title": "Task A", "description": "Do something", "status": "todo", "priority": "high"},
        headers={"Authorization": f"Bearer {owner_token}"},
    )

    assert create_response.status_code == 200
    assert create_response.json()["data"]["title"] == "Task A"
    assert create_response.json()["data"]["sort_order"] == 1

    list_response = client.get(
        f"/api/projects/{project['id']}/tasks",
        headers={"Authorization": f"Bearer {owner_token}"},
    )

    assert list_response.status_code == 200
    assert len(list_response.json()["data"]["items"]) == 1
    assert list_response.json()["data"]["items"][0]["status"] == "todo"
    assert list_response.json()["data"]["items"][0]["comment_count"] == 0


def test_task_sort_order_is_scoped_by_status_column(client: TestClient) -> None:
    _, owner_token = create_user(client, "alice", "alice@example.com")
    project = create_project(client, owner_token)

    first_todo = client.post(
        f"/api/projects/{project['id']}/tasks",
        json={"title": "Task A", "description": "First", "status": "todo", "priority": "medium"},
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    second_todo = client.post(
        f"/api/projects/{project['id']}/tasks",
        json={"title": "Task B", "description": "Second", "status": "todo", "priority": "medium"},
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    in_progress = client.post(
        f"/api/projects/{project['id']}/tasks",
        json={"title": "Task C", "description": "Third", "status": "in_progress", "priority": "low"},
        headers={"Authorization": f"Bearer {owner_token}"},
    )

    assert first_todo.json()["data"]["sort_order"] == 1
    assert second_todo.json()["data"]["sort_order"] == 2
    assert in_progress.json()["data"]["sort_order"] == 1


def test_update_task_can_change_status_and_priority(client: TestClient) -> None:
    _, owner_token = create_user(client, "alice", "alice@example.com")
    project = create_project(client, owner_token)

    created = client.post(
        f"/api/projects/{project['id']}/tasks",
        json={"title": "Task A", "description": "First", "status": "todo", "priority": "medium"},
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    task_id = created.json()["data"]["id"]

    update_response = client.put(
        f"/api/tasks/{task_id}",
        json={"title": "Task A+", "description": "Updated", "status": "done", "priority": "high"},
        headers={"Authorization": f"Bearer {owner_token}"},
    )

    assert update_response.status_code == 200
    assert update_response.json()["data"]["status"] == "done"
    assert update_response.json()["data"]["priority"] == "high"
    assert update_response.json()["data"]["title"] == "Task A+"


def test_update_task_preserves_comment_count(client: TestClient) -> None:
    _, owner_token = create_user(client, "alice", "alice@example.com")
    project = create_project(client, owner_token)
    created = client.post(
        f"/api/projects/{project['id']}/tasks",
        json={"title": "Task A", "description": "First", "status": "todo", "priority": "medium"},
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    task_id = created.json()["data"]["id"]

    comment_response = client.post(
        f"/api/tasks/{task_id}/comments",
        json={"content": "Keep this context"},
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert comment_response.status_code == 200

    update_response = client.put(
        f"/api/tasks/{task_id}",
        json={"title": "Task A+", "description": "Updated", "status": "done", "priority": "high"},
        headers={"Authorization": f"Bearer {owner_token}"},
    )

    assert update_response.status_code == 200
    assert update_response.json()["data"]["comment_count"] == 1


def test_batch_order_updates_sort_order_and_status(client: TestClient) -> None:
    _, owner_token = create_user(client, "alice", "alice@example.com")
    project = create_project(client, owner_token)

    task_a = client.post(
        f"/api/projects/{project['id']}/tasks",
        json={"title": "Task A", "description": "First", "status": "todo", "priority": "medium"},
        headers={"Authorization": f"Bearer {owner_token}"},
    ).json()["data"]
    task_b = client.post(
        f"/api/projects/{project['id']}/tasks",
        json={"title": "Task B", "description": "Second", "status": "todo", "priority": "medium"},
        headers={"Authorization": f"Bearer {owner_token}"},
    ).json()["data"]

    reorder_response = client.patch(
        "/api/tasks/batch-order",
        json={
            "items": [
                {"task_id": task_b["id"], "status": "in_progress", "sort_order": 1},
                {"task_id": task_a["id"], "status": "todo", "sort_order": 1},
            ]
        },
        headers={"Authorization": f"Bearer {owner_token}"},
    )

    assert reorder_response.status_code == 200
    assert reorder_response.json()["data"]["updated"] == 2

    list_response = client.get(
        f"/api/projects/{project['id']}/tasks",
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    items = {item["id"]: item for item in list_response.json()["data"]["items"]}
    assert items[task_b["id"]]["status"] == "in_progress"
    assert items[task_b["id"]]["sort_order"] == 1
    assert items[task_a["id"]]["sort_order"] == 1


def test_get_task_detail_requires_project_membership(client: TestClient) -> None:
    _, owner_token = create_user(client, "alice", "alice@example.com")
    _, outsider_token = create_user(client, "bob", "bob@example.com")
    project = create_project(client, owner_token)
    created = client.post(
        f"/api/projects/{project['id']}/tasks",
        json={"title": "Task A", "description": "First", "status": "todo", "priority": "medium"},
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    task_id = created.json()["data"]["id"]

    outsider_response = client.get(
        f"/api/tasks/{task_id}",
        headers={"Authorization": f"Bearer {outsider_token}"},
    )
    assert outsider_response.status_code == 403

    owner_response = client.get(
        f"/api/tasks/{task_id}",
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert owner_response.status_code == 200
    assert owner_response.json()["data"]["id"] == task_id


def test_delete_task_removes_it_from_list(client: TestClient) -> None:
    _, owner_token = create_user(client, "alice", "alice@example.com")
    project = create_project(client, owner_token)
    created = client.post(
        f"/api/projects/{project['id']}/tasks",
        json={"title": "Task A", "description": "First", "status": "todo", "priority": "medium"},
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    task_id = created.json()["data"]["id"]

    delete_response = client.delete(
        f"/api/tasks/{task_id}",
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert delete_response.status_code == 200
    assert delete_response.json()["data"]["deleted"] is True

    list_response = client.get(
        f"/api/projects/{project['id']}/tasks",
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert list_response.status_code == 200
    assert list_response.json()["data"]["items"] == []


def test_list_tasks_supports_status_priority_and_assignee_filters(client: TestClient) -> None:
    session_local = client.app.state.testing_session_local
    _, owner_token = create_user(client, "alice", "alice@example.com")
    assignee, _ = create_user(client, "bob", "bob@example.com")
    project = create_project(client, owner_token)

    client.post(
        f"/api/projects/{project['id']}/tasks",
        json={
            "title": "Task A",
            "description": "First",
            "status": "todo",
            "priority": "high",
            "assignee_id": assignee.id,
        },
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    client.post(
        f"/api/projects/{project['id']}/tasks",
        json={
            "title": "Task B",
            "description": "Second",
            "status": "done",
            "priority": "low",
        },
        headers={"Authorization": f"Bearer {owner_token}"},
    )

    filtered_response = client.get(
        f"/api/projects/{project['id']}/tasks?status=todo&priority=high&assignee_id={assignee.id}",
        headers={"Authorization": f"Bearer {owner_token}"},
    )

    assert filtered_response.status_code == 200
    items = filtered_response.json()["data"]["items"]
    assert len(items) == 1
    assert items[0]["title"] == "Task A"
