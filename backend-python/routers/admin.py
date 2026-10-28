import csv
import io

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel

from db import audit, notify, tx
from security import load_event, require_roles

router = APIRouter(prefix="/api/admin")

admin_only = require_roles("platform_admin")

SETTING_KEYS = ("activation_fee", "processing_fee_rate")


class ReportReview(BaseModel):
    status: str


class SettingsUpdate(BaseModel):
    activation_fee: float | None = None
    processing_fee_rate: float | None = None


def like(q):
    return f"%{q.strip()}%" if q and q.strip() else None


@router.get("/users")
def search_users(q: str | None = None, role: str | None = None, user=Depends(admin_only)):
    with tx() as cur:
        cur.execute(
            """SELECT id, email, full_name, role, is_email_verified, is_suspended, created_at FROM users
               WHERE (%(q)s IS NULL OR email ILIKE %(q)s OR full_name ILIKE %(q)s) AND (%(r)s IS NULL OR role = %(r)s)
               ORDER BY created_at DESC LIMIT 200""", {"q": like(q), "r": role})
        return cur.fetchall()


def _set_suspended(user_id, admin, suspended):
    if str(user_id) == str(admin["id"]):
        raise HTTPException(status_code=400, detail="You cannot suspend your own account")
    with tx() as cur:
        cur.execute("UPDATE users SET is_suspended = %s WHERE id = %s RETURNING id, email, full_name, role, is_suspended",
                    (suspended, user_id))
        target = cur.fetchone()
        if not target:
            raise HTTPException(status_code=404, detail="User not found")
        audit(cur, admin["id"], None, "user_suspended" if suspended else "user_reinstated",
              f"{target['email']} " + ("suspended" if suspended else "reinstated"), "user", user_id)
        return target


@router.post("/users/{user_id}/suspend")
def suspend_user(user_id: str, admin=Depends(admin_only)):
    return _set_suspended(user_id, admin, True)


@router.post("/users/{user_id}/unsuspend")
def unsuspend_user(user_id: str, admin=Depends(admin_only)):
    return _set_suspended(user_id, admin, False)


@router.get("/events")
def search_events(q: str | None = None, status: str | None = None, user=Depends(admin_only)):
    with tx() as cur:
        cur.execute(
            """SELECT e.*, u.email AS organizer_email,
                      (SELECT count(*) FROM event_reports r WHERE r.event_id = e.id AND r.status = 'open') AS open_reports
               FROM events e JOIN users u ON e.organizer_id = u.id
               WHERE (%(q)s IS NULL OR e.title ILIKE %(q)s OR u.email ILIKE %(q)s) AND (%(s)s IS NULL OR e.status = %(s)s)
               ORDER BY e.created_at DESC LIMIT 200""", {"q": like(q), "s": status})
        return cur.fetchall()


@router.post("/events/{event_id}/suspend")
def suspend_event(event_id: str, admin=Depends(admin_only)):
    with tx() as cur:
        event = load_event(cur, event_id, lock=True)
        if event["status"] == "suspended":
            raise HTTPException(status_code=409, detail="Already suspended")
        cur.execute("UPDATE events SET status = 'suspended' WHERE id = %s RETURNING *", (event_id,))
        suspended = cur.fetchone()
        audit(cur, admin["id"], event_id, "event_suspended", "Event suspended by a platform admin", "event", event_id)
        notify(cur, event["organizer_id"], "event_suspended", f"{event['title']} was suspended",
               "A BiletFlow administrator suspended this event. Contact support for details.")
        return suspended


@router.post("/events/{event_id}/reinstate")
def reinstate_event(event_id: str, admin=Depends(admin_only)):
    #comes back as a published (upcoming) event. the organizer can unpublish it again
    with tx() as cur:
        event = load_event(cur, event_id, lock=True)
        if event["status"] != "suspended":
            raise HTTPException(status_code=409, detail="This event is not suspended")
        cur.execute("UPDATE events SET status = 'upcoming' WHERE id = %s RETURNING *", (event_id,))
        reinstated = cur.fetchone()
        audit(cur, admin["id"], event_id, "event_reinstated", "Event reinstated by a platform admin", "event", event_id)
        return reinstated


