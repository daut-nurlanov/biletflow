import os
from datetime import timedelta, timezone

import psycopg2
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel

from db import audit, notify, release_expired_holds, tx
from security import (assert_manager, can_manage, load_event, optional_user, require_roles,
                      resolve_actor)

router = APIRouter()

BASE_URL = os.getenv("PUBLIC_BASE_URL", "http://localhost:3000")
SEAT_CATEGORIES = ("premium", "standard", "accessible")


class EventCreate(BaseModel):
    organizer_id: str | None = None
    title: str
    venue_name: str
    start_time: str
    capacity: int | None = 100
    description: str | None = None
    category: str | None = None
    venue_address: str | None = None
    end_time: str | None = None
    visibility: str = "public"
    has_assigned_seating: bool = False


class EventUpdate(BaseModel):
    #status is not here on purpose: publishing, unpublishing and cancelling
    #have their own endpoints, because each one has rules and side effects
    title: str | None = None
    venue_name: str | None = None
    start_time: str | None = None
    capacity: int | None = None
    description: str | None = None
    category: str | None = None
    venue_address: str | None = None
    end_time: str | None = None
    visibility: str | None = None


class TicketTypeCreate(BaseModel):
    name: str
    price: float = 0
    total_quantity: int
    description: str | None = None
    seat_category: str | None = None
    sales_start_time: str | None = None
    sales_end_time: str | None = None
    max_per_order: int = 10
    is_hidden: bool = False


class TicketTypeUpdate(BaseModel):
    name: str | None = None
    price: float | None = None
    total_quantity: int | None = None
    description: str | None = None
    seat_category: str | None = None
    sales_start_time: str | None = None
    sales_end_time: str | None = None
    max_per_order: int | None = None
    is_hidden: bool | None = None


class SeatBlock(BaseModel):
    section: str
    category: str
    rows: int
    seats_per_row: int
    first_row_label: int = 1


class SeatHoldRequest(BaseModel):
    seat_id: str
    held_by_user_id: str | None = None


class ReportRequest(BaseModel):
    reason: str


@router.get("/api/events")
def list_events(organizer_id: str | None = None, public: bool = False):
    #?public=true is what the attendee apps should use: only events people
    #can actually buy into (upcoming/active) that the organizer made public
    with tx() as cur:
        if organizer_id:
            cur.execute("SELECT * FROM events WHERE organizer_id = %s ORDER BY start_time", (organizer_id,))
        elif public:
            cur.execute(
                """SELECT * FROM events
                   WHERE status IN ('upcoming','active') AND visibility = 'public'
                   ORDER BY start_time""")
        else:
            cur.execute("SELECT * FROM events ORDER BY start_time")
        return cur.fetchall()


@router.get("/api/events/{event_id}")
def get_event(event_id: str, user=Depends(optional_user)):
    with tx() as cur:
        event = load_event(cur, event_id)
        manager = can_manage(user, event)
        #drafts, suspended events and private events are only visible to the
        #people who run them (this is also how an organizer previews a draft)
        if not manager and (event["status"] in ("draft", "suspended") or event["visibility"] == "private"):
            raise HTTPException(status_code=404, detail="Event not found")
        cur.execute(
            "SELECT * FROM ticket_types WHERE event_id = %s AND (is_hidden = false OR %s) ORDER BY price DESC, name",
            (event_id, manager))
        event = dict(event)
        event["ticket_types"] = cur.fetchall()
        return event


@router.post("/api/events", status_code=201)
def create_event(payload: EventCreate, user=Depends(require_roles("organizer"))):
    if payload.organizer_id and payload.organizer_id != str(user["id"]):
        raise HTTPException(status_code=403, detail="You can only create events for yourself")
    with tx() as cur:
        cur.execute(
            """INSERT INTO events (organizer_id, title, venue_name, start_time, capacity,
                                   description, category, venue_address, end_time, visibility,
                                   has_assigned_seating)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING *""",
            (user["id"], payload.title, payload.venue_name, payload.start_time, payload.capacity,
             payload.description, payload.category, payload.venue_address, payload.end_time,
             payload.visibility, payload.has_assigned_seating))
        event = cur.fetchone()
        audit(cur, user["id"], event["id"], "event_created", f"Event '{event['title']}' created as draft",
              "event", event["id"])
        return event


