import re
import uuid
from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from db import audit, get_setting, notify, tx
from security import assert_manager, day_range, require_roles

router = APIRouter()

#where an event is in its life, worked out from its status and its dates
PHASE_SQL = """CASE
    WHEN e.status = 'cancelled' THEN 'cancelled'
    WHEN e.status = 'draft' THEN 'draft'
    WHEN e.status = 'suspended' THEN 'suspended'
    WHEN e.status = 'completed' OR COALESCE(e.end_time, e.start_time + interval '2 hours') < now() THEN 'completed'
    WHEN e.status = 'active' OR e.start_time <= now() THEN 'active'
    ELSE 'upcoming' END"""


class ProfileUpdate(BaseModel):
    contact_phone: str | None = None
    payout_account_details: str | None = None


class ActivateRequest(BaseModel):
    accept_terms: bool = False


def _valid_contact_phone(value):
    phone = (value or "").strip()
    return (len(phone) <= 40 and bool(re.fullmatch(r"\+?[0-9()\s.-]+", phone))
            and len(re.findall(r"[0-9]", phone)) >= 7)


def _valid_payout_account(value):
    # This is a simulated account field. Existing payouts may use local bank
    # descriptions rather than an IBAN.
    return 0 < len((value or "").strip()) <= 200


@router.get("/api/organizer/profile")
def get_profile(user=Depends(require_roles("organizer"))):
    with tx() as cur:
        cur.execute("SELECT * FROM organizer_profiles WHERE user_id = %s", (user["id"],))
        profile = cur.fetchone()
        if not profile:
            cur.execute("INSERT INTO organizer_profiles (user_id) VALUES (%s) ON CONFLICT (user_id) DO NOTHING",
                        (user["id"],))
            cur.execute("SELECT * FROM organizer_profiles WHERE user_id = %s", (user["id"],))
            profile = cur.fetchone()
        return profile


@router.put("/api/organizer/profile")
def update_profile(payload: ProfileUpdate, user=Depends(require_roles("organizer"))):
    phone = payload.contact_phone.strip() if payload.contact_phone is not None else None
    payout = payload.payout_account_details.strip() if payload.payout_account_details is not None else None
    if phone is not None and not _valid_contact_phone(phone):
        raise HTTPException(status_code=400, detail="Enter a contact phone with at least 7 digits (at most 40 characters)")
    if payout is not None and not _valid_payout_account(payout):
        raise HTTPException(status_code=400, detail="Enter a payout account (at most 200 characters)")
    with tx() as cur:
        cur.execute(
            """INSERT INTO organizer_profiles (user_id, contact_phone, payout_account_details)
               VALUES (%s, %s, %s)
               ON CONFLICT (user_id) DO UPDATE SET
                 contact_phone = COALESCE(EXCLUDED.contact_phone, organizer_profiles.contact_phone),
                 payout_account_details = COALESCE(EXCLUDED.payout_account_details, organizer_profiles.payout_account_details)
               RETURNING *""",
            (user["id"], phone, payout))
        return cur.fetchone()


@router.post("/api/organizer/profile/verify")
def verify_identity(user=Depends(require_roles("organizer"))):
    #SIMULATION: a real platform would check an ID document here. we only check
    #that the contact and payout details were filled in, then mark the profile verified
    with tx() as cur:
        cur.execute("SELECT * FROM organizer_profiles WHERE user_id = %s FOR UPDATE", (user["id"],))
        profile = cur.fetchone()
        if not profile or not (_valid_contact_phone(profile["contact_phone"]) and
                               _valid_payout_account(profile["payout_account_details"])):
            raise HTTPException(status_code=409, detail="Save a valid contact phone and payout account first")
        cur.execute("UPDATE organizer_profiles SET paid_sales_verified = true WHERE user_id = %s RETURNING *", (user["id"],))
        verified = cur.fetchone()
        audit(cur, user["id"], None, "identity_verified", "Organizer identity verified (simulated)", "user", user["id"])
        return verified


