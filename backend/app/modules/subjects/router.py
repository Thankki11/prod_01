from fastapi import APIRouter, status
from sqlalchemy import exists, select

from app.core.deps import AdminUser, CurrentUser, DbSession
from app.core.errors import conflict, not_found
from app.modules.classes.models import Class
from app.modules.subjects.models import Subject
from app.modules.subjects.schemas import SubjectIn, SubjectOut, SubjectUpdate

router = APIRouter(prefix="/subjects", tags=["subjects"])


def _get(db, subject_id: int) -> Subject:
    subject = db.get(Subject, subject_id)
    if subject is None:
        raise not_found("môn học")
    return subject


def _ensure_code_free(db, code: str, exclude_id: int | None = None):
    if db.scalar(select(Subject.id).where(Subject.code == code, Subject.id != exclude_id)):
        raise conflict(f"Mã môn '{code}' đã tồn tại")


# Mọi người đã đăng nhập đều xem được danh sách môn (để hiện tên môn trên giao diện)
@router.get("", response_model=list[SubjectOut])
def list_subjects(db: DbSession, _: CurrentUser):
    return db.scalars(select(Subject).order_by(Subject.code)).all()


@router.post("", response_model=SubjectOut, status_code=status.HTTP_201_CREATED)
def create_subject(body: SubjectIn, db: DbSession, _: AdminUser):
    _ensure_code_free(db, body.code)
    subject = Subject(code=body.code.strip(), name=body.name.strip())
    db.add(subject)
    db.commit()
    return subject


@router.patch("/{subject_id}", response_model=SubjectOut)
def update_subject(subject_id: int, body: SubjectUpdate, db: DbSession, _: AdminUser):
    subject = _get(db, subject_id)
    changes = body.model_dump(exclude_unset=True)
    if "code" in changes:
        _ensure_code_free(db, changes["code"], subject.id)
    for field, value in changes.items():
        setattr(subject, field, value.strip())
    db.commit()
    return subject


@router.delete("/{subject_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_subject(subject_id: int, db: DbSession, _: AdminUser):
    subject = _get(db, subject_id)
    if db.scalar(select(exists().where(Class.subject_id == subject.id))):
        raise conflict("Môn học đang được dùng cho lớp, không thể xoá")
    db.delete(subject)
    db.commit()
