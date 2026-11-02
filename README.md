# Điểm Danh QR

Web điểm danh sinh viên bằng mã QR xoay vòng, có dashboard cho admin và giảng viên.

**Stack:** React 19 + Vite + TypeScript + Tailwind 4 + shadcn/ui · FastAPI (Python 3.12) · MySQL 8.4 · Docker Compose

## Tính năng

| Vai trò | Làm được gì |
|---|---|
| **Admin** | Quản lý người dùng, môn học, lớp; xem dashboard toàn hệ thống |
| **Giảng viên** | Tạo buổi học, mở/đóng điểm danh, chiếu mã QR, sửa điểm danh thủ công (bắt buộc ghi lý do), nhập danh sách sinh viên từ CSV, xuất CSV, xem dashboard lớp mình |
| **Sinh viên** | Quét QR bằng camera điện thoại để điểm danh, xem lịch sử và tỉ lệ vắng |

**Cách điểm danh hoạt động**

1. Giảng viên mở buổi học và bấm **Chiếu mã QR**.
2. Mã QR chứa một đường link có ký số. Mã đổi mỗi 15 giây.
3. Sinh viên quét bằng camera của điện thoại, trình duyệt mở ra và điểm danh ngay (sinh viên cần đăng nhập sẵn).
4. Server kiểm tra các điều kiện sau:
   - chữ ký hợp lệ;
   - mã còn hạn (nhận cả mã của khung 15 giây liền trước);
   - buổi học đang mở;
   - sinh viên thuộc lớp;
   - sinh viên chưa điểm danh buổi này (có cả ràng buộc UNIQUE ở DB).
5. Quét sau `late_after_minutes` phút tính từ giờ bắt đầu thì bị tính là **đi muộn**.
6. Khi giảng viên đóng buổi, ai chưa quét sẽ bị ghi **vắng**.

## Chạy ở máy local

Yêu cầu: Docker Desktop.

```bash
cp .env.example .env        # rồi sửa mật khẩu/SECRET_KEY trong .env
docker compose up --build   # db + backend + frontend, có hot reload
docker compose exec backend python -m scripts.seed   # tạo dữ liệu mẫu
```

| Địa chỉ | |
|---|---|
| http://localhost:5173 | Web |
| http://localhost:8000/api/docs | Tài liệu API (Swagger) |
| `localhost:3307` | MySQL (dùng cho DBeaver/Workbench) |

**Tài khoản mẫu** (sau khi seed):
- `admin`: mật khẩu là `SEED_ADMIN_PASSWORD` trong `.env`.
- Giảng viên `gv.demo` và các sinh viên `b21dccn001` … `b21dccn005`: mật khẩu là `SEED_DEMO_PASSWORD` (mặc định `Demo@1234`).

> Thử luồng QR trên điện thoại thật khi chạy local: đặt `PUBLIC_APP_URL=http://<IP-LAN-của-máy>:5173` trong `.env`, điện thoại dùng chung Wi-Fi.

## Kiểm thử

```bash
docker compose exec backend python -m pytest -q        # 34 test: auth, QR, phân quyền, dashboard
cd frontend && npm run build                            # kiểm tra TypeScript + build
```

Test backend chạy trên database riêng `diemdanh_test`. Database này được tạo tự động lần đầu MySQL khởi động (`backend/scripts/mysql-init/`).

## Cấu trúc

```
backend/app/
  core/             config, db, security (JWT, mật khẩu), deps (phân quyền), timeutil
  modules/<tên>/    router.py · schemas.py · service.py · models.py
                    auth, users, subjects, classes, sessions, attendance, dashboard
  models.py         nạp models cho Alembic
backend/alembic/    migration (KHÔNG dùng create_all ở production)
frontend/src/
  app/              router, layout, chặn quyền theo route
  features/<tên>/   các trang theo nghiệp vụ
  components/ui/    shadcn/ui
  lib/              api client (tự refresh token), auth, theme, kiểu dữ liệu
```

### Thêm một module mới (VD: xin nghỉ phép)

1. **Backend:** tạo `backend/app/modules/leave/` gồm `router.py` (có biến `router`), `schemas.py`, `service.py`, `models.py`. Router sẽ **tự được gắn** vào `/api/v1`, không cần sửa `main.py`.
2. Có bảng mới: thêm 1 dòng import trong `app/models.py`, rồi tạo migration:
   ```bash
   docker compose exec backend alembic revision --autogenerate -m "add leave requests"
   docker compose exec backend alembic upgrade head
   ```
3. **Frontend:** tạo `src/features/leave/`, thêm route trong `src/app/router.tsx` và mục menu trong `NAV` ở `src/app/AppLayout.tsx`.

## Nhập sinh viên từ CSV

File CSV (UTF-8; Excel lưu dạng "CSV UTF-8"), phân cách bằng `,` hoặc `;`:

```csv
student_code,full_name,username,password
B21DCCN001,Nguyễn Văn An,,
B21DCCN002,Trần Thị Bình,binh.tt,MatKhau@123
```

- Bắt buộc có cột `student_code` và `full_name`.
- Sinh viên chưa có tài khoản sẽ được tạo mới:
  - tên đăng nhập là `username`, nếu bỏ trống thì dùng mã SV viết thường;
  - mật khẩu là `password`, nếu bỏ trống thì dùng **mã SV**. Nhắc sinh viên đổi mật khẩu sau khi đăng nhập.
- Dòng lỗi được bỏ qua và báo lại theo số dòng, các dòng còn lại vẫn được nhập.

## Bảo mật (tóm tắt)

- **Access token (JWT)** sống 15 phút và chỉ nằm trong bộ nhớ trình duyệt.
- **Refresh token** nằm trong cookie `HttpOnly; Secure; SameSite=Strict`, giới hạn ở đường dẫn `/api/v1/auth`. Mỗi refresh token chỉ dùng được 1 lần, DB chỉ lưu hash của nó.
- **Mật khẩu** được hash bằng Argon2.
- **Chữ ký mã QR** dùng khoá ghép từ `SECRET_KEY` và secret riêng của từng buổi.
- Container backend chạy bằng user thường, không phải root.

## Triển khai production

Xem [DEPLOY.md](DEPLOY.md).
