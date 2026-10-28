import os
import uuid
from decimal import Decimal
from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import psycopg2
import psycopg2.extras
import bcrypt
from fpdf import FPDF

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


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


def release_expired_holds(cur):
    #holds say "5 minutes" but nothing used to enforce it. any endpoint that
    #cares about seat availability calls this first, so a stale hold can
    #never block a seat. the caller's transaction commits it
    cur.execute("UPDATE seat_holds SET status = 'expired' WHERE status = 'active' AND expires_at <= now()")


class EventCreate(BaseModel):
    organizer_id: str
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


class TicketTypeCreate(BaseModel):
    name: str
    price: float = 0
    total_quantity: int
    description: str | None = None
    seat_category: str | None = None
    sales_start_time: str | None = None
    sales_end_time: str | None = None


class SeatBlock(BaseModel):
    section: str
    category: str
    rows: int
    seats_per_row: int
    first_row_label: int = 1


class CheckoutRequest(BaseModel):
    attendee_id: str
    event_id: str
    ticket_type_id: str
    attendee_name: str
    seat_id: str | None = None
    quantity: int = 1
    promo_code: str | None = None


class RegisterRequest(BaseModel):
    email: str
    password: str
    full_name: str
    role: str


class LoginRequest(BaseModel):
    email: str
    password: str


class CheckinRequest(BaseModel):
    qr_code_hash: str
    checked_in_by: str

class EventUpdate(BaseModel):
    title: str | None = None
    venue_name: str | None = None
    start_time: str | None = None
    capacity: int | None = None
    status: str | None = None
    description: str | None = None
    category: str | None = None
    venue_address: str | None = None
    end_time: str | None = None
    visibility: str | None = None


class ManualSearchRequest(BaseModel):
    event_id: str
    name: str


class SeatHoldRequest(BaseModel):
    seat_id: str
    held_by_user_id: str


@app.get("/api/events")
def list_events(organizer_id: str | None = None, public: bool = False):
    #?public=true is what the attendee apps should use: only events people
    #can actually buy into (upcoming/active) that the organizer made public
    conn = get_connection()
    cur = conn.cursor()
    if organizer_id:
        cur.execute("SELECT * FROM events WHERE organizer_id = %s ORDER BY start_time", (organizer_id,))
    elif public:
        cur.execute(
            """SELECT * FROM events
               WHERE status IN ('upcoming','active') AND visibility = 'public'
               ORDER BY start_time""")
    else:
        cur.execute("SELECT * FROM events ORDER BY start_time")
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return rows


@app.get("/api/events/{event_id}")
def get_event(event_id: str):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM events WHERE id = %s", (event_id,))
    event = cur.fetchone()
    if not event:
        cur.close(); conn.close()
        raise HTTPException(status_code=404, detail="Event not found")
    cur.execute("SELECT * FROM ticket_types WHERE event_id = %s", (event_id,))
    ticket_types = cur.fetchall()
    cur.close(); conn.close()
    event = dict(event)
    event["ticket_types"] = ticket_types
    return event


@app.post("/api/events", status_code=201)
def create_event(payload: EventCreate):
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            """INSERT INTO events (organizer_id, title, venue_name, start_time, capacity,
                                   description, category, venue_address, end_time, visibility,
                                   has_assigned_seating)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING *""",
            (payload.organizer_id, payload.title, payload.venue_name, payload.start_time, payload.capacity,
             payload.description, payload.category, payload.venue_address, payload.end_time,
             payload.visibility, payload.has_assigned_seating),
        )
        new_event = cur.fetchone()
        conn.commit()
        return new_event
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close(); conn.close()


#this one has to be defined BEFORE /api/tickets/{ticket_id} below it.
#FastAPI checks routes top to bottom and uses the first match, so if
#{ticket_id} came first, it would grab "my-tickets" as if it were an
#actual ticket's id and never let this one run at all. same gotcha would
#happen in Express too, it's not FastAPI-specific, just worth knowing:
#always put the more specific, fixed-word route above the generic {id} one
@app.get("/api/tickets/my-tickets")
def my_tickets(attendee_id: str):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        """SELECT tickets.*, events.title AS event_title, events.start_time
           FROM tickets
           JOIN orders ON tickets.order_id = orders.id
           JOIN events ON tickets.event_id = events.id
           WHERE orders.attendee_id = %s
           ORDER BY events.start_time""", (attendee_id,))
    rows = cur.fetchall()
    cur.close(); conn.close()
    return rows


