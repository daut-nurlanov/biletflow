@echo off
REM Saves a full copy of the BiletFlow database to backups\biletflow-<date>.sql
REM Run it from the project folder while the app is running (docker compose up -d).
if not exist backups mkdir backups
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set STAMP=%%i
set FILE=backups\biletflow-%STAMP%.sql
docker compose exec -T db pg_dump -U postgres --clean --if-exists biletflow > "%FILE%"
if errorlevel 1 (
  echo Backup FAILED. Is the app running? Try: docker compose up -d
  del "%FILE%" 2>nul
  exit /b 1
)
echo Backup saved: %FILE%
