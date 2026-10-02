#!/usr/bin/env bash
# Nightly dump of the lidogram database, run as root by /etc/cron.d/lidogram.
# pg_dump runs inside the postgres container, so its version always matches the server (17).
# The dump is written to a .partial file first: a failed dump never looks like a backup.
set -euo pipefail
umask 077

BACKUP_DIR=/srv/backups/lidogram
KEEP=14
FILE="$BACKUP_DIR/lidogram-$(date +%F).sql.gz"

log() {
  logger -t lidogram-backup -- "$*"
  printf '[backup] %s\n' "$*"
}
trap 'log "FAILED (exit $?): no new backup written"; rm -f -- "$FILE.partial"' ERR

cd /opt/lidogram
docker compose -p lidogram -f compose.prod.yml exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' | gzip > "$FILE.partial"
gzip -t "$FILE.partial"
mv -- "$FILE.partial" "$FILE"
log "ok: $FILE ($(du -h "$FILE" | cut -f1))"

# Retention: our own files only, newest first; everything past KEEP is removed.
ls -1t "$BACKUP_DIR"/lidogram-*.sql.gz | tail -n +$((KEEP + 1)) | while read -r old; do
  [[ "$old" == "$BACKUP_DIR"/lidogram-*.sql.gz ]] || continue
  rm -f -- "$old"
  log "removed old backup $old"
done
