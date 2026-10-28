import io
import os
import uuid
from decimal import Decimal
from zoneinfo import ZoneInfo

import segno
from fastapi import APIRouter, Depends, HTTPException, Response
from fpdf import FPDF
from pydantic import BaseModel

from db import audit, notify, release_expired_holds, tx
from security import can_manage, current_user, load_event, optional_user, resolve_actor

router = APIRouter()

TIMEZONE = ZoneInfo(os.getenv("DISPLAY_TIMEZONE", "Asia/Almaty"))
FONT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "fonts")


class CheckoutRequest(BaseModel):
    attendee_id: str | None = None
    event_id: str
    ticket_type_id: str
    attendee_name: str
    seat_id: str | None = None
    quantity: int = 1
    promo_code: str | None = None


class QuoteRequest(BaseModel):
    event_id: str
    ticket_type_id: str
    quantity: int = 1
    promo_code: str | None = None


class RefundRequest(BaseModel):
    reason: str | None = None


def price_order(cur, event, ticket_type, quantity, promo_code, lock):
    """Every rule about whether something can be bought and what it costs.
    Used by both the price preview (quote) and the real checkout, so the two
    can never disagree. Raises HTTPException with a clear message if not allowed."""
    if ticket_type["is_hidden"]:
        raise HTTPException(status_code=409, detail="That ticket type is not available")
    if quantity < 1:
        raise HTTPException(status_code=400, detail="Quantity must be at least 1")
    if quantity > ticket_type["max_per_order"]:
        raise HTTPException(status_code=400,
                            detail=f"You can buy at most {ticket_type['max_per_order']} of this ticket type per order")
    if event["status"] not in ("upcoming", "active"):
        raise HTTPException(status_code=409, detail="This event is not on sale")
    if ticket_type["price"] > 0:
        if event["paid_sales_suspended"]:
            raise HTTPException(status_code=403, detail="Paid sales for this event were suspended by BiletFlow")
        if not event["is_paid_sales_active"]:
            raise HTTPException(status_code=403, detail="Paid sales are not active for this event")

    cur.execute("SELECT now() AS now")
    now = cur.fetchone()["now"]
    if ticket_type["sales_start_time"] and now < ticket_type["sales_start_time"]:
        raise HTTPException(status_code=409, detail="Sales for this ticket type have not started yet")
    if ticket_type["sales_end_time"] and now > ticket_type["sales_end_time"]:
        raise HTTPException(status_code=409, detail="Sales for this ticket type have ended")

    if ticket_type["quantity_available"] <= 0:
        raise HTTPException(status_code=409, detail="Sold out")
    if ticket_type["quantity_available"] < quantity:
        raise HTTPException(status_code=409, detail=f"Only {ticket_type['quantity_available']} left for this ticket type")

    subtotal = ticket_type["price"] * quantity
    discount = Decimal("0")
    campaign = None
    if promo_code:
        cur.execute(
            "SELECT *, ticket_type_ids::text[] AS ticket_type_ids FROM promo_campaigns WHERE code = %s AND event_id = %s" + (" FOR UPDATE" if lock else ""),
            (promo_code.strip().upper(), event["id"]))
        campaign = cur.fetchone()
        if not campaign:
            raise HTTPException(status_code=404, detail="Invalid promo code")
        if not campaign["is_active"]:
            raise HTTPException(status_code=409, detail="This promo code has been disabled")
        if campaign["ticket_type_ids"] and str(ticket_type["id"]) not in [str(i) for i in campaign["ticket_type_ids"]]:
            raise HTTPException(status_code=409, detail="This promo code does not apply to this ticket type")
        if (campaign["valid_from"] and now < campaign["valid_from"]) or \
           (campaign["valid_until"] and now > campaign["valid_until"]):
            raise HTTPException(status_code=409, detail="This promo code is not valid right now")
        if campaign["redemptions_count"] >= campaign["max_redemptions"]:
            raise HTTPException(status_code=409, detail="This promo code has been fully used")
        if campaign["discount_type"] == "percentage":
            discount = (subtotal * campaign["discount_value"] / 100).quantize(Decimal("0.01"))
        else:
            discount = min(campaign["discount_value"], subtotal)
    return {"subtotal": subtotal, "discount": discount, "total": subtotal - discount,
            "campaign": campaign, "now": now}


