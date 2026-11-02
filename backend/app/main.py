import importlib
import pkgutil

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app import modules as app_modules
from app.core.config import get_settings
from app.core.db import engine

settings = get_settings()

app = FastAPI(title="Điểm Danh QR API", version="0.1.0", docs_url="/api/docs", openapi_url="/api/openapi.json")

if settings.cors_origin_list:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

api = APIRouter(prefix="/api/v1")


@api.get("/health", tags=["health"])
def health():
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception:
        return JSONResponse(status_code=503, content={"status": "error", "db": "unreachable"})
    return {"status": "ok", "db": "ok"}


# Tự động gắn router của mọi module trong app/modules có file router.py.
# Thêm module mới = tạo thư mục app/modules/<ten>/router.py với biến `router`, không phải sửa file này.
for mod in sorted(pkgutil.iter_modules(app_modules.__path__), key=lambda m: m.name):
    try:
        router_module = importlib.import_module(f"app.modules.{mod.name}.router")
    except ModuleNotFoundError as exc:
        if exc.name != f"app.modules.{mod.name}.router":
            raise
        continue
    api.include_router(router_module.router)

app.include_router(api)
