from fastapi import APIRouter, Response, status

from app.core.db import utcnow
from app.core.deps import DbSession, StaffUser, StudentUser
from app.core.timeutil import to_local
from app.modules.attendance import service
from app.modules.attendance.schemas import AttendanceRow, CheckInIn, CheckInOut, ManualMarkIn, MyAttendanceOut
from app.modules.classes.service import get_class_for_staff
from app.modules.sessions.service import get_session_for_staff, list_sessions

router = APIRouter(tags=["attendance"])


@router.post("/attendance/check-in", response_model=CheckInOut, status_code=status.HTTP_201_CREATED)
def check_in(body: CheckInIn, db: DbSession, student: StudentUser):
    return service.check_in(db, student, body.token)


@router.get("/me/attendance", response_model=MyAttendanceOut)
def my_attendance(db: DbSession, student: StudentUser):
    return service.my_attendance(db, student)


@router.get("/sessions/{session_id}/attendance", response_model=list[AttendanceRow])
def session_attendance(session_id: int, db: DbSession, user: StaffUser):
    session, _ = get_session_for_staff(db, session_id, user)
    return service.session_rows(db, session)


@router.put("/sessions/{session_id}/attendance/{student_id}", status_code=status.HTTP_204_NO_CONTENT)
def mark_student(session_id: int, student_id: int, body: ManualMarkIn, db: DbSession, user: StaffUser):
    """Giảng viên điểm danh/sửa tay cho 1 sinh viên, kể cả khi sinh viên chưa có bản ghi (VD: điện thoại hết pin)."""
    session, _ = get_session_for_staff(db, session_id, user)
    service.manual_mark(db, session, student_id, body.status, body.note, user)


@router.patch("/attendance/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def update_record(record_id: int, body: ManualMarkIn, db: DbSession, user: StaffUser):
    record = service.get_record(db, record_id)
    session, _ = get_session_for_staff(db, record.session_id, user)
    service.manual_mark(db, session, record.student_id, body.status, body.note, user)


def _csv_response(content: str, filename: str) -> Response:
    return Response(
        content=content.encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/sessions/{session_id}/attendance/export.csv")
def export_session(session_id: int, db: DbSession, user: StaffUser):
    session, cls = get_session_for_staff(db, session_id, user)
    stamp = to_local(session.starts_at).strftime("%Y%m%d")
    return _csv_response(service.export_csv(db, cls, [session]), f"diem-danh_{cls.code}_{stamp}_buoi{session.id}.csv")


@router.get("/classes/{class_id}/attendance/export.csv")
def export_class(class_id: int, db: DbSession, user: StaffUser):
    cls = get_class_for_staff(db, class_id, user)
    sessions = sorted(list_sessions(db, cls), key=lambda s: s.starts_at)
    stamp = to_local(utcnow()).strftime("%Y%m%d")
    return _csv_response(service.export_csv(db, cls, sessions), f"diem-danh_{cls.code}_{stamp}.csv")
