"""Mã QR xoay vòng, không cần ghi DB mỗi lần đổi mã.

token = "<session_id>.<window>.<chữ ký>", với window = floor(thời gian / QR_ROTATE_SECONDS).
Chữ ký là HMAC-SHA256 dùng khoá ghép từ SECRET_KEY của server và qr_secret riêng của buổi học,
nên lộ DB thôi chưa đủ để giả mã. Server nhận mã của khung hiện tại và khung liền trước,
để sinh viên quét đúng lúc mã vừa đổi vẫn hợp lệ.
"""

import base64
import hashlib
import hmac
import secrets
import time
from dataclasses import dataclass
from enum import Enum

from app.core.config import get_settings

SIG_BYTES = 16  # cắt ngắn chữ ký để mã QR thưa, dễ quét; 128 bit vẫn đủ an toàn


class QrError(Enum):
    malformed = "malformed"
    bad_signature = "bad_signature"
    expired = "expired"


@dataclass(frozen=True)
class QrCode:
    token: str
    expires_in: float


def new_session_secret() -> str:
    return secrets.token_urlsafe(32)


def _window(now: float | None = None) -> int:
    return int((time.time() if now is None else now) // get_settings().qr_rotate_seconds)


def _sign(session_id: int, window: int, session_secret: str) -> str:
    key = f"{get_settings().secret_key}:{session_secret}".encode()
    digest = hmac.new(key, f"{session_id}.{window}".encode(), hashlib.sha256).digest()[:SIG_BYTES]
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode()


def make_token(session_id: int, session_secret: str, now: float | None = None) -> QrCode:
    now = time.time() if now is None else now
    window = _window(now)
    rotate = get_settings().qr_rotate_seconds
    return QrCode(token=f"{session_id}.{window}.{_sign(session_id, window, session_secret)}", expires_in=(window + 1) * rotate - now)


def parse_session_id(token: str) -> int | None:
    parts = token.split(".")
    if len(parts) != 3 or not parts[0].isdigit() or not parts[1].isdigit():
        return None
    return int(parts[0])


def verify_token(token: str, session_id: int, session_secret: str, now: float | None = None) -> QrError | None:
    """Trả về None nếu hợp lệ, ngược lại là lý do bị từ chối."""
    parts = token.split(".")
    if len(parts) != 3 or parts[0] != str(session_id) or not parts[1].isdigit():
        return QrError.malformed
    window = int(parts[1])
    if not hmac.compare_digest(parts[2], _sign(session_id, window, session_secret)):
        return QrError.bad_signature
    current = _window(now)
    if window not in (current, current - 1):
        return QrError.expired
    return None
