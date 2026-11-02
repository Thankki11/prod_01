from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.core.timeutil import UtcDatetime
from app.modules.sessions.models import SessionStatus


class SessionIn(BaseModel):
    title: str = Field(min_length=1, max_length=128)
    # Bỏ trống = bắt đầu ngay bây giờ
    starts_at: datetime | None = None


class SessionCounts(BaseModel):
    present: int = 0
    late: int = 0
    absent: int = 0
    total_students: int = 0


class SessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    class_id: int
    title: str
    starts_at: UtcDatetime
    status: SessionStatus
    opened_at: UtcDatetime | None
    closed_at: UtcDatetime | None
    counts: SessionCounts = SessionCounts()


class QrOut(BaseModel):
    token: str
    url: str
    expires_in: float
    rotate_seconds: int
    checked_in: int
    total_students: int