def build_checklist(cur, event, *, lock_profile=False):
    cur.execute("SELECT * FROM organizer_profiles WHERE user_id = %s" + (" FOR SHARE" if lock_profile else ""),
                (event["organizer_id"],))
    profile = cur.fetchone() or {}
    payout_ready = _valid_payout_account(profile.get("payout_account_details"))
    identity_ready = (profile.get("paid_sales_verified") is True
                      and _valid_contact_phone(profile.get("contact_phone")) and payout_ready)
    cur.execute("SELECT count(*) AS n FROM ticket_types WHERE event_id = %s AND price > 0", (event["id"],))
    has_paid = cur.fetchone()["n"] > 0
    cur.execute("SELECT * FROM paid_sales_activations WHERE event_id = %s", (event["id"],))
    activation = cur.fetchone()
    items = [
        {"key": "paid_ticket_type", "label": "Create at least one paid ticket type", "done": has_paid},
        {"key": "identity_verified", "label": "Complete identity verification", "done": identity_ready},
        {"key": "payout_account", "label": "Add a payout account", "done": payout_ready},
        {"key": "fee_paid", "label": "Pay the activation fee", "done": activation is not None},
        {"key": "terms_accepted", "label": "Accept the paid-event terms", "done": activation is not None},
    ]
    return items


@router.get("/api/events/{event_id}/activation-checklist")
def activation_checklist(event_id: str, user=Depends(require_roles("organizer", "platform_admin"))):
    with tx() as cur:
        event = assert_manager(cur, user, event_id)
        fee = get_setting(cur, "activation_fee", "5000")
        items = build_checklist(cur, event)
    return {"event_id": event_id, "activation_fee": fee, "currency": "KZT", "items": items,
            "paid_sales_active": event["is_paid_sales_active"], "suspended_by_admin": event["paid_sales_suspended"]}


@router.post("/api/events/{event_id}/activate-paid")
def activate_paid_sales(event_id: str, payload: ActivateRequest, user=Depends(require_roles("organizer"))):
    #the fee payment is a labelled simulation: no money moves, we only record that it "happened"
    with tx() as cur:
        event = assert_manager(cur, user, event_id, lock=True)
        if event["paid_sales_suspended"]:
            raise HTTPException(status_code=403, detail="Paid sales for this event were suspended by BiletFlow")
        if event["is_paid_sales_active"]:
            raise HTTPException(status_code=409, detail="Paid sales are already active for this event")
        if not payload.accept_terms:
            raise HTTPException(status_code=400, detail="You must accept the paid-event terms")
        missing = [i["label"] for i in build_checklist(cur, event, lock_profile=True)
                   if i["key"] in ("paid_ticket_type", "identity_verified", "payout_account") and not i["done"]]
        if missing:
            raise HTTPException(status_code=409, detail="Not ready yet: " + "; ".join(missing))
        fee = Decimal(get_setting(cur, "activation_fee", "5000"))
        reference = "SANDBOX-FEE-" + str(uuid.uuid4())[:8]
        cur.execute(
            "INSERT INTO paid_sales_activations (event_id, activated_by, fee_amount, fee_reference) VALUES (%s, %s, %s, %s)",
            (event_id, user["id"], fee, reference))
        cur.execute("UPDATE events SET is_paid_sales_active = true WHERE id = %s RETURNING *", (event_id,))
        activated = cur.fetchone()
        audit(cur, user["id"], event_id, "paid_sales_activated",
              f"Paid sales activated, fee {fee} KZT (simulated, {reference})", "event", event_id)
        return activated


@router.get("/api/organizer/events")
def organizer_events(phase: str | None = None, user=Depends(require_roles("organizer"))):
    #the organizer's dashboard list. each event comes with its phase (draft,
    #upcoming, active, completed, cancelled, suspended) and quick sales numbers
    with tx() as cur:
        cur.execute(
            f"""SELECT * FROM (
                  SELECT e.*, {PHASE_SQL} AS phase,
                    (SELECT COALESCE(sum(total_quantity), 0) FROM ticket_types WHERE event_id = e.id) AS tickets_total,
                    (SELECT count(*) FROM tickets WHERE event_id = e.id AND status IN ('valid','checked_in')) AS tickets_sold,
                    (SELECT count(*) FROM tickets WHERE event_id = e.id AND status = 'checked_in') AS tickets_checked_in,
                    (SELECT COALESCE(sum(total_amount), 0) FROM orders WHERE event_id = e.id AND status = 'paid') AS net_revenue
                  FROM events e WHERE e.organizer_id = %s) x
                WHERE (%s IS NULL OR phase = %s)
                ORDER BY start_time DESC""", (user["id"], phase, phase))
        return cur.fetchall()


