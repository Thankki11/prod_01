import os

# Phải đặt TRƯỚC khi import app: engine được tạo lúc import và trỏ vào DB test riêng.
os.environ["MYSQL_DATABASE"] = os.environ.get("MYSQL_DATABASE", "diemdanh") + "_test"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.core.db import SessionLocal, engine  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.main import app  # noqa: E402
from app.models import metadata  # noqa: E402
from app.modules.users.models import Role, User  # noqa: E402

PASSWORD = "Password@123"


@pytest.fixture(scope="session", autouse=True)
def _schema():
    # create_all chỉ dùng cho DB test; production luôn đi qua Alembic
    metadata.drop_all(engine)
    metadata.create_all(engine)
    yield
    metadata.drop_all(engine)


@pytest.fixture(autouse=True)
def _clean_tables():
    yield
    with engine.begin() as conn:
        conn.execute(text("SET FOREIGN_KEY_CHECKS = 0"))
        for table in reversed(metadata.sorted_tables):
            conn.execute(table.delete())
        conn.execute(text("SET FOREIGN_KEY_CHECKS = 1"))


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
def make_user(db):
    counter = iter(range(1, 10_000))

    def _make(role: Role = Role.student, **kwargs) -> User:
        n = next(counter)
        user = User(
            username=kwargs.pop("username", f"{role.value}{n}"),
            full_name=kwargs.pop("full_name", f"{role.value.title()} {n}"),
            password_hash=hash_password(kwargs.pop("password", PASSWORD)),
            role=role,
            student_code=kwargs.pop("student_code", f"SV{n:04d}" if role == Role.student else None),
            **kwargs,
        )
        db.add(user)
        db.commit()
        return user

    return _make


@pytest.fixture
def login(client):
    def _login(user: User, password: str = PASSWORD) -> dict[str, str]:
        res = client.post("/api/v1/auth/login", json={"username": user.username, "password": password})
        assert res.status_code == 200, res.text
        return {"Authorization": f"Bearer {res.json()['access_token']}"}

    return _login
