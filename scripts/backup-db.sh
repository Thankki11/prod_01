#!/usr/bin/env bash
# Sao lưu MySQL ra file nén, giữ 14 bản gần nhất. Chạy trên VPS (cron), trong thư mục dự án.
#   ./scripts/backup-db.sh                              -> ghi vào ./backups/
#   BACKUP_DIR=/mnt/backup ./scripts/backup-db.sh
#   RCLONE_REMOTE=gdrive:diemdanh-backup ./scripts/backup-db.sh
#       -> chép thêm lên cloud (Google Drive, OneDrive...) bằng rclone, cũng giữ KEEP bản gần nhất
set -euo pipefail

cd "$(dirname "$0")/.."
BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP="${KEEP:-14}"
RCLONE_REMOTE="${RCLONE_REMOTE:-}"
mkdir -p "$BACKUP_DIR"

name="diemdanh_$(date +%Y%m%d_%H%M%S).sql.gz"
file="$BACKUP_DIR/$name"
# Ghi ra file tạm, chỉ đổi tên khi dump thành công -> không bao giờ có bản sao lưu dở dang
if ! docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T db \
  sh -c 'exec mysqldump --single-transaction --routines --no-tablespaces -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' \
  | gzip > "$file.part"; then
  rm -f "$file.part"
  echo "Sao lưu THẤT BẠI" >&2
  exit 1
fi
mv "$file.part" "$file"

ls -1t "$BACKUP_DIR"/diemdanh_*.sql.gz | tail -n +"$((KEEP + 1))" | xargs -r rm -f
echo "Đã sao lưu: $file ($(du -h "$file" | cut -f1))"

if [ -n "$RCLONE_REMOTE" ]; then
  # Lỗi upload không xoá bản local, nhưng trả mã lỗi để cron log ghi nhận
  rclone copyto "$file" "$RCLONE_REMOTE/$name"
  rclone lsf "$RCLONE_REMOTE" --include 'diemdanh_*.sql.gz' | sort -r | tail -n +"$((KEEP + 1))" \
    | while read -r old; do rclone deletefile "$RCLONE_REMOTE/$old"; done
  echo "Đã chép lên $RCLONE_REMOTE"
fi
