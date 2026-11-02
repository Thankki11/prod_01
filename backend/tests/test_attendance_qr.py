"""Luồng điểm danh QR và các kiểm tra phía server."""

import time
from datetime import UTC, datetime, timedelta

import pytest

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.modules.sessions import qr
from app.modules.sessions.models import ClassSession
from app.modules.users.models import Role
from tests.factories import make_class


@pytest.fixture
def setup(client, make_user, login, db):
    lecturer = make_user(Role.lecturer)
    sv1, sv2, outsider = make_user(), make_user(), make_user()
    cls = make_class(db, lecturer, [sv1, sv2])
    gv = login(lecturer)
    session = client.post(f"/api/v1/classes/{cls.id}/sessions", json={"title": "Buổi 1"}, headers=gv).json()
    return {"cls": cls, "gv": gv, "sv1": sv1, "sv2": sv2, "outsider": outsider, "session": session}


def _open_and_get_token(client, s) -> str:
    assert client.post(f"/api/v1/sessions/{s['session']['id']}/open", headers=s["gv"]).status_code == 200
    res = client.get(f"/api/v1/sessions/{s['session']['id']}/qr", headers=s["gv"])
    assert res.status_code == 200
    body = res.json()
    assert body["url"].endswith(f"/diem-danh?t={body['token']}")
    return body["token"]


def _check_in(client, login, user, token):
    return client.post("/api/v1/attendance/check-in", json={"token": token}, headers=login(user))


def test_full_flow_present_then_absent_on_close(client, login, setup):
    token = _open_and_get_token(client, setup)
    res = _check_in(client, login, setup["sv1"], token)
    assert res.status_code == 201, res.text
    assert res.json()["status"] == "present"

    sid = setup["session"]["id"]
    closed = client.post(f"/api/v1/sessions/{sid}/close", headers=setup["gv"]).json()
    assert closed["counts"] == {"present": 1, "late": 0, "absent": 1, "total_students": 2}

    rows = {r["student_id"]: r for r in client.get(f"/api/v1/sessions/{sid}/attendance", headers=setup["gv"]).json()}
    assert rows[setup["sv2"].id]["status"] == "absent"


def test_qr_requires_open_session(client, setup):
    res = client.get(f"/api/v1/sessions/{setup['session']['id']}/qr", headers=setup["gv"])
    assert res.status_code == 409


def test_expired_token_rejected(client, login, setup):
    _open_and_get_token(client, setup)
    s = setup["session"]
    with SessionLocal() as db:
        secret = db.get(ClassSession, s["id"]).qr_secret
    old = qr.make_token(s["id"], secret, now=time.time() - 3 * get_settings().qr_rotate_seconds).token
    res = _check_in(client, login, setup["sv1"], old)
    assert res.status_code == 400
    assert res.json()["detail"]["reason"] == "expired"


def test_previous_window_still_accepted(client, login, setup):
    _open_and_get_token(client, setup)
    s = setup["session"]
    with SessionLocal() as db:
        secret = db.get(ClassSession, s["id"]).qr_secret
    prev = qr.make_token(s["id"], secret, now=time.time() - get_settings().qr_rotate_seconds).token
    assert _check_in(client, login, setup["sv1"], prev).status_code == 201


def test_tampered_token_rejected(client, login, setup):
    token = _open_and_get_token(client, setup)
    sid, window, sig = token.split(".")
    forged = f"{sid}.{int(window) + 1}.{sig}"
    res = _check_in(client, login, setup["sv1"], forged)
    assert res.status_code == 400
    assert res.json()["detail"]["reason"] == "invalid"
    assert _check_in(client, login, setup["sv1"], "khong-phai-ma-qr").json()["detail"]["reason"] == "invalid"


def test_duplicate_check_in_rejected(client, login, setup):
    token = _open_and_get_token(client, setup)
    assert _check_in(client, login, setup["sv1"], token).status_code == 201
    res = _check_in(client, login, setup["sv1"], token)
    assert res.status_code == 409
    assert res.json()["detail"]["reason"] == "duplicate"


def test_student_not_in_class_rejected(client, login, setup):
    token = _open_and_get_token(client, setup)
    res = _check_in(client, login, setup["outsider"], token)
    assert res.status_code == 403
    assert res.json()["detail"]["reason"] == "not_enrolled"


def test_closed_session_rejects_check_in(client, login, setup):
    token = _open_and_get_token(client, setup)
    client.post(f"/api/v1/sessions/{setup['session']['id']}/close", headers=setup["gv"])
    res = _check_in(client, login, setup["sv1"], token)
    assert res.status_code == 409
    assert res.json()["detail"]["reason"] == "not_open"


def test_late_status_after_threshold(client, login, setup):
    starts = (datetime.now(UTC) - timedelta(minutes=30)).isoformat()
    s = client.post(
        f"/api/v1/classes/{setup['cls'].id}/sessions", json={"title": "Buổi muộn", "starts_at": starts}, headers=setup["gv"]
    ).json()
    token = _open_and_get_token(client, {**setup, "session": s})
    assert _check_in(client, login, setup["sv1"], token).json()["status"] == "late"


def test_only_students_can_check_in(client, login, setup):
    token = _open_and_get_token(client, setup)
    res = client.post("/api/v1/attendance/check-in", json={"token": token}, headers=setup["gv"])
    assert res.status_code == 403


def test_manual_mark_requires_note_and_sets_method(client, setup):
    sid = setup["session"]["id"]
    client.post(f"/api/v1/sessions/{sid}/open", headers=setup["gv"])
    url = f"/api/v1/sessions/{sid}/attendance/{setup['sv2'].id}"
    assert client.put(url, json={"status": "present"}, headers=setup["gv"]).status_code == 422
    assert client.put(url, json={"status": "present", "note": "Điện thoại hết pin"}, headers=setup["gv"]).status_code == 204
    row = next(r for r in client.get(f"/api/v1/sessions/{sid}/attendance", headers=setup["gv"]).json() if r["student_id"] == setup["sv2"].id)
    assert (row["status"], row["method"], row["note"]) == ("present", "manual", "Điện thoại hết pin")


def test_student_history_and_csv_export(client, login, setup):
    token = _open_and_get_token(client, setup)
    _check_in(client, login, setup["sv1"], token)
    client.post(f"/api/v1/sessions/{setup['session']['id']}/close", headers=setup["gv"])

    mine = client.get("/api/v1/me/attendance", headers=login(setup["sv1"])).json()
    assert mine["summary"][0]["present"] == 1 and mine["items"][0]["status"] == "present"
    assert mine["items"][0]["starts_at"].endswith("Z")

    res = client.get(f"/api/v1/classes/{setup['cls'].id}/attendance/export.csv", headers=setup["gv"])
    assert res.status_code == 200
    text = res.content.decode("utf-8-sig")
    assert "Có mặt" in text and "Vắng" in text and text.count("\n") == 3