@router.put("/api/events/{event_id}")
def update_event(event_id: str, payload: EventUpdate, user=Depends(require_roles("organizer", "platform_admin"))):
    changes = payload.model_dump(exclude_none=True)
    if not changes:
        raise HTTPException(status_code=400, detail="Nothing to update")
    with tx() as cur:
        event = assert_manager(cur, user, event_id, lock=True)
        if event["status"] in ("cancelled", "completed"):
            raise HTTPException(status_code=409, detail=f"A {event['status']} event cannot be edited")
        if "capacity" in changes and changes["capacity"] < 1:
            raise HTTPException(status_code=400, detail="Capacity must be at least 1")
        #column names come from this fixed model (never from user input), so
        #building the SQL like this is safe
        set_clause = ", ".join(f"{col} = %s" for col in changes)
        cur.execute(f"UPDATE events SET {set_clause} WHERE id = %s RETURNING *", (*changes.values(), event_id))
        updated = cur.fetchone()
        if "capacity" in changes and changes["capacity"] != event["capacity"]:
            audit(cur, user["id"], event_id, "capacity_changed",
                  f"Capacity changed from {event['capacity']} to {changes['capacity']}", "event", event_id)
        other = [c for c in changes if c != "capacity"]
        if other:
            audit(cur, user["id"], event_id, "event_updated", "Updated: " + ", ".join(other), "event", event_id)
        return updated


@router.post("/api/events/{event_id}/publish")
def publish_event(event_id: str, user=Depends(require_roles("organizer", "platform_admin"))):
    with tx() as cur:
        event = assert_manager(cur, user, event_id, lock=True)
        if event["status"] != "draft":
            raise HTTPException(status_code=409, detail=f"Only draft events can be published (this one is {event['status']})")
        cur.execute("SELECT is_email_verified FROM users WHERE id = %s", (event["organizer_id"],))
        if not cur.fetchone()["is_email_verified"]:
            raise HTTPException(status_code=403, detail="Verify your email before publishing an event")
        cur.execute("SELECT count(*) AS n FROM ticket_types WHERE event_id = %s", (event_id,))
        if cur.fetchone()["n"] == 0:
            raise HTTPException(status_code=409, detail="Add at least one ticket type before publishing")
        cur.execute("UPDATE events SET status = 'upcoming' WHERE id = %s RETURNING *", (event_id,))
        published = cur.fetchone()
        audit(cur, user["id"], event_id, "event_published", "Event published", "event", event_id)
        return published


@router.post("/api/events/{event_id}/unpublish")
def unpublish_event(event_id: str, user=Depends(require_roles("organizer", "platform_admin"))):
    with tx() as cur:
        event = assert_manager(cur, user, event_id, lock=True)
        if event["status"] not in ("upcoming", "active"):
            raise HTTPException(status_code=409, detail="Only a published event can be unpublished")
        cur.execute("SELECT count(*) AS n FROM tickets WHERE event_id = %s AND status IN ('valid','checked_in')", (event_id,))
        if cur.fetchone()["n"] > 0:
            raise HTTPException(status_code=409, detail="Tickets have been sold. Cancel the event instead of unpublishing it")
        cur.execute("UPDATE events SET status = 'draft' WHERE id = %s RETURNING *", (event_id,))
        draft = cur.fetchone()
        audit(cur, user["id"], event_id, "event_unpublished", "Event moved back to draft", "event", event_id)
        return draft


@router.post("/api/events/{event_id}/cancel")
def cancel_event(event_id: str, user=Depends(require_roles("organizer", "platform_admin"))):
    with tx() as cur:
        event = assert_manager(cur, user, event_id, lock=True)
        if event["status"] in ("cancelled", "completed"):
            raise HTTPException(status_code=409, detail=f"This event is already {event['status']}")
        cur.execute("UPDATE events SET status = 'cancelled' WHERE id = %s RETURNING *", (event_id,))
        cancelled = cur.fetchone()
        #everyone holding a ticket gets told. their tickets stop working at the
        #door immediately (the scanner checks the event status). refunds are a
        #separate, deliberate step: POST /api/orders/{id}/refund
        cur.execute(
            """SELECT DISTINCT orders.attendee_id FROM orders
               WHERE orders.event_id = %s AND orders.status = 'paid'""", (event_id,))
        holders = cur.fetchall()
        for holder in holders:
            notify(cur, holder["attendee_id"], "event_cancelled", f"{event['title']} was cancelled",
                   "The organizer cancelled this event. Contact the organizer or support about your refund.")
        audit(cur, user["id"], event_id, "event_cancelled",
              f"Event cancelled, {len(holders)} ticket holder(s) notified", "event", event_id)
        return cancelled


