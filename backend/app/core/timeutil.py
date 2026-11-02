from datetime import UTC, datetime
from typing import Annotated

from pydantic import AfterValidator

from app.core.config import get_settings


def _as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


# DB lưu UTC dạng naive. Dùng kiểu này cho mọi field thời gian trả ra API
# để JSON có hậu tố "Z", trình duyệt mới hiểu đúng là giờ UTC.
UtcDatetime = Annotated[datetime, AfterValidator(_as_utc)]


def to_db_utc(value: datetime) -> datetime:
    """Thời gian từ client -> UTC naive để lưu DB. Không kèm múi giờ thì coi là giờ địa phương của trường."""
    if value.tzinfo is None:
        value = value.replace(tzinfo=get_settings().tz)
    return value.astimezone(UTC).replace(tzinfo=None)


def to_local(value: datetime) -> datetime:
    """UTC naive trong DB -> giờ địa phương (dùng cho file CSV và gom nhóm theo ngày)."""
    return value.replace(tzinfo=UTC).astimezone(get_settings().tz)
