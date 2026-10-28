from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

import main


def run_sql(sql, params=()):
    conn = main.get_connection()
    cur = conn.cursor()
    cur.execute(sql, params)
    conn.commit()
    cur.close()
    conn.close()


@pytest.fixture
def world():
    """An organizer, three attendees and an on-sale event with paid sales active.
    Everything is created through the real API where possible, and cleaned up after."""
    client = TestClient(main.app)
    ids = {"organizer": str(uuid4()), "attendees": [str(uuid4()) for _ in range(3)]}
    for user_id, role in [(ids["organizer"], "organizer")] + [(a, "attendee") for a in ids["attendees"]]:
        run_sql("INSERT INTO users (id, email, full_name, role) VALUES (%s, %s, 'Feature Test', %s)",
                (user_id, f"{user_id}@test.invalid", role))
    event = client.post("/api/events", json={
        "organizer_id": ids["organizer"], "title": "Feature Test Event", "venue_name": "Test Hall",
        "start_time": "2030-01-01T19:00:00+05:00", "capacity": 100,
        "description": "desc", "category": "music", "venue_address": "Somewhere 1",
        "end_time": "2030-01-01T23:00:00+05:00",
    }).json()
    ids["event"] = event["id"]
    run_sql("UPDATE events SET status = 'upcoming', is_paid_sales_active = true WHERE id = %s", (event["id"],))
    ids["client"] = client
    yield ids
    eid = ids["event"]
    run_sql("DELETE FROM promo_redemptions WHERE order_id IN (SELECT id FROM orders WHERE event_id = %s)", (eid,))
    run_sql("DELETE FROM tickets WHERE event_id = %s", (eid,))
    run_sql("DELETE FROM orders WHERE event_id = %s", (eid,))
    run_sql("DELETE FROM seat_holds WHERE seat_id IN (SELECT id FROM seats WHERE event_id = %s)", (eid,))
    run_sql("DELETE FROM seats WHERE event_id = %s", (eid,))
    run_sql("DELETE FROM promo_campaigns WHERE event_id = %s", (eid,))
    run_sql("DELETE FROM ticket_types WHERE event_id = %s", (eid,))
    run_sql("DELETE FROM events WHERE id = %s", (eid,))
    for user_id in [ids["organizer"], *ids["attendees"]]:
        run_sql("DELETE FROM users WHERE id = %s", (user_id,))


def make_ticket_type(w, **kwargs):
    body = {"name": "General", "price": 1000, "total_quantity": 10}
    body.update(kwargs)
    response = w["client"].post(f"/api/events/{w['event']}/ticket-types", json=body)
    assert response.status_code == 201, response.text
    return response.json()


def buy(w, ticket_type_id, attendee=0, **kwargs):
    body = {"attendee_id": w["attendees"][attendee], "event_id": w["event"],
            "ticket_type_id": ticket_type_id, "attendee_name": "Buyer"}
    body.update(kwargs)
    return w["client"].post("/api/orders/checkout", json=body)


def make_seats(w, category="standard", rows=1, per_row=2, section="T"):
    response = w["client"].post(f"/api/events/{w['event']}/seats", json={
        "section": section, "category": category, "rows": rows, "seats_per_row": per_row})
    assert response.status_code == 201, response.text
    return response.json()


def seat_ids(w):
    return [s["id"] for s in w["client"].get(f"/api/events/{w['event']}/seats").json()]


def test_event_new_fields_roundtrip(world):
    c = world["client"]
    event = c.get(f"/api/events/{world['event']}").json()
    assert event["description"] == "desc" and event["category"] == "music"
    assert event["venue_address"] == "Somewhere 1" and event["visibility"] == "public"
    updated = c.put(f"/api/events/{world['event']}", json={"visibility": "unlisted", "description": "new"}).json()
    assert updated["visibility"] == "unlisted" and updated["description"] == "new"
    assert c.put(f"/api/events/{world['event']}", json={"visibility": "bogus"}).status_code == 400


def test_public_filter_hides_drafts_suspended_and_unlisted(world):
    c = world["client"]
    def listed():
        return world["event"] in [e["id"] for e in c.get("/api/events?public=true").json()]
    assert listed()
    c.put(f"/api/events/{world['event']}", json={"visibility": "unlisted"})
    assert not listed()
    c.put(f"/api/events/{world['event']}", json={"visibility": "public", "status": "suspended"})
    assert not listed()
    c.put(f"/api/events/{world['event']}", json={"status": "draft"})
    assert not listed()


def test_ics_uses_real_end_time(world):
    text = world["client"].get(f"/api/events/{world['event']}/export.ics").text
    assert "DTSTART:20300101T140000Z" in text and "DTEND:20300101T180000Z" in text


