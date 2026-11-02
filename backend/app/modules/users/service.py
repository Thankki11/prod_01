from sqlalchemy import exists, func, or_, select
from sqlalchemy.orm import Session

from app.core.errors import conflict, not_found
from app.core.security import hash_password
from app.modules.attendance.models import AttendanceRecord
from app.modules.classes.models import Class
from app.modules.users.models import Role, User
from app.modules.users.schemas import UserCreate, UserUpdate


def list_users(db: Session, q: str | None, role: Role | None, page: int, size: int) -> tuple[list[User], int]:
    stmt = select(User)
    if role:
        stmt = stmt.where(User.role == role)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(User.username.like(like), User.full_name.like(like), User.student_code.like(like)))
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    items = db.scalars(stmt.order_by(User.id.desc()).offset((page - 1) * size).limit(size)).all()
    return list(items), total or 0


def get_user(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise not_found("người dùng")
    return user


def _ensure_unique(db: Session, username: str | None = None, student_code: str | None = None, exclude_id: int | None = None):
    if username and db.scalar(select(User.id).where(User.username == username, User.id != exclude_id)):
        raise conflict(f"Tên đăng nhập '{username}' đã tồn tại")
    if student_code and db.scalar(select(User.id).where(User.student_code == student_code, User.id != exclude_id)):
        raise conflict(f"Mã sinh viên '{student_code}' đã tồn tại")


def create_user(db: Session, data: UserCreate) -> User:
    _ensure_unique(db, data.username, data.student_code)
    user = User(
        username=data.username,
        full_name=data.full_name.strip(),
        password_hash=hash_password(data.password),
        role=data.role,
        student_code=data.student_code if data.role == Role.student else None,
    )
    db.add(user)
    db.commit()
    return user


def update_user(db: Session, user: User, data: UserUpdate, acting_admin: User) -> User:
    changes = data.model_dump(exclude_unset=True)
    if user.id == acting_admin.id and (changes.get("is_active") is False or changes.get("role", Role.admin) != Role.admin):
        raise conflict("Không thể tự khoá hoặc tự hạ quyền tài khoản admin đang đăng nhập")
    if "student_code" in changes:
        changes["student_code"] = (changes["student_code"] or "").strip() or None
        _ensure_unique(db, student_code=changes["student_code"], exclude_id=user.id)
    if password := changes.pop("password", None):
        user.password_hash = hash_password(password)
    for field, value in changes.items():
        setattr(user, field, value)
    db.commit()
    return user


def delete_user(db: Session, user: User, acting_admin: User) -> None:
    if user.id == acting_admin.id:
        raise conflict("Không thể xoá tài khoản đang đăng nhập")
    has_history = db.scalar(select(exists().where(AttendanceRecord.student_id == user.id)))
    teaches = db.scalar(select(exists().where(Class.lecturer_id == user.id)))
    if has_history or teaches:
        # Xoá cứng sẽ kéo theo mất lịch sử điểm danh, nên chỉ cho vô hiệu hoá
        raise conflict("Người dùng đã có dữ liệu điểm danh hoặc đang phụ trách lớp. Hãy vô hiệu hoá thay vì xoá.")
    db.delete(user)
    db.commit()
