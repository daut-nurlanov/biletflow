@echo off
REM Wipes the local database and reloads the demo data.
docker compose down -v
docker compose up -d --build
