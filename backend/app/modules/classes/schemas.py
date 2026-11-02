from pydantic import BaseModel, ConfigDict, Field

from app.core.timeutil import UtcDatetime
from app.modules.subjects.schemas import SubjectOut


class LecturerBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    username: str


class ClassIn(BaseModel):
    code: str = Field(min_length=1, max_length=32)
    name: str = Field(min_length=1, max_length=128)
    subject_id: int
    lecturer_id: int | None = None
    semester: str = Field(default="", max_length=32)
    late_after_minutes: int = Field(default=15, ge=0, le=240)
    absence_threshold_pct: int = Field(default=20, ge=1, le=100)


class ClassUpdate(BaseModel):
    code: str | None = Field(default=None, min_length=1, max_length=32)
    name: str | None = Field(default=None, min_length=1, max_length=128)
    subject_id: int | None = None
    lecturer_id: int | None = None
    semester: str | None = Field(default=None, max_length=32)
    late_after_minutes: int | None = Field(default=None, ge=0, le=240)
    absence_threshold_pct: int | None = Field(default=None, ge=1, le=100)


class ClassOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str
    semester: str
    late_after_minutes: int
    absence_threshold_pct: int
    subject: SubjectOut
    lecturer: LecturerBrief | None
    student_count: int = 0


class StudentInClass(BaseModel):
    id: int
    username: str
    student_code: str | None
    full_name: str
    is_active: bool
    joined_at: UtcDatetime


class AddStudentsIn(BaseModel):
    student_ids: list[int] = Field(min_length=1, max_length=500)


class ImportError_(BaseModel):
    line: int
    message: str


class ImportResult(BaseModel):
    created: int
    enrolled: int
    already_enrolled: int
    errors: list[ImportError_]