def _paid_sales(event_id, admin, suspended):
    with tx() as cur:
        event = load_event(cur, event_id, lock=True)
        cur.execute("UPDATE events SET paid_sales_suspended = %s WHERE id = %s RETURNING *", (suspended, event_id))
        updated = cur.fetchone()
        audit(cur, admin["id"], event_id, "paid_sales_suspended" if suspended else "paid_sales_restored",
              "Paid sales " + ("suspended" if suspended else "restored") + " by a platform admin", "event", event_id)
        if suspended:
            notify(cur, event["organizer_id"], "paid_sales_suspended", f"Paid sales suspended for {event['title']}",
                   "A BiletFlow administrator suspended paid ticket sales for this event.")
        return updated


@router.post("/events/{event_id}/suspend-paid-sales")
def suspend_paid_sales(event_id: str, admin=Depends(admin_only)):
    return _paid_sales(event_id, admin, True)


@router.post("/events/{event_id}/restore-paid-sales")
def restore_paid_sales(event_id: str, admin=Depends(admin_only)):
    return _paid_sales(event_id, admin, False)


@router.get("/orders")
def search_orders(q: str | None = None, status: str | None = None, user=Depends(admin_only)):
    #payments are orders in this project (payment_reference is the simulated payment id),
    #so searching orders is searching payments
    with tx() as cur:
        cur.execute(
            """SELECT o.*, u.email AS attendee_email, e.title AS event_title
               FROM orders o JOIN users u ON o.attendee_id = u.id JOIN events e ON o.event_id = e.id
               WHERE (%(q)s IS NULL OR o.id::text ILIKE %(q)s OR u.email ILIKE %(q)s OR e.title ILIKE %(q)s
                      OR o.payment_reference ILIKE %(q)s)
                 AND (%(s)s IS NULL OR o.status = %(s)s)
               ORDER BY o.created_at DESC LIMIT 200""", {"q": like(q), "s": status})
        return cur.fetchall()


@router.get("/activations")
def activations(user=Depends(admin_only)):
    with tx() as cur:
        cur.execute(
            """SELECT a.*, e.title AS event_title, e.paid_sales_suspended, u.email AS organizer_email
               FROM paid_sales_activations a JOIN events e ON a.event_id = e.id JOIN users u ON a.activated_by = u.id
               ORDER BY a.created_at DESC""")
        return cur.fetchall()


@router.get("/refunds")
def refunds(user=Depends(admin_only)):
    with tx() as cur:
        cur.execute(
            """SELECT r.*, o.event_id, e.title AS event_title, u.email AS attendee_email
               FROM refunds r JOIN orders o ON r.order_id = o.id JOIN events e ON o.event_id = e.id
               JOIN users u ON o.attendee_id = u.id ORDER BY r.created_at DESC""")
        return cur.fetchall()


@router.get("/event-reports")
def event_reports(status: str | None = "open", user=Depends(admin_only)):
    with tx() as cur:
        cur.execute(
            """SELECT r.*, e.title AS event_title, e.status AS event_status
               FROM event_reports r JOIN events e ON r.event_id = e.id
               WHERE (%s IS NULL OR r.status = %s) ORDER BY r.created_at DESC""", (status, status))
        return cur.fetchall()


@router.put("/event-reports/{report_id}")
def review_report(report_id: str, payload: ReportReview, admin=Depends(admin_only)):
    if payload.status not in ("dismissed", "actioned"):
        raise HTTPException(status_code=400, detail="status must be dismissed or actioned")
    with tx() as cur:
        cur.execute("UPDATE event_reports SET status = %s WHERE id = %s RETURNING *", (payload.status, report_id))
        report = cur.fetchone()
        if not report:
            raise HTTPException(status_code=404, detail="Report not found")
        audit(cur, admin["id"], report["event_id"], "event_report_reviewed", f"Report {payload.status}", "event_report", report_id)
        return report


