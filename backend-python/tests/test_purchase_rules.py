from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4

from fastapi.testclient import TestClient

import main
from conftest import fetch_one, run_sql


def test_checkout_blocked_when_event_not_on_sale(kit):
    org, buyer = kit.user("organizer"), kit.user()
    event, tt = kit.event(org, publish=False)
    assert kit.buy(buyer, event["id"], tt["id"]).status_code == 409          #draft
    kit.publish(org, event["id"])
    run_sql("UPDATE events SET is_paid_sales_active = true WHERE id = %s", (event["id"],))
    assert kit.buy(buyer, event["id"], tt["id"]).status_code == 201
    run_sql("UPDATE events SET status = 'suspended' WHERE id = %s", (event["id"],))
    assert kit.buy(buyer, event["id"], tt["id"]).status_code == 409
    run_sql("UPDATE events SET status = 'completed' WHERE id = %s", (event["id"],))
    assert kit.buy(buyer, event["id"], tt["id"]).status_code == 409


def test_paid_sales_gate_only_blocks_paid_tickets(kit):
    org, buyer = kit.user("organizer"), kit.user()
    event, paid = kit.event(org, publish=True, price=500)
    run_sql("UPDATE events SET is_paid_sales_active = false WHERE id = %s", (event["id"],))
    free = kit.ticket_type(org, event["id"], name="Free", price=0)
    assert kit.buy(buyer, event["id"], paid["id"]).status_code == 403
    assert kit.buy(buyer, event["id"], free["id"]).status_code == 201
    run_sql("UPDATE events SET is_paid_sales_active = true WHERE id = %s", (event["id"],))
    assert kit.buy(buyer, event["id"], paid["id"]).status_code == 201
    run_sql("UPDATE events SET paid_sales_suspended = true WHERE id = %s", (event["id"],))
    suspended = kit.buy(buyer, event["id"], paid["id"])
    assert suspended.status_code == 403 and "suspended" in suspended.json()["detail"]
    assert kit.buy(buyer, event["id"], free["id"]).status_code == 201         #free tickets unaffected


def test_sale_window_enforced(kit):
    org, buyer = kit.user("organizer"), kit.user()
    event, _ = kit.event(org)
    future = kit.ticket_type(org, event["id"], name="Later", sales_start_time="2099-01-01T00:00:00+00:00")
    past = kit.ticket_type(org, event["id"], name="Over", sales_end_time="2000-01-01T00:00:00+00:00")
    assert kit.buy(buyer, event["id"], future["id"]).status_code == 409
    assert kit.buy(buyer, event["id"], past["id"]).status_code == 409


def test_ticket_type_must_belong_to_the_event(kit):
    org, buyer = kit.user("organizer"), kit.user()
    event, tt = kit.event(org)
    other_event, _ = kit.event(org)
    assert kit.buy(buyer, other_event["id"], tt["id"]).status_code == 400
    assert kit.buy(buyer, event["id"], str(uuid4())).status_code == 404
    assert kit.buy(buyer, str(uuid4()), tt["id"]).status_code == 400


def test_multi_ticket_order_and_per_order_limit(kit):
    org, buyer = kit.user("organizer"), kit.user()
    event, tt = kit.event(org, quantity=5)
    capped = kit.ticket_type(org, event["id"], name="Capped", max_per_order=2, quantity=10)
    response = kit.buy(buyer, event["id"], tt["id"], quantity=3)
    assert response.status_code == 201
    body = response.json()
    assert len(body["tickets"]) == 3 and float(body["order"]["total_amount"]) == 3000
    assert len({t["qr_code_hash"] for t in body["tickets"]}) == 3
    assert fetch_one("SELECT quantity_available FROM ticket_types WHERE id = %s", (tt["id"],))["quantity_available"] == 2
    too_many = kit.buy(buyer, event["id"], tt["id"], quantity=3)
    assert too_many.status_code == 409 and "Only 2 left" in too_many.json()["detail"]
    assert kit.buy(buyer, event["id"], tt["id"], quantity=0).status_code == 400
    over_limit = kit.buy(buyer, event["id"], capped["id"], quantity=3)
    assert over_limit.status_code == 400 and "at most 2" in over_limit.json()["detail"]
    assert kit.buy(buyer, event["id"], capped["id"], quantity=2).status_code == 201


def test_free_registration_creates_zero_value_order_and_confirmation(kit):
    org, buyer = kit.user("organizer"), kit.user()
    event, tt = kit.event(org, free=True)
    response = kit.buy(buyer, event["id"], tt["id"])
    assert response.status_code == 201 and float(response.json()["order"]["total_amount"]) == 0
    from conftest import notifications_for
    assert notifications_for(buyer.id, "order_confirmation")


