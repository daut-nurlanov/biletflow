#!/bin/sh
# Restores the database from a backup file.  Usage: ./restore.sh backups/biletflow-20261125-101500.sql
# This REPLACES the current data with the contents of the file.
set -e
if [ -z "$1" ] || [ ! -f "$1" ]; then
  echo "Usage: ./restore.sh <backup file>"; echo "Available backups:"; ls backups 2>/dev/null; exit 1
fi
docker compose stop backend
docker compose exec -T db psql -U postgres -d biletflow -v ON_ERROR_STOP=1 < "$1"
docker compose start backend
echo "Restored from $1"
