# Backup and recovery

SRS section 7 asks for regular backups and a recovery procedure. This is ours.

## What is backed up

Everything lives in one PostgreSQL database inside Docker: users, events, orders,
tickets, check-ins, support cases, the audit log, notifications and the uploaded
event pictures (pictures are stored in the database on purpose, so one backup
covers them). The signing secret for logins is not stored in the database; if you
set `BILETFLOW_SECRET`, keep that value with your backups.

## Make a backup

The app must be running (`docker compose up -d`).

- Windows: `backup.bat`
- Mac or Linux: `./backup.sh`

It writes `backups/biletflow-<date>-<time>.sql`. The `backups` folder is ignored
by Git, so copy important backups somewhere else too (another disk or cloud
storage). A copy that lives only on the same computer is not a real backup.

Suggested routine for the demo: one backup after the demo data is ready, one
before the presentation, one after any big change.

## Restore a backup

1. List the backups: `dir backups` (Windows) or `ls backups`.
2. Windows: `restore.bat backups\biletflow-20261125-101500.sql`
   Mac or Linux: `./restore.sh backups/biletflow-20261125-101500.sql`

The script stops the backend, replaces the database contents with the file, and
starts the backend again. Everything made after the backup was taken is lost.
Users have to sign in again only if the signing secret changed.

## Start from scratch (demo reset)

`reset-demo.bat` (or `./reset-demo.sh`) deletes the data volume and reloads the
demo data. Use it when you want the clean demo state, not to recover data.

## What was tested

A backup was taken, the orders and the uploaded picture were deleted on purpose,
and restoring the file brought back the same users, events, orders and picture.
Automated daily backups and off-site storage are not set up; that would be the
next step for a real deployment.
