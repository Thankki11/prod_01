from collections import defaultdict
from datetime import UTC, date, datetime, time, timedelta

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import bad_request
from app.core.timeutil import to_local
from app.modules.attendance.models import AttendanceRecord, AttendanceStatus
from app.modules.classes.models import Class, ClassStudent
from app.modules.classes.service import get_class_for_staff
from app.modules.dashboard.schemas import AtRiskStudent, SummaryOut, WeekPoint
from app.modules.sessions.models import ClassSession, SessionStatus
from app.modules.users.models import Role, User

DEFAULT_RANGE_WEEKS = 12


class Scope:
    """Phạm vi dữ liệu được xem: admin = mọi lớp, giảng viên = lớp mình; có thể thu hẹp về 1 lớp."""

    def __init__(self, db: Session, user: User, class_id: int | None, date_from: date | None, date_to: date | None):
        if class_id is not None:
            get_class_for_staff(db, class_id, user)
        self.class_id = class_id
        self.lecturer_id = user.id if user.role == Role.lecturer else None

        today = datetime.now(get_settings().tz).date()
        self.date_to = date_to or today
        self.date_from = date_from or self.date_to - timedelta(weeks=DEFAULT_RANGE_WEEKS)
        if self.date_from > self.date_to:
            raise bad_request("Ngày bắt đầu phải trước ngày kết thúc")
        self.utc_from, self.utc_to = _local_day_bounds(self.date_from, self.date_to)
        self.today_from, self.today_to = _local_day_bounds(today, today)

    def classes(self, stmt: Select) -> Select:
        if self.class_id is not None:
            stmt = stmt.where(Class.id == self.class_id)
        if self.lecturer_id is not None:
            stmt = stmt.where(Class.lecturer_id == self.lecturer_id)
        return stmt


def _local_day_bounds(start: date, end: date) -> tuple[datetime, datetime]:
    """[00:00 ngày start, 00:00 ngày sau end) theo giờ địa phương -> UTC naive để so với DB."""
    tz = get_settings().tz

    def to_utc(d: date) -> datetime:
        return datetime.combine(d, time.min, tzinfo=tz).astimezone(UTC).replace(tzinfo=None)

    return to_utc(start), to_utc(end + timedelta(days=1))


def _rate(attended: int, total: int) -> float | None:
    return round(attended / total * 100, 1) if total else None


def _status_counts(db: Session, scope: Scope, utc_from: datetime, utc_to: datetime) -> dict[AttendanceStatus, int]:
    stmt = scope.classes(
        select(AttendanceRecord.status, func.count())
        .join(ClassSession, ClassSession.id == AttendanceRecord.session_id)
        .join(Class, Class.id == ClassSession.class_id)
        .where(ClassSession.starts_at >= utc_from, ClassSession.starts_at < utc_to)
        .group_by(AttendanceRecord.status)
    )
    return dict(db.execute(stmt).all())


def summary(db: Session, scope: Scope) -> SummaryOut:
    # Hôm nay: so với sĩ số của các buổi đã mở/đã đóng (buổi đang mở thì người chưa quét chưa có bản ghi)
    today_sessions = db.execute(
        scope.classes(
            select(ClassSession.id, ClassSession.class_id)
            .join(Class, Class.id == ClassSession.class_id)
            .where(
                ClassSession.starts_at >= scope.today_from,
                ClassSession.starts_at < scope.today_to,
                ClassSession.status != SessionStatus.scheduled,
            )
        )
    ).all()
    class_sizes = dict(
        db.execute(
            select(ClassStudent.class_id, func.count())
            .where(ClassStudent.class_id.in_({c for _, c in today_sessions} or {0}))
            .group_by(ClassStudent.class_id)
        ).all()
    )
    today_expected = sum(class_sizes.get(c, 0) for _, c in today_sessions)
    today_counts = _status_counts(db, scope, scope.today_from, scope.today_to)
    today_attended = today_counts.get(AttendanceStatus.present, 0) + today_counts.get(AttendanceStatus.late, 0)

    open_sessions = db.scalar(
        scope.classes(
            select(func.count()).select_from(ClassSession).join(Class, Class.id == ClassSession.class_id)
            .where(ClassSession.status == SessionStatus.open)
        )
    ) or 0

    range_counts = _status_counts(db, scope, scope.utc_from, scope.utc_to)
    range_total = sum(range_counts.values())
    range_attended = range_counts.get(AttendanceStatus.present, 0) + range_counts.get(AttendanceStatus.late, 0)
    range_sessions = db.scalar(
        scope.classes(
            select(func.count()).select_from(ClassSession).join(Class, Class.id == ClassSession.class_id)
            .where(ClassSession.starts_at >= scope.utc_from, ClassSession.starts_at < scope.utc_to)
        )
    ) or 0

    return SummaryOut(
        today_rate=_rate(today_attended, today_expected),
        today_expected=today_expected,
        today_attended=today_attended,
        open_sessions=open_sessions,
        at_risk_students=len(at_risk(db, scope)),
        range_rate=_rate(range_attended, range_total),
        range_sessions=range_sessions,
    )


