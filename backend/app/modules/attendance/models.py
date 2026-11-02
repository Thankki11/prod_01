import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, utcnow


class AttendanceStatus(str, enum.Enum):
    present = "present"
    late = "late"
    absent = "absent"


class AttendanceMethod(str, enum.Enum):
    qr = "qr"
    manual = "manual"


class AttendanceRecord(Base):
    __tablename__ = "attendance_records"
    # Chặn điểm danh trùng ngay ở tầng DB, kể cả khi 2 request đến cùng lúc
    __table_args__ = (UniqueConstraint("session_id", "student_id", name="uq_attendance_session_student"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("class_sessions.id", ondelete="CASCADE"))
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    status: Mapped[AttendanceStatus] = mapped_column(Enum(AttendanceStatus, name="attendance_status"))
    method: Mapped[AttendanceMethod] = mapped_column(Enum(AttendanceMethod, name="attendance_method"))
    checked_in_at: Mapped[datetime | None] = mapped_column(DateTime)
    note: Mapped[str | None] = mapped_column(String(500))
    updated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)
