from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from db import audit, notify, tx
from security import current_user, require_roles

router = APIRouter()

CATEGORIES = ("ticket_delivery", "payment", "refund", "seating", "event_information",
              "check_in", "account", "activation", "technical")
STATUSES = ("open", "in_progress", "waiting_customer", "resolved")


class CaseCreate(BaseModel):
    category: str
    message: str
    event_id: str | None = None
    order_id: str | None = None
    ticket_id: str | None = None


class MessageCreate(BaseModel):
    message: str


class CaseUpdate(BaseModel):
    status: str | None = None
    assigned_to: str | None = None


def access_level(cur, user, case):
    """Who is this person in relation to this case? 'owner' opened it,
    'handler' is the event's organizer (attendee cases), 'admin' is platform
    staff (organizer cases and anything escalated). Anyone else gets nothing."""
    if str(case["opened_by"]) == str(user["id"]):
        return "owner"
    if user["role"] == "platform_admin" and (case["kind"] == "organizer" or case["escalated"]):
        return "admin"
    if case["kind"] == "attendee" and case["event_id"]:
        cur.execute("SELECT organizer_id FROM events WHERE id = %s", (case["event_id"],))
        event = cur.fetchone()
        if event and str(event["organizer_id"]) == str(user["id"]):
            return "handler"
    return None


def load_case(cur, case_id, user):
    cur.execute("SELECT * FROM support_cases WHERE id = %s", (case_id,))
    case = cur.fetchone()
    level = access_level(cur, user, case) if case else None
    if not case or not level:
        #same answer for "does not exist" and "not yours", so ids can't be probed
        raise HTTPException(status_code=404, detail="Support case not found")
    return case, level


def notify_other_side(cur, case, sender, subject, body):
    recipients = set()
    if str(sender["id"]) != str(case["opened_by"]):
        recipients.add(str(case["opened_by"]))
    else:
        if case["assigned_to"]:
            recipients.add(str(case["assigned_to"]))
        elif case["kind"] == "attendee" and case["event_id"]:
            cur.execute("SELECT organizer_id FROM events WHERE id = %s", (case["event_id"],))
            recipients.add(str(cur.fetchone()["organizer_id"]))
        else:
            cur.execute("SELECT id FROM users WHERE role = 'platform_admin' AND NOT is_suspended")
            recipients.update(str(r["id"]) for r in cur.fetchall())
    recipients.discard(str(sender["id"]))
    for user_id in recipients:
        notify(cur, user_id, "support", subject, body)


@router.post("/api/support/cases", status_code=201)
def open_case(payload: CaseCreate, user=Depends(require_roles("attendee", "organizer"))):
    if payload.category not in CATEGORIES:
        raise HTTPException(status_code=400, detail="category must be one of: " + ", ".join(CATEGORIES))
    if not payload.message.strip():
        raise HTTPException(status_code=400, detail="Write a message describing the problem")
    kind = "organizer" if user["role"] == "organizer" else "attendee"
    event_id, order_id, ticket_id = payload.event_id, payload.order_id, payload.ticket_id

    with tx() as cur:
        #fill in the context automatically: a ticket knows its order and event,
        #an order knows its event
        if ticket_id:
            cur.execute("SELECT t.id, t.order_id, t.event_id, o.attendee_id FROM tickets t JOIN orders o ON t.order_id = o.id WHERE t.id = %s", (ticket_id,))
            ticket = cur.fetchone()
            if not ticket:
                raise HTTPException(status_code=404, detail="Ticket not found")
            order_id, event_id = str(ticket["order_id"]), str(ticket["event_id"])
            owner = str(ticket["attendee_id"])
        elif order_id:
            cur.execute("SELECT * FROM orders WHERE id = %s", (order_id,))
            order = cur.fetchone()
            if not order:
                raise HTTPException(status_code=404, detail="Order not found")
            event_id, owner = str(order["event_id"]), str(order["attendee_id"])
        else:
            owner = None

        if kind == "attendee":
            if not event_id:
                raise HTTPException(status_code=400, detail="Open the request from an event, order or ticket")
            if owner and owner != str(user["id"]):
                raise HTTPException(status_code=403, detail="That order or ticket is not yours")
        if event_id:
            cur.execute("SELECT organizer_id FROM events WHERE id = %s", (event_id,))
            event = cur.fetchone()
            if not event:
                raise HTTPException(status_code=404, detail="Event not found")
            if kind == "organizer" and str(event["organizer_id"]) != str(user["id"]):
                raise HTTPException(status_code=403, detail="That is not your event")

        cur.execute(
            """INSERT INTO support_cases (opened_by, event_id, order_id, ticket_id, category, kind)
               VALUES (%s, %s, %s, %s, %s, %s) RETURNING *""",
            (user["id"], event_id, order_id, ticket_id, payload.category, kind))
        case = cur.fetchone()
        cur.execute("INSERT INTO support_messages (case_id, sender_id, message) VALUES (%s, %s, %s)",
                    (case["id"], user["id"], payload.message.strip()))
        notify_other_side(cur, case, user, "New support request", f"{user['full_name']} ({payload.category}): {payload.message.strip()[:200]}")
        return case


