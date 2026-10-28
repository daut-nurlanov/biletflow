import os
from contextlib import contextmanager

import psycopg2
import psycopg2.extras


def get_connection():
    #defaults match the docker command in SETUP.md, so nothing changes for
    #anyone running it locally. docker-compose overrides these with env vars
    return psycopg2.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=int(os.getenv("DB_PORT", "5432")),
        user=os.getenv("DB_USER", "postgres"),
        password=os.getenv("DB_PASSWORD", "devpassword"),
        dbname=os.getenv("DB_NAME", "biletflow"),
        cursor_factory=psycopg2.extras.RealDictCursor,
    )


@contextmanager
def tx():
    #opens a connection, hands you a cursor, and then does the right thing
    #on its own: commit if the block finishes, rollback if anything inside
    #raised (including an HTTPException), and always close everything.
    #so inside a "with tx() as cur:" block you can just raise to abort
    conn = get_connection()
    cur = conn.cursor()
    try:
        yield cur
        conn.commit()
    except BaseException:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


def release_expired_holds(cur):
    #holds say "5 minutes" but nothing used to enforce it. any endpoint that
    #cares about seat availability calls this first, so a stale hold can
    #never block a seat. the caller's transaction commits it
    cur.execute("UPDATE seat_holds SET status = 'expired' WHERE status = 'active' AND expires_at <= now()")


def audit(cur, actor_id, event_id, action, details, entity_type=None, entity_id=None):
    #one row in the activity timeline / audit trail. nothing in the API can
    #edit or delete these rows, only add them
    cur.execute(
        """INSERT INTO audit_log (actor_id, event_id, action, details, entity_type, entity_id)
           VALUES (%s, %s, %s, %s, %s, %s)""",
        (actor_id, event_id, action, details, entity_type, str(entity_id) if entity_id else None))


def notify(cur, user_id, kind, subject, body):
    #"email" for the demo: we store it as an in-app notification (see
    #GET /api/notifications) and print it to the server log. swapping in a
    #real email provider later only means changing this one function
    cur.execute(
        "INSERT INTO notifications (user_id, kind, subject, body) VALUES (%s, %s, %s, %s)",
        (user_id, kind, subject, body))
    print(f"[notification to user {user_id}] {kind}: {subject}", flush=True)


def get_setting(cur, key, default):
    cur.execute("SELECT value FROM platform_settings WHERE key = %s", (key,))
    row = cur.fetchone()
    return row["value"] if row else default