@router.get("/promo-activity")
def promo_activity(user=Depends(admin_only)):
    with tx() as cur:
        cur.execute(
            """SELECT c.id, c.code, c.is_active, c.discount_type, c.discount_value, c.redemptions_count,
                      c.max_redemptions, e.title AS event_title, u.email AS organizer_email
               FROM promo_campaigns c JOIN events e ON c.event_id = e.id JOIN users u ON e.organizer_id = u.id
               ORDER BY c.redemptions_count DESC, c.code""")
        return cur.fetchall()


@router.get("/settings")
def get_settings(user=Depends(admin_only)):
    with tx() as cur:
        cur.execute("SELECT key, value FROM platform_settings ORDER BY key")
        return {row["key"]: row["value"] for row in cur.fetchall()}


@router.put("/settings")
def update_settings(payload: SettingsUpdate, admin=Depends(admin_only)):
    changes = payload.model_dump(exclude_none=True)
    if not changes:
        raise HTTPException(status_code=400, detail="Nothing to update")
    if changes.get("activation_fee", 0) < 0 or not 0 <= changes.get("processing_fee_rate", 0) <= 1:
        raise HTTPException(status_code=400, detail="activation_fee cannot be negative and processing_fee_rate must be between 0 and 1")
    with tx() as cur:
        for key, value in changes.items():
            cur.execute(
                "INSERT INTO platform_settings (key, value) VALUES (%s, %s) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
                (key, str(value)))
            audit(cur, admin["id"], None, "setting_changed", f"{key} set to {value}", "setting", key)
    return get_settings(admin)


@router.get("/reports/summary")
def summary(user=Depends(admin_only)):
    with tx() as cur:
        cur.execute(
            """SELECT
                 (SELECT count(*) FROM users) AS users,
                 (SELECT count(*) FROM users WHERE role = 'organizer') AS organizers,
                 (SELECT count(*) FROM events) AS events,
                 (SELECT count(*) FROM events WHERE status IN ('upcoming','active')) AS events_on_sale,
                 (SELECT count(*) FROM orders WHERE status = 'paid') AS paid_orders,
                 (SELECT COALESCE(sum(total_amount), 0) FROM orders WHERE status = 'paid') AS net_sales,
                 (SELECT COALESCE(sum(amount), 0) FROM refunds) AS refunded,
                 (SELECT count(*) FROM tickets WHERE status IN ('valid','checked_in')) AS tickets_issued,
                 (SELECT count(*) FROM tickets WHERE status = 'checked_in') AS tickets_checked_in,
                 (SELECT count(*) FROM support_cases WHERE status <> 'resolved') AS open_support_cases,
                 (SELECT count(*) FROM support_cases WHERE escalated AND status <> 'resolved') AS escalated_cases,
                 (SELECT count(*) FROM event_reports WHERE status = 'open') AS open_event_reports,
                 (SELECT COALESCE(sum(fee_amount), 0) FROM paid_sales_activations) AS activation_fees""")
        return {**cur.fetchone(), "currency": "KZT", "note": "All money is simulated"}


@router.get("/reports/orders.csv")
def export_orders_csv(user=Depends(admin_only)):
    with tx() as cur:
        cur.execute(
            """SELECT o.id, o.created_at, e.title AS event, u.email AS attendee, o.status, o.total_amount,
                      o.promo_code_applied, o.payment_reference
               FROM orders o JOIN events e ON o.event_id = e.id JOIN users u ON o.attendee_id = u.id
               ORDER BY o.created_at DESC""")
        rows = cur.fetchall()
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(["order_id", "created_at", "event", "attendee", "status", "total_kzt", "promo_code", "payment_reference"])
    for r in rows:
        writer.writerow([r["id"], r["created_at"].isoformat(), r["event"], r["attendee"], r["status"],
                         r["total_amount"], r["promo_code_applied"] or "", r["payment_reference"] or ""])
    return Response(content=out.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": 'attachment; filename="orders.csv"'})
