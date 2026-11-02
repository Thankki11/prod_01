# syntax=docker/dockerfile:1

# ---------- base: Python + múi giờ ----------
FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PATH="/venv/bin:$PATH"
RUN apt-get update && apt-get install -y --no-install-recommends tzdata && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---------- deps: chỉ cài thư viện, cache được khi code đổi ----------
FROM base AS deps
COPY pyproject.toml .
RUN python -m venv /venv && python - <<'EOF'
import subprocess, tomllib
deps = tomllib.load(open("pyproject.toml", "rb"))["project"]["dependencies"]
subprocess.check_call(["pip", "install", *deps])
EOF

# ---------- dev: thêm pytest/httpx, chạy uvicorn --reload ----------
FROM deps AS dev
RUN python - <<'EOF'
import subprocess, tomllib
deps = tomllib.load(open("pyproject.toml", "rb"))["project"]["optional-dependencies"]["dev"]
subprocess.check_call(["pip", "install", *deps])
EOF
COPY . .
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"]

# ---------- prod: image gọn, user không phải root ----------
FROM base AS prod
COPY --from=deps /venv /venv
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./
COPY scripts ./scripts
RUN useradd --system --uid 10001 appuser
USER appuser
# Render (và nhiều PaaS khác) cấp cổng qua biến PORT; không có thì dùng 8000 như docker-compose
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
    CMD python -c "import os,urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:' + os.environ.get('PORT', '8000') + '/api/v1/health', timeout=4).status == 200 else 1)"
CMD ["sh", "-c", "alembic upgrade head && exec gunicorn app.main:app -k uvicorn.workers.UvicornWorker -w ${WEB_CONCURRENCY:-2} -b 0.0.0.0:${PORT:-8000} --access-logfile -"]