@app.get("/api/tickets/{ticket_id}")
def get_ticket(ticket_id: str):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        """SELECT tickets.*, events.title AS event_title, ticket_types.name AS ticket_type_name
           FROM tickets JOIN events ON tickets.event_id = events.id
           JOIN ticket_types ON tickets.ticket_type_id = ticket_types.id
           WHERE tickets.id = %s""", (ticket_id,))
    ticket = cur.fetchone()
    cur.close(); conn.close()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return ticket


@app.post("/api/orders/checkout", status_code=201)
def checkout(payload: CheckoutRequest):
    if payload.quantity < 1 or payload.quantity > 10:
        raise HTTPException(status_code=400, detail="Quantity must be between 1 and 10")
    if payload.seat_id and payload.quantity != 1:
        raise HTTPException(status_code=400, detail="Seats are bought one ticket at a time")

    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute("BEGIN")
        release_expired_holds(cur)

        #lock the ticket type row first, so two buyers racing for the last
        #ticket take turns instead of both succeeding
        cur.execute("SELECT * FROM ticket_types WHERE id = %s FOR UPDATE", (payload.ticket_type_id,))
        ticket_type = cur.fetchone()
        if not ticket_type:
            conn.rollback()
            raise HTTPException(status_code=404, detail="Ticket type not found")
        if str(ticket_type["event_id"]) != payload.event_id:
            conn.rollback()
            raise HTTPException(status_code=400, detail="That ticket type does not belong to this event")

        cur.execute("SELECT * FROM events WHERE id = %s", (payload.event_id,))
        event = cur.fetchone()
        if not event:
            conn.rollback()
            raise HTTPException(status_code=404, detail="Event not found")
        if event["status"] not in ("upcoming", "active"):
            conn.rollback()
            raise HTTPException(status_code=409, detail="This event is not on sale")
        if ticket_type["price"] > 0 and not event["is_paid_sales_active"]:
            conn.rollback()
            raise HTTPException(status_code=403, detail="Paid sales are not active for this event")

        cur.execute("SELECT now() AS now")
        now = cur.fetchone()["now"]
        if ticket_type["sales_start_time"] and now < ticket_type["sales_start_time"]:
            conn.rollback()
            raise HTTPException(status_code=409, detail="Sales for this ticket type have not started yet")
        if ticket_type["sales_end_time"] and now > ticket_type["sales_end_time"]:
            conn.rollback()
            raise HTTPException(status_code=409, detail="Sales for this ticket type have ended")

        cur.execute("SELECT id FROM users WHERE id = %s", (payload.attendee_id,))
        if not cur.fetchone():
            conn.rollback()
            raise HTTPException(status_code=404, detail="Attendee not found")

        if ticket_type["quantity_available"] <= 0:
            conn.rollback()
            raise HTTPException(status_code=409, detail="Sold out")
        if ticket_type["quantity_available"] < payload.quantity:
            conn.rollback()
            raise HTTPException(
                status_code=409,
                detail=f"Only {ticket_type['quantity_available']} left for this ticket type")

        if payload.seat_id:
            cur.execute(
                "SELECT * FROM seats WHERE id = %s AND event_id = %s FOR UPDATE",
                (payload.seat_id, payload.event_id))
            seat = cur.fetchone()
            if not seat:
                conn.rollback()
                raise HTTPException(status_code=404, detail="Seat not found for this event")
            if ticket_type["seat_category"] and seat["category"] != ticket_type["seat_category"]:
                conn.rollback()
                raise HTTPException(status_code=409, detail="That seat does not match this ticket type")
            cur.execute(
                """SELECT id FROM tickets WHERE seat_id = %s AND status IN ('valid','checked_in') FOR UPDATE""",
                (payload.seat_id,))
            if cur.fetchone():
                conn.rollback()
                raise HTTPException(status_code=409, detail="That seat is already taken")

            #if somebody else is holding this seat right now, it's theirs.
            #if the buyer is the one holding it, the hold turns into a ticket
            cur.execute(
                "SELECT * FROM seat_holds WHERE seat_id = %s AND status = 'active' FOR UPDATE",
                (payload.seat_id,))
            hold = cur.fetchone()
            if hold and str(hold["held_by_user_id"]) != payload.attendee_id:
                conn.rollback()
                raise HTTPException(status_code=409, detail="That seat is being held by someone else")
            if hold:
                cur.execute("UPDATE seat_holds SET status = 'converted' WHERE id = %s", (hold["id"],))

        subtotal = ticket_type["price"] * payload.quantity
        discount = Decimal("0")
        campaign = None
        if payload.promo_code:
            cur.execute(
                "SELECT * FROM promo_campaigns WHERE code = %s AND event_id = %s FOR UPDATE",
                (payload.promo_code, payload.event_id))
            campaign = cur.fetchone()
            if not campaign:
                conn.rollback()
                raise HTTPException(status_code=404, detail="Invalid promo code")
            if (campaign["valid_from"] and now < campaign["valid_from"]) or \
               (campaign["valid_until"] and now > campaign["valid_until"]):
                conn.rollback()
                raise HTTPException(status_code=409, detail="This promo code is not valid right now")
            if campaign["redemptions_count"] >= campaign["max_redemptions"]:
                conn.rollback()
                raise HTTPException(status_code=409, detail="This promo code has been fully used")
            if campaign["discount_type"] == "percentage":
                discount = (subtotal * campaign["discount_value"] / 100).quantize(Decimal("0.01"))
            else:
                discount = min(campaign["discount_value"], subtotal)
        total = subtotal - discount

        payment_ref = "SANDBOX-" + str(uuid.uuid4())[:8]
        cur.execute(
            """INSERT INTO orders (attendee_id, event_id, total_amount, status, payment_reference, promo_code_applied)
               VALUES (%s, %s, %s, 'paid', %s, %s) RETURNING *""",
            (payload.attendee_id, payload.event_id, total, payment_ref,
             payload.promo_code if campaign else None))
        order = cur.fetchone()

        tickets = []
        for _ in range(payload.quantity):
            cur.execute(
                """INSERT INTO tickets (order_id, event_id, ticket_type_id, seat_id, attendee_name, qr_code_hash, status)
                   VALUES (%s, %s, %s, %s, %s, %s, 'valid') RETURNING *""",
                (order["id"], payload.event_id, payload.ticket_type_id, payload.seat_id,
                 payload.attendee_name, str(uuid.uuid4())))
            tickets.append(cur.fetchone())

        cur.execute("UPDATE ticket_types SET quantity_available = quantity_available - %s WHERE id = %s",
                    (payload.quantity, payload.ticket_type_id))
        if campaign:
            cur.execute("INSERT INTO promo_redemptions (campaign_id, order_id, discount_amount) VALUES (%s, %s, %s)",
                        (campaign["id"], order["id"], discount))
            cur.execute("UPDATE promo_campaigns SET redemptions_count = redemptions_count + 1 WHERE id = %s",
                        (campaign["id"],))
        conn.commit()
        #"ticket" (first one) is kept so older clients keep working
        return {"order": order, "ticket": tickets[0], "tickets": tickets}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close(); conn.close()


