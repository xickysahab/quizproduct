#!/usr/bin/env bash
#
# Takes a compressed dump of the production database.
#
# Run before every migration and once a day. `prisma migrate deploy` was
# previously run against production with nothing taken first, so a migration
# that went wrong — or a mistaken one that was merged — had no route back.
#
# Usage:
#   ./backup-db.sh                     # -> $BACKUP_DIR, default /var/backups/quizpulse
#   ./backup-db.sh /some/other/dir
#
# Requires DATABASE_URL and pg_dump. Exits non-zero on any failure, so a
# deploy that calls it stops rather than migrating unprotected.

set -euo pipefail

BACKUP_DIR="${1:-${BACKUP_DIR:-/var/backups/quizpulse}}"
RETAIN_DAYS="${BACKUP_RETAIN_DAYS:-14}"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "backup-db: DATABASE_URL is not set. Refusing to continue." >&2
  exit 1
fi

if ! command -v pg_dump > /dev/null 2>&1; then
  echo "backup-db: pg_dump not found. Install the postgresql client on this host." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TARGET="$BACKUP_DIR/quizpulse-$STAMP.sql.gz"

echo "backup-db: dumping to $TARGET"

# Written to a partial name first and moved into place only on success, so a
# dump interrupted halfway cannot be mistaken later for a usable backup — which
# is the failure that only ever shows up during a restore.
pg_dump --no-owner --no-privileges --format=plain "$DATABASE_URL" \
  | gzip -9 > "$TARGET.partial"

mv "$TARGET.partial" "$TARGET"

SIZE="$(du -h "$TARGET" | cut -f1)"

# A dump of a database that is not empty is never a few hundred bytes. Catching
# it here means the deploy stops, rather than the backup being discovered
# useless on the day it is needed.
BYTES="$(wc -c < "$TARGET" | tr -d ' ')"
if [ "$BYTES" -lt 1024 ]; then
  echo "backup-db: dump is only ${BYTES} bytes — that is not a real backup. Failing." >&2
  rm -f "$TARGET"
  exit 1
fi

echo "backup-db: wrote $TARGET ($SIZE)"

# Prune old dumps last, and only after a good one has landed, so a run that
# fails never deletes the backups it failed to replace.
find "$BACKUP_DIR" -name 'quizpulse-*.sql.gz' -type f -mtime "+$RETAIN_DAYS" -print -delete
find "$BACKUP_DIR" -name '*.partial' -type f -mtime +1 -print -delete

echo "backup-db: done. Retaining $RETAIN_DAYS days."
