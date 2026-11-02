from fastapi import APIRouter, Cookie, HTTPException, Response, status

from app.core.config import get_settings
from app.core.deps import CurrentUser, DbSession
from app.core.security import create_access_token, hash_password, verify_password
from app.modules.auth import service
from app.modules.auth.schemas import ChangePasswordIn, LoginIn, TokenOut
from app.modules.users.models import User
from app.modules.users.schemas import UserOut

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE = "refresh_token"
# Cookie chỉ được gửi kèm các request tới /api/v1/auth, không lộ ra các API khác
REFRESH_COOKIE_PATH = "/api/v1/auth"


def _token_response(response: Response, user: User, refresh_token: str) -> TokenOut:
    settings = get_settings()
    response.set_cookie(
        REFRESH_COOKIE,
        refresh_token,
        max_age=settings.refresh_token_days * 86400,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="strict",
        path=REFRESH_COOKIE_PATH,
    )
    return TokenOut(
        access_token=create_access_token(user.id, user.role.value),
        expires_in=settings.access_token_minutes * 60,
        user=UserOut.model_validate(user),
    )


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, response: Response, db: DbSession):
    user = service.authenticate(db, body.username, body.password)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sai tên đăng nhập hoặc mật khẩu")
    return _token_response(response, user, service.issue_refresh_token(db, user))


@router.post("/refresh", response_model=TokenOut)
def refresh(response: Response, db: DbSession, refresh_token: str | None = Cookie(default=None)):
    result = service.rotate_refresh_token(db, refresh_token) if refresh_token else None
    if result is None:
        response.delete_cookie(REFRESH_COOKIE, path=REFRESH_COOKIE_PATH)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Phiên đăng nhập đã hết hạn")
    user, new_token = result
    return _token_response(response, user, new_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response, db: DbSession, refresh_token: str | None = Cookie(default=None)):
    if refresh_token:
        service.revoke_refresh_token(db, refresh_token)
    response.delete_cookie(REFRESH_COOKIE, path=REFRESH_COOKIE_PATH)


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser):
    return user


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(body: ChangePasswordIn, user: CurrentUser, db: DbSession):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mật khẩu hiện tại không đúng")
    user.password_hash = hash_password(body.new_password)
    # Đổi mật khẩu thì đăng xuất mọi thiết bị khác
    service.revoke_all_for_user(db, user.id)
    db.commit()
