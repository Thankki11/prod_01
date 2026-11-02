from app.modules.users.models import Role
from tests.factories import make_class


def _run_session(client, login, gv, cls, attendees):
    s = client.post(f"/api/v1/classes/{cls.id}/sessions", json={"title": "Buổi"}, headers=gv).json()
    client.post(f"/api/v1/sessions/{s['id']}/open", headers=gv)
    token = client.get(f"/api/v1/sessions/{s['id']}/qr", headers=gv).json()["token"]
    for sv in attendees:
        assert client.post("/api/v1/attendance/check-in", json={"token": token}, headers=login(sv)).status_code == 201
    return s


def test_dashboard_reflects_check_ins(client, make_user, login, db):
    lecturer = make_user(Role.lecturer)
    sv = [make_user() for _ in range(4)]
    cls = make_class(db, lecturer, sv, absence_threshold_pct=40)
    gv = login(lecturer)
    admin = login(make_user(Role.admin))

    s1 = _run_session(client, login, gv, cls, sv[:3])
    summary = client.get("/api/v1/dashboard/summary", headers=admin).json()
    assert summary["open_sessions"] == 1
    assert (summary["today_attended"], summary["today_expected"], summary["today_rate"]) == (3, 4, 75.0)

    client.post(f"/api/v1/sessions/{s1['id']}/close", headers=gv)
    s2 = _run_session(client, login, gv, cls, sv[:2])
    client.post(f"/api/v1/sessions/{s2['id']}/close", headers=gv)

    # sv[3] vắng 2/2 = 100% > 40%; sv[2] vắng 1/2 = 50% > 40%
    risk = client.get("/api/v1/dashboard/at-risk-students", headers=admin).json()
    assert [(r["student_id"], r["absence_pct"]) for r in risk] == [(sv[3].id, 100.0), (sv[2].id, 50.0)]

    trend = client.get("/api/v1/dashboard/weekly-trend", headers=admin).json()
    this_week = trend[-1]
    assert (this_week["present"], this_week["absent"], this_week["rate"]) == (5, 3, 62.5)


def test_dashboard_scoped_for_lecturer(client, make_user, login, db):
    gv1, gv2 = make_user(Role.lecturer), make_user(Role.lecturer)
    sv = make_user()
    make_class(db, gv1, [sv], code="A1")
    other = make_class(db, gv2, [sv], code="B1")
    _run_session(client, login, login(gv2), other, [sv])

    headers = login(gv1)
    assert client.get("/api/v1/dashboard/summary", headers=headers).json()["open_sessions"] == 0
    assert client.get(f"/api/v1/dashboard/summary?class_id={other.id}", headers=headers).status_code == 403
    assert client.get("/api/v1/dashboard/summary", headers=login(sv)).status_code == 403


def test_invalid_date_range(client, make_user, login):
    res = client.get("/api/v1/dashboard/summary?from=2026-05-01&to=2026-04-01", headers=login(make_user(Role.admin)))
    assert res.status_code == 400
