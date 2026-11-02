# Triển khai production — 1 VPS

Toàn bộ hệ thống (web, API, database) chạy trên **1 VPS** bằng `docker-compose.prod.yml`, gồm 4 service:

```
Internet ──443──► caddy (HTTPS tự động) ──► frontend (nginx: web tĩnh + /api) ──► backend (gunicorn) ──► db (MySQL 8.4)
```

Chỉ Caddy mở cổng ra ngoài. Ba service còn lại chỉ kết nối với nhau trong mạng nội bộ của Docker.

## 0. Chọn VPS

Với khoảng 100–300 người dùng, tải rất nhẹ: 100 sinh viên quét QR trong 1 phút chỉ tạo vài request mỗi giây. Yêu cầu tối thiểu là **1 vCPU, 1 GB RAM (thêm swap), 20 GB SSD, Ubuntu 22.04 hoặc 24.04, có IPv4 công khai**.

| Phương án | Chi phí | Dùng khi |
|---|---|---|
| **Oracle Cloud Always Free** (mục 1–2) | 0đ | Thử trước. Cần thẻ để xác minh, có rủi ro VM bị thu hồi |
| **VPS trả phí** (nhà cung cấp Việt Nam, Hetzner...) | Khoảng ≤ 100k/tháng (xem giá thực tế) | Oracle hết máy, không xác minh được thẻ, hoặc muốn ổn định lâu dài. Bỏ qua mục 1–2, làm từ mục 3 |

Với VPS 1 GB RAM, thêm vào `.env.prod`:

```ini
WEB_CONCURRENCY=1        # 1 tiến trình gunicorn là đủ cho vài trăm người dùng
MYSQL_BUFFER_POOL=128M   # mặc định 256M
```

## 1. Vì sao chọn Oracle Cloud (số liệu tra ngày 02/11/2026)

