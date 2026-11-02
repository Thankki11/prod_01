from fastapi import APIRouter, Query, status

from app.core.deps import AdminUser, DbSession
from app.modules.users import service
from app.modules.users.models import Role
from app.modules.users.schemas import UserCreate, UserOut, UserPage, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=UserPage)
def list_users(
    db: DbSession,
    _: AdminUser,
    q: str | None = Query(default=None, max_length=100),
    role: Role | None = None,
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
):
    items, total = service.list_users(db, q, role, page, size)
    return UserPage(items=items, total=total)


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(body: UserCreate, db: DbSession, _: AdminUser):
    return service.create_user(db, body)


@router.get("/{user_id}", response_model=UserOut)
def get_user(user_id: int, db: DbSession, _: AdminUser):
    return service.get_user(db, user_id)


@router.patch("/{user_id}", response_model=UserOut)
def update_user(user_id: int, body: UserUpdate, db: DbSession, admin: AdminUser):
    return service.update_user(db, service.get_user(db, user_id), body, admin)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: int, db: DbSession, admin: AdminUser):
    service.delete_user(db, service.get_user(db, user_id), admin)