@app.post("/api/auth/register", status_code=201)
def register(payload: RegisterRequest):
    conn = get_connection()
    cur = conn.cursor()
    try:
        password_hash = bcrypt.hashpw(payload.password.encode(), bcrypt.gensalt()).decode()
        cur.execute(
            """INSERT INTO users (email, password_hash, full_name, role)
               VALUES (%s, %s, %s, %s) RETURNING id, email, full_name, role, created_at""",
            (payload.email, password_hash, payload.full_name, payload.role))
        new_user = cur.fetchone()
        conn.commit()
        return new_user
    except psycopg2.errors.UniqueViolation:
        conn.rollback()
        raise HTTPException(status_code=409, detail="An account with that email already exists")
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close(); conn.close()


@app.post("/api/auth/login")
def login(payload: LoginRequest):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE email = %s", (payload.email,))
    user = cur.fetchone()
    cur.close(); conn.close()

    if not user or not bcrypt.checkpw(payload.password.encode(), user["password_hash"].encode()):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    return {"id": user["id"], "email": user["email"], "full_name": user["full_name"], "role": user["role"]}

@app.post("/api/events/{event_id}/ticket-types", status_code=201)
def create_ticket_type(event_id: str, payload: TicketTypeCreate):
    if payload.total_quantity < 1:
        raise HTTPException(status_code=400, detail="total_quantity must be at least 1")
    if payload.price < 0:
        raise HTTPException(status_code=400, detail="price cannot be negative")
    if payload.seat_category not in (None, "premium", "standard", "accessible"):
        raise HTTPException(status_code=400, detail="seat_category must be premium, standard or accessible")
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT id FROM events WHERE id = %s", (event_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Event not found")
        cur.execute(
            """INSERT INTO ticket_types (event_id, name, description, price, total_quantity,
                                         quantity_available, seat_category, sales_start_time, sales_end_time)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING *""",
            (event_id, payload.name, payload.description, payload.price, payload.total_quantity,
             payload.total_quantity, payload.seat_category, payload.sales_start_time, payload.sales_end_time))
        ticket_type = cur.fetchone()
        conn.commit()
        return ticket_type
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        cur.close(); conn.close()


