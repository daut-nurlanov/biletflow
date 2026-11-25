"""Event cover pictures (upload, download, limits) and optional SMTP email."""
import struct
import zlib

import db
from conftest import fetch_one


def tiny_png():
    def chunk(kind, data):
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)
    header = struct.pack(">IIBBBBB", 2, 2, 8, 2, 0, 0, 0)
    rows = b"".join(b"\x00" + bytes([10, 20, 30]) * 2 for _ in range(2))
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(rows)) + chunk(b"IEND", b"")


def upload(kit, user, event_id, data):
    return kit.client.post(f"/api/events/{event_id}/image", headers=user.h, content=data)


def test_duplicated_events_keep_an_independent_uploaded_cover(kit):
    organizer = kit.user("organizer")
    event, _ = kit.event(organizer, publish=False)
    cover = tiny_png()
    assert upload(kit, organizer, event["id"], cover).status_code == 200
    response = kit.client.post(f"/api/events/{event['id']}/duplicate", headers=organizer.h)
    assert response.status_code == 201
    copied = response.json()
    assert copied["image_url"] == f"/api/events/{copied['id']}/image"
    assert upload(kit, organizer, event["id"], cover + b"replacement").status_code == 200
    image = kit.client.get(copied["image_url"])
    assert image.status_code == 200 and image.content == cover


def test_organizer_uploads_picture_and_anyone_can_load_it(kit):
    org = kit.user("organizer")
    event, _ = kit.event(org)
    png = tiny_png()
    response = upload(kit, org, event["id"], png)
    assert response.status_code == 200, response.text
    assert response.json()["image_url"].startswith(f"/api/events/{event['id']}/image?v=")
    loaded = kit.client.get(f"/api/events/{event['id']}/image")  #no login: <img> tags cannot send one
    assert loaded.status_code == 200
    assert loaded.headers["content-type"] == "image/png"
    assert loaded.content == png
    assert fetch_one("SELECT count(*) AS n FROM audit_log WHERE event_id = %s AND action = 'event_image_uploaded'",
                     (event["id"],))["n"] == 1


def test_upload_rejects_wrong_type_empty_and_too_large(kit):
    org = kit.user("organizer")
    event, _ = kit.event(org)
    assert upload(kit, org, event["id"], b"<html>not a picture</html>").status_code == 400
    assert upload(kit, org, event["id"], b"").status_code == 400
    assert upload(kit, org, event["id"], tiny_png() + b"0" * (2 * 1024 * 1024 + 10)).status_code == 413
    assert kit.client.get(f"/api/events/{event['id']}/image").status_code == 404


def test_only_the_events_organizer_can_upload(kit):
    org = kit.user("organizer")
    other = kit.user("organizer")
    attendee = kit.user("attendee")
    event, _ = kit.event(org)
    assert kit.client.post(f"/api/events/{event['id']}/image", content=tiny_png()).status_code == 401
    assert upload(kit, attendee, event["id"], tiny_png()).status_code == 403
    assert upload(kit, other, event["id"], tiny_png()).status_code in (403, 404)


def test_replacing_a_picture_changes_the_version_and_content(kit):
    org = kit.user("organizer")
    event, _ = kit.event(org)
    first = tiny_png()
    assert upload(kit, org, event["id"], first).status_code == 200
    second = first + b"\x00"  #still starts like a PNG, different bytes
    assert upload(kit, org, event["id"], second).status_code == 200
    assert kit.client.get(f"/api/events/{event['id']}/image").content == second
    assert fetch_one("SELECT count(*) AS n FROM event_images WHERE event_id = %s", (event["id"],))["n"] == 1


def test_bad_event_ids_for_pictures_are_404_not_500(kit):
    assert kit.client.get("/api/events/not-a-uuid/image").status_code == 404
    assert kit.client.get("/api/events/00000000-0000-0000-0000-000000000000/image").status_code == 404


def test_email_is_off_by_default_and_a_failing_mail_server_never_breaks_notify(kit, monkeypatch):
    org = kit.user("organizer")
    sent = []
    monkeypatch.setattr(db, "_send_email", lambda *args: sent.append(args))

    monkeypatch.delenv("SMTP_HOST", raising=False)
    conn = db.get_connection()
    cur = conn.cursor()
    db.notify(cur, org.id, "test", "Subject A", "Body A")
    conn.commit()
    assert sent == []  #no SMTP_HOST: nothing leaves the computer

    monkeypatch.setenv("SMTP_HOST", "mail.example.test")
    db.notify(cur, org.id, "test", "Subject B", "Body B")
    conn.commit()
    cur.close()
    conn.close()
    import time
    for _ in range(50):
        if sent:
            break
        time.sleep(0.05)
    assert [s[1] for s in sent] == ["Subject B"]
    assert fetch_one("SELECT count(*) AS n FROM notifications WHERE user_id = %s", (org.id,))["n"] >= 2


def test_send_email_swallows_connection_errors(monkeypatch, capsys):
    monkeypatch.setenv("SMTP_HOST", "127.0.0.1")
    monkeypatch.setenv("SMTP_PORT", "1")  #nothing listens here
    db._send_email("someone@example.test", "Hello", "Body")  #must not raise
    assert "[email FAILED]" in capsys.readouterr().out


def test_local_outbox_captures_reset_and_purchase_without_smtp(kit, monkeypatch, tmp_path, capsys):
    from email import policy
    from email.parser import BytesParser

    organizer, buyer = kit.user("organizer"), kit.user()
    event, ticket_type = kit.event(organizer)
    monkeypatch.setenv("BILETFLOW_EMAIL_OUTBOX", str(tmp_path))
    monkeypatch.setenv("SMTP_HOST", "mail.example.test")
    sent = []
    monkeypatch.setattr(db, "_send_email", lambda *args: sent.append(args))
    assert kit.client.post("/api/auth/forgot-password", json={"email": buyer.email}).status_code == 200
    assert kit.buy(buyer, event["id"], ticket_type["id"]).status_code == 201

    messages = [BytesParser(policy=policy.default).parsebytes(path.read_bytes()) for path in tmp_path.glob("*.eml")]
    reset = next(message for message in messages if message["Subject"] == "Reset your BiletFlow password")
    reset_code = reset.get_body().get_content().splitlines()[0].split(": ")[-1]
    assert reset_code and reset_code not in capsys.readouterr().out
    pdfs = [part for message in messages for part in message.iter_attachments()]
    assert len(pdfs) == 1 and pdfs[0].get_payload(decode=True).startswith(b"%PDF")
    assert not sent


def test_confirmation_email_has_link_ticket_ids_and_pdf_attachment(kit, monkeypatch):
    import time
    org = kit.user("organizer")
    buyer = kit.user("attendee")
    event, ticket_type = kit.event(org)
    sent = []
    monkeypatch.setattr(db, "_send_email", lambda *args: sent.append(args))
    monkeypatch.setenv("SMTP_HOST", "mail.example.test")
    response = kit.buy(buyer, event["id"], ticket_type["id"])
    assert response.status_code in (200, 201), response.text
    for _ in range(50):
        if sent:
            break
        time.sleep(0.05)
    to, subject, body, attachments = sent[0]
    ticket_id = response.json()["tickets"][0]["id"]
    assert "/my-tickets" in body and ticket_id in body
    assert len(attachments) == 1 and attachments[0][1].startswith(b"%PDF")
