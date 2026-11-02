"""Phân quyền: mỗi role chỉ chạm được vào đúng phần dữ liệu của mình."""

import pytest

from app.modules.users.models import Role
from tests.factories import make_class


@pytest.mark.parametrize("role", [Role.lecturer, Role.student])
def test_non_admin_cannot_manage_users(client, make_user, login, role):
    headers = login(make_user(role))
    assert client.get("/api/v1/users", headers=headers).status_code == 403
    payload = {"username": "hacker", "full_name": "X", "password": "Password@123", "role": "admin"}
    assert client.post("/api/v1/users", json=payload, headers=headers).status_code == 403


def test_admin_crud_user(client, make_user, login):
    headers = login(make_user(Role.admin))
    payload = {"username": "gv.an", "full_name": "Nguyễn An", "password": "Password@123", "role": "lecturer"}
    res = client.post("/api/v1/users", json=payload, headers=headers)
    assert res.status_code == 201
    uid = res.json()["id"]
    assert client.post("/api/v1/users", json=payload, headers=headers).status_code == 409
    assert client.patch(f"/api/v1/users/{uid}", json={"is_active": False}, headers=headers).json()["is_active"] is False
    assert client.delete(f"/api/v1/users/{uid}", headers=headers).status_code == 204


def test_admin_cannot_lock_themselves(client, make_user, login):
    admin = make_user(Role.admin)
    res = client.patch(f"/api/v1/users/{admin.id}", json={"is_active": False}, headers=login(admin))
    assert res.status_code == 409


def test_only_admin_creates_classes(client, make_user, login, db):
    lecturer = make_user(Role.lecturer)
    cls = make_class(db, lecturer)
    payload = {"code": "L99", "name": "Lớp mới", "subject_id": cls.subject_id}
    assert client.post("/api/v1/classes", json=payload, headers=login(lecturer)).status_code == 403
    assert client.post("/api/v1/classes", json=payload, headers=login(make_user(Role.admin))).status_code == 201


def test_class_list_is_scoped_by_role(client, make_user, login, db):
    gv1, gv2 = make_user(Role.lecturer), make_user(Role.lecturer)
    sv = make_user(Role.student)
    make_class(db, gv1, [sv], code="A1")
    make_class(db, gv2, [], code="B1")

    def codes(user):
        return {c["code"] for c in client.get("/api/v1/classes", headers=login(user)).json()}

    assert codes(make_user(Role.admin)) == {"A1", "B1"}
    assert codes(gv1) == {"A1"}
    assert codes(sv) == {"A1"}


def test_lecturer_cannot_touch_other_lecturers_class(client, make_user, login, db):
    gv1, gv2 = make_user(Role.lecturer), make_user(Role.lecturer)
    other = make_class(db, gv2, code="B1")
    headers = login(gv1)
    assert client.get(f"/api/v1/classes/{other.id}/students", headers=headers).status_code == 403
    assert client.post(f"/api/v1/classes/{other.id}/sessions", json={"title": "Buổi 1"}, headers=headers).status_code == 403


def test_student_cannot_view_class_roster(client, make_user, login, db):
    sv = make_user(Role.student)
    cls = make_class(db, make_user(Role.lecturer), [sv])
    assert client.get(f"/api/v1/classes/{cls.id}/students", headers=login(sv)).status_code == 403


def test_import_students_csv(client, make_user, login, db):
    lecturer = make_user(Role.lecturer)
    existing = make_user(Role.student, student_code="B21DCCN001")
    cls = make_class(db, lecturer)
    csv_bytes = (
        "﻿student_code;full_name\n"
        "B21DCCN001;Đã có tài khoản\n"
        "B21DCCN002;Trần Thị Bình\n"
        "B21DCCN002;Bị lặp\n"
        ";Thiếu mã\n"
    ).encode()
    res = client.post(
        f"/api/v1/classes/{cls.id}/students/import",
        files={"file": ("ds.csv", csv_bytes, "text/csv")},
        headers=login(lecturer),
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert (body["created"], body["enrolled"], body["already_enrolled"]) == (1, 2, 0)
    assert [e["line"] for e in body["errors"]] == [4, 5]

    roster = client.get(f"/api/v1/classes/{cls.id}/students", headers=login(lecturer)).json()
    assert {s["student_code"] for s in roster} == {existing.student_code, "B21DCCN002"}
    # Tài khoản mới tạo đăng nhập được bằng mật khẩu mặc định = mã SV
    login_res = client.post("/api/v1/auth/login", json={"username": "b21dccn002", "password": "B21DCCN002"})
    assert login_res.status_code == 200
