from urllib.parse import quote

from fastapi import APIRouter, status

from app.core.config import get_settings
from app.core.deps import DbSession, StaffUser
from app.core.errors import conflict
from app.modules.classes.service import get_class_for_staff
from app.modules.sessions import service
from app.modules.sessions.models import SessionStatus
from app.modules.sessions.qr import make_token
from app.modules.sessions.schemas import QrOut, SessionIn, SessionOut

router = APIRouter(tags=["sessions"])


@router.get("/classes/{class_id}/sessions", response_model=list[SessionOut])
def list_sessions(class_id: int, db: DbSession, user: StaffUser):
    cls = get_class_for_staff(db, class_id, user)
    return service.to_out(db, service.list_sessions(db, cls))


@router.post("/classes/{class_id}/sessions", response_model=SessionOut, status_code=status.HTTP_201_CREATED)
def create_session(class_id: int, body: SessionIn, db: DbSession, user: StaffUser):
    cls = get_class_for_staff(db, class_id, user)
    return service.to_out(db, [service.create_session(db, cls, body, user)])[0]


@router.get("/sessions/{session_id}", response_model=SessionOut)
def get_session(session_id: int, db: DbSession, user: StaffUser):
    session, _ = service.get_session_for_staff(db, session_id, user)
    return service.to_out(db, [session])[0]


@router.post("/sessions/{session_id}/open", response_model=SessionOut)
def open_session(session_id: int, db: DbSession, user: StaffUser):
    session, _ = service.get_session_for_staff(db, session_id, user)
    return service.to_out(db, [service.open_session(db, session)])[0]


@router.post("/sessions/{session_id}/close", response_model=SessionOut)
def close_session(session_id: int, db: DbSession, user: StaffUser):
    session, _ = service.get_session_for_staff(db, session_id, user)
    return service.to_out(db, [service.close_session(db, session)])[0]


@router.get("/sessions/{session_id}/qr", response_model=QrOut)
def current_qr(session_id: int, db: DbSession, user: StaffUser):
    session, cls = service.get_session_for_staff(db, session_id, user)
    if session.status != SessionStatus.open:
        raise conflict("Buổi học chưa mở hoặc đã kết thúc")
    settings = get_settings()
    qr = make_token(session.id, session.qr_secret)
    return QrOut(
        token=qr.token,
        url=f"{settings.public_app_url.rstrip('/')}/diem-danh?t={quote(qr.token)}",
        expires_in=round(qr.expires_in, 2),
        rotate_seconds=settings.qr_rotate_seconds,
        checked_in=service.checked_in_count(db, session.id),
        total_students=service.total_students(db, cls.id),
    )
