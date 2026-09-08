#!/bin/bash
# ==============================================================================
# Automated Database Backup Script for Loan Management App
# ==============================================================================
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DB_NAME="${DB_NAME:-loan_db}"
DB_USER="${DB_USER:-root}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-3306}"

mkdir -p "$BACKUP_DIR"

BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_backup_${TIMESTAMP}.sql.gz"

echo "[$(date)] Starting backup for database: $DB_NAME on $DB_HOST:$DB_PORT..."

if [ -n "${DB_PASSWORD:-}" ]; then
  MYSQL_PWD="$DB_PASSWORD" mysqldump -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" \
    --default-character-set=utf8mb4 --single-transaction --quick "$DB_NAME" | gzip > "$BACKUP_FILE"
else
  mysqldump -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" \
    --default-character-set=utf8mb4 --single-transaction --quick "$DB_NAME" | gzip > "$BACKUP_FILE"
fi

echo "[$(date)] Backup completed successfully: $BACKUP_FILE"

# Keep last 14 days of backups
find "$BACKUP_DIR" -name "${DB_NAME}_backup_*.sql.gz" -mtime +14 -delete
echo "[$(date)] Cleaned up backups older than 14 days."
