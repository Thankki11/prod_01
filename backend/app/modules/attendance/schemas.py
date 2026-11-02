from pydantic import BaseModel, Field

from app.core.timeutil import UtcDatetime
from app.modules.attendance.models import AttendanceMethod, AttendanceStatus


class CheckInIn(BaseModel):
    token: str = Field(min_length=5, max_length=200)


class CheckInOut(BaseModel):
    status: AttendanceStatus
    checked_in_at: UtcDatetime
    session_title: str
    class_code: str
    class_name: str


class AttendanceRow(BaseModel):
    """Một dòng trong danh sách điểm danh của buổi: mọi sinh viên trong lớp, kể cả chưa điểm danh."""

    record_id: int | None
    student_id: int
    student_code: str | None
    full_name: str
    status: AttendanceStatus | None
    method: AttendanceMethod | None
    checked_in_at: UtcDatetime | None
    note: str | None


class ManualMarkIn(BaseModel):
    status: AttendanceStatus
    note: str = Field(min_length=3, max_length=500, description="Lý do sửa tay (bắt buộc)")


class MyAttendanceItem(BaseModel):
    session_id: int
    session_title: str
    starts_at: UtcDatetime
    class_id: int
    class_code: str
    class_name: str
    status: AttendanceStatus
    checked_in_at: UtcDatetime | None


class MyClassSummary(BaseModel):
    class_id: int
    class_code: str
    class_name: str
    present: int
    late: int
    absent: int
    absence_threshold_pct: int


class MyAttendanceOut(BaseModel):
    summary: list[MyClassSummary]
    items: list[MyAttendanceItem]
