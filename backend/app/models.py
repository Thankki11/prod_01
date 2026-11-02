"""Nạp toàn bộ models để Alembic thấy metadata. Module mới có models thì thêm 1 dòng import ở đây."""

from app.core.db import Base
from app.modules.attendance import models as _attendance  # noqa: F401
from app.modules.classes import models as _classes  # noqa: F401
from app.modules.sessions import models as _sessions  # noqa: F401
from app.modules.subjects import models as _subjects  # noqa: F401
from app.modules.users import models as _users  # noqa: F401

metadata = Base.metadata