@app.get("/api/events/{event_id}/ticket-types")
def list_ticket_types(event_id: str):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM ticket_types WHERE event_id = %s ORDER BY price DESC, name", (event_id,))
    rows = cur.fetchall()
    cur.close(); conn.close()
    return rows


@app.post("/api/events/{event_id}/seats", status_code=201)
def create_seats(event_id: str, payload: SeatBlock):
    #creates a whole block of seats in one go, e.g. section A, 10 rows of 12
    #seats each, all "standard". call it once per section/category
    if payload.category not in ("premium", "standard", "accessible"):
        raise HTTPException(status_code=400, detail="category must be premium, standard or accessible")
    if payload.rows < 1 or payload.seats_per_row < 1 or payload.rows * payload.seats_per_row > 2000:
        raise HTTPException(status_code=400, detail="Use between 1 and 2000 seats per call")
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT id FROM events WHERE id = %s", (event_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Event not found")
        for row in range(payload.first_row_label, payload.first_row_label + payload.rows):
            for number in range(1, payload.seats_per_row + 1):
                cur.execute(
                    """INSERT INTO seats (event_id, section, row_label, seat_number, category)
                       VALUES (%s, %s, %s, %s, %s)""",
                    (event_id, payload.section, str(row), str(number), payload.category))
        cur.execute("UPDATE events SET has_assigned_seating = true WHERE id = %s", (event_id,))
        conn.commit()
        return {"created": payload.rows * payload.seats_per_row}
    except HTTPException:
        conn.rollback()
        raise
    except psycopg2.errors.UniqueViolation:
        conn.rollback()
        raise HTTPException(status_code=409, detail="Some of those seats already exist for this event")
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close(); conn.close()


@app.get("/api/events/{event_id}/seats")
def get_seats(event_id: str):
    #this is what the seat map screen actually renders from. every seat
    #for the event, plus whatever active hold or sold ticket currently
    #sits on top of it, so the frontend can color each one correctly
    conn = get_connection()
    cur = conn.cursor()
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
    rows = cur.fetchall()
    cur.close(); conn.close()
    return rows


