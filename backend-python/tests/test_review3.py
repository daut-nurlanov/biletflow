"""Found by reading every line of the backend a third time."""
import json
from datetime import datetime, timedelta, timezone

import psycopg2
import pytest

from conftest import fetch_one, notifications_for, run_sql
import routers.auth as auth_module


def mk(kit, **kw):
    org = kit.user("organizer")
    ev, tt = kit.event(org, **kw)
    return org, ev, tt


# ---------- accounts ----------

def test_overlong_password_and_bad_email_are_refused_not_500(kit):
    base = {"password": "password123", "full_name": "A", "role": "attendee"}
    assert kit.client.post("/api/auth/register", json={**base, "email": "rev3a@x.invalid", "password": "p" * 80}).status_code == 400
    for bad in ("a@b", "a@", "@b.com", "a b@c.com", ""):
        assert kit.client.post("/api/auth/register", json={**base, "email": bad}).status_code == 400, bad
    u = kit.user()
    kit.client.post("/api/auth/forgot-password", json={"email": u.email})
    assert kit.client.post("/api/auth/reset-password", json={"token": "x", "new_password": "p" * 80}).status_code == 400


def test_too_many_wrong_passwords_lock_the_login_for_a_while(kit):
    u = kit.user()
    auth_module.failed_logins.pop(u.email, None)
    for _ in range(auth_module.MAX_FAILED_LOGINS):
        assert kit.client.post("/api/auth/login", json={"email": u.email, "password": "wrong-password"}).status_code == 401
    locked = kit.client.post("/api/auth/login", json={"email": u.email, "password": "password123"})
    assert locked.status_code == 429
    auth_module.failed_logins.pop(u.email, None)
    assert kit.client.post("/api/auth/login", json={"email": u.email, "password": "password123"}).status_code == 200


# ---------- numbers ----------

def test_nan_and_absurd_numbers_are_refused(kit):
    org, ev, tt = mk(kit)
    headers = {**org.h, "Content-Type": "application/json"}
    for bad in ('{"name":"x","price":NaN,"total_quantity":1}', '{"name":"x","price":Infinity,"total_quantity":1}',
                '{"name":"x","price":999999999999,"total_quantity":1}'):
        r = kit.client.post(f"/api/events/{ev['id']}/ticket-types", content=bad, headers=headers)
        assert 400 <= r.status_code < 500, (bad, r.status_code)
    adm = kit.user("platform_admin")
    r = kit.client.put("/api/admin/settings", content='{"processing_fee_rate": NaN}', headers={**adm.h, "Content-Type": "application/json"})
    assert 400 <= r.status_code < 500


def test_null_capacity_is_a_400_not_a_server_error(kit):
    org = kit.user("organizer")
    r = kit.client.post("/api/events", json={"title": "x", "venue_name": "v", "start_time": "2030-01-01T10:00:00+05:00", "capacity": None}, headers=org.h)
    assert r.status_code == 400


# ---------- who may see what ----------

def test_drafts_and_private_events_do_not_leak_through_side_endpoints(kit):
    org, ev, tt = mk(kit, publish=False)
    for path in (f"/api/events/{ev['id']}/ticket-types", f"/api/events/{ev['id']}/seats",
                 f"/api/events/{ev['id']}/export.ics", f"/api/events/{ev['id']}/calendar-links"):
        assert kit.client.get(path).status_code == 404, path
        assert kit.client.get(path, headers=org.h).status_code == 200, path
    kit.publish(org, ev["id"])
    assert kit.client.get(f"/api/events/{ev['id']}/export.ics").status_code == 200


def test_private_events_cannot_be_bought_or_held_by_the_public(kit):
    org, ev, tt = mk(kit, visibility="private")
    seats = kit.seats(org, ev["id"])
    buyer = kit.user()
    assert kit.buy(buyer, ev["id"], tt["id"], seat_id=seats[0]).status_code == 404
    assert kit.client.post("/api/orders/quote", json={"event_id": ev["id"], "ticket_type_id": tt["id"], "quantity": 1}).status_code == 404
    assert kit.client.post("/api/seats/hold", json={"seat_id": seats[0]}, headers=buyer.h).status_code == 404
    # the organizer can still try their own event
    assert kit.buy(org, ev["id"], tt["id"], seat_id=seats[0]).status_code == 201


