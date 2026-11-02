from app.modules.classes.models import Class, ClassStudent
from app.modules.subjects.models import Subject
from app.modules.users.models import User


def make_class(db, lecturer: User | None = None, students: list[User] = (), code: str = "L01", **kwargs) -> Class:
    subject = Subject(code=f"MH-{code}", name="Lập trình Web")
    db.add(subject)
    db.flush()
    cls = Class(code=code, name=f"Lớp {code}", subject_id=subject.id, lecturer_id=lecturer.id if lecturer else None, **kwargs)
    db.add(cls)
    db.flush()
    db.add_all(ClassStudent(class_id=cls.id, student_id=s.id) for s in students)
    db.commit()
    return cls