@app.post("/api/seats/hold", status_code=201)
def hold_seat(payload: SeatHoldRequest):
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute("BEGIN")
        release_expired_holds(cur)

        cur.execute("SELECT id FROM seats WHERE id = %s", (payload.seat_id,))
        if not cur.fetchone():
            conn.rollback()
            raise HTTPException(status_code=404, detail="Seat not found")

        #same FOR UPDATE idea as checkout, locks this seat's existing
        #holds so two people clicking the same seat at the same instant
        #can't both succeed
        cur.execute(
            """SELECT * FROM seat_holds WHERE seat_id = %s AND status = 'active' FOR UPDATE""",
            (payload.seat_id,))
        existing = cur.fetchone()
        if existing:
            if str(existing["held_by_user_id"]) == payload.held_by_user_id:
                #same person clicking again, just hand back their hold
                conn.rollback()
                return existing
            conn.rollback()
            raise HTTPException(status_code=409, detail="Seat is already held by someone else")

        cur.execute(
            """SELECT id FROM tickets WHERE seat_id = %s AND status IN ('valid','checked_in')""",
            (payload.seat_id,))
        if cur.fetchone():
            conn.rollback()
            raise HTTPException(status_code=409, detail="Seat is already sold")

        #5-minute hold window, matches what the seat map screen shows as
        #a countdown timer in the UI
        cur.execute(
            """INSERT INTO seat_holds (seat_id, held_by_user_id, expires_at, status)
               VALUES (%s, %s, now() + interval '5 minutes', 'active')
               RETURNING *""",
            (payload.seat_id, payload.held_by_user_id))
        hold = cur.fetchone()
        conn.commit()
        return hold
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close(); conn.close()


@app.post("/api/auth/logout")
def logout():
    #there's no real session/token to invalidate yet, since login is
    #still the simplified stand-in version, so this exists mainly so the
    #frontend has a real endpoint to call, and to be honest about what
    #it does and doesn't do right now
    return {"message": "Logged out"}

@app.put("/api/events/{event_id}")
def update_event(event_id: str, payload: EventUpdate):
    #only touch the fields the caller actually sent. column names come from
    #this fixed list (never from user input), so building the SQL like this is safe
    changes = payload.model_dump(exclude_none=True)
    if not changes:
        raise HTTPException(status_code=400, detail="Nothing to update")
    conn = get_connection()
    cur = conn.cursor()
    try:
        set_clause = ", ".join(f"{col} = %s" for col in changes)
        cur.execute(
            f"UPDATE events SET {set_clause} WHERE id = %s RETURNING *",
            (*changes.values(), event_id))
        event = cur.fetchone()
        if not event:
            conn.rollback()
            raise HTTPException(status_code=404, detail="Event not found")
        conn.commit()
        return event
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        cur.close(); conn.close()


@app.post("/api/events/{event_id}/activate-paid")
def activate_paid_sales(event_id: str):
    #sandbox version: just flips the flag. no real identity or payout
    #verification, which the SRS allows as long as it's labelled a simulation
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute("UPDATE events SET is_paid_sales_active = true WHERE id = %s RETURNING *", (event_id,))
        event = cur.fetchone()
        if not event:
            conn.rollback()
            raise HTTPException(status_code=404, detail="Event not found")
        conn.commit()
        return event
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close(); conn.close()


@app.get("/api/events/{event_id}/export.ics")
def export_ics(event_id: str):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM events WHERE id = %s", (event_id,))
    event = cur.fetchone()
    cur.close(); conn.close()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    #calendar apps want times in UTC like 20261014T140000Z. if the organizer
    #never set an end_time we fall back to a 2 hour block
    from datetime import timedelta, timezone
    start = event["start_time"].astimezone(timezone.utc)
    if event["end_time"]:
        end = event["end_time"].astimezone(timezone.utc)
    else:
        end = start + timedelta(hours=2)
    fmt = "%Y%m%dT%H%M%SZ"

    def clean(text):
        return str(text).replace("\\", "\\\\").replace(",", "\\,").replace(";", "\\;").replace("\n", " ")

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//BiletFlow//EN",
        "BEGIN:VEVENT",
        f"UID:{event['id']}@biletflow",
        f"DTSTAMP:{start.strftime(fmt)}",
        f"DTSTART:{start.strftime(fmt)}",
        f"DTEND:{end.strftime(fmt)}",
        f"SUMMARY:{clean(event['title'])}",
        f"LOCATION:{clean(event['venue_name'])}",
        "END:VEVENT",
        "END:VCALENDAR",
    ]
    return Response(
        content="\r\n".join(lines) + "\r\n",
        media_type="text/calendar",
        headers={"Content-Disposition": f'attachment; filename="event-{event_id}.ics"'})