@router.post("/api/events/{event_id}/duplicate", status_code=201)
def duplicate_event(event_id: str, user=Depends(require_roles("organizer"))):
    #copies the setup (details, ticket types, seats) into a fresh draft.
    #orders, tickets, payments, check-ins and support cases are never copied
    with tx() as cur:
        event = assert_manager(cur, user, event_id)
        if str(event["organizer_id"]) != str(user["id"]):
            raise HTTPException(status_code=403, detail="You can only duplicate your own events")
        cur.execute(
            """INSERT INTO events (organizer_id, title, venue_name, start_time, capacity, description, category,
                                   venue_address, end_time, visibility, has_assigned_seating)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING *""",
            (user["id"], event["title"] + " (copy)", event["venue_name"], event["start_time"], event["capacity"],
             event["description"], event["category"], event["venue_address"], event["end_time"],
             event["visibility"], event["has_assigned_seating"]))
        new = cur.fetchone()
        cur.execute(
            """INSERT INTO ticket_types (event_id, name, description, price, total_quantity, quantity_available,
                                         seat_category, sales_start_time, sales_end_time, is_hidden, max_per_order)
               SELECT %s, name, description, price, total_quantity, total_quantity,
                      seat_category, sales_start_time, sales_end_time, is_hidden, max_per_order
               FROM ticket_types WHERE event_id = %s""", (new["id"], event_id))
        cur.execute(
            """INSERT INTO seats (event_id, section, row_label, seat_number, category)
               SELECT %s, section, row_label, seat_number, category FROM seats WHERE event_id = %s""",
            (new["id"], event_id))
        audit(cur, user["id"], new["id"], "event_duplicated", f"Created as a copy of event {event_id}", "event", new["id"])
        audit(cur, user["id"], event_id, "event_duplicated_from", f"Duplicated into new draft {new['id']}", "event", event_id)
        return new


@router.post("/api/events/{event_id}/report", status_code=201)
def report_event(event_id: str, payload: ReportRequest, user=Depends(optional_user)):
    if not payload.reason.strip():
        raise HTTPException(status_code=400, detail="Tell us what is wrong with this event")
    with tx() as cur:
        load_event(cur, event_id)
        cur.execute(
            "INSERT INTO event_reports (event_id, reported_by, reason) VALUES (%s, %s, %s) RETURNING *",
            (event_id, user["id"] if user else None, payload.reason.strip()))
        return cur.fetchone()


@router.post("/api/events/{event_id}/ticket-types", status_code=201)
def create_ticket_type(event_id: str, payload: TicketTypeCreate, user=Depends(require_roles("organizer", "platform_admin"))):
    if payload.total_quantity < 1:
        raise HTTPException(status_code=400, detail="total_quantity must be at least 1")
    if payload.price < 0:
        raise HTTPException(status_code=400, detail="price cannot be negative")
    if payload.max_per_order < 1:
        raise HTTPException(status_code=400, detail="max_per_order must be at least 1")
    if payload.seat_category not in (None, *SEAT_CATEGORIES):
        raise HTTPException(status_code=400, detail="seat_category must be premium, standard or accessible")
    with tx() as cur:
        assert_manager(cur, user, event_id)
        cur.execute(
            """INSERT INTO ticket_types (event_id, name, description, price, total_quantity, quantity_available,
                                         seat_category, sales_start_time, sales_end_time, max_per_order, is_hidden)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING *""",
            (event_id, payload.name, payload.description, payload.price, payload.total_quantity,
             payload.total_quantity, payload.seat_category, payload.sales_start_time, payload.sales_end_time,
             payload.max_per_order, payload.is_hidden))
        ticket_type = cur.fetchone()
        audit(cur, user["id"], event_id, "ticket_type_created",
              f"Ticket type '{ticket_type['name']}' created at {ticket_type['price']} KZT", "ticket_type", ticket_type["id"])
        return ticket_type


@router.get("/api/events/{event_id}/ticket-types")
def list_ticket_types(event_id: str, user=Depends(optional_user)):
    with tx() as cur:
        event = load_event(cur, event_id)
        manager = can_manage(user, event)
        cur.execute(
            "SELECT * FROM ticket_types WHERE event_id = %s AND (is_hidden = false OR %s) ORDER BY price DESC, name",
            (event_id, manager))
        return cur.fetchall()


