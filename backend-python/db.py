import os
import smtplib
import threading
from contextlib import contextmanager
from email.message import EmailMessage
from pathlib import Path
from tempfile import NamedTemporaryFile

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


def _email_message(sender, to_address, subject, body, attachments):
    msg = EmailMessage()
    msg["From"] = sender
    msg["To"] = to_address
    msg["Subject"] = subject
    msg.set_content(body + "\n\n-- BiletFlow (university project demo, no real payments)")
    for filename, data in attachments:
        msg.add_attachment(data, maintype="application", subtype="pdf", filename=filename)
    return msg


def _capture_email(outbox, to_address, subject, body, attachments):
    try:
        folder = Path(outbox)
        folder.mkdir(mode=0o700, parents=True, exist_ok=True)
        msg = _email_message("no-reply@biletflow.local", to_address, subject, body, attachments)
        # Write atomically so a local viewer never opens a half-written PDF.
        with NamedTemporaryFile(dir=folder, suffix=".tmp", delete=False) as file:
            path = Path(file.name)
            file.write(msg.as_bytes())
        path.replace(path.with_suffix(".eml"))
    except (OSError, ValueError):
        print("[email capture FAILED]", flush=True)


def _send_email(to_address, subject, body, attachments=()):
    #real email through any SMTP provider (Gmail app password, SendGrid, Mailgun,
    #a school mail server...). Runs in its own thread so a slow or broken mail
    #server can never slow down or break a purchase. Failures are only logged.
    host = os.environ.get("SMTP_HOST", "").strip()
    port = int(os.environ.get("SMTP_PORT", "587") or 587)
    user = os.environ.get("SMTP_USER", "").strip()
    password = os.environ.get("SMTP_PASSWORD", "")
    sender = os.environ.get("SMTP_FROM", "").strip() or user or "no-reply@biletflow.local"
    use_ssl = os.environ.get("SMTP_SSL", "").strip().lower() in ("1", "true", "yes")
    use_starttls = os.environ.get("SMTP_STARTTLS", "true").strip().lower() not in ("0", "false", "no")
    try:
        msg = _email_message(sender, to_address, subject, body, attachments)
        if use_ssl:
            server = smtplib.SMTP_SSL(host, port, timeout=15)
        else:
            server = smtplib.SMTP(host, port, timeout=15)
        with server:
            if use_starttls and not use_ssl:
                server.starttls()
            if user:
                server.login(user, password)
            server.send_message(msg)
        print(f"[email sent] {to_address}: {subject}", flush=True)
    except Exception as error:  # noqa: BLE001 - never let email problems reach the caller
        print(f"[email FAILED] {type(error).__name__}", flush=True)


def notify(cur, user_id, kind, subject, body, attachments=()):
    # An explicitly configured QA outbox takes precedence over SMTP.
    cur.execute(
        "INSERT INTO notifications (user_id, kind, subject, body) VALUES (%s, %s, %s, %s)",
        (user_id, kind, subject, body))
    outbox = os.environ.get("BILETFLOW_EMAIL_OUTBOX", "").strip()
    if outbox or os.environ.get("SMTP_HOST", "").strip():
        cur.execute("SELECT email FROM users WHERE id = %s", (user_id,))
        row = cur.fetchone()
        if row and row["email"]:
            address = row["email"]
            if outbox:
                _capture_email(outbox, address, subject, body, attachments)
            else:
                threading.Thread(target=_send_email, args=(address, subject, body, attachments), daemon=True).start()
    print(f"[notification to user {user_id}] {kind}", flush=True)


def get_setting(cur, key, default):
    cur.execute("SELECT value FROM platform_settings WHERE key = %s", (key,))
    row = cur.fetchone()
    return row["value"] if row else default