def weekly_trend(db: Session, scope: Scope) -> list[WeekPoint]:
    rows = db.execute(
        scope.classes(
            select(ClassSession.starts_at, AttendanceRecord.status)
            .join(ClassSession, ClassSession.id == AttendanceRecord.session_id)
            .join(Class, Class.id == ClassSession.class_id)
            .where(ClassSession.starts_at >= scope.utc_from, ClassSession.starts_at < scope.utc_to)
        )
    ).all()
    buckets: dict[date, dict[AttendanceStatus, int]] = defaultdict(lambda: defaultdict(int))
    for starts_at, status in rows:
        local_day = to_local(starts_at).date()
        buckets[local_day - timedelta(days=local_day.weekday())][status] += 1

    # Trả đủ mọi tuần trong khoảng, kể cả tuần không có buổi, để biểu đồ không bị nhảy cóc
    week = scope.date_from - timedelta(days=scope.date_from.weekday())
    points = []
    while week <= scope.date_to:
        c = buckets.get(week, {})
        p, l, a = c.get(AttendanceStatus.present, 0), c.get(AttendanceStatus.late, 0), c.get(AttendanceStatus.absent, 0)
        points.append(WeekPoint(week_start=week, present=p, late=l, absent=a, rate=_rate(p + l, p + l + a)))
        week += timedelta(weeks=1)
    return points


def at_risk(db: Session, scope: Scope) -> list[AtRiskStudent]:
    """Sinh viên có tỉ lệ vắng (trên các buổi đã đóng trong khoảng) vượt ngưỡng của lớp."""
    closed = (
        select(ClassSession.class_id, func.count().label("n"))
        .where(
            ClassSession.status == SessionStatus.closed,
            ClassSession.starts_at >= scope.utc_from,
            ClassSession.starts_at < scope.utc_to,
        )
        .group_by(ClassSession.class_id)
        .subquery()
    )
    absences = (
        select(ClassSession.class_id, AttendanceRecord.student_id, func.count().label("absent"))
        .join(ClassSession, ClassSession.id == AttendanceRecord.session_id)
        .where(
            AttendanceRecord.status == AttendanceStatus.absent,
            ClassSession.status == SessionStatus.closed,
            ClassSession.starts_at >= scope.utc_from,
            ClassSession.starts_at < scope.utc_to,
        )
        .group_by(ClassSession.class_id, AttendanceRecord.student_id)
        .subquery()
    )
    rows = db.execute(
        scope.classes(
            select(User, Class, absences.c.absent, closed.c.n)
            .join(absences, absences.c.student_id == User.id)
            .join(Class, Class.id == absences.c.class_id)
            .join(closed, closed.c.class_id == Class.id)
            .where(absences.c.absent * 100 > Class.absence_threshold_pct * closed.c.n)
        )
    ).all()
    result = [
        AtRiskStudent(
            student_id=u.id,
            student_code=u.student_code,
            full_name=u.full_name,
            class_id=c.id,
            class_code=c.code,
            absent=absent,
            sessions=n,
            absence_pct=round(absent / n * 100, 1),
            threshold_pct=c.absence_threshold_pct,
        )
        for u, c, absent, n in rows
    ]
    return sorted(result, key=lambda r: (-r.absence_pct, r.class_code, r.student_code or ""))
