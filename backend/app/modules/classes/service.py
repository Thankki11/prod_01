import csv
import io

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.errors import bad_request, conflict, forbidden, not_found
from app.core.security import hash_password
from app.modules.classes.models import Class, ClassStudent
from app.modules.classes.schemas import ClassIn, ClassOut, ClassUpdate, ImportError_, ImportResult, StudentInClass
from app.modules.subjects.models import Subject
from app.modules.users.models import Role, User

MAX_IMPORT_ROWS = 2000


# ---------- Phân quyền theo lớp (các module sessions/attendance/dashboard dùng lại) ----------

def get_class(db: Session, class_id: int) -> Class:
    cls = db.get(Class, class_id)
    if cls is None:
        raise not_found("lớp")
    return cls


def can_manage(user: User, cls: Class) -> bool:
    return user.role == Role.admin or (user.role == Role.lecturer and cls.lecturer_id == user.id)


def get_class_for_staff(db: Session, class_id: int, user: User) -> Class:
    """Lớp mà user được quản lý: admin mọi lớp, giảng viên chỉ lớp mình phụ trách."""
    cls = get_class(db, class_id)
    if not can_manage(user, cls):
        raise forbidden("Bạn không phụ trách lớp này")
    return cls


def is_enrolled(db: Session, class_id: int, student_id: int) -> bool:
    return db.get(ClassStudent, (class_id, student_id)) is not None


# ---------- CRUD lớp ----------

def _student_counts(db: Session, class_ids: list[int]) -> dict[int, int]:
    if not class_ids:
        return {}
    rows = db.execute(
        select(ClassStudent.class_id, func.count()).where(ClassStudent.class_id.in_(class_ids)).group_by(ClassStudent.class_id)
    )
    return dict(rows.all())


def to_out(db: Session, classes: list[Class]) -> list[ClassOut]:
    counts = _student_counts(db, [c.id for c in classes])
    return [ClassOut.model_validate(c).model_copy(update={"student_count": counts.get(c.id, 0)}) for c in classes]


def list_classes(db: Session, user: User) -> list[Class]:
    stmt = select(Class).order_by(Class.code)
    if user.role == Role.lecturer:
        stmt = stmt.where(Class.lecturer_id == user.id)
    elif user.role == Role.student:
        stmt = stmt.join(ClassStudent, ClassStudent.class_id == Class.id).where(ClassStudent.student_id == user.id)
    return list(db.scalars(stmt).unique().all())


def get_class_for_viewer(db: Session, class_id: int, user: User) -> Class:
    cls = get_class(db, class_id)
    if can_manage(user, cls) or (user.role == Role.student and is_enrolled(db, cls.id, user.id)):
        return cls
    raise forbidden("Bạn không có quyền xem lớp này")


def _validate_refs(db: Session, subject_id: int | None, lecturer_id: int | None):
    if subject_id is not None and db.get(Subject, subject_id) is None:
        raise bad_request("Môn học không tồn tại")
    if lecturer_id is not None:
        lecturer = db.get(User, lecturer_id)
        if lecturer is None or lecturer.role != Role.lecturer:
            raise bad_request("Giảng viên phụ trách không hợp lệ")


def _ensure_code_free(db: Session, code: str, exclude_id: int | None = None):
    if db.scalar(select(Class.id).where(Class.code == code, Class.id != exclude_id)):
        raise conflict(f"Mã lớp '{code}' đã tồn tại")


def create_class(db: Session, data: ClassIn) -> Class:
    _ensure_code_free(db, data.code)
    _validate_refs(db, data.subject_id, data.lecturer_id)
    cls = Class(**data.model_dump())
    db.add(cls)
    db.commit()
    db.refresh(cls)
    return cls


def update_class(db: Session, cls: Class, data: ClassUpdate) -> Class:
    changes = data.model_dump(exclude_unset=True)
    if "code" in changes:
        _ensure_code_free(db, changes["code"], cls.id)
    _validate_refs(db, changes.get("subject_id"), changes.get("lecturer_id"))
    for field, value in changes.items():
        setattr(cls, field, value)
    db.commit()
    db.refresh(cls)
    return cls


def delete_class(db: Session, cls: Class) -> None:
    db.delete(cls)
    db.commit()


# ---------- Sinh viên trong lớp ----------

