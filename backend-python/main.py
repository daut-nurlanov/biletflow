import uuid
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import psycopg2
import psycopg2.extras
import bcrypt

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_connection():
    return psycopg2.connect(
        host="localhost", port=5432, user="postgres", password="devpassword",
        dbname="biletflow", cursor_factory=psycopg2.extras.RealDictCursor,
    )


class EventCreate(BaseModel):
    organizer_id: str
    title: str
    venue_name: str
    start_time: str
    capacity: int | None = 100


class CheckoutRequest(BaseModel):
    attendee_id: str
    event_id: str
    ticket_type_id: str
    attendee_name: str
    seat_id: str | None = None


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

class SeatHoldRequest(BaseModel):
    seat_id: str
    held_by_user_id: str


@app.get("/api/events")
def list_events(organizer_id: str | None = None):
    conn = get_connection()
    cur = conn.cursor()
    if organizer_id:
        cur.execute("SELECT * FROM events WHERE organizer_id = %s ORDER BY start_time", (organizer_id,))
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
            """INSERT INTO events (organizer_id, title, venue_name, start_time, capacity)
               VALUES (%s, %s, %s, %s, %s) RETURNING *""",
            (payload.organizer_id, payload.title, payload.venue_name, payload.start_time, payload.capacity),
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
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute("BEGIN")
        cur.execute("SELECT * FROM ticket_types WHERE id = %s FOR UPDATE", (payload.ticket_type_id,))
        ticket_type = cur.fetchone()
        if not ticket_type:
            conn.rollback()
            raise HTTPException(status_code=404, detail="Ticket type not found")
        if ticket_type["quantity_available"] <= 0:
            conn.rollback()
            raise HTTPException(status_code=409, detail="Sold out")
        if payload.seat_id:
            cur.execute(
                """SELECT id FROM tickets WHERE seat_id = %s AND status IN ('valid','checked_in') FOR UPDATE""",
                (payload.seat_id,))
            if cur.fetchone():
                conn.rollback()
                raise HTTPException(status_code=409, detail="That seat is already taken")
        payment_ref = "SANDBOX-" + str(uuid.uuid4())[:8]
        cur.execute(
            """INSERT INTO orders (attendee_id, event_id, total_amount, status, payment_reference)
               VALUES (%s, %s, %s, 'paid', %s) RETURNING *""",
            (payload.attendee_id, payload.event_id, ticket_type["price"], payment_ref))
        order = cur.fetchone()
        qr_hash = str(uuid.uuid4())
        cur.execute(
            """INSERT INTO tickets (order_id, event_id, ticket_type_id, seat_id, attendee_name, qr_code_hash, status)
               VALUES (%s, %s, %s, %s, %s, %s, 'valid') RETURNING *""",
            (order["id"], payload.event_id, payload.ticket_type_id, payload.seat_id, payload.attendee_name, qr_hash))
        ticket = cur.fetchone()
        cur.execute("UPDATE ticket_types SET quantity_available = quantity_available - 1 WHERE id = %s",
                    (payload.ticket_type_id,))
        conn.commit()
        return {"order": order, "ticket": ticket}
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

        #same FOR UPDATE idea as checkout, locks this seat's existing
        #holds so two people clicking the same seat at the same instant
        #can't both succeed
        cur.execute(
            """SELECT id FROM seat_holds WHERE seat_id = %s AND status = 'active' FOR UPDATE""",
            (payload.seat_id,))
        if cur.fetchone():
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