@app.get("/api/tickets/{ticket_id}/pdf")
def ticket_pdf(ticket_id: str):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        """SELECT tickets.*, events.title AS event_title, events.venue_name, events.start_time,
                  ticket_types.name AS ticket_type_name,
                  seats.section, seats.row_label, seats.seat_number
           FROM tickets
           JOIN events ON tickets.event_id = events.id
           JOIN ticket_types ON tickets.ticket_type_id = ticket_types.id
           LEFT JOIN seats ON tickets.seat_id = seats.id
           WHERE tickets.id = %s""", (ticket_id,))
    t = cur.fetchone()
    cur.close(); conn.close()
    if not t:
        raise HTTPException(status_code=404, detail="Ticket not found")

    #fpdf's built-in fonts only handle latin characters, so anything else
    #(cyrillic names, special dashes) gets swapped for "?" instead of crashing
    def safe(text):
        return str(text).encode("latin-1", "replace").decode("latin-1")

    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 22)
    pdf.cell(0, 14, "BiletFlow Ticket", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, safe(t["event_title"]), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 12)
    pdf.cell(0, 8, "Venue: " + safe(t["venue_name"]), new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 8, "Date: " + t["start_time"].strftime("%d %b %Y, %H:%M"), new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 8, "Attendee: " + safe(t["attendee_name"]), new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 8, "Ticket type: " + safe(t["ticket_type_name"]), new_x="LMARGIN", new_y="NEXT")
    if t["section"]:
        pdf.cell(0, 8, f"Seat: {t['section']}-{t['row_label']}{t['seat_number']}", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 8, "Status: " + t["status"], new_x="LMARGIN", new_y="NEXT")
    pdf.ln(6)
    pdf.set_font("Courier", "", 10)
    pdf.cell(0, 8, "Check-in code: " + t["qr_code_hash"], new_x="LMARGIN", new_y="NEXT")
    return Response(
        content=bytes(pdf.output()),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="ticket-{ticket_id}.pdf"'})


@app.post("/api/checkin/manual-search")
def manual_search(payload: ManualSearchRequest):
    #for when a QR code won't scan: find people by (part of) their name
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        """SELECT tickets.id, tickets.attendee_name, tickets.status, tickets.qr_code_hash,
                  ticket_types.name AS ticket_type_name
           FROM tickets JOIN ticket_types ON tickets.ticket_type_id = ticket_types.id
           WHERE tickets.event_id = %s AND tickets.attendee_name ILIKE %s
           ORDER BY tickets.attendee_name""",
        (payload.event_id, "%" + payload.name + "%"))
    rows = cur.fetchall()
    cur.close(); conn.close()
    return rows


@app.post("/api/checkin/verify-qr")
def verify_qr(payload: CheckinRequest):
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT * FROM tickets WHERE qr_code_hash = %s FOR UPDATE", (payload.qr_code_hash,))
        ticket = cur.fetchone()

        if not ticket:
            conn.rollback()
            raise HTTPException(status_code=404, detail="Not a valid ticket")

        if ticket["status"] == "checked_in":
            conn.rollback()
            return {"result": "already_checked_in", "attendee_name": ticket["attendee_name"]}

        if ticket["status"] in ("cancelled", "refunded"):
            conn.rollback()
            return {"result": ticket["status"], "attendee_name": ticket["attendee_name"]}

        cur.execute("UPDATE tickets SET status = 'checked_in' WHERE id = %s", (ticket["id"],))
        cur.execute("INSERT INTO checkin_records (ticket_id, checked_in_by) VALUES (%s, %s)",
                    (ticket["id"], payload.checked_in_by))
        conn.commit()
        return {"result": "valid", "attendee_name": ticket["attendee_name"]}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close(); conn.close()