@router.put("/api/ticket-types/{ticket_type_id}")
def update_ticket_type(ticket_type_id: str, payload: TicketTypeUpdate, user=Depends(require_roles("organizer", "platform_admin"))):
    changes = payload.model_dump(exclude_none=True)
    if not changes:
        raise HTTPException(status_code=400, detail="Nothing to update")
    if changes.get("price", 0) < 0 or changes.get("max_per_order", 1) < 1:
        raise HTTPException(status_code=400, detail="Invalid price or max_per_order")
    if changes.get("seat_category") not in (None, *SEAT_CATEGORIES):
        raise HTTPException(status_code=400, detail="seat_category must be premium, standard or accessible")
    with tx() as cur:
        cur.execute("SELECT * FROM ticket_types WHERE id = %s FOR UPDATE", (ticket_type_id,))
        old = cur.fetchone()
        if not old:
            raise HTTPException(status_code=404, detail="Ticket type not found")
        assert_manager(cur, user, old["event_id"])
        if "total_quantity" in changes:
            sold = old["total_quantity"] - old["quantity_available"]
            if changes["total_quantity"] < sold:
                raise HTTPException(status_code=409, detail=f"{sold} tickets are already sold, so the total cannot go below {sold}")
            changes["quantity_available"] = changes["total_quantity"] - sold
        set_clause = ", ".join(f"{col} = %s" for col in changes)
        cur.execute(f"UPDATE ticket_types SET {set_clause} WHERE id = %s RETURNING *", (*changes.values(), ticket_type_id))
        new = cur.fetchone()
        if "price" in changes and float(changes["price"]) != float(old["price"]):
            audit(cur, user["id"], old["event_id"], "ticket_price_changed",
                  f"'{old['name']}' price changed from {old['price']} to {new['price']} KZT", "ticket_type", ticket_type_id)
        if "is_hidden" in changes and changes["is_hidden"] != old["is_hidden"]:
            audit(cur, user["id"], old["event_id"], "ticket_type_hidden" if changes["is_hidden"] else "ticket_type_shown",
                  f"'{old['name']}' " + ("hidden" if changes["is_hidden"] else "shown again"), "ticket_type", ticket_type_id)
        return new


@router.post("/api/events/{event_id}/seats", status_code=201)
def create_seats(event_id: str, payload: SeatBlock, user=Depends(require_roles("organizer", "platform_admin"))):
    #creates a whole block of seats in one go, e.g. section A, 10 rows of 12
    #seats each, all "standard". call it once per section/category
    if payload.category not in SEAT_CATEGORIES:
        raise HTTPException(status_code=400, detail="category must be premium, standard or accessible")
    if payload.rows < 1 or payload.seats_per_row < 1 or payload.rows * payload.seats_per_row > 2000:
        raise HTTPException(status_code=400, detail="Use between 1 and 2000 seats per call")
    try:
        with tx() as cur:
            assert_manager(cur, user, event_id)
            for row in range(payload.first_row_label, payload.first_row_label + payload.rows):
                for number in range(1, payload.seats_per_row + 1):
                    cur.execute(
                        """INSERT INTO seats (event_id, section, row_label, seat_number, category)
                           VALUES (%s, %s, %s, %s, %s)""",
                        (event_id, payload.section, str(row), str(number), payload.category))
            cur.execute("UPDATE events SET has_assigned_seating = true WHERE id = %s", (event_id,))
            return {"created": payload.rows * payload.seats_per_row}
    except psycopg2.errors.UniqueViolation:
        raise HTTPException(status_code=409, detail="Some of those seats already exist for this event")


@router.get("/api/events/{event_id}/seats")
def get_seats(event_id: str):
    #this is what the seat map screen renders from: every seat for the event,
    #plus whatever active hold or sold ticket currently sits on top of it, so
    #the frontend can color each one correctly
    with tx() as cur:
        cur.execute(
            """SELECT
                 seats.*,
                 (SELECT status FROM seat_holds
                  WHERE seat_holds.seat_id = seats.id AND seat_holds.status = 'active'
                    AND seat_holds.expires_at > now()
                  LIMIT 1) AS hold_status,
                 (SELECT tickets.status FROM tickets
                  WHERE tickets.seat_id = seats.id AND tickets.status IN ('valid','checked_in')
                  LIMIT 1) AS ticket_status
               FROM seats
               WHERE seats.event_id = %s
               ORDER BY seats.section, seats.row_label, seats.seat_number""",
            (event_id,))
        return cur.fetchall()


