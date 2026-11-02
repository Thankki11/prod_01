"""Tạo dữ liệu ban đầu. Chạy lại nhiều lần không tạo trùng.

    python -m scripts.seed               # dev: 1 admin, 1 giảng viên, 1 lớp, 5 sinh viên
    python -m scripts.seed --admin-only  # production: chỉ tài khoản admin
"""

import argparse
import os
import sys

from sqlalchemy import select

from app.core.db import SessionLocal
from app.core.security import hash_password
from app.modules.classes.models import Class, ClassStudent
from app.modules.subjects.models import Subject
from app.modules.users.models import Role, User

STUDENTS = [
    ("B21DCCN001", "Nguyễn Văn An"),
    ("B21DCCN002", "Trần Thị Bình"),
    ("B21DCCN003", "Lê Hoàng Cường"),
    ("B21DCCN004", "Phạm Minh Dung"),
    ("B21DCCN005", "Võ Thu Hà"),
]


def get_or_create_user(db, username: str, password: str, **fields) -> User:
    user = db.scalar(select(User).where(User.username == username))
    if user is None:
        user = User(username=username, password_hash=hash_password(password), **fields)
        db.add(user)
        db.flush()
        print(f"  + {fields['role'].value:<8} {username}")
    return user


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--admin-only", action="store_true")
    args = parser.parse_args()

    admin_password = os.environ.get("SEED_ADMIN_PASSWORD")
    if not admin_password or len(admin_password) < 8:
        sys.exit("Cần đặt SEED_ADMIN_PASSWORD (tối thiểu 8 ký tự)")
    demo_password = os.environ.get("SEED_DEMO_PASSWORD", "Demo@1234")

    with SessionLocal() as db:
        print("Seed:")
        get_or_create_user(db, "admin", admin_password, full_name="Quản trị viên", role=Role.admin)
        if not args.admin_only:
            lecturer = get_or_create_user(db, "gv.demo", demo_password, full_name="ThS. Nguyễn Thị Lan", role=Role.lecturer)
            subject = db.scalar(select(Subject).where(Subject.code == "INT1434"))
            if subject is None:
                subject = Subject(code="INT1434", name="Lập trình Web")
                db.add(subject)
                db.flush()
            cls = db.scalar(select(Class).where(Class.code == "D21CQCN01"))
            if cls is None:
                cls = Class(code="D21CQCN01", name="Lập trình Web - Nhóm 01", subject_id=subject.id, lecturer_id=lecturer.id, semester="HK1 2026-2027")
                db.add(cls)
                db.flush()
                print(f"  + class    {cls.code}")
            for code, name in STUDENTS:
                sv = get_or_create_user(db, code.lower(), demo_password, full_name=name, student_code=code, role=Role.student)
                if db.get(ClassStudent, (cls.id, sv.id)) is None:
                    db.add(ClassStudent(class_id=cls.id, student_id=sv.id))
        db.commit()
    print("Xong.")


if __name__ == "__main__":
    main()