@router.post("/api/orders/quote")
def quote(payload: QuoteRequest):
    #shows the attendee the code, the discount and the final total BEFORE they
    #pay. the server does the math, the app never decides a price itself
    with tx() as cur:
        event = load_event(cur, payload.event_id)
        cur.execute("SELECT * FROM ticket_types WHERE id = %s AND event_id = %s", (payload.ticket_type_id, payload.event_id))
        ticket_type = cur.fetchone()
        if not ticket_type:
            raise HTTPException(status_code=404, detail="Ticket type not found for this event")
        priced = price_order(cur, event, ticket_type, payload.quantity, payload.promo_code, lock=False)
    return {"quantity": payload.quantity, "unit_price": ticket_type["price"], "subtotal": priced["subtotal"],
            "promo_code": priced["campaign"]["code"] if priced["campaign"] else None,
            "discount": priced["discount"], "total": priced["total"], "currency": "KZT"}


@router.post("/api/orders/checkout", status_code=201)
def checkout(payload: CheckoutRequest, user=Depends(optional_user)):
    attendee_id = resolve_actor(user, payload.attendee_id)
    if payload.quantity < 1 or payload.quantity > 50:
        raise HTTPException(status_code=400, detail="Quantity must be at least 1")
    if payload.seat_id and payload.quantity != 1:
        raise HTTPException(status_code=400, detail="Seats are bought one ticket at a time")

    with tx() as cur:
        release_expired_holds(cur)

        #lock the ticket type row first, so two buyers racing for the last
        #ticket take turns instead of both succeeding
        cur.execute("SELECT * FROM ticket_types WHERE id = %s FOR UPDATE", (payload.ticket_type_id,))
        ticket_type = cur.fetchone()
        if not ticket_type:
            raise HTTPException(status_code=404, detail="Ticket type not found")
        if str(ticket_type["event_id"]) != payload.event_id:
            raise HTTPException(status_code=400, detail="That ticket type does not belong to this event")
        event = load_event(cur, payload.event_id)

        cur.execute("SELECT id FROM users WHERE id = %s", (attendee_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Attendee not found")

        priced = price_order(cur, event, ticket_type, payload.quantity, payload.promo_code, lock=True)
        campaign = priced["campaign"]

        if payload.seat_id:
            cur.execute("SELECT * FROM seats WHERE id = %s AND event_id = %s FOR UPDATE", (payload.seat_id, payload.event_id))
            seat = cur.fetchone()
            if not seat:
                raise HTTPException(status_code=404, detail="Seat not found for this event")
            if ticket_type["seat_category"] and seat["category"] != ticket_type["seat_category"]:
                raise HTTPException(status_code=409, detail="That seat does not match this ticket type")
            cur.execute(
                "SELECT id FROM tickets WHERE seat_id = %s AND status IN ('valid','checked_in') FOR UPDATE",
                (payload.seat_id,))
            if cur.fetchone():
                raise HTTPException(status_code=409, detail="That seat is already taken")

            #if somebody else is holding this seat right now, it's theirs.
            #if the buyer is the one holding it, the hold turns into a ticket
            cur.execute("SELECT * FROM seat_holds WHERE seat_id = %s AND status = 'active' FOR UPDATE", (payload.seat_id,))
            hold = cur.fetchone()
            if hold and str(hold["held_by_user_id"]) != attendee_id:
                raise HTTPException(status_code=409, detail="That seat is being held by someone else")
            if hold:
                cur.execute("UPDATE seat_holds SET status = 'converted' WHERE id = %s", (hold["id"],))

        payment_ref = "SANDBOX-" + str(uuid.uuid4())[:8]
        cur.execute(
            """INSERT INTO orders (attendee_id, event_id, total_amount, status, payment_reference, promo_code_applied)
               VALUES (%s, %s, %s, 'paid', %s, %s) RETURNING *""",
            (attendee_id, payload.event_id, priced["total"], payment_ref, campaign["code"] if campaign else None))
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
                        (campaign["id"], order["id"], priced["discount"]))
            cur.execute("UPDATE promo_campaigns SET redemptions_count = redemptions_count + 1 WHERE id = %s",
                        (campaign["id"],))
        audit(cur, attendee_id, payload.event_id, "order_paid",
              f"Order of {payload.quantity} ticket(s), {priced['total']} KZT (simulated payment {payment_ref})",
              "order", order["id"])
        notify(cur, attendee_id, "order_confirmation", f"Your tickets for {event['title']}",
               f"Order {order['id']} confirmed: {payload.quantity} ticket(s), total {priced['total']} KZT. "
               "Your QR tickets are in My Tickets.")
        #"ticket" (the first one) is kept so older clients keep working
        return {"order": order, "ticket": tickets[0], "tickets": tickets}


TICKET_DETAIL_SQL = """
    SELECT tickets.*, events.title AS event_title, events.venue_name, events.venue_address,
           events.start_time, events.end_time, events.status AS event_status,
           ticket_types.name AS ticket_type_name,
           seats.section, seats.row_label, seats.seat_number
    FROM tickets
    JOIN events ON tickets.event_id = events.id
    JOIN ticket_types ON tickets.ticket_type_id = ticket_types.id
    LEFT JOIN seats ON tickets.seat_id = seats.id
"""


#this one has to be defined BEFORE /api/tickets/{ticket_id} below it.
#FastAPI checks routes top to bottom and uses the first match, so if
#{ticket_id} came first, it would grab "my-tickets" as if it were an
#actual ticket's id and never let this one run at all.
#always put the more specific, fixed-word route above the generic {id} one
@router.get("/api/tickets/my-tickets")
def my_tickets(attendee_id: str | None = None, user=Depends(optional_user)):
    attendee = resolve_actor(user, attendee_id)
    with tx() as cur:
        cur.execute(
            TICKET_DETAIL_SQL + """JOIN orders ON tickets.order_id = orders.id
               WHERE orders.attendee_id = %s ORDER BY events.start_time""", (attendee,))
        return cur.fetchall()


@router.get("/api/tickets/{ticket_id}")
def get_ticket(ticket_id: str):
    #ticket ids are long random values, so knowing one is what lets you open it
    with tx() as cur:
        cur.execute(TICKET_DETAIL_SQL + " WHERE tickets.id = %s", (ticket_id,))
        ticket = cur.fetchone()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return ticket


def qr_png(text, scale=8, dark="black"):
    buf = io.BytesIO()
    segno.make(text, error="h").save(buf, kind="png", scale=scale, border=3, dark=dark)
    return buf.getvalue()


@router.get("/api/tickets/{ticket_id}/qr.png")
def ticket_qr(ticket_id: str):
    with tx() as cur:
        cur.execute("SELECT qr_code_hash FROM tickets WHERE id = %s", (ticket_id,))
        ticket = cur.fetchone()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return Response(content=qr_png(ticket["qr_code_hash"]), media_type="image/png")


@router.get("/api/tickets/{ticket_id}/pdf")
def ticket_pdf(ticket_id: str):
    with tx() as cur:
        cur.execute(TICKET_DETAIL_SQL + " WHERE tickets.id = %s", (ticket_id,))
        t = cur.fetchone()
    if not t:
        raise HTTPException(status_code=404, detail="Ticket not found")

    pdf = FPDF(format="A4")
    pdf.set_auto_page_break(False)
    pdf.add_page()
    #DejaVu is bundled so Kazakh and Russian names print correctly. the
    #built-in PDF fonts only know Latin letters
    try:
        pdf.add_font("DejaVu", "", os.path.join(FONT_DIR, "DejaVuSans.ttf"))
        pdf.add_font("DejaVu", "B", os.path.join(FONT_DIR, "DejaVuSans-Bold.ttf"))
        family, safe = "DejaVu", (lambda s: str(s))
    except Exception:
        family, safe = "Helvetica", (lambda s: str(s).encode("latin-1", "replace").decode("latin-1"))

    def line(label, value, size=13):
        pdf.set_font(family, "B", size)
        pdf.cell(42, 9, safe(label))
        pdf.set_font(family, "", size)
        pdf.multi_cell(0, 9, safe(value), new_x="LMARGIN", new_y="NEXT")

    start = t["start_time"].astimezone(TIMEZONE)
    pdf.set_font(family, "B", 26)
    pdf.cell(0, 14, "BiletFlow", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font(family, "B", 20)
    pdf.multi_cell(0, 10, safe(t["event_title"]), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)
    line("Date and time", start.strftime("%d.%m.%Y, %H:%M") + " (Almaty time)")
    line("Venue", t["venue_name"] + (", " + t["venue_address"] if t["venue_address"] else ""))
    line("Ticket type", t["ticket_type_name"])
    line("Attendee", t["attendee_name"])
    if t["section"]:
        line("Seat", f"Section {t['section']}, row {t['row_label']}, seat {t['seat_number']}")
    line("Status", t["status"])
    #one big black-on-white QR so it scans from paper, even printed in grayscale
    pdf.image(io.BytesIO(qr_png(t["qr_code_hash"], scale=10)), x=55, y=pdf.get_y() + 8, w=100)
    pdf.set_y(pdf.get_y() + 112)
    pdf.set_font("Courier", "", 9)
    pdf.cell(0, 6, "Ticket ID: " + str(t["id"]), align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font(family, "", 9)
    pdf.cell(0, 6, "Digital and printed copies of this ticket are the same ticket and admit one person once.",
             align="C", new_x="LMARGIN", new_y="NEXT")
    return Response(
        content=bytes(pdf.output()), media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="ticket-{ticket_id}.pdf"'})


@router.get("/api/orders/my-orders")
def my_orders(user=Depends(current_user)):
    with tx() as cur:
        cur.execute(
            """SELECT orders.*, events.title AS event_title, events.start_time,
                      (SELECT count(*) FROM tickets WHERE tickets.order_id = orders.id) AS ticket_count
               FROM orders JOIN events ON orders.event_id = events.id
               WHERE orders.attendee_id = %s ORDER BY orders.created_at DESC""", (user["id"],))
        return cur.fetchall()


def _load_order_for(cur, order_id, user, lock=False):
    cur.execute("SELECT * FROM orders WHERE id = %s" + (" FOR UPDATE" if lock else ""), (order_id,))
    order = cur.fetchone()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    event = load_event(cur, order["event_id"])
    is_owner = str(order["attendee_id"]) == str(user["id"])
    if not (is_owner or can_manage(user, event)):
        raise HTTPException(status_code=403, detail="You do not have access to this order")
    return order, event, is_owner


@router.get("/api/orders/{order_id}")
def get_order(order_id: str, user=Depends(current_user)):
    with tx() as cur:
        order, event, _ = _load_order_for(cur, order_id, user)
        cur.execute(TICKET_DETAIL_SQL + " WHERE tickets.order_id = %s", (order_id,))
        order = dict(order)
        order["tickets"] = cur.fetchall()
        cur.execute("SELECT * FROM refunds WHERE order_id = %s ORDER BY created_at", (order_id,))
        order["refunds"] = cur.fetchall()
        return order


def _release_order(cur, order_id, new_ticket_status):
    #tickets stop working, and their inventory goes back on sale. a ticket whose
    #status is no longer valid/checked_in also frees its seat automatically
    cur.execute("SELECT ticket_type_id, count(*) AS n FROM tickets WHERE order_id = %s GROUP BY ticket_type_id", (order_id,))
    for row in cur.fetchall():
        cur.execute("UPDATE ticket_types SET quantity_available = LEAST(total_quantity, quantity_available + %s) WHERE id = %s",
                    (row["n"], row["ticket_type_id"]))
    cur.execute("UPDATE tickets SET status = %s WHERE order_id = %s", (new_ticket_status, order_id))


@router.post("/api/orders/{order_id}/refund")
def refund_order(order_id: str, payload: RefundRequest | None = None, user=Depends(current_user)):
    #full refunds only (partial refunds are out of scope in the SRS)
    with tx() as cur:
        order, event, _ = _load_order_for(cur, order_id, user, lock=True)
        if not can_manage(user, event):
            raise HTTPException(status_code=403, detail="Only the event's organizer can refund an order")
        if order["status"] != "paid":
            raise HTTPException(status_code=409, detail=f"This order is already {order['status']}")
        if order["total_amount"] <= 0:
            raise HTTPException(status_code=409, detail="This is a free registration, use cancel instead of refund")
        cur.execute("SELECT count(*) AS n FROM tickets WHERE order_id = %s AND status = 'checked_in'", (order_id,))
        if cur.fetchone()["n"] > 0:
            raise HTTPException(status_code=409, detail="Some tickets were already used at the door, so the order cannot be refunded")
        _release_order(cur, order_id, "refunded")
        cur.execute("UPDATE orders SET status = 'refunded' WHERE id = %s RETURNING *", (order_id,))
        updated = cur.fetchone()
        reason = payload.reason if payload else None
        cur.execute(
            "INSERT INTO refunds (order_id, amount, reason, issued_by) VALUES (%s, %s, %s, %s) RETURNING *",
            (order_id, order["total_amount"], reason, user["id"]))
        refund = cur.fetchone()
        audit(cur, user["id"], order["event_id"], "order_refunded",
              f"Order {order_id} refunded {order['total_amount']} KZT (simulated)", "order", order_id)
        notify(cur, order["attendee_id"], "refund_completed", f"Refund for {event['title']}",
               f"Your order was refunded: {order['total_amount']} KZT (simulated). The tickets are no longer valid.")
        return {"order": updated, "refund": refund}


@router.post("/api/orders/{order_id}/cancel")
def cancel_order(order_id: str, user=Depends(current_user)):
    #cancelling a FREE registration. the attendee can cancel their own, the
    #organizer can cancel anyone's. paid orders go through refund instead
    with tx() as cur:
        order, event, _ = _load_order_for(cur, order_id, user, lock=True)
        if order["status"] != "paid":
            raise HTTPException(status_code=409, detail=f"This order is already {order['status']}")
        if order["total_amount"] > 0:
            raise HTTPException(status_code=409, detail="This order was paid for, ask the organizer for a refund")
        cur.execute("SELECT count(*) AS n FROM tickets WHERE order_id = %s AND status = 'checked_in'", (order_id,))
        if cur.fetchone()["n"] > 0:
            raise HTTPException(status_code=409, detail="Some tickets were already used at the door")
        _release_order(cur, order_id, "cancelled")
        cur.execute("UPDATE orders SET status = 'cancelled' WHERE id = %s RETURNING *", (order_id,))
        updated = cur.fetchone()
        audit(cur, user["id"], order["event_id"], "registration_cancelled",
              f"Free registration {order_id} cancelled", "order", order_id)
        if str(order["attendee_id"]) != str(user["id"]):
            notify(cur, order["attendee_id"], "registration_cancelled", f"Your registration for {event['title']} was cancelled",
                   "The organizer cancelled your free registration.")
        return updated