def test_quantity_above_one_not_allowed_with_a_seat(kit):
    org, buyer = kit.user("organizer"), kit.user()
    event, tt = kit.event(org)
    seats = kit.seats(org, event["id"])
    assert kit.buy(buyer, event["id"], tt["id"], quantity=2, seat_id=seats[0]).status_code == 400


def test_seat_must_match_ticket_type_category(kit):
    org, buyer = kit.user("organizer"), kit.user()
    event, _ = kit.event(org)
    vip = kit.ticket_type(org, event["id"], name="VIP", seat_category="premium")
    standard_seats = kit.seats(org, event["id"], category="standard")
    assert kit.buy(buyer, event["id"], vip["id"], seat_id=standard_seats[0]).status_code == 409
    premium_seats = kit.seats(org, event["id"], category="premium", section="P")
    assert kit.buy(buyer, event["id"], vip["id"], seat_id=premium_seats[0]).status_code == 201
    assert kit.buy(buyer, event["id"], vip["id"], seat_id=str(uuid4())).status_code == 404


def test_seat_holds_block_others_and_convert_for_the_owner(kit):
    org, a, b = kit.user("organizer"), kit.user(), kit.user()
    event, tt = kit.event(org)
    seat = kit.seats(org, event["id"])[0]
    c = kit.client
    first = c.post("/api/seats/hold", json={"seat_id": seat}, headers=a.h)
    assert first.status_code == 201
    assert c.post("/api/seats/hold", json={"seat_id": seat}, headers=a.h).json()["id"] == first.json()["id"]
    assert c.post("/api/seats/hold", json={"seat_id": seat}, headers=b.h).status_code == 409
    assert kit.buy(b, event["id"], tt["id"], seat_id=seat).status_code == 409
    assert kit.buy(a, event["id"], tt["id"], seat_id=seat).status_code == 201
    assert fetch_one("SELECT status FROM seat_holds WHERE id = %s", (first.json()["id"],))["status"] == "converted"
    assert c.post("/api/seats/hold", json={"seat_id": seat}, headers=b.h).status_code == 409   #now sold


def test_expired_hold_frees_the_seat(kit):
    org, a, b, c3 = kit.user("organizer"), kit.user(), kit.user(), kit.user()
    event, tt = kit.event(org)
    seat = kit.seats(org, event["id"])[0]
    c = kit.client
    hold = c.post("/api/seats/hold", json={"seat_id": seat}, headers=a.h).json()
    run_sql("UPDATE seat_holds SET expires_at = now() - interval '1 minute' WHERE id = %s", (hold["id"],))
    row = [s for s in c.get(f"/api/events/{event['id']}/seats").json() if s["id"] == seat][0]
    assert row["hold_status"] is None
    assert c.post("/api/seats/hold", json={"seat_id": seat}, headers=b.h).status_code == 201
    run_sql("UPDATE seat_holds SET expires_at = now() - interval '1 minute' WHERE seat_id = %s AND status = 'active'", (seat,))
    assert kit.buy(c3, event["id"], tt["id"], seat_id=seat).status_code == 201


def test_hold_on_unknown_seat_is_404_and_needs_an_identity(kit):
    a = kit.user()
    assert kit.client.post("/api/seats/hold", json={"seat_id": str(uuid4())}, headers=a.h).status_code == 404
    assert kit.client.post("/api/seats/hold", json={"seat_id": str(uuid4())}).status_code == 401


def test_unknown_attendee_is_404_and_identity_rules(kit):
    org, buyer, other = kit.user("organizer"), kit.user(), kit.user()
    event, tt = kit.event(org)
    ghost = kit.client.post("/api/orders/checkout", json={
        "attendee_id": str(uuid4()), "event_id": event["id"], "ticket_type_id": tt["id"], "attendee_name": "x"})
    assert ghost.status_code == 404
    #signed in, but naming somebody else
    stolen = kit.client.post("/api/orders/checkout", headers=buyer.h, json={
        "attendee_id": other.id, "event_id": event["id"], "ticket_type_id": tt["id"], "attendee_name": "x"})
    assert stolen.status_code == 403
    #neither a token nor an id
    anonymous = kit.client.post("/api/orders/checkout", json={
        "event_id": event["id"], "ticket_type_id": tt["id"], "attendee_name": "x"})
    assert anonymous.status_code == 401
    #the older, token-less way still works (kept for the existing mobile app)
    assert kit.buy(buyer, event["id"], tt["id"], signed_in=False).status_code == 201


