#!/usr/bin/env bash
#
# Restores a dump taken by backup-db.sh.
#
# Kept next to the backup script on purpose: a backup procedure nobody has ever
# run in reverse is a hope, not a plan. Try this against a scratch database
# before you need it.
#
# Usage:
#   DATABASE_URL=postgresql://... ./restore-db.sh /var/backups/quizpulse/quizpulse-....sql.gz

set -euo pipefail

DUMP="${1:-}"

if [ -z "$DUMP" ] || [ ! -f "$DUMP" ]; then
  echo "restore-db: pass the path to a .sql.gz dump." >&2
  exit 1
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "restore-db: DATABASE_URL is not set." >&2
  exit 1
fi

# Restoring overwrites everything. Ask, unless explicitly told not to, because
# the one thing worse than no backup is restoring the wrong one over live data.
if [ "${RESTORE_CONFIRM:-}" != "yes" ]; then
  echo "restore-db: this will overwrite the database at:"
  echo "            ${DATABASE_URL%%\?*}"
  echo "            from $DUMP"
  read -r -p "Type the word restore to continue: " REPLY
  [ "$REPLY" = "restore" ] || { echo "Aborted."; exit 1; }
fi

echo "restore-db: restoring $DUMP"
gunzip -c "$DUMP" | psql --quiet --set ON_ERROR_STOP=on "$DATABASE_URL"
echo "restore-db: done. Run 'npx prisma migrate status' to confirm the schema matches."
