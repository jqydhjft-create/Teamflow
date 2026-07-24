from fastapi.testclient import TestClient

from app.core.security import create_access_token, hash_password
from app.models.user import User


def create_user_and_token(client: TestClient) -> tuple[User, str]:
    session_local = client.app.state.testing_session_local
    db = session_local()
    user = User(
        username="alice",
        email="alice@example.com",
        password_hash=hash_password("secret123"),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token(user.id)
    db.close()
    return user, token


def test_create_project_requires_auth(client: TestClient) -> None:
    response = client.post("/api/projects", json={"name": "Alpha", "description": "First project"})

    assert response.status_code == 401


def test_create_and_list_projects(client: TestClient) -> None:
    _, token = create_user_and_token(client)

    create_response = client.post(
        "/api/projects",
        json={"name": "Alpha", "description": "First project"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert create_response.status_code == 200
    assert create_response.json()["data"]["name"] == "Alpha"

    list_response = client.get("/api/projects", headers={"Authorization": f"Bearer {token}"})

    assert list_response.status_code == 200
    assert len(list_response.json()["data"]["items"]) == 1


def test_join_project_with_invite_code(client: TestClient) -> None:
    _, owner_token = create_user_and_token(client)
    session_local = client.app.state.testing_session_local
    db = session_local()
    member = User(
        username="bob",
        email="bob@example.com",
        password_hash=hash_password("secret123"),
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    db.close()
    member_token = create_access_token(member.id)

    create_response = client.post(
        "/api/projects",
        json={"name": "Alpha", "description": "First project"},
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    invite_code = create_response.json()["data"]["invite_code"]

    join_response = client.post(
        f"/api/projects/{create_response.json()['data']['id']}/join",
        json={"invite_code": invite_code},
        headers={"Authorization": f"Bearer {member_token}"},
    )

    assert join_response.status_code == 200
    assert join_response.json()["data"]["role"] == "member"


def test_get_project_detail_requires_membership(client: TestClient) -> None:
    _, owner_token = create_user_and_token(client)
    session_local = client.app.state.testing_session_local
    db = session_local()
    outsider = User(
        username="charlie",
        email="charlie@example.com",
        password_hash=hash_password("secret123"),
    )
    db.add(outsider)
    db.commit()
    db.refresh(outsider)
    db.close()
    outsider_token = create_access_token(outsider.id)

    create_response = client.post(
        "/api/projects",
        json={"name": "Alpha", "description": "First project"},
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    project_id = create_response.json()["data"]["id"]

    outsider_response = client.get(
        f"/api/projects/{project_id}",
        headers={"Authorization": f"Bearer {outsider_token}"},
    )

    assert outsider_response.status_code == 403

    owner_response = client.get(
        f"/api/projects/{project_id}",
        headers={"Authorization": f"Bearer {owner_token}"},
    )

    assert owner_response.status_code == 200
    assert owner_response.json()["data"]["id"] == project_id


def test_list_project_members_for_member(client: TestClient) -> None:
    _, owner_token = create_user_and_token(client)
    session_local = client.app.state.testing_session_local
    db = session_local()
    member = User(
        username="david",
        email="david@example.com",
        password_hash=hash_password("secret123"),
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    db.close()
    member_token = create_access_token(member.id)

    create_response = client.post(
        "/api/projects",
        json={"name": "Alpha", "description": "First project"},
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    project_id = create_response.json()["data"]["id"]
    invite_code = create_response.json()["data"]["invite_code"]

    client.post(
        f"/api/projects/{project_id}/join",
        json={"invite_code": invite_code},
        headers={"Authorization": f"Bearer {member_token}"},
    )

    members_response = client.get(
        f"/api/projects/{project_id}/members",
        headers={"Authorization": f"Bearer {member_token}"},
    )

    assert members_response.status_code == 200
    assert len(members_response.json()["data"]["items"]) == 2
