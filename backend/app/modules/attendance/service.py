import csv
import io
from datetime import timedelta

from fastapi import HTTPException, status
from sqlalchemy import select, true
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.db import utcnow
from app.core.errors import conflict, not_found
from app.core.timeutil import to_local
from app.modules.attendance.models import AttendanceMethod, AttendanceRecord, AttendanceStatus
from app.modules.attendance.schemas import (
    AttendanceRow,
    CheckInOut,
    MyAttendanceItem,
    MyAttendanceOut,
    MyClassSummary,
)
from app.modules.classes.models import Class, ClassStudent
from app.modules.classes.service import is_enrolled
from app.modules.sessions.models import ClassSession, SessionStatus
from app.modules.sessions.qr import QrError, parse_session_id, verify_token
from app.modules.users.models import User

STATUS_LABELS = {AttendanceStatus.present: "Có mặt", AttendanceStatus.late: "Đi muộn", AttendanceStatus.absent: "Vắng"}
METHOD_LABELS = {AttendanceMethod.qr: "QR", AttendanceMethod.manual: "Thủ công"}


def _reject(code: int, detail: str, reason: str) -> HTTPException:
    # `reason` cho frontend biết hiển thị màn hình lỗi nào, không cần dò theo câu chữ
    return HTTPException(status_code=code, detail={"message": detail, "reason": reason})


def check_in(db: Session, student: User, token: str) -> CheckInOut:
    session_id = parse_session_id(token)
    session = db.get(ClassSession, session_id) if session_id else None
    if session is None:
        raise _reject(status.HTTP_400_BAD_REQUEST, "Mã QR không hợp lệ", "invalid")

    error = verify_token(token, session.id, session.qr_secret)
    if error is QrError.expired:
        raise _reject(status.HTTP_400_BAD_REQUEST, "Mã QR đã hết hạn, hãy quét mã mới trên màn hình", "expired")
    if error is not None:
        raise _reject(status.HTTP_400_BAD_REQUEST, "Mã QR không hợp lệ", "invalid")

    if session.status != SessionStatus.open:
        raise _reject(status.HTTP_409_CONFLICT, "Buổi học chưa mở hoặc đã kết thúc điểm danh", "not_open")
    if not is_enrolled(db, session.class_id, student.id):
        raise _reject(status.HTTP_403_FORBIDDEN, "Bạn không có tên trong lớp này", "not_enrolled")

    cls = db.get(Class, session.class_id)
    now = utcnow()
    is_late = now > session.starts_at + timedelta(minutes=cls.late_after_minutes)
    record = AttendanceRecord(
        session_id=session.id,
        student_id=student.id,
        status=AttendanceStatus.late if is_late else AttendanceStatus.present,
        method=AttendanceMethod.qr,
        checked_in_at=now,
    )
    db.add(record)
    try:
        db.commit()
    except IntegrityError:
        # UNIQUE(session_id, student_id): đã điểm danh rồi, kể cả khi bấm 2 lần cùng lúc
        db.rollback()
        raise _reject(status.HTTP_409_CONFLICT, "Bạn đã điểm danh buổi này rồi", "duplicate") from None
    return CheckInOut(
        status=record.status,
        checked_in_at=record.checked_in_at,
        session_title=session.title,
        class_code=cls.code,
        class_name=cls.name,
    )


def session_rows(db: Session, session: ClassSession) -> list[AttendanceRow]:
    rows = db.execute(
        select(User, AttendanceRecord)
        .join(ClassStudent, (ClassStudent.student_id == User.id) & (ClassStudent.class_id == session.class_id))
        .outerjoin(AttendanceRecord, (AttendanceRecord.student_id == User.id) & (AttendanceRecord.session_id == session.id))
        .order_by(User.student_code, User.full_name)
    ).all()
    # Sinh viên đã rời lớp nhưng vẫn có bản ghi cũ của buổi này: vẫn hiện để không mất lịch sử
    listed = {u.id for u, _ in rows}
    extra = db.execute(
        select(User, AttendanceRecord)
        .join(AttendanceRecord, AttendanceRecord.student_id == User.id)
        .where(AttendanceRecord.session_id == session.id, User.id.not_in(listed) if listed else true())
    ).all()
    return [
        AttendanceRow(
            record_id=r.id if r else None,
            student_id=u.id,
            student_code=u.student_code,
            full_name=u.full_name,
            status=r.status if r else None,
            method=r.method if r else None,
            checked_in_at=r.checked_in_at if r else None,
            note=r.note if r else None,
        )
        for u, r in [*rows, *extra]
    ]