| Phương án | Kết luận |
|---|---|
| **Oracle Cloud Always Free – Ampere A1** | **Chọn.** 2 OCPU, 12 GB RAM, 200 GB đĩa, 10 TB/tháng băng thông ra, không hết hạn. Chạy được nguyên stack Docker + MySQL 8 thật. ([nguồn](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)) |
| Google Cloud e2-micro | Dự phòng. Chỉ có 1 GB RAM và 1 GB/tháng băng thông ra, chỉ ở các vùng của Mỹ. ([nguồn](https://docs.cloud.google.com/free/docs/free-cloud-features)) |
| Vercel + Cloud Run + Aiven MySQL | Dự phòng. Aiven MySQL miễn phí chỉ có 1 GB dung lượng và sẽ tắt dịch vụ nếu không hoạt động; Vercel Hobby chỉ cho mục đích phi thương mại. |
| AWS | Không đạt yêu cầu: gói Free plan chỉ kéo dài 6 tháng. ([nguồn](https://aws.amazon.com/free/)) |
| Render | Không đạt yêu cầu: không có MySQL, Postgres miễn phí hết hạn sau 30 ngày. ([nguồn](https://render.com/docs/free)) |

### ⚠️ Rủi ro cần biết (theo tài liệu chính thức của Oracle)

1. **VM idle có thể bị thu hồi.** Oracle coi VM là idle nếu trong 7 ngày cả CPU (phân vị 95), mạng và RAM đều dưới 20%. Một web điểm danh ít người dùng rất dễ rơi vào trường hợp này.
   - Tài liệu **không** nói việc nâng lên Pay-As-You-Go sẽ tránh được việc thu hồi. Cộng đồng hay khuyên làm vậy, nhưng điều này chưa được Oracle xác nhận.
   - ➜ **Cách phòng:** sao lưu DB hằng ngày và **chép bản sao lưu ra ngoài VM** (mục 7). Nếu VM bị thu hồi, chỉ cần tạo VM mới rồi khôi phục dữ liệu.
2. **Có thể gặp lỗi "out of host capacity"** khi tạo VM A1, do vùng của bạn tạm hết máy. Cách xử lý: thử availability domain khác, hoặc đợi rồi thử lại.
3. **Đăng ký cần thẻ tín dụng** để xác minh. Oracle không trừ tiền nếu bạn không nâng cấp tài khoản.

## 2. Tạo tài khoản và VM

1. Đăng ký tại https://signup.cloud.oracle.com.
   - **Home region** chỉ chọn được 1 lần và VM miễn phí chỉ tạo được trong vùng này. Gần Việt Nam nhất là *Singapore*.
2. Vào Console → **Compute → Instances → Create instance**:
   - **Image:** Canonical Ubuntu 24.04.
   - **Shape:** `VM.Standard.A1.Flex`, chọn **2 OCPU / 12 GB** (tối đa của gói miễn phí).
   - **Networking:** để mặc định để tạo VCN mới, bật *Assign a public IPv4 address*.
   - **SSH keys:** tải lên public key của bạn (hoặc để Oracle tạo rồi tải private key về).
   - **Boot volume:** 50 GB là đủ.
3. Mở cổng trên **Security List** của subnet: *Networking → Virtual Cloud Networks → (VCN) → Security Lists → Default → Add Ingress Rules*:
   - Source `0.0.0.0/0`, TCP, port `80`
   - Source `0.0.0.0/0`, TCP, port `443`
   - Source `0.0.0.0/0`, UDP, port `443` (HTTP/3, không bắt buộc)
4. Ghi lại **Public IP** của VM.

## 3. Tên miền miễn phí (tạm thời)

Caddy cần một tên miền để xin chứng chỉ HTTPS. Bắt buộc phải có HTTPS vì cookie đăng nhập dùng cờ `Secure`.

- Vào https://www.duckdns.org, đăng nhập rồi tạo subdomain, ví dụ `diemdanh-ptit.duckdns.org`. Ô **current ip** điền Public IP của VPS.
- Sau này có tên miền riêng thì chỉ cần trỏ bản ghi A về IP của VPS và sửa `DOMAIN` trong `.env.prod`.

## 4. Cài đặt trên VPS

```bash
ssh ubuntu@<PUBLIC_IP>     # VPS trả phí thường là root@<PUBLIC_IP>

# --- Chỉ với Oracle: image Ubuntu có sẵn luật iptables chặn mọi cổng trừ 22 -> mở 80/443
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p udp --dport 443 -j ACCEPT
sudo netfilter-persistent save

# --- Chỉ với VPS trả phí: bật tường lửa ufw, chỉ mở SSH + web
sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443 && sudo ufw --force enable
#    Lưu ý: cổng do Docker publish đi vòng qua ufw. Ở đây chỉ Caddy publish 80/443 nên không sao,
#    đừng thêm "ports:" cho db/backend trong docker-compose.prod.yml.

# --- VPS ≤ 2 GB RAM: tạo 2 GB swap để build image và MySQL không bị hết RAM
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Tự cài bản vá bảo mật cho hệ điều hành
sudo apt-get update && sudo apt-get install -y unattended-upgrades

# Docker (script cài đặt chính thức của Docker)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker
docker compose version
```

> Nếu mở web mà bị timeout dù đã thêm Security List, hãy kiểm tra lại luật iptables bằng `sudo iptables -L INPUT -n --line-numbers`. Luật ACCEPT phải nằm **trước** dòng REJECT.

## 5. Đưa code lên VM và chạy

```bash
# Cách 1: qua Git (khuyên dùng). Đẩy repo lên GitHub (private) trước.
git clone https://github.com/<ban>/diem-danh.git && cd diem-danh
# Cách 2: chép thẳng từ máy bạn
#   scp -r diem-danh ubuntu@<PUBLIC_IP>:~/   (bỏ qua node_modules, .env)

cp .env.example .env.prod
nano .env.prod
```

Trong `.env.prod`, **bắt buộc** đổi các dòng sau:

```ini
MYSQL_PASSWORD=<chuỗi ngẫu nhiên>
MYSQL_ROOT_PASSWORD=<chuỗi ngẫu nhiên khác>
SECRET_KEY=<chuỗi ngẫu nhiên dài>         # python3 -c "import secrets;print(secrets.token_urlsafe(48))"
SEED_ADMIN_PASSWORD=<mật khẩu admin, ≥ 8 ký tự>
DOMAIN=diemdanh-ptit.duckdns.org
```

Các dòng `PUBLIC_APP_URL`, `CORS_ORIGINS` và `SEED_DEMO_PASSWORD` không cần sửa: `docker-compose.prod.yml` tự đặt hai dòng đầu theo `DOMAIN`, còn dòng cuối chỉ dùng cho dev.

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build   # lần đầu build khoảng 3-5 phút
docker compose -f docker-compose.prod.yml --env-file .env.prod ps              # cả 4 service phải "healthy"
docker compose -f docker-compose.prod.yml --env-file .env.prod exec backend python -m scripts.seed --admin-only
```

Mở `https://<DOMAIN>` và đăng nhập bằng `admin` / `SEED_ADMIN_PASSWORD`. Sau đó tạo môn học, giảng viên và lớp, rồi nhập danh sách sinh viên bằng CSV.

> Gõ lệnh dài cho gọn: `alias dcp='docker compose -f docker-compose.prod.yml --env-file .env.prod'`

## 6. Cập nhật phiên bản mới

```bash
cd ~/diem-danh && git pull
dcp up -d --build        # backend tự chạy "alembic upgrade head" khi khởi động
```

## 7. Sao lưu và khôi phục

```bash
chmod +x scripts/backup-db.sh
./scripts/backup-db.sh                 # tạo backups/diemdanh_YYYYMMDD_HHMMSS.sql.gz, giữ 14 bản

# Tự động lúc 2h sáng mỗi ngày
crontab -e
0 2 * * * cd /home/ubuntu/diem-danh && ./scripts/backup-db.sh >> backups/backup.log 2>&1
```

**Chép bản sao lưu ra ngoài VPS.** Đây là bước bắt buộc, vì VPS có thể hỏng hoặc bị thu hồi (xem mục 1). Cách tự động dùng rclone, đẩy lên Google Drive (hoặc OneDrive):

```bash
sudo apt-get install -y rclone
rclone config            # n -> đặt tên "gdrive" -> chọn "drive" -> làm theo hướng dẫn.
                         # VPS không có trình duyệt: ở bước "Use web browser", chọn n rồi chạy
                         # lệnh "rclone authorize ..." mà nó in ra trên máy tính của bạn, dán kết quả lại.
RCLONE_REMOTE=gdrive:diemdanh-backup ./scripts/backup-db.sh    # chạy thử

# Sửa dòng cron ở trên thành:
0 2 * * * cd /home/ubuntu/diem-danh && RCLONE_REMOTE=gdrive:diemdanh-backup ./scripts/backup-db.sh >> backups/backup.log 2>&1
```

Không dùng rclone thì chép thủ công về máy của bạn:

```bash
scp "ubuntu@<PUBLIC_IP>:~/diem-danh/backups/*.sql.gz" ./backup-diemdanh/
```

Khôi phục dữ liệu (trên VM mới, sau khi stack đã chạy):

```bash
gunzip -c diemdanh_YYYYMMDD_HHMMSS.sql.gz | dcp exec -T db sh -c 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"'
```

## 8. Xử lý sự cố

| Triệu chứng | Kiểm tra |
|---|---|
| Không vào được web | `dcp ps` (đủ 4 service healthy?) · Security List đã mở 80/443? · iptables (mục 4) · DuckDNS đã trỏ đúng IP? |
| Lỗi chứng chỉ HTTPS | `dcp logs caddy`. Tên miền phải trỏ đúng IP và cổng 80 phải mở được từ Internet để Let's Encrypt xác minh. **Đừng xoá volume `caddy_data`**, vì Let's Encrypt giới hạn số lần cấp chứng chỉ. |
| Đăng nhập xong bị đá ra | Phải truy cập bằng `https://`. Cookie có cờ `Secure` nên không hoạt động qua `http://`. |
| Backend không lên | `dcp logs backend`: thường do sai mật khẩu MySQL hoặc thiếu `SECRET_KEY` trong `.env.prod` |
| Xem log trực tiếp | `dcp logs -f backend frontend` |

**Đổi mật khẩu MySQL sau khi đã chạy:** MySQL chỉ đọc biến môi trường ở **lần khởi tạo đầu tiên**. Nếu sửa `.env.prod` sau đó thì phải đổi mật khẩu trong MySQL bằng lệnh `ALTER USER`. Không xoá volume `db_data`, vì làm vậy sẽ **mất toàn bộ dữ liệu**.
