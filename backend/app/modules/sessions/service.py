from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.db import utcnow
from app.core.errors import conflict, not_found
from app.core.timeutil import to_db_utc
from app.modules.attendance.models import AttendanceMethod, AttendanceRecord, AttendanceStatus
from app.modules.classes.models import Class, ClassStudent
from app.modules.classes.service import get_class_for_staff
from app.modules.sessions.models import ClassSession, SessionStatus
from app.modules.sessions.qr import new_session_secret
from app.modules.sessions.schemas import SessionCounts, SessionIn, SessionOut
from app.modules.users.models import User


def get_session(db: Session, session_id: int) -> ClassSession:
    session = db.get(ClassSession, session_id)
    if session is None:
        raise not_found("buổi học")
    return session


def get_session_for_staff(db: Session, session_id: int, user: User) -> tuple[ClassSession, Class]:
    session = get_session(db, session_id)
    return session, get_class_for_staff(db, session.class_id, user)


def total_students(db: Session, class_id: int) -> int:
    return db.scalar(select(func.count()).select_from(ClassStudent).where(ClassStudent.class_id == class_id)) or 0


def counts_for(db: Session, sessions: list[ClassSession]) -> dict[int, SessionCounts]:
    if not sessions:
        return {}
    rows = db.execute(
        select(AttendanceRecord.session_id, AttendanceRecord.status, func.count())
        .where(AttendanceRecord.session_id.in_([s.id for s in sessions]))
        .group_by(AttendanceRecord.session_id, AttendanceRecord.status)
    ).all()
    totals: dict[int, int] = {}
    result: dict[int, SessionCounts] = {}
    for s in sessions:
        if s.class_id not in totals:
            totals[s.class_id] = total_students(db, s.class_id)
        result[s.id] = SessionCounts(total_students=totals[s.class_id])
    for session_id, status, n in rows:
        setattr(result[session_id], status.value, n)
    return result


def to_out(db: Session, sessions: list[ClassSession]) -> list[SessionOut]:
    counts = counts_for(db, sessions)
    return [SessionOut.model_validate(s).model_copy(update={"counts": counts[s.id]}) for s in sessions]


def list_sessions(db: Session, cls: Class) -> list[ClassSession]:
    return list(db.scalars(select(ClassSession).where(ClassSession.class_id == cls.id).order_by(ClassSession.starts_at.desc())))


def create_session(db: Session, cls: Class, data: SessionIn, user: User) -> ClassSession:
    session = ClassSession(
        class_id=cls.id,
        title=data.title.strip(),
        starts_at=to_db_utc(data.starts_at) if data.starts_at else utcnow(),
        qr_secret=new_session_secret(),
        created_by=user.id,
    )
    db.add(session)
    db.commit()
    return session


def open_session(db: Session, session: ClassSession) -> ClassSession:
    if session.status != SessionStatus.scheduled:
        raise conflict("Chỉ mở được buổi học chưa bắt đầu")
    session.status = SessionStatus.open
    session.opened_at = utcnow()
    db.commit()
    return session


def close_session(db: Session, session: ClassSession) -> ClassSession:
    """Đóng buổi học; sinh viên trong lớp chưa có bản ghi sẽ được ghi nhận vắng."""
    if session.status != SessionStatus.open:
        raise conflict("Chỉ đóng được buổi học đang mở")
    session.status = SessionStatus.closed
    session.closed_at = utcnow()
    has_record = select(AttendanceRecord.student_id).where(AttendanceRecord.session_id == session.id)
    missing = db.scalars(
        select(ClassStudent.student_id).where(ClassStudent.class_id == session.class_id, ClassStudent.student_id.not_in(has_record))
    ).all()
    db.add_all(
        AttendanceRecord(session_id=session.id, student_id=sid, status=AttendanceStatus.absent, method=AttendanceMethod.qr)
        for sid in missing
    )
    db.commit()
    return session


def checked_in_count(db: Session, session_id: int) -> int:
    return db.scalar(
        select(func.count())
        .select_from(AttendanceRecord)
        .where(AttendanceRecord.session_id == session_id, AttendanceRecord.status != AttendanceStatus.absent)
    ) or 0
