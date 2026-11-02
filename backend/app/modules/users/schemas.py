from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.timeutil import UtcDatetime
from app.modules.users.models import Role


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    student_code: str | None
    full_name: str
    role: Role
    is_active: bool
    created_at: UtcDatetime


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=64, pattern=r"^[A-Za-z0-9._-]+$")
    full_name: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=8, max_length=128)
    role: Role
    student_code: str | None = Field(default=None, max_length=32)

    @field_validator("student_code")
    @classmethod
    def blank_to_none(cls, v: str | None) -> str | None:
        return v.strip() or None if v is not None else None


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=128)
    password: str | None = Field(default=None, min_length=8, max_length=128)
    role: Role | None = None
    student_code: str | None = Field(default=None, max_length=32)
    is_active: bool | None = None


class UserPage(BaseModel):
    items: list[UserOut]
    total: int
