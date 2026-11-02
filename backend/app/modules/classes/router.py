from fastapi import APIRouter, File, UploadFile, status

from app.core.deps import AdminUser, CurrentUser, DbSession, StaffUser
from app.core.errors import bad_request
from app.modules.classes import service
from app.modules.classes.schemas import AddStudentsIn, ClassIn, ClassOut, ClassUpdate, ImportResult, StudentInClass

router = APIRouter(prefix="/classes", tags=["classes"])

MAX_CSV_BYTES = 2 * 1024 * 1024


@router.get("", response_model=list[ClassOut])
def list_classes(db: DbSession, user: CurrentUser):
    return service.to_out(db, service.list_classes(db, user))


@router.post("", response_model=ClassOut, status_code=status.HTTP_201_CREATED)
def create_class(body: ClassIn, db: DbSession, _: AdminUser):
    return service.to_out(db, [service.create_class(db, body)])[0]


@router.get("/{class_id}", response_model=ClassOut)
def get_class(class_id: int, db: DbSession, user: CurrentUser):
    return service.to_out(db, [service.get_class_for_viewer(db, class_id, user)])[0]


@router.patch("/{class_id}", response_model=ClassOut)
def update_class(class_id: int, body: ClassUpdate, db: DbSession, _: AdminUser):
    cls = service.update_class(db, service.get_class(db, class_id), body)
    return service.to_out(db, [cls])[0]


@router.delete("/{class_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_class(class_id: int, db: DbSession, _: AdminUser):
    service.delete_class(db, service.get_class(db, class_id))


@router.get("/{class_id}/students", response_model=list[StudentInClass])
def list_students(class_id: int, db: DbSession, user: StaffUser):
    return service.list_students(db, service.get_class_for_staff(db, class_id, user))


@router.post("/{class_id}/students", status_code=status.HTTP_200_OK)
def add_students(class_id: int, body: AddStudentsIn, db: DbSession, user: StaffUser):
    cls = service.get_class_for_staff(db, class_id, user)
    return {"added": service.add_students(db, cls, body.student_ids)}


@router.delete("/{class_id}/students/{student_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_student(class_id: int, student_id: int, db: DbSession, user: StaffUser):
    service.remove_student(db, service.get_class_for_staff(db, class_id, user), student_id)


@router.post("/{class_id}/students/import", response_model=ImportResult)
def import_students(class_id: int, db: DbSession, user: StaffUser, file: UploadFile = File(...)):
    # Hàm đồng bộ (không async): hash mật khẩu tốn CPU, FastAPI sẽ chạy nó trong threadpool
    cls = service.get_class_for_staff(db, class_id, user)
    raw = file.file.read(MAX_CSV_BYTES + 1)
    if len(raw) > MAX_CSV_BYTES:
        raise bad_request("File CSV tối đa 2 MB")
    return service.import_students_csv(db, cls, raw)