# ---------- seat holds ----------

def test_one_person_cannot_hold_the_whole_seat_map(kit):
    org, ev, tt = mk(kit, quantity=30, capacity=100)
    seats = kit.seats(org, ev["id"], rows=1, per_row=12)
    greedy = kit.user()
    for seat in seats[:10]:
        assert kit.client.post("/api/seats/hold", json={"seat_id": seat}, headers=greedy.h).status_code == 201
    assert kit.client.post("/api/seats/hold", json={"seat_id": seats[10]}, headers=greedy.h).status_code == 409
    # clicking a seat they already hold still just hands back the hold
    assert kit.client.post("/api/seats/hold", json={"seat_id": seats[0]}, headers=greedy.h).status_code == 201


# ---------- event lifecycle ----------

def test_cannot_publish_an_event_that_is_already_over(kit):
    org, ev, tt = mk(kit, publish=False)
    run_sql("UPDATE events SET start_time = now() - interval '2 days', end_time = now() - interval '1 day' WHERE id = %s", (ev["id"],))
    assert kit.client.post(f"/api/events/{ev['id']}/publish", headers=org.h).status_code == 409


def test_cancelled_event_setup_is_locked(kit):
    org, ev, tt = mk(kit)
    kit.client.post(f"/api/events/{ev['id']}/cancel", headers=org.h)
    assert kit.client.post(f"/api/events/{ev['id']}/ticket-types", json={"name": "late", "price": 1, "total_quantity": 1}, headers=org.h).status_code == 409
    assert kit.client.put(f"/api/ticket-types/{tt['id']}", json={"price": 5}, headers=org.h).status_code == 409
    assert kit.client.post(f"/api/events/{ev['id']}/seats", json={"section": "Q", "category": "standard", "rows": 1, "seats_per_row": 1}, headers=org.h).status_code == 409


def test_ticket_type_checks(kit):
    org, ev, tt = mk(kit)
    url = f"/api/events/{ev['id']}/ticket-types"
    assert kit.client.post(url, json={"name": " ", "price": 1, "total_quantity": 1}, headers=org.h).status_code == 400
    window = {"sales_start_time": "2030-01-02T10:00:00+05:00", "sales_end_time": "2030-01-01T10:00:00+05:00"}
    assert kit.client.post(url, json={"name": "w", "price": 1, "total_quantity": 1, **window}, headers=org.h).status_code == 400
    assert kit.client.put(f"/api/ticket-types/{tt['id']}", json=window, headers=org.h).status_code == 400
    assert kit.client.put(f"/api/ticket-types/{tt['id']}", json={"name": ""}, headers=org.h).status_code == 400
    assert kit.client.put(f"/api/ticket-types/{tt['id']}", json={"total_quantity": 0}, headers=org.h).status_code == 400


def test_blank_attendee_name_is_refused(kit):
    org, ev, tt = mk(kit)
    assert kit.buy(kit.user(), ev["id"], tt["id"], attendee_name="   ").status_code == 400


# ---------- admin ----------

def test_reinstating_restores_what_the_event_was_before(kit):
    org, ev, tt = mk(kit, publish=False)          # a draft
    adm = kit.user("platform_admin")
    assert kit.client.post(f"/api/admin/events/{ev['id']}/suspend", headers=adm.h).status_code == 200
    back = kit.client.post(f"/api/admin/events/{ev['id']}/reinstate", headers=adm.h).json()
    assert back["status"] == "draft"                 # must NOT go on sale by itself

    kit.publish(org, ev["id"])
    kit.client.post(f"/api/admin/events/{ev['id']}/suspend", headers=adm.h)
    assert kit.client.post(f"/api/admin/events/{ev['id']}/reinstate", headers=adm.h).json()["status"] == "upcoming"

    kit.client.post(f"/api/events/{ev['id']}/cancel", headers=org.h)
    # a cancelled event cannot be suspended, so reinstating can never "un-cancel" it
    assert kit.client.post(f"/api/admin/events/{ev['id']}/suspend", headers=adm.h).status_code == 409


def test_csv_export_neutralises_spreadsheet_formulas(kit):
    org, ev, tt = mk(kit, title="=HYPERLINK(\"http://evil.invalid\",\"click\")")
    buyer = kit.user()
    kit.buy(buyer, ev["id"], tt["id"])
    adm = kit.user("platform_admin")
    text = kit.client.get("/api/admin/reports/orders.csv", headers=adm.h).text
    assert "'=HYPERLINK" in text
    assert ",=HYPERLINK" not in text and "\n=HYPERLINK" not in text