def list_students(db: Session, cls: Class) -> list[StudentInClass]:
    rows = db.execute(
        select(User, ClassStudent.joined_at)
        .join(ClassStudent, ClassStudent.student_id == User.id)
        .where(ClassStudent.class_id == cls.id)
        .order_by(User.student_code, User.full_name)
    ).all()
    return [
        StudentInClass(
            id=u.id, username=u.username, student_code=u.student_code, full_name=u.full_name, is_active=u.is_active, joined_at=j
        )
        for u, j in rows
    ]


def add_students(db: Session, cls: Class, student_ids: list[int]) -> int:
    students = db.scalars(select(User).where(User.id.in_(student_ids), User.role == Role.student)).all()
    if len(students) != len(set(student_ids)):
        raise bad_request("Có ID không tồn tại hoặc không phải sinh viên")
    already = set(db.scalars(select(ClassStudent.student_id).where(ClassStudent.class_id == cls.id)).all())
    added = [s for s in students if s.id not in already]
    db.add_all(ClassStudent(class_id=cls.id, student_id=s.id) for s in added)
    db.commit()
    return len(added)


def remove_student(db: Session, cls: Class, student_id: int) -> None:
    result = db.execute(delete(ClassStudent).where(ClassStudent.class_id == cls.id, ClassStudent.student_id == student_id))
    if result.rowcount == 0:
        raise not_found("sinh viên trong lớp")
    db.commit()


def import_students_csv(db: Session, cls: Class, raw: bytes) -> ImportResult:
    """CSV cột: student_code, full_name, [username], [password].

    Sinh viên chưa có tài khoản sẽ được tạo mới; thiếu username thì dùng mã SV viết thường,
    thiếu password thì mật khẩu ban đầu = mã SV.
    """
    try:
        text = raw.decode("utf-8-sig")  # Excel hay lưu UTF-8 có BOM
    except UnicodeDecodeError:
        raise bad_request("File phải được lưu dạng CSV UTF-8") from None
    try:
        dialect = csv.Sniffer().sniff(text.splitlines()[0] if text else ",", delimiters=",;")
    except csv.Error:
        dialect = csv.excel
    reader = csv.DictReader(io.StringIO(text), dialect=dialect)
    headers = {h.strip().lower() for h in (reader.fieldnames or [])}
    if not {"student_code", "full_name"} <= headers:
        raise bad_request("CSV cần có cột 'student_code' và 'full_name'")

    errors: list[ImportError_] = []
    created = enrolled = already_enrolled = 0
    enrolled_ids = set(db.scalars(select(ClassStudent.student_id).where(ClassStudent.class_id == cls.id)).all())
    seen_codes: set[str] = set()

    for line_no, row in enumerate(reader, start=2):
        if line_no - 1 > MAX_IMPORT_ROWS:
            errors.append(ImportError_(line=line_no, message=f"Vượt quá {MAX_IMPORT_ROWS} dòng, phần còn lại bị bỏ qua"))
            break
        row = {(k or "").strip().lower(): (v or "").strip() for k, v in row.items()}
        code, name = row.get("student_code", ""), row.get("full_name", "")
        if not code or not name:
            errors.append(ImportError_(line=line_no, message="Thiếu mã sinh viên hoặc họ tên"))
            continue
        if code in seen_codes:
            errors.append(ImportError_(line=line_no, message=f"Mã '{code}' bị lặp trong file"))
            continue
        seen_codes.add(code)

        user = db.scalar(select(User).where(User.student_code == code))
        if user is None:
            username = row.get("username") or code.lower()
            if db.scalar(select(User.id).where(User.username == username)):
                errors.append(ImportError_(line=line_no, message=f"Tên đăng nhập '{username}' đã được dùng"))
                continue
            user = User(
                username=username,
                student_code=code,
                full_name=name,
                password_hash=hash_password(row.get("password") or code),
                role=Role.student,
            )
            db.add(user)
            db.flush()
            created += 1
        elif user.role != Role.student:
            errors.append(ImportError_(line=line_no, message=f"Mã '{code}' thuộc tài khoản không phải sinh viên"))
            continue

        if user.id in enrolled_ids:
            already_enrolled += 1
            continue
        db.add(ClassStudent(class_id=cls.id, student_id=user.id))
        enrolled_ids.add(user.id)
        enrolled += 1

    db.commit()
    return ImportResult(created=created, enrolled=enrolled, already_enrolled=already_enrolled, errors=errors)