def test_my_tickets_uses_the_token_and_cannot_peek_at_others(kit):
    org, a, b = kit.user("organizer"), kit.user(), kit.user()
    event, tt = kit.event(org)
    kit.buy(a, event["id"], tt["id"], quantity=2)
    assert len(kit.client.get("/api/tickets/my-tickets", headers=a.h).json()) == 2
    assert kit.client.get("/api/tickets/my-tickets", headers=b.h).json() == []
    assert kit.client.get(f"/api/tickets/my-tickets?attendee_id={a.id}", headers=b.h).status_code == 403
    assert len(kit.client.get(f"/api/tickets/my-tickets?attendee_id={a.id}").json()) == 2   #legacy
    assert kit.client.get("/api/tickets/my-tickets").status_code == 401


def test_quote_matches_checkout(kit):
    org, buyer = kit.user("organizer"), kit.user()
    event, tt = kit.event(org, price=1000)
    kit.client.post(f"/api/events/{event['id']}/promo-campaigns", headers=org.h, json={
        "code": "Q" + event["id"][:6], "discount_type": "percentage", "discount_value": 25, "max_redemptions": 5})
    code = "Q" + event["id"][:6].upper()
    quote = kit.client.post("/api/orders/quote", json={"event_id": event["id"], "ticket_type_id": tt["id"], "quantity": 2, "promo_code": code.lower()})
    assert quote.status_code == 200
    q = quote.json()
    assert float(q["subtotal"]) == 2000 and float(q["discount"]) == 500 and float(q["total"]) == 1500 and q["promo_code"] == code
    order = kit.buy(buyer, event["id"], tt["id"], quantity=2, promo_code=code).json()["order"]
    assert float(order["total_amount"]) == float(q["total"])
    assert fetch_one("SELECT redemptions_count FROM promo_campaigns WHERE code = %s", (code,))["redemptions_count"] == 1   #quote did not consume one
    bad = kit.client.post("/api/orders/quote", json={"event_id": event["id"], "ticket_type_id": tt["id"], "promo_code": "NOPE"})
    assert bad.status_code == 404
    assert kit.client.post("/api/orders/quote", json={"event_id": event["id"], "ticket_type_id": str(uuid4())}).status_code == 404


def test_pdf_has_a_qr_image_and_handles_kazakh_and_russian_names(kit):
    org, buyer = kit.user("organizer"), kit.user()
    event, tt = kit.event(org, title="Концерт Алматы")
    seat = kit.seats(org, event["id"])[0]
    ticket = kit.buy(buyer, event["id"], tt["id"], seat_id=seat, attendee_name="Әйгерім Қасымова").json()["ticket"]
    pdf = kit.client.get(f"/api/tickets/{ticket['id']}/pdf")
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF") and b"/Subtype /Image" in pdf.content
    png = kit.client.get(f"/api/tickets/{ticket['id']}/qr.png")
    assert png.status_code == 200 and png.content.startswith(b"\x89PNG")
    assert kit.client.get(f"/api/tickets/{uuid4()}/pdf").status_code == 404
    detail = kit.client.get(f"/api/tickets/{ticket['id']}").json()
    assert detail["section"] == "T" and detail["event_title"] == "Концерт Алматы"


def test_concurrent_last_ticket_and_last_seat_and_last_promo(kit):
    org, a, b = kit.user("organizer"), kit.user(), kit.user()
    event, tt = kit.event(org, quantity=1)
    seats = kit.seats(org, event["id"], per_row=1)
    code = "ONE" + event["id"][:6].upper()
    kit.client.post(f"/api/events/{event['id']}/promo-campaigns", headers=org.h, json={
        "code": code, "discount_type": "percentage", "discount_value": 10, "max_redemptions": 1})
    two = kit.ticket_type(org, event["id"], name="Two", quantity=5)

    def race(body_for):
        barrier = Barrier(2)
        def go(i):
            with TestClient(main.app) as c:
                barrier.wait(timeout=10)
                who = (a, b)[i]
                return c.post("/api/orders/checkout", headers=who.h, json=body_for(i)).status_code
        with ThreadPoolExecutor(max_workers=2) as ex:
            return sorted(ex.map(go, range(2)))

    base = {"event_id": event["id"], "attendee_name": "x"}
    assert race(lambda i: {**base, "ticket_type_id": tt["id"]}) == [201, 409]
    assert race(lambda i: {**base, "ticket_type_id": two["id"], "seat_id": seats[0]}) == [201, 409]
    assert race(lambda i: {**base, "ticket_type_id": two["id"], "promo_code": code}) == [201, 409]