def test_create_and_list_ticket_types_and_seats(world):
    c = world["client"]
    tt = make_ticket_type(world, name="VIP", seat_category="premium", total_quantity=5)
    assert tt["quantity_available"] == 5
    assert len(c.get(f"/api/events/{world['event']}/ticket-types").json()) == 1
    assert c.post(f"/api/events/{world['event']}/ticket-types",
                  json={"name": "x", "price": 1, "total_quantity": 0}).status_code == 400
    assert c.post(f"/api/events/{world['event']}/ticket-types",
                  json={"name": "x", "price": -1, "total_quantity": 1}).status_code == 400
    assert make_seats(world, rows=2, per_row=3)["created"] == 6
    assert len(seat_ids(world)) == 6
    again = c.post(f"/api/events/{world['event']}/seats",
                   json={"section": "T", "category": "standard", "rows": 1, "seats_per_row": 1})
    assert again.status_code == 409
    missing = str(uuid4())
    assert c.post(f"/api/events/{missing}/ticket-types",
                  json={"name": "x", "price": 1, "total_quantity": 1}).status_code == 404


def test_checkout_blocked_when_event_not_on_sale(world):
    tt = make_ticket_type(world)
    run_sql("UPDATE events SET status = 'draft' WHERE id = %s", (world["event"],))
    assert buy(world, tt["id"]).status_code == 409
    run_sql("UPDATE events SET status = 'suspended' WHERE id = %s", (world["event"],))
    assert buy(world, tt["id"]).status_code == 409


def test_paid_sales_gate_only_blocks_paid_tickets(world):
    paid = make_ticket_type(world, name="Paid", price=500)
    free = make_ticket_type(world, name="Free", price=0)
    run_sql("UPDATE events SET is_paid_sales_active = false WHERE id = %s", (world["event"],))
    assert buy(world, paid["id"]).status_code == 403
    assert buy(world, free["id"]).status_code == 201
    world["client"].post(f"/api/events/{world['event']}/activate-paid")
    assert buy(world, paid["id"]).status_code == 201


def test_sale_window_enforced(world):
    future = make_ticket_type(world, name="Later", sales_start_time="2099-01-01T00:00:00+00:00")
    past = make_ticket_type(world, name="Over", sales_end_time="2000-01-01T00:00:00+00:00")
    assert buy(world, future["id"]).status_code == 409
    assert buy(world, past["id"]).status_code == 409


def test_ticket_type_from_other_event_rejected(world):
    other = make_ticket_type(world)
    body = {"attendee_id": world["attendees"][0], "event_id": str(uuid4()),
            "ticket_type_id": other["id"], "attendee_name": "x"}
    assert world["client"].post("/api/orders/checkout", json=body).status_code == 400


def test_multi_ticket_order(world):
    tt = make_ticket_type(world, total_quantity=5, price=1000)
    response = buy(world, tt["id"], quantity=3)
    assert response.status_code == 201
    body = response.json()
    assert len(body["tickets"]) == 3 and float(body["order"]["total_amount"]) == 3000
    assert len({t["qr_code_hash"] for t in body["tickets"]}) == 3
    left = world["client"].get(f"/api/events/{world['event']}/ticket-types").json()[0]["quantity_available"]
    assert left == 2
    too_many = buy(world, tt["id"], quantity=3)
    assert too_many.status_code == 409 and "Only 2 left" in too_many.json()["detail"]
    assert buy(world, tt["id"], quantity=0).status_code == 400


def test_quantity_above_one_not_allowed_with_a_seat(world):
    tt = make_ticket_type(world)
    make_seats(world)
    assert buy(world, tt["id"], quantity=2, seat_id=seat_ids(world)[0]).status_code == 400


def test_promo_percentage_and_fixed(world):
    tt = make_ticket_type(world, price=1000, total_quantity=10)
    run_sql("""INSERT INTO promo_campaigns (event_id, code, discount_type, discount_value, max_redemptions)
               VALUES (%s, %s, 'percentage', 20, 5)""", (world["event"], "PCT" + world["event"][:6]))
    run_sql("""INSERT INTO promo_campaigns (event_id, code, discount_type, discount_value, max_redemptions)
               VALUES (%s, %s, 'fixed', 5000, 5)""", (world["event"], "FIX" + world["event"][:6]))
    pct = buy(world, tt["id"], quantity=2, promo_code="PCT" + world["event"][:6]).json()
    assert float(pct["order"]["total_amount"]) == 1600
    fixed = buy(world, tt["id"], promo_code="FIX" + world["event"][:6]).json()
    assert float(fixed["order"]["total_amount"]) == 0
    count = main.get_connection()
    cur = count.cursor()
    cur.execute("SELECT redemptions_count FROM promo_campaigns WHERE code = %s", ("PCT" + world["event"][:6],))
    assert cur.fetchone()["redemptions_count"] == 1
    cur.close(); count.close()


