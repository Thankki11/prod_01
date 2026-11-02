from datetime import date

from pydantic import BaseModel


class SummaryOut(BaseModel):
    today_rate: float | None  # None khi hôm nay chưa có buổi nào mở
    today_expected: int
    today_attended: int
    open_sessions: int
    at_risk_students: int
    range_rate: float | None
    range_sessions: int


class WeekPoint(BaseModel):
    week_start: date
    present: int
    late: int
    absent: int
    rate: float | None


class AtRiskStudent(BaseModel):
    student_id: int
    student_code: str | None
    full_name: str
    class_id: int
    class_code: str
    absent: int
    sessions: int
    absence_pct: float
    threshold_pct: int
