"""Upgrade existing demo databases without resetting their volumes or records.

Run before starting the API: python migrate.py. Fresh databases must first be
initialized with docs/schema.sql (Docker Compose already does this).
"""
from pathlib import Path

from db import tx


def migrate():
    with tx() as cur:
        cur.execute("SET LOCAL lock_timeout = '5s'")
        # Serialize startup across backend processes; each migration is atomic.
        cur.execute("SELECT pg_advisory_xact_lock(361, 20261115)")
        cur.execute("""CREATE TABLE IF NOT EXISTS schema_migrations (
            name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())""")
        for path in sorted(Path(__file__).with_name("migrations").glob("*.sql")):
            cur.execute("SELECT 1 FROM schema_migrations WHERE name = %s", (path.name,))
            if cur.fetchone():
                continue
            cur.execute(path.read_text(encoding="utf-8"))
            cur.execute("INSERT INTO schema_migrations (name) VALUES (%s)", (path.name,))
            print(f"Applied migration {path.name}", flush=True)


if __name__ == "__main__":
    migrate()
