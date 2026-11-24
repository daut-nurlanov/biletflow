@echo off
REM Restores the database from a backup file. This REPLACES the current data.
REM Usage: restore.bat backups\biletflow-20261125-101500.sql
if "%~1"=="" (
  echo Usage: restore.bat backups\biletflow-YYYYMMDD-HHMMSS.sql
  echo Available backups:
  dir /b backups 2>nul
  exit /b 1
)
if not exist "%~1" (
  echo File not found: %~1
  exit /b 1
)
docker compose stop backend
docker compose exec -T db psql -U postgres -d biletflow -v ON_ERROR_STOP=1 < "%~1"
if errorlevel 1 (
  echo Restore FAILED. The old data may be partly changed. See docs\BACKUP_RECOVERY.md
  docker compose start backend
  exit /b 1
)
docker compose start backend
echo Restored from %~1
