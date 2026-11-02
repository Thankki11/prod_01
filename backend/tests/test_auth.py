from datetime import UTC, datetime, timedelta

import jwt

from app.core.config import get_settings
from app.modules.users.models import Role
from tests.conftest import PASSWORD


def test_login_success_returns_access_token_and_refresh_cookie(client, make_user):
    user = make_user(Role.admin)
    res = client.post("/api/v1/auth/login", json={"username": user.username, "password": PASSWORD})
    assert res.status_code == 200
    body = res.json()
    assert body["user"]["role"] == "admin"
    assert "refresh_token" in res.cookies
    assert "password_hash" not in body["user"]


def test_login_wrong_password(client, make_user):
    user = make_user()
    res = client.post("/api/v1/auth/login", json={"username": user.username, "password": "sai-mat-khau"})
    assert res.status_code == 401


def test_login_inactive_user_rejected(client, make_user):
    user = make_user(is_active=False)
    res = client.post("/api/v1/auth/login", json={"username": user.username, "password": PASSWORD})
    assert res.status_code == 401


def test_me_requires_token(client):
    assert client.get("/api/v1/auth/me").status_code == 401


def test_me_with_token(client, make_user, login):
    user = make_user(Role.lecturer)
    res = client.get("/api/v1/auth/me", headers=login(user))
    assert res.status_code == 200
    assert res.json()["username"] == user.username


def test_expired_access_token_rejected(client, make_user):
    user = make_user()
    expired = jwt.encode(
        {"sub": str(user.id), "role": "student", "type": "access", "exp": datetime.now(UTC) - timedelta(seconds=1)},
        get_settings().secret_key,
        algorithm="HS256",
    )
    assert client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {expired}"}).status_code == 401


def test_token_signed_with_other_key_rejected(client, make_user):
    user = make_user(Role.admin)
    forged = jwt.encode({"sub": str(user.id), "role": "admin", "type": "access"}, "khoa-gia", algorithm="HS256")
    assert client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {forged}"}).status_code == 401


def test_refresh_rotates_token_and_old_one_cannot_be_reused(client, make_user, login):
    user = make_user()
    login(user)
    old = client.cookies.get("refresh_token")

    res = client.post("/api/v1/auth/refresh")
    assert res.status_code == 200
    new = client.cookies.get("refresh_token")
    assert new and new != old

    client.cookies.set("refresh_token", old, path="/api/v1/auth")
    assert client.post("/api/v1/auth/refresh").status_code == 401


def test_logout_revokes_refresh_token(client, make_user, login):
    user = make_user()
    login(user)
    token = client.cookies.get("refresh_token")
    assert client.post("/api/v1/auth/logout").status_code == 204

    client.cookies.set("refresh_token", token, path="/api/v1/auth")
    assert client.post("/api/v1/auth/refresh").status_code == 401


def test_change_password(client, make_user, login):
    user = make_user()
    headers = login(user)
    res = client.post(
        "/api/v1/auth/change-password",
        json={"current_password": PASSWORD, "new_password": "MatKhauMoi@1"},
        headers=headers,
    )
    assert res.status_code == 204
    assert client.post("/api/v1/auth/login", json={"username": user.username, "password": PASSWORD}).status_code == 401
    assert client.post("/api/v1/auth/login", json={"username": user.username, "password": "MatKhauMoi@1"}).status_code == 200