@router.get("/api/support/cases")
def list_cases(status: str | None = None, escalated: bool | None = None, user=Depends(current_user)):
    with tx() as cur:
        cur.execute(
            """SELECT c.*, e.title AS event_title, u.full_name AS opened_by_name
               FROM support_cases c
               LEFT JOIN events e ON c.event_id = e.id
               JOIN users u ON c.opened_by = u.id
               WHERE (c.opened_by = %(me)s
                      OR (c.kind = 'attendee' AND e.organizer_id = %(me)s)
                      OR (%(admin)s AND (c.kind = 'organizer' OR c.escalated)))
                 AND (%(status)s IS NULL OR c.status = %(status)s)
                 AND (%(escalated)s IS NULL OR c.escalated = %(escalated)s)
               ORDER BY c.updated_at DESC""",
            {"me": str(user["id"]), "admin": user["role"] == "platform_admin", "status": status, "escalated": escalated})
        return cur.fetchall()


@router.get("/api/support/cases/{case_id}")
def get_case(case_id: str, user=Depends(current_user)):
    with tx() as cur:
        case, level = load_case(cur, case_id, user)
        cur.execute(
            """SELECT m.*, u.full_name AS sender_name FROM support_messages m
               JOIN users u ON m.sender_id = u.id WHERE m.case_id = %s ORDER BY m.created_at""", (case_id,))
        return {**case, "your_role_in_case": level, "messages": cur.fetchall()}


@router.post("/api/support/cases/{case_id}/messages", status_code=201)
def add_message(case_id: str, payload: MessageCreate, user=Depends(current_user)):
    if not payload.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    with tx() as cur:
        case, level = load_case(cur, case_id, user)
        cur.execute("INSERT INTO support_messages (case_id, sender_id, message) VALUES (%s, %s, %s) RETURNING *",
                    (case_id, user["id"], payload.message.strip()))
        message = cur.fetchone()
        #a customer replying while we were waiting on them puts it back in progress
        new_status = "in_progress" if level == "owner" and case["status"] == "waiting_customer" else case["status"]
        cur.execute("UPDATE support_cases SET updated_at = now(), status = %s WHERE id = %s", (new_status, case_id))
        notify_other_side(cur, case, user, "New reply on your support case", payload.message.strip()[:200])
        return message


@router.put("/api/support/cases/{case_id}")
def update_case(case_id: str, payload: CaseUpdate, user=Depends(current_user)):
    with tx() as cur:
        case, level = load_case(cur, case_id, user)
        if level == "owner":
            raise HTTPException(status_code=403, detail="Only the support side can change a case's status or assignee")
        if payload.status is not None and payload.status not in STATUSES:
            raise HTTPException(status_code=400, detail="status must be one of: " + ", ".join(STATUSES))
        if payload.assigned_to:
            cur.execute("SELECT role FROM users WHERE id = %s", (payload.assigned_to,))
            assignee = cur.fetchone()
            if not assignee or assignee["role"] not in ("organizer", "platform_admin"):
                raise HTTPException(status_code=400, detail="A case can only be assigned to an organizer or platform admin")
        cur.execute(
            """UPDATE support_cases SET status = COALESCE(%s, status), assigned_to = COALESCE(%s, assigned_to),
                      updated_at = now() WHERE id = %s RETURNING *""",
            (payload.status, payload.assigned_to, case_id))
        updated = cur.fetchone()
        if payload.status and payload.status != case["status"]:
            audit(cur, user["id"], case["event_id"], "support_case_status_changed",
                  f"Support case {case['category']}: {case['status']} to {payload.status}", "support_case", case_id)
            notify(cur, case["opened_by"], "support", "Your support case changed status", f"New status: {payload.status}")
        return updated


@router.post("/api/support/cases/{case_id}/escalate")
def escalate_case(case_id: str, user=Depends(require_roles("organizer"))):
    #an organizer who can't resolve an attendee's problem hands it to the platform team
    with tx() as cur:
        case, level = load_case(cur, case_id, user)
        if level != "handler":
            raise HTTPException(status_code=403, detail="Only the event's organizer can escalate an attendee case")
        cur.execute("UPDATE support_cases SET escalated = true, updated_at = now() WHERE id = %s RETURNING *", (case_id,))
        updated = cur.fetchone()
        audit(cur, user["id"], case["event_id"], "support_case_escalated", "Case escalated to platform admins", "support_case", case_id)
        cur.execute("SELECT id FROM users WHERE role = 'platform_admin' AND NOT is_suspended")
        for admin in cur.fetchall():
            notify(cur, admin["id"], "support", "Escalated support case", f"Case {case_id} ({case['category']}) was escalated")
        return updated
