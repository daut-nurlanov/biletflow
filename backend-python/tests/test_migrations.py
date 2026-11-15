"""Run the actual upgrade against a legacy schema inside a rolled-back transaction."""
from contextlib import contextmanager
from pathlib import Path
from uuid import uuid4

import db
import migrate


def test_legacy_upgrade_preserves_orders_and_is_repeatable(monkeypatch):
    connection = db.get_connection()
    try:
        cur = connection.cursor()
        schema = "migration_test_" + uuid4().hex
        cur.execute(f'CREATE SCHEMA "{schema}"')
        cur.execute(f'SET LOCAL search_path TO "{schema}"')
        source = Path(__file__).resolve().parents[2] / "docs" / "schema.sql"
        legacy = source.read_text(encoding="utf-8").split("-- ADDITIONS BLOCK 2")[0]
        cur.execute(legacy)
        cur.execute("INSERT INTO users (email,full_name,role) VALUES ('upgrade@test.invalid','Upgrade','organizer') RETURNING id")
        user = cur.fetchone()["id"]
        cur.execute("""INSERT INTO events (organizer_id,title,venue_name,start_time)
                       VALUES (%s,'Preserved event','Hall',now()) RETURNING id""", (user,))
        event = cur.fetchone()["id"]
        cur.execute("""INSERT INTO orders (attendee_id,event_id,total_amount,status)
                       VALUES (%s,%s,1000,'paid') RETURNING id""", (user, event))
        order = cur.fetchone()["id"]

        @contextmanager
        def transaction():
            yield cur

        monkeypatch.setattr(migrate, "tx", transaction)
        migrate.migrate()
        cur.execute("SELECT * FROM events WHERE id = %s", (event,))
        upgraded = cur.fetchone()
        assert upgraded["title"] == "Preserved event"
        assert upgraded["registration_opens_at"] is None
        cur.execute("SELECT * FROM orders WHERE id = %s", (order,))
        upgraded = cur.fetchone()
        assert upgraded["total_amount"] == 1000 and upgraded["processing_fee"] == 30
        assert upgraded["idempotency_key"] is None
        cur.execute("UPDATE orders SET processing_fee = 12 WHERE id = %s", (order,))
        migrate.migrate()
        cur.execute("SELECT processing_fee FROM orders WHERE id = %s", (order,))
        assert cur.fetchone()["processing_fee"] == 12
        cur.execute("SELECT count(*) AS n FROM schema_migrations")
        assert cur.fetchone()["n"] == 1
    finally:
        connection.rollback()  # Includes the test schema; no demo records are touched.
        connection.close()