def test_invalid_expired_and_exhausted_promo(world):
    tt = make_ticket_type(world)
    assert buy(world, tt["id"], promo_code="NOPE").status_code == 404
    code = "OLD" + world["event"][:6]
    run_sql("""INSERT INTO promo_campaigns (event_id, code, discount_type, discount_value, max_redemptions, valid_until)
               VALUES (%s, %s, 'percentage', 10, 5, '2000-01-01')""", (world["event"], code))
    assert buy(world, tt["id"], promo_code=code).status_code == 409
    code2 = "FULL" + world["event"][:6]
    run_sql("""INSERT INTO promo_campaigns (event_id, code, discount_type, discount_value, max_redemptions, redemptions_count)
               VALUES (%s, %s, 'percentage', 10, 1, 1)""", (world["event"], code2))
    assert buy(world, tt["id"], promo_code=code2).status_code == 409


def test_concurrent_promo_cannot_exceed_max_redemptions(world):
    tt = make_ticket_type(world, total_quantity=10)
    code = "ONE" + world["event"][:6]
    run_sql("""INSERT INTO promo_campaigns (event_id, code, discount_type, discount_value, max_redemptions)
               VALUES (%s, %s, 'percentage', 10, 1)""", (world["event"], code))
    barrier = Barrier(2)

    def go(i):
        with TestClient(main.app) as c:
            barrier.wait(timeout=10)
            return c.post("/api/orders/checkout", json={
                "attendee_id": world["attendees"][i], "event_id": world["event"],
                "ticket_type_id": tt["id"], "attendee_name": "x", "promo_code": code})

    with ThreadPoolExecutor(max_workers=2) as ex:
        codes = sorted(r.status_code for r in ex.map(go, range(2)))
    assert codes == [201, 409]


def test_seat_must_match_ticket_type_category(world):
    vip = make_ticket_type(world, name="VIP", seat_category="premium")
    make_seats(world, category="standard")
    assert buy(world, vip["id"], seat_id=seat_ids(world)[0]).status_code == 409
    make_seats(world, category="premium", section="P")
    premium = [s["id"] for s in world["client"].get(f"/api/events/{world['event']}/seats").json()
               if s["category"] == "premium"][0]
    assert buy(world, vip["id"], seat_id=premium).status_code == 201


def test_hold_blocks_other_buyers_and_converts_for_owner(world):
    tt = make_ticket_type(world)
    make_seats(world)
    seat = seat_ids(world)[0]
    c = world["client"]
    first = c.post("/api/seats/hold", json={"seat_id": seat, "held_by_user_id": world["attendees"][0]})
    assert first.status_code == 201
    again = c.post("/api/seats/hold", json={"seat_id": seat, "held_by_user_id": world["attendees"][0]})
    assert again.json()["id"] == first.json()["id"]
    assert c.post("/api/seats/hold", json={"seat_id": seat, "held_by_user_id": world["attendees"][1]}).status_code == 409
    assert buy(world, tt["id"], attendee=1, seat_id=seat).status_code == 409
    assert buy(world, tt["id"], attendee=0, seat_id=seat).status_code == 201
    status = main.get_connection()
    cur = status.cursor()
    cur.execute("SELECT status FROM seat_holds WHERE id = %s", (first.json()["id"],))
    assert cur.fetchone()["status"] == "converted"
    cur.close(); status.close()


def test_expired_hold_frees_the_seat(world):
    tt = make_ticket_type(world)
    make_seats(world)
    seat = seat_ids(world)[0]
    c = world["client"]
    hold = c.post("/api/seats/hold", json={"seat_id": seat, "held_by_user_id": world["attendees"][0]}).json()
    run_sql("UPDATE seat_holds SET expires_at = now() - interval '1 minute' WHERE id = %s", (hold["id"],))
    seat_row = [s for s in c.get(f"/api/events/{world['event']}/seats").json() if s["id"] == seat][0]
    assert seat_row["hold_status"] is None
    assert c.post("/api/seats/hold", json={"seat_id": seat, "held_by_user_id": world["attendees"][1]}).status_code == 201
    run_sql("UPDATE seat_holds SET expires_at = now() - interval '1 minute' WHERE seat_id = %s AND status = 'active'", (seat,))
    assert buy(world, tt["id"], attendee=2, seat_id=seat).status_code == 201


def test_hold_on_unknown_seat_is_404(world):
    r = world["client"].post("/api/seats/hold", json={"seat_id": str(uuid4()), "held_by_user_id": world["attendees"][0]})
    assert r.status_code == 404


def test_unknown_attendee_is_404(world):
    tt = make_ticket_type(world)
    assert buy(world, tt["id"], attendee_id=str(uuid4())).status_code == 404


def test_pdf_and_manual_search(world):
    tt = make_ticket_type(world)
    ticket = buy(world, tt["id"], attendee_name="Aigerim Test").json()["ticket"]
    c = world["client"]
    pdf = c.get(f"/api/tickets/{ticket['id']}/pdf")
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")
    found = c.post("/api/checkin/manual-search", json={"event_id": world["event"], "name": "aigerim"}).json()
    assert [t["id"] for t in found] == [ticket["id"]]