@router.get("/api/events/{event_id}/attendees")
def attendee_list(event_id: str, ticket_type_id: str | None = None, status: str | None = None, q: str | None = None,
                  user=Depends(require_roles("organizer", "platform_admin"))):
    with tx() as cur:
        assert_manager(cur, user, event_id)
        cur.execute(
            """SELECT t.id AS ticket_id, t.attendee_name, u.email, tt.name AS ticket_type, t.status,
                      s.section, s.row_label, s.seat_number, o.id AS order_id, o.created_at AS ordered_at,
                      (SELECT max(checked_in_at) FROM checkin_records c WHERE c.ticket_id = t.id AND NOT c.reversed) AS checked_in_at
               FROM tickets t
               JOIN orders o ON t.order_id = o.id
               JOIN users u ON o.attendee_id = u.id
               JOIN ticket_types tt ON t.ticket_type_id = tt.id
               LEFT JOIN seats s ON t.seat_id = s.id
               WHERE t.event_id = %(e)s
                 AND (%(tt)s::uuid IS NULL OR t.ticket_type_id = %(tt)s::uuid)
                 AND (%(st)s IS NULL OR t.status = %(st)s)
                 AND (%(q)s IS NULL OR t.attendee_name ILIKE %(q)s OR u.email ILIKE %(q)s)
               ORDER BY t.attendee_name""",
            {"e": event_id, "tt": ticket_type_id, "st": status, "q": f"%{q}%" if q else None})
        return cur.fetchall()


@router.get("/api/events/{event_id}/orders")
def event_orders(event_id: str, status: str | None = None, user=Depends(require_roles("organizer", "platform_admin"))):
    with tx() as cur:
        assert_manager(cur, user, event_id)
        cur.execute(
            """SELECT o.*, u.email, u.full_name,
                      (SELECT count(*) FROM tickets WHERE order_id = o.id) AS ticket_count
               FROM orders o JOIN users u ON o.attendee_id = u.id
               WHERE o.event_id = %s AND (%s IS NULL OR o.status = %s)
               ORDER BY o.created_at DESC""", (event_id, status, status))
        return cur.fetchall()


