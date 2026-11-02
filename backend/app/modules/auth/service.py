from datetime import timedelta

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import utcnow
from app.core.security import hash_refresh_token, new_refresh_token, verify_password
from app.modules.users.models import RefreshToken, User


def authenticate(db: Session, username: str, password: str) -> User | None:
    user = db.scalar(select(User).where(User.username == username))
    if user is None or not user.is_active or not verify_password(password, user.password_hash):
        return None
    return user


def issue_refresh_token(db: Session, user: User) -> str:
    token, token_hash = new_refresh_token()
    expires = utcnow() + timedelta(days=get_settings().refresh_token_days)
    db.add(RefreshToken(user_id=user.id, token_hash=token_hash, expires_at=expires))
    db.commit()
    return token


def rotate_refresh_token(db: Session, token: str) -> tuple[User, str] | None:
    """Đổi refresh token cũ lấy token mới. Token cũ bị thu hồi ngay, nên mỗi token chỉ dùng được 1 lần."""
    row = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(token)))
    if row is None or row.revoked_at is not None or row.expires_at <= utcnow():
        return None
    user = db.get(User, row.user_id)
    if user is None or not user.is_active:
        return None
    row.revoked_at = utcnow()
    return user, issue_refresh_token(db, user)


def revoke_refresh_token(db: Session, token: str) -> None:
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.token_hash == hash_refresh_token(token), RefreshToken.revoked_at.is_(None))
        .values(revoked_at=utcnow())
    )
    db.commit()


def revoke_all_for_user(db: Session, user_id: int) -> None:
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=utcnow())
    )