def manual_mark(db: Session, session: ClassSession, student_id: int, new_status: AttendanceStatus, note: str, actor: User) -> None:
    if session.status == SessionStatus.scheduled:
        raise conflict("Buổi học chưa mở, chưa thể điểm danh")
    record = db.scalar(
        select(AttendanceRecord).where(AttendanceRecord.session_id == session.id, AttendanceRecord.student_id == student_id)
    )
    if record is None:
        if not is_enrolled(db, session.class_id, student_id):
            raise not_found("sinh viên trong lớp")
        record = AttendanceRecord(session_id=session.id, student_id=student_id, checked_in_at=utcnow())
        db.add(record)
    record.status = new_status
    record.method = AttendanceMethod.manual
    record.note = note.strip()
    record.updated_by = actor.id
    db.commit()


def get_record(db: Session, record_id: int) -> AttendanceRecord:
    record = db.get(AttendanceRecord, record_id)
    if record is None:
        raise not_found("bản ghi điểm danh")
    return record


def my_attendance(db: Session, student: User) -> MyAttendanceOut:
    rows = db.execute(
        select(AttendanceRecord, ClassSession, Class)
        .join(ClassSession, ClassSession.id == AttendanceRecord.session_id)
        .join(Class, Class.id == ClassSession.class_id)
        .where(AttendanceRecord.student_id == student.id)
        .order_by(ClassSession.starts_at.desc())
    ).all()
    items = []
    summary: dict[int, MyClassSummary] = {}
    for record, session, cls in rows:
        items.append(
            MyAttendanceItem(
                session_id=session.id,
                session_title=session.title,
                starts_at=session.starts_at,
                class_id=cls.id,
                class_code=cls.code,
                class_name=cls.name,
                status=record.status,
                checked_in_at=record.checked_in_at,
            )
        )
        s = summary.setdefault(
            cls.id,
            MyClassSummary(
                class_id=cls.id, class_code=cls.code, class_name=cls.name, present=0, late=0, absent=0,
                absence_threshold_pct=cls.absence_threshold_pct,
            ),
        )
        setattr(s, record.status.value, getattr(s, record.status.value) + 1)
    return MyAttendanceOut(summary=sorted(summary.values(), key=lambda s: s.class_code), items=items)


# ---------- Xuất CSV ----------

CSV_HEADER = ["Mã lớp", "Buổi học", "Bắt đầu", "Mã SV", "Họ tên", "Trạng thái", "Giờ điểm danh", "Cách điểm danh", "Ghi chú"]


def _fmt(dt) -> str:
    return to_local(dt).strftime("%d/%m/%Y %H:%M:%S") if dt else ""


def export_csv(db: Session, cls: Class, sessions: list[ClassSession]) -> str:
    buf = io.StringIO()
    buf.write("﻿")  # BOM để Excel mở đúng tiếng Việt
    writer = csv.writer(buf)
    writer.writerow(CSV_HEADER)
    for session in sessions:
        for row in session_rows(db, session):
            writer.writerow([
                cls.code,
                session.title,
                _fmt(session.starts_at),
                row.student_code or "",
                row.full_name,
                STATUS_LABELS.get(row.status, "Chưa điểm danh"),
                _fmt(row.checked_in_at) if row.status != AttendanceStatus.absent else "",
                METHOD_LABELS.get(row.method, ""),
                row.note or "",
            ])
    return buf.getvalue()