@router.get("/api/events/{event_id}/analytics")
def analytics(event_id: str, date_from: str | None = None, date_to: str | None = None,
              ticket_type_id: str | None = None, user=Depends(require_roles("organizer", "platform_admin"))):
    """Sales use order purchase dates; inventory is a current snapshot."""
    date_start, date_end = day_range(date_from, date_to)
    if date_start and date_end and date_start >= date_end:
        raise HTTPException(status_code=400, detail="date_from must not be after date_to")
    p = {"e": event_id, "f": date_start, "t": date_end, "tt": ticket_type_id}
    selected_orders = """WITH selected_orders AS (
        SELECT o.*, COALESCE(r.discount_amount, 0) AS discount_amount
        FROM orders o
        LEFT JOIN (SELECT order_id, sum(discount_amount) AS discount_amount
                   FROM promo_redemptions GROUP BY order_id) r ON r.order_id = o.id
        WHERE o.event_id = %(e)s
          AND (%(f)s::timestamptz IS NULL OR o.created_at >= %(f)s::timestamptz)
          AND (%(t)s::timestamptz IS NULL OR o.created_at < %(t)s::timestamptz)
          AND (%(tt)s::uuid IS NULL OR EXISTS (
              SELECT 1 FROM tickets WHERE order_id = o.id AND ticket_type_id = %(tt)s::uuid))
    ) """
    with tx() as cur:
        #one snapshot keeps totals and breakdowns consistent during concurrent checkout
        cur.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        event = assert_manager(cur, user, event_id)
        if ticket_type_id:
            cur.execute("SELECT id FROM ticket_types WHERE event_id = %s AND id = %s", (event_id, ticket_type_id))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Ticket type not found for this event")
        cur.execute("SELECT now() AS generated_at")
        generated_at = cur.fetchone()["generated_at"]

        cur.execute("""SELECT COALESCE(sum(total_quantity), 0) AS capacity,
                              COALESCE(sum(quantity_available), 0) AS remaining,
                              (SELECT count(*) FROM tickets WHERE event_id = %(e)s
                               AND status IN ('valid','checked_in')
                               AND (%(tt)s::uuid IS NULL OR ticket_type_id = %(tt)s::uuid)) AS sold
                       FROM ticket_types WHERE event_id = %(e)s
                       AND (%(tt)s::uuid IS NULL OR id = %(tt)s::uuid)""", p)
        stock = cur.fetchone()
        cur.execute(selected_orders + """
            SELECT count(*) FILTER (WHERE t.status IN ('valid','checked_in')) AS sold,
                   count(*) FILTER (WHERE t.status = 'refunded') AS refunded,
                   count(*) FILTER (WHERE t.status = 'checked_in') AS checked_in,
                   count(*) FILTER (WHERE t.status = 'valid') AS not_arrived
            FROM tickets t JOIN selected_orders o ON t.order_id = o.id
            WHERE (%(tt)s::uuid IS NULL OR t.ticket_type_id = %(tt)s::uuid)""", p)
        tickets = cur.fetchone()
        #seat holds have no ticket_type_id, so their scope is always the whole event
        cur.execute("""SELECT count(*) AS n FROM seat_holds h JOIN seats s ON h.seat_id = s.id
                       WHERE s.event_id = %s AND h.status = 'active' AND h.expires_at > now()""", (event_id,))
        reserved = cur.fetchone()["n"]

        cur.execute(selected_orders + """
            SELECT COALESCE(sum(total_amount + discount_amount) FILTER (WHERE status IN ('paid','refunded')), 0) AS gross,
                   COALESCE(sum(discount_amount) FILTER (WHERE status IN ('paid','refunded')), 0) AS discounts,
                   COALESCE(sum(total_amount) FILTER (WHERE status = 'refunded'), 0) AS refunds,
                   COALESCE(sum(processing_fee) FILTER (WHERE status = 'paid'), 0) AS fees
            FROM selected_orders""", p)
        money = cur.fetchone()
        net = money["gross"] - money["discounts"] - money["refunds"]
        fee = money["fees"]
        cur.execute(selected_orders + """
            SELECT (o.created_at AT TIME ZONE 'Asia/Almaty')::date AS day, count(*) AS orders,
                   COALESCE(sum(o.total_amount), 0) AS revenue,
                   COALESCE(sum((SELECT count(*) FROM tickets t WHERE t.order_id = o.id
                                 AND (%(tt)s::uuid IS NULL OR t.ticket_type_id = %(tt)s::uuid))), 0) AS tickets
            FROM selected_orders o WHERE o.status = 'paid' GROUP BY 1 ORDER BY 1""", p)
        over_time = cur.fetchall()

        cur.execute(selected_orders + """
            SELECT tt.id, tt.name, tt.price, tt.total_quantity, tt.quantity_available AS remaining,
                   count(t.id) FILTER (WHERE t.status IN ('valid','checked_in')) AS sold,
                   count(t.id) FILTER (WHERE t.status = 'refunded') AS refunded,
                   count(t.id) FILTER (WHERE t.status IN ('valid','checked_in')) * tt.price AS revenue_at_list_price
            FROM ticket_types tt
            LEFT JOIN tickets t ON t.ticket_type_id = tt.id AND t.order_id IN (SELECT id FROM selected_orders)
            WHERE tt.event_id = %(e)s AND (%(tt)s::uuid IS NULL OR tt.id = %(tt)s::uuid)
            GROUP BY tt.id ORDER BY tt.price DESC, tt.name""", p)
        by_type = cur.fetchall()

        cur.execute(selected_orders + """
            SELECT c.id, c.code, c.is_active, c.max_redemptions,
                   c.redemptions_count AS active_redemptions_all_dates,
                   count(o.id) FILTER (WHERE o.status = 'paid') AS redemptions,
                   count(o.id) FILTER (WHERE o.status IN ('paid','refunded')) AS orders,
                   count(o.id) FILTER (WHERE o.status = 'refunded') AS refunded_orders,
                   COALESCE(sum(o.total_amount + r.discount_amount) FILTER (WHERE o.status IN ('paid','refunded')), 0) AS gross_sales,
                   COALESCE(sum(r.discount_amount) FILTER (WHERE o.status IN ('paid','refunded')), 0) AS discounts,
                   COALESCE(sum(o.total_amount) FILTER (WHERE o.status = 'refunded'), 0) AS refunds,
                   COALESCE(sum(o.total_amount) FILTER (WHERE o.status = 'paid'), 0) AS net_revenue,
                   COALESCE(sum(r.discount_amount) FILTER (WHERE o.status = 'paid'), 0) AS discount_given,
                   COALESCE(sum((SELECT count(*) FROM tickets t WHERE t.order_id = o.id
                                 AND t.status IN ('valid','checked_in')
                                 AND (%(tt)s::uuid IS NULL OR t.ticket_type_id = %(tt)s::uuid)))
                            FILTER (WHERE o.status = 'paid'), 0) AS tickets
            FROM promo_campaigns c
            LEFT JOIN promo_redemptions r ON r.campaign_id = c.id
            LEFT JOIN selected_orders o ON r.order_id = o.id
            WHERE c.event_id = %(e)s GROUP BY c.id ORDER BY c.code""", p)
        campaigns = cur.fetchall()

    registered = tickets["sold"]
    return {
        "event_id": event_id, "currency": "KZT", "generated_at": generated_at,
        "filters": {"date_from": date_from, "date_to": date_to, "ticket_type_id": ticket_type_id},
        "inventory": {"total": stock["capacity"], "sold": stock["sold"], "remaining": stock["remaining"],
                      "percent_sold": round(100 * stock["sold"] / stock["capacity"], 1) if stock["capacity"] else 0,
                      "reserved": reserved, "reserved_scope": "event"},
        "capacity": {"total": stock["capacity"], "sold": tickets["sold"], "remaining": stock["remaining"],
                     "percent_sold": round(100 * tickets["sold"] / stock["capacity"], 1) if stock["capacity"] else 0},
        "ticket_counts": {"available": stock["remaining"], "reserved": reserved, "sold": tickets["sold"],
                          "refunded": tickets["refunded"], "checked_in": tickets["checked_in"]},
        "money": {"gross_sales": money["gross"], "discounts": money["discounts"], "refunds": money["refunds"],
                  "net_revenue": net, "processing_fee_simulated": fee, "estimated_payout": net - fee,
                  "payout_status": event["payout_status"]},
        "sales_over_time": over_time, "by_ticket_type": by_type, "campaigns": campaigns,
        "attendance": {"registered": registered, "checked_in": tickets["checked_in"], "absent": tickets["not_arrived"],
                       "percent_checked_in": round(100 * tickets["checked_in"] / registered, 1) if registered else 0},
    }