@router.post("/api/seats/hold", status_code=201)
def hold_seat(payload: SeatHoldRequest, user=Depends(optional_user)):
    holder = resolve_actor(user, payload.held_by_user_id, "held_by_user_id")
    with tx() as cur:
        release_expired_holds(cur)
        cur.execute("SELECT id FROM seats WHERE id = %s", (payload.seat_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Seat not found")

        #FOR UPDATE locks this seat's existing holds so two people clicking
        #the same seat at the same instant can't both succeed
        cur.execute("SELECT * FROM seat_holds WHERE seat_id = %s AND status = 'active' FOR UPDATE", (payload.seat_id,))
        existing = cur.fetchone()
        if existing:
            if str(existing["held_by_user_id"]) == holder:
                return existing  #same person clicking again, hand back their hold
            raise HTTPException(status_code=409, detail="Seat is already held by someone else")

        cur.execute("SELECT id FROM tickets WHERE seat_id = %s AND status IN ('valid','checked_in')", (payload.seat_id,))
        if cur.fetchone():
            raise HTTPException(status_code=409, detail="Seat is already sold")

        #5-minute hold window, matches the countdown the seat map screen shows
        cur.execute(
            """INSERT INTO seat_holds (seat_id, held_by_user_id, expires_at, status)
               VALUES (%s, %s, now() + interval '5 minutes', 'active') RETURNING *""",
            (payload.seat_id, holder))
        return cur.fetchone()


def _ics_text(text):
    return str(text).replace("\\", "\\\\").replace(",", "\\,").replace(";", "\\;").replace("\n", "\\n")


@router.get("/api/events/{event_id}/export.ics")
def export_ics(event_id: str):
    with tx() as cur:
        event = load_event(cur, event_id)
    #calendar apps want times in UTC like 20261014T140000Z. if the organizer
    #never set an end_time we fall back to a 2 hour block
    start = event["start_time"].astimezone(timezone.utc)
    end = event["end_time"].astimezone(timezone.utc) if event["end_time"] else start + timedelta(hours=2)
    fmt = "%Y%m%dT%H%M%SZ"
    cancelled = event["status"] == "cancelled"
    place = event["venue_name"] + (", " + event["venue_address"] if event["venue_address"] else "")
    lines = [
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//BiletFlow//EN",
        "METHOD:CANCEL" if cancelled else "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        #the same UID every time, so importing an updated file replaces the old entry
        f"UID:{event['id']}@biletflow",
        f"DTSTAMP:{event['created_at'].astimezone(timezone.utc).strftime(fmt)}",
        f"SEQUENCE:{1 if cancelled else 0}",
        f"DTSTART:{start.strftime(fmt)}", f"DTEND:{end.strftime(fmt)}",
        f"SUMMARY:{_ics_text(('CANCELLED: ' if cancelled else '') + event['title'])}",
        f"LOCATION:{_ics_text(place)}",
        f"URL:{BASE_URL}/events/{event['id']}",
        "STATUS:CANCELLED" if cancelled else "STATUS:CONFIRMED",
    ]
    if event["description"]:
        lines.append(f"DESCRIPTION:{_ics_text(event['description'])}")
    lines += ["END:VEVENT", "END:VCALENDAR"]
    return Response(
        content="\r\n".join(lines) + "\r\n", media_type="text/calendar",
        headers={"Content-Disposition": f'attachment; filename="event-{event_id}.ics"'})


@router.get("/api/events/{event_id}/calendar-links")
def calendar_links(event_id: str):
    #one-click links: the .ics file works for Apple/Outlook, the Google link opens
    #Google Calendar with the event filled in. neither needs access to anyone's calendar
    from urllib.parse import quote
    with tx() as cur:
        event = load_event(cur, event_id)
    start = event["start_time"].astimezone(timezone.utc)
    end = event["end_time"].astimezone(timezone.utc) if event["end_time"] else start + timedelta(hours=2)
    fmt = "%Y%m%dT%H%M%SZ"
    place = event["venue_name"] + (", " + event["venue_address"] if event["venue_address"] else "")
    google = ("https://calendar.google.com/calendar/render?action=TEMPLATE"
              f"&text={quote(event['title'])}&dates={start.strftime(fmt)}/{end.strftime(fmt)}"
              f"&location={quote(place)}&details={quote(event['description'] or '')}")
    return {"ics": f"/api/events/{event_id}/export.ics", "google": google}
