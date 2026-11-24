#!/bin/sh
# Saves a full copy of the BiletFlow database to backups/biletflow-<date>.sql
# Usage: ./backup.sh        (the stack must be running: docker compose up -d)
set -e
mkdir -p backups
STAMP=$(date +%Y%m%d-%H%M%S)
FILE="backups/biletflow-$STAMP.sql"
docker compose exec -T db pg_dump -U postgres --clean --if-exists biletflow > "$FILE"
echo "Backup saved: $FILE ($(wc -c < "$FILE") bytes)"
