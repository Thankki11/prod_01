# syntax=docker/dockerfile:1

# ---------- deps: cài node_modules (cache được khi chỉ đổi code) ----------
# Dùng bản slim (glibc) thay vì alpine: TypeScript 7 và rolldown dùng binary native
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---------- dev: Vite dev server có hot reload ----------
FROM deps AS dev
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev"]

# ---------- build: biên dịch ra file tĩnh ----------
FROM deps AS build
COPY . .
RUN npm run build

# ---------- prod: nginx phục vụ file tĩnh + chuyển /api sang backend ----------
FROM nginx:1.29-alpine AS prod
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
    CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