# ---------- dates ----------

def test_analytics_date_filter_includes_the_whole_end_day(kit):
    org, ev, tt = mk(kit)
    buyer = kit.user()
    kit.buy(buyer, ev["id"], tt["id"])
    today = datetime.now(timezone(timedelta(hours=5))).date().isoformat()
    tomorrow = (datetime.now(timezone(timedelta(hours=5))).date() + timedelta(days=1)).isoformat()
    inside = kit.client.get(f"/api/events/{ev['id']}/analytics?date_from={today}&date_to={today}", headers=org.h).json()
    assert inside["capacity"]["sold"] == 1
    later = kit.client.get(f"/api/events/{ev['id']}/analytics?date_from={tomorrow}", headers=org.h).json()
    assert later["capacity"]["sold"] == 0
    assert kit.client.get(f"/api/events/{ev['id']}/analytics?date_from=banana", headers=org.h).status_code == 400
    assert kit.client.get(f"/api/events/{ev['id']}/timeline?date_to={today}", headers=org.h).json()


# ---------- discovery ----------

def test_event_list_can_be_searched_and_filtered(kit):
    org = kit.user("organizer")
    a, _ = kit.event(org, title="Zebra Jazz Gala", category="music")
    b, _ = kit.event(org, title="Zebra Tech Day", category="tech", start_time="2030-06-01T10:00:00+05:00")
    ids = lambda qs: [e["id"] for e in kit.client.get("/api/events" + qs).json()]
    assert set(ids("?q=zebra")) >= {a["id"], b["id"]}
    assert a["id"] in ids("?q=zebra&category=MUSIC") and b["id"] not in ids("?q=zebra&category=music")
    assert b["id"] in ids("?q=zebra&date_from=2030-06-01&date_to=2030-06-01")
    assert a["id"] not in ids("?q=zebra&date_from=2030-06-01&date_to=2030-06-01")
    assert a["id"] not in ids("?q=nothing-like-this")
    assert kit.client.get("/api/events?date_from=nonsense").status_code == 400


# ---------- promo ----------

def test_promo_input_checks(kit):
    org, ev, tt = mk(kit)
    url = f"/api/events/{ev['id']}/promo-campaigns"
    ok = {"discount_type": "fixed", "discount_value": 10, "max_redemptions": 1}
    assert kit.client.post(url, json={**ok, "code": "bad code!"}, headers=org.h).status_code == 400
    assert kit.client.post(url, json={**ok, "code": "X" * 41}, headers=org.h).status_code == 400
    assert kit.client.post(url, json={**ok, "valid_from": "2030-02-01T00:00:00+05:00", "valid_until": "2030-01-01T00:00:00+05:00"}, headers=org.h).status_code == 400


# ---------- support ----------

def test_support_assignment_and_reopening(kit):
    org, ev, tt = mk(kit)
    buyer, other_org, adm = kit.user(), kit.user("organizer"), kit.user("platform_admin")
    order = kit.buy(buyer, ev["id"], tt["id"]).json()
    case = kit.client.post("/api/support/cases", headers=buyer.h, json={
        "category": "payment", "message": "help", "ticket_id": order["ticket"]["id"]}).json()
    url = f"/api/support/cases/{case['id']}"
    assert kit.client.put(url, json={"assigned_to": other_org.id}, headers=org.h).status_code == 400    # cannot even open it
    assert kit.client.put(url, json={"assigned_to": adm.id}, headers=org.h).status_code == 400          # not escalated yet
    assert kit.client.put(url, json={"assigned_to": org.id, "status": "resolved"}, headers=org.h).status_code == 200
    kit.client.post(f"{url}/messages", json={"message": "still broken"}, headers=buyer.h)
    assert kit.client.get(url, headers=buyer.h).json()["status"] == "open"
    assert kit.client.post(f"{url}/messages", json={"message": "x" * 5000}, headers=buyer.h).status_code == 400


# ---------- database safety nets ----------

