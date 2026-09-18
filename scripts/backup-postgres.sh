#!/usr/bin/env bash
# NazdikStore — Postgres + media backup (Phase 10)
# Cron example: 0 3 * * * /opt/nazdik/scripts/backup-postgres.sh
set -euo pipefail

STAMP=$(date +%Y%m%d_%H%M%S)
OUT_DIR="${BACKUP_DIR:-/var/backups/nazdik}"
mkdir -p "$OUT_DIR"

DB_USER="${POSTGRES_USER:-nazdik}"
DB_NAME="${POSTGRES_DB:-nazdik}"
CONTAINER="${POSTGRES_CONTAINER:-nazdik-postgres}"

if command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' | grep -q "$CONTAINER"; then
  docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" \
    | gzip > "$OUT_DIR/nazdik_${STAMP}.sql.gz"
else
  echo "Docker container $CONTAINER not found — adjust POSTGRES_CONTAINER" >&2
  exit 1
fi

MEDIA_SRC="${MEDIA_ROOT:-/var/nazdik/uploads}"
if [ -d "$MEDIA_SRC" ]; then
  tar -czf "$OUT_DIR/media_${STAMP}.tgz" -C "$(dirname "$MEDIA_SRC")" "$(basename "$MEDIA_SRC")"
fi

# keep last 14 dumps
ls -1t "$OUT_DIR"/nazdik_*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm -f
ls -1t "$OUT_DIR"/media_*.tgz 2>/dev/null | tail -n +15 | xargs -r rm -f

echo "Backup OK → $OUT_DIR"