@router.get("/api/events/{event_id}/timeline")
def timeline(event_id: str, date_from: str | None = None, date_to: str | None = None, action: str | None = None,
             before: str | None = None, limit: int = Query(default=500, ge=1, le=500),
             user=Depends(require_roles("organizer", "platform_admin"))):
    with tx() as cur:
        assert_manager(cur, user, event_id)
        range_start, range_end = day_range(date_from, date_to)
        if range_start and range_end and range_start >= range_end:
            raise HTTPException(status_code=400, detail="date_from must not be after date_to")
        before_time, before_id = None, None
        if before is not None:
            try:
                timestamp, record_id = before.rsplit("|", 1)
                before_time = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
                if before_time.tzinfo is None:
                    raise ValueError("Cursor timestamp needs a timezone")
                before_id = str(uuid.UUID(record_id))
            except (ValueError, OverflowError):
                raise HTTPException(status_code=400, detail="Invalid history cursor; use the last record's timestamp and id")
        cur.execute(
            """SELECT a.id, a.created_at AS timestamp, u.full_name AS actor, a.actor_id,
                      a.action, a.entity_type, a.entity_id, a.details
               FROM audit_log a LEFT JOIN users u ON a.actor_id = u.id
               WHERE a.event_id = %(e)s
                 AND (%(f)s::timestamptz IS NULL OR a.created_at >= %(f)s::timestamptz)
                 AND (%(t)s::timestamptz IS NULL OR a.created_at < %(t)s::timestamptz)
                 AND (%(a)s IS NULL OR a.action = %(a)s)
                 AND (%(b)s::timestamptz IS NULL OR (a.created_at, a.id) < (%(b)s::timestamptz, %(i)s::uuid))
               ORDER BY a.created_at DESC, a.id DESC LIMIT %(limit)s""",
            {"e": event_id, "f": range_start, "t": range_end, "a": action,
             "b": before_time, "i": before_id, "limit": limit})
        return cur.fetchall()