def test_database_refuses_two_live_tickets_on_one_seat(kit):
    org, ev, tt = mk(kit)
    seat = kit.seats(org, ev["id"], per_row=1)[0]
    buyer = kit.user()
    order = kit.buy(buyer, ev["id"], tt["id"], seat_id=seat).json()["order"]
    with pytest.raises(psycopg2.errors.UniqueViolation):
        run_sql("""INSERT INTO tickets (order_id, event_id, ticket_type_id, seat_id, attendee_name, qr_code_hash, status)
                   VALUES (%s, %s, %s, %s, 'dup', gen_random_uuid()::text, 'valid')""", (order["id"], ev["id"], tt["id"], seat))
    with pytest.raises(psycopg2.errors.CheckViolation):
        run_sql("UPDATE ticket_types SET quantity_available = -1 WHERE id = %s", (tt["id"],))


# ---------- double taps, limits, paging ----------

def test_same_idempotency_key_returns_the_first_order_instead_of_buying_twice(kit):
    org, ev, tt = mk(kit, quantity=5)
    buyer = kit.user()
    body = {"event_id": ev["id"], "ticket_type_id": tt["id"], "attendee_name": "Tap", "quantity": 2}
    first = kit.client.post("/api/orders/checkout", json=body, headers={**buyer.h, "Idempotency-Key": "tap-1"})
    again = kit.client.post("/api/orders/checkout", json=body, headers={**buyer.h, "Idempotency-Key": "tap-1"})
    assert first.status_code == 201 and again.status_code == 201
    assert again.json()["order"]["id"] == first.json()["order"]["id"] and again.json()["repeated"] is True
    assert len(again.json()["tickets"]) == 2
    assert fetch_one("SELECT count(*) AS n FROM orders WHERE event_id = %s", (ev["id"],))["n"] == 1
    assert fetch_one("SELECT quantity_available FROM ticket_types WHERE id = %s", (tt["id"],))["quantity_available"] == 3
    # a different key (or none) is a genuinely new purchase
    other = kit.client.post("/api/orders/checkout", json=body, headers={**buyer.h, "Idempotency-Key": "tap-2"})
    assert other.json()["order"]["id"] != first.json()["order"]["id"]


def test_failed_payment_can_be_retried_with_the_same_key(kit):
    org, ev, tt = mk(kit)
    buyer = kit.user()
    body = {"event_id": ev["id"], "ticket_type_id": tt["id"], "attendee_name": "Tap"}
    headers = {**buyer.h, "Idempotency-Key": "retry-1"}
    assert kit.client.post("/api/orders/checkout", json={**body, "simulate_payment": "fail"}, headers=headers).status_code == 402
    assert kit.client.post("/api/orders/checkout", json=body, headers=headers).status_code == 201


def test_text_length_limits_and_paging(kit):
    org = kit.user("organizer")
    base = {"title": "T", "venue_name": "V", "start_time": "2030-01-01T10:00:00+05:00", "capacity": 5}
    assert kit.client.post("/api/events", json={**base, "title": "x" * 201}, headers=org.h).status_code == 400
    assert kit.client.post("/api/events", json={**base, "description": "x" * 5001}, headers=org.h).status_code == 400
    for i in range(3):
        kit.event(org, title=f"Paging {i}")
    page = kit.client.get("/api/events?q=Paging&limit=2").json()
    assert len(page) == 2
    rest = kit.client.get("/api/events?q=Paging&limit=2&offset=2").json()
    assert len(rest) == 1 and rest[0]["id"] not in [e["id"] for e in page]


def test_seat_block_input_checks(kit):
    org, ev, tt = mk(kit)
    url = f"/api/events/{ev['id']}/seats"
    assert kit.client.post(url, json={"section": " ", "category": "standard", "rows": 1, "seats_per_row": 1}, headers=org.h).status_code == 400
    assert kit.client.post(url, json={"section": "A", "category": "standard", "rows": 1, "seats_per_row": 1, "first_row_label": 0}, headers=org.h).status_code == 400


def test_cannot_hold_a_seat_at_an_event_that_is_over(kit):
    org, ev, tt = mk(kit)
    seat = kit.seats(org, ev["id"])[0]
    run_sql("UPDATE events SET start_time = now() - interval '5 hours', end_time = now() - interval '3 hours' WHERE id = %s", (ev["id"],))
    assert kit.client.post("/api/seats/hold", json={"seat_id": seat}, headers=kit.user().h).status_code == 409
