from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from db import audit, tx
from security import assert_event_staff, load_event, require_roles

router = APIRouter()

STAFF_ROLES = ("event_admin", "organizer", "platform_admin")


class VerifyRequest(BaseModel):
    qr_code_hash: str
    checked_in_by: str | None = None  #ignored, the scanner is whoever is signed in


class UndoRequest(BaseModel):
    ticket_id: str


class ManualSearchRequest(BaseModel):
    event_id: str
    name: str


def seat_label(ticket):
    return f"{ticket['section']}-{ticket['row_label']}{ticket['seat_number']}" if ticket.get("section") else None


@router.get("/api/staff/events")
def my_staff_events(user=Depends(require_roles(*STAFF_ROLES))):
    #the scanner app's event picker: an event admin only ever sees the events
    #they were assigned to
    with tx() as cur:
        if user["role"] == "event_admin":
            cur.execute(
                """SELECT events.* FROM events JOIN staff_assignments sa ON sa.event_id = events.id
                   WHERE sa.user_id = %s AND sa.status = 'active' ORDER BY events.start_time""", (user["id"],))
        elif user["role"] == "organizer":
            cur.execute("SELECT * FROM events WHERE organizer_id = %s ORDER BY start_time", (user["id"],))
        else:
            cur.execute("SELECT * FROM events ORDER BY start_time")
        return cur.fetchall()


@router.post("/api/checkin/verify-qr")
def verify_qr(payload: VerifyRequest, user=Depends(require_roles(*STAFF_ROLES))):
    code = payload.qr_code_hash.strip()
    with tx() as cur:
        #a campaign QR (the promo link kind) must never open a door
        cur.execute("SELECT 1 FROM promo_campaigns WHERE qr_token = %s", (code,))
        if code.startswith("cmp_") or "/events/" in code or "?c=" in code or cur.fetchone():
            raise HTTPException(status_code=400, detail="This is a promo campaign QR code, not an admission ticket")

        cur.execute(
            """SELECT tickets.*, seats.section, seats.row_label, seats.seat_number, ticket_types.name AS ticket_type_name
               FROM tickets LEFT JOIN seats ON tickets.seat_id = seats.id
               JOIN ticket_types ON tickets.ticket_type_id = ticket_types.id
               WHERE tickets.qr_code_hash = %s FOR UPDATE OF tickets""", (code,))
        ticket = cur.fetchone()
        if not ticket:
            raise HTTPException(status_code=404, detail="Not a valid ticket")
        event = assert_event_staff(cur, user, ticket["event_id"])

        base = {"attendee_name": ticket["attendee_name"], "ticket_id": ticket["id"],
                "ticket_type": ticket["ticket_type_name"], "seat": seat_label(ticket)}
        if event["status"] in ("cancelled", "suspended"):
            return {"result": f"event_{event['status']}", **base}
        if ticket["status"] == "checked_in":
            return {"result": "already_checked_in", **base}
        if ticket["status"] in ("cancelled", "refunded"):
            return {"result": ticket["status"], **base}

        cur.execute("UPDATE tickets SET status = 'checked_in' WHERE id = %s", (ticket["id"],))
        cur.execute("INSERT INTO checkin_records (ticket_id, checked_in_by) VALUES (%s, %s)", (ticket["id"], user["id"]))
        audit(cur, user["id"], ticket["event_id"], "check_in", f"{ticket['attendee_name']} checked in", "ticket", ticket["id"])
        return {"result": "valid", **base}


@router.post("/api/checkin/undo")
def undo_checkin(payload: UndoRequest, user=Depends(require_roles(*STAFF_ROLES))):
    with tx() as cur:
        cur.execute("SELECT * FROM tickets WHERE id = %s FOR UPDATE", (payload.ticket_id,))
        ticket = cur.fetchone()
        if not ticket:
            raise HTTPException(status_code=404, detail="Ticket not found")
        assert_event_staff(cur, user, ticket["event_id"])
        if ticket["status"] != "checked_in":
            raise HTTPException(status_code=409, detail="That ticket is not checked in")
        cur.execute("UPDATE tickets SET status = 'valid' WHERE id = %s", (ticket["id"],))
        cur.execute("UPDATE checkin_records SET reversed = true WHERE ticket_id = %s AND reversed = false", (ticket["id"],))
        audit(cur, user["id"], ticket["event_id"], "check_in_reversed",
              f"Check-in of {ticket['attendee_name']} was reversed", "ticket", ticket["id"])
        return {"result": "reversed", "ticket_id": ticket["id"]}


@router.get("/api/events/{event_id}/checkin-stats")
def checkin_stats(event_id: str, user=Depends(require_roles(*STAFF_ROLES))):
    with tx() as cur:
        assert_event_staff(cur, user, event_id)
        cur.execute(
            """SELECT count(*) FILTER (WHERE status IN ('valid','checked_in')) AS registered,
                      count(*) FILTER (WHERE status = 'checked_in') AS checked_in
               FROM tickets WHERE event_id = %s""", (event_id,))
        row = cur.fetchone()
    registered, checked = row["registered"], row["checked_in"]
    return {"registered": registered, "checked_in": checked, "not_arrived": registered - checked,
            "percent_checked_in": round(100 * checked / registered, 1) if registered else 0}


@router.post("/api/checkin/manual-search")
def manual_search(payload: ManualSearchRequest, user=Depends(require_roles(*STAFF_ROLES))):
    #for when a QR code won't scan: find people by (part of) their name or email
    #and check them in with the ticket's qr_code_hash through /verify-qr
    if len(payload.name.strip()) < 2:
        raise HTTPException(status_code=400, detail="Type at least 2 letters")
    with tx() as cur:
        assert_event_staff(cur, user, payload.event_id)
        pattern = "%" + payload.name.strip() + "%"
        cur.execute(
            """SELECT tickets.id, tickets.attendee_name, tickets.status, tickets.qr_code_hash,
                      ticket_types.name AS ticket_type_name, seats.section, seats.row_label, seats.seat_number
               FROM tickets
               JOIN ticket_types ON tickets.ticket_type_id = ticket_types.id
               JOIN orders ON tickets.order_id = orders.id
               JOIN users ON orders.attendee_id = users.id
               LEFT JOIN seats ON tickets.seat_id = seats.id
               WHERE tickets.event_id = %s AND (tickets.attendee_name ILIKE %s OR users.email ILIKE %s)
               ORDER BY tickets.attendee_name""",
            (payload.event_id, pattern, pattern))
        return cur.fetchall()
