"""Event extras, registration window, processing fee, failed payments, multi-seat orders,
event-update notifications and payout status."""
from conftest import fetch_one, notifications_for, run_sql


def setup_event(kit, **kw):
    org = kit.user("organizer")
    event, tt = kit.event(org, **kw)
    return org, event, tt


# ---------- event extras ----------

def test_event_image_and_refund_policy_are_saved_validated_and_copied(kit):
    org = kit.user("organizer")
    body = {"title": "X", "venue_name": "V", "start_time": "2030-01-01T19:00:00+05:00", "capacity": 10,
            "image_url": "https://example.com/a.jpg", "refund_policy": "Full refund up to 48h before."}
    created = kit.client.post("/api/events", json=body, headers=org.h)
    assert created.status_code == 201
    assert created.json()["image_url"] == "https://example.com/a.jpg"
    assert created.json()["refund_policy"].startswith("Full refund")

    bad = kit.client.post("/api/events", json={**body, "image_url": "javascript:alert(1)"}, headers=org.h)
    assert bad.status_code == 400
    bad_update = kit.client.put(f"/api/events/{created.json()['id']}", json={"image_url": "ftp://x"}, headers=org.h)
    assert bad_update.status_code == 400

    copy = kit.client.post(f"/api/events/{created.json()['id']}/duplicate", headers=org.h)
    assert copy.status_code in (200, 201)
    assert copy.json()["image_url"] == "https://example.com/a.jpg"
    assert copy.json()["refund_policy"].startswith("Full refund")


# ---------- registration window ----------

def test_registration_window_blocks_early_and_late_buyers(kit):
    org, event, tt = setup_event(kit)
    buyer = kit.user()
    run_sql("UPDATE events SET registration_opens_at = now() + interval '1 day' WHERE id = %s", (event["id"],))
    early = kit.buy(buyer, event["id"], tt["id"])
    assert early.status_code == 409 and "not opened" in early.json()["detail"]
    quote = kit.client.post("/api/orders/quote", json={"event_id": event["id"], "ticket_type_id": tt["id"], "quantity": 1})
    assert quote.status_code == 409

    run_sql("UPDATE events SET registration_opens_at = now() - interval '2 days', "
            "registration_closes_at = now() - interval '1 day' WHERE id = %s", (event["id"],))
    late = kit.buy(buyer, event["id"], tt["id"])
    assert late.status_code == 409 and "closed" in late.json()["detail"]

    run_sql("UPDATE events SET registration_closes_at = now() + interval '1 day' WHERE id = %s", (event["id"],))
    assert kit.buy(buyer, event["id"], tt["id"]).status_code == 201


def test_registration_window_must_close_after_it_opens(kit):
    org = kit.user("organizer")
    body = {"title": "X", "venue_name": "V", "start_time": "2030-01-01T19:00:00+05:00", "capacity": 10,
            "registration_opens_at": "2029-12-02T10:00:00+05:00", "registration_closes_at": "2029-12-01T10:00:00+05:00"}
    assert kit.client.post("/api/events", json=body, headers=org.h).status_code == 400


# ---------- processing fee ----------

def test_processing_fee_is_quoted_stored_and_used_in_analytics(kit):
    org, event, tt = setup_event(kit, price=1000)
    buyer = kit.user()
    quote = kit.client.post("/api/orders/quote", json={"event_id": event["id"], "ticket_type_id": tt["id"], "quantity": 2})
    assert float(quote.json()["total"]) == 2000 and float(quote.json()["processing_fee"]) == 60
    order = kit.buy(buyer, event["id"], tt["id"], quantity=2).json()["order"]
    assert float(fetch_one("SELECT processing_fee FROM orders WHERE id = %s", (order["id"],))["processing_fee"]) == 60
    money = kit.client.get(f"/api/events/{event['id']}/analytics", headers=org.h).json()["money"]
    assert float(money["processing_fee_simulated"]) == 60
    assert float(money["estimated_payout"]) == 1940

    # a refund gives the fee back, so it no longer counts
    assert kit.client.post(f"/api/orders/{order['id']}/refund", json={}, headers=org.h).status_code == 200
    money = kit.client.get(f"/api/events/{event['id']}/analytics", headers=org.h).json()["money"]
    assert float(money["processing_fee_simulated"]) == 0 and float(money["estimated_payout"]) == 0


def test_free_orders_have_no_fee(kit):
    org, event, tt = setup_event(kit, free=True)
    buyer = kit.user()
    quote = kit.client.post("/api/orders/quote", json={"event_id": event["id"], "ticket_type_id": tt["id"], "quantity": 1})
    assert float(quote.json()["processing_fee"]) == 0


# ---------- failed payment ----------

def test_failed_payment_issues_nothing_and_is_visible_to_admin(kit):
    org, event, tt = setup_event(kit, price=1000, quantity=5)
    buyer = kit.user()
    admin = kit.user("platform_admin")
    promo = kit.client.post(f"/api/events/{event['id']}/promo-campaigns", headers=org.h,
                            json={"code": "FAILTEST", "discount_type": "fixed", "discount_value": 100, "max_redemptions": 3})
    assert promo.status_code == 201

    failed = kit.buy(buyer, event["id"], tt["id"], quantity=2, promo_code="FAILTEST", simulate_payment="fail")
    assert failed.status_code == 402
    assert failed.json()["status"] == "failed" and failed.json()["order_id"]

    assert fetch_one("SELECT count(*) AS n FROM tickets WHERE event_id = %s", (event["id"],))["n"] == 0
    assert fetch_one("SELECT quantity_available FROM ticket_types WHERE id = %s", (tt["id"],))["quantity_available"] == 5
    assert fetch_one("SELECT count(*) AS n FROM promo_redemptions r JOIN promo_campaigns c ON c.id = r.campaign_id "
                     "WHERE c.event_id = %s", (event["id"],))["n"] == 0
    assert fetch_one("SELECT redemptions_count FROM promo_campaigns WHERE event_id = %s", (event["id"],))["redemptions_count"] == 0
    assert notifications_for(buyer.id, "payment_failed")
    assert fetch_one("SELECT count(*) AS n FROM audit_log WHERE event_id = %s AND action = 'payment_failed'",
                     (event["id"],))["n"] == 1

    # failed attempts do not count as sales
    money = kit.client.get(f"/api/events/{event['id']}/analytics", headers=org.h).json()["money"]
    assert float(money["gross_sales"]) == 0 and float(money["processing_fee_simulated"]) == 0

    listed = kit.client.get("/api/admin/payment-failures", headers=admin.h).json()
    assert failed.json()["order_id"] in [row["id"] for row in listed]
    by_status = kit.client.get("/api/admin/orders?status=failed", headers=admin.h).json()
    assert failed.json()["order_id"] in [row["id"] for row in by_status]
    assert kit.client.get("/api/admin/payment-failures", headers=buyer.h).status_code == 403

    # the buyer can simply try again
    retry = kit.buy(buyer, event["id"], tt["id"], quantity=2, promo_code="FAILTEST")
    assert retry.status_code == 201


def test_failed_payment_keeps_the_seat_hold_and_validates_input(kit):
    org, event, tt = setup_event(kit, price=1000)
    seats = kit.seats(org, event["id"], per_row=2)
    buyer = kit.user()
    assert kit.client.post("/api/seats/hold", json={"seat_id": seats[0]}, headers=buyer.h).status_code == 201

    failed = kit.buy(buyer, event["id"], tt["id"], seat_id=seats[0], simulate_payment="fail")
    assert failed.status_code == 402
    hold = fetch_one("SELECT status FROM seat_holds WHERE seat_id = %s ORDER BY created_at DESC", (seats[0],))
    assert hold["status"] == "active"
    assert kit.buy(buyer, event["id"], tt["id"], seat_id=seats[0]).status_code == 201

    assert kit.buy(buyer, event["id"], tt["id"], simulate_payment="maybe").status_code == 400


def test_free_ticket_cannot_fail_payment(kit):
    org, event, tt = setup_event(kit, free=True)
    buyer = kit.user()
    assert kit.buy(buyer, event["id"], tt["id"], simulate_payment="fail").status_code == 400


# ---------- multi-seat orders ----------

def test_one_order_can_buy_several_seats(kit):
    org, event, tt = setup_event(kit, price=1000, quantity=5)
    seats = kit.seats(org, event["id"], per_row=3)
    buyer = kit.user()
    response = kit.buy(buyer, event["id"], tt["id"], seat_ids=seats[:2])
    assert response.status_code == 201, response.text
    rows = fetch_one("SELECT count(*) AS n, count(DISTINCT seat_id) AS seats FROM tickets WHERE event_id = %s", (event["id"],))
    assert rows["n"] == 2 and rows["seats"] == 2
    assert fetch_one("SELECT quantity_available FROM ticket_types WHERE id = %s", (tt["id"],))["quantity_available"] == 3
    assert float(response.json()["order"]["total_amount"]) == 2000


def test_multi_seat_order_is_all_or_nothing_and_checks_counts(kit):
    org, event, tt = setup_event(kit, price=1000, quantity=5)
    seats = kit.seats(org, event["id"], per_row=3)
    first, second = kit.user(), kit.user()
    assert kit.buy(first, event["id"], tt["id"], seat_id=seats[0]).status_code == 201

    clash = kit.buy(second, event["id"], tt["id"], seat_ids=[seats[1], seats[0]])
    assert clash.status_code == 409
    assert fetch_one("SELECT count(*) AS n FROM tickets WHERE event_id = %s", (event["id"],))["n"] == 1

    assert kit.buy(second, event["id"], tt["id"], seat_ids=[seats[1], seats[2]], quantity=3).status_code == 400
    assert kit.buy(second, event["id"], tt["id"], seat_ids=[seats[1], seats[1]]).status_code == 400
    assert kit.buy(second, event["id"], tt["id"], seat_id=seats[1], seat_ids=[seats[2]]).status_code == 400


def test_multi_seat_order_respects_other_peoples_holds(kit):
    org, event, tt = setup_event(kit, price=1000, quantity=5)
    seats = kit.seats(org, event["id"], per_row=3)
    holder, buyer = kit.user(), kit.user()
    assert kit.client.post("/api/seats/hold", json={"seat_id": seats[1]}, headers=holder.h).status_code == 201
    blocked = kit.buy(buyer, event["id"], tt["id"], seat_ids=[seats[0], seats[1]])
    assert blocked.status_code == 409
    assert fetch_one("SELECT count(*) AS n FROM tickets WHERE event_id = %s", (event["id"],))["n"] == 0


# ---------- event update notifications ----------

def test_changing_time_or_venue_notifies_ticket_buyers_only(kit):
    org, event, tt = setup_event(kit)
    buyer, bystander, refunded = kit.user(), kit.user(), kit.user()
    assert kit.buy(buyer, event["id"], tt["id"]).status_code == 201
    assert kit.buy(bystander, event["id"], tt["id"], simulate_payment="fail").status_code == 402
    gone = kit.buy(refunded, event["id"], tt["id"]).json()["order"]
    assert kit.client.post(f"/api/orders/{gone['id']}/refund", json={}, headers=org.h).status_code == 200

    quiet = kit.client.put(f"/api/events/{event['id']}", json={"description": "new text"}, headers=org.h)
    assert quiet.status_code == 200 and not notifications_for(buyer.id, "event_updated")

    same = kit.client.put(f"/api/events/{event['id']}", json={"venue_name": "Test Hall"}, headers=org.h)
    assert same.status_code == 200 and not notifications_for(buyer.id, "event_updated")

    moved = kit.client.put(f"/api/events/{event['id']}", json={"venue_name": "New Hall"}, headers=org.h)
    assert moved.status_code == 200
    assert len(notifications_for(buyer.id, "event_updated")) == 1
    assert not notifications_for(bystander.id, "event_updated")
    assert not notifications_for(refunded.id, "event_updated")


# ---------- payout status ----------

def test_admin_moves_payout_status_and_organizer_is_told(kit):
    org, event, tt = setup_event(kit)
    admin, other = kit.user("platform_admin"), kit.user("organizer")
    url = f"/api/admin/events/{event['id']}/payout-status"
    assert fetch_one("SELECT payout_status FROM events WHERE id = %s", (event["id"],))["payout_status"] == "not_started"

    assert kit.client.put(url, json={"status": "paid"}, headers=other.h).status_code == 403
    assert kit.client.put(url, json={"status": "banana"}, headers=admin.h).status_code == 400

    done = kit.client.put(url, json={"status": "processing"}, headers=admin.h)
    assert done.status_code == 200 and done.json()["changed"] is True
    assert len(notifications_for(org.id, "payout_status")) == 1
    again = kit.client.put(url, json={"status": "processing"}, headers=admin.h)
    assert again.json()["changed"] is False and len(notifications_for(org.id, "payout_status")) == 1

    money = kit.client.get(f"/api/events/{event['id']}/analytics", headers=org.h).json()["money"]
    assert money["payout_status"] == "processing"
    assert fetch_one("SELECT count(*) AS n FROM audit_log WHERE event_id = %s AND action = 'payout_status_changed'",
                     (event["id"],))["n"] == 1


# ---------- finished events ----------

def test_finished_events_are_hidden_from_the_public_list_and_cannot_be_bought(kit):
    org, event, tt = setup_event(kit)
    buyer = kit.user()
    run_sql("UPDATE events SET start_time = now() - interval '5 hours', end_time = now() - interval '3 hours' WHERE id = %s",
            (event["id"],))
    listed = [e["id"] for e in kit.client.get("/api/events").json()]
    assert event["id"] not in listed
    owner_list = [e["id"] for e in kit.client.get(f"/api/events?organizer_id={org.id}", headers=org.h).json()]
    assert event["id"] in owner_list  # the organizer still sees it, as history
    ended = kit.buy(buyer, event["id"], tt["id"])
    assert ended.status_code == 409 and "ended" in ended.json()["detail"]

    # no end time set: it counts as over 2 hours after the start
    run_sql("UPDATE events SET start_time = now() - interval '1 hour', end_time = NULL WHERE id = %s", (event["id"],))
    assert event["id"] in [e["id"] for e in kit.client.get("/api/events").json()]
    run_sql("UPDATE events SET start_time = now() - interval '3 hours' WHERE id = %s", (event["id"],))
    assert event["id"] not in [e["id"] for e in kit.client.get("/api/events").json()]


def test_seats_of_a_cancelled_event_cannot_be_held(kit):
    org, event, tt = setup_event(kit)
    seats = kit.seats(org, event["id"])
    buyer = kit.user()
    assert kit.client.post(f"/api/events/{event['id']}/cancel", headers=org.h).status_code == 200
    assert kit.client.post("/api/seats/hold", json={"seat_id": seats[0]}, headers=buyer.h).status_code == 409


# ---------- calendar ----------

def test_calendar_file_sequence_rises_when_the_event_changes_and_on_cancel(kit):
    org, event, tt = setup_event(kit)

    def sequence():
        text = kit.client.get(f"/api/events/{event['id']}/export.ics").text
        assert "X-WR-TIMEZONE:Asia/Almaty" in text and f"UID:{event['id']}@biletflow" in text
        return int([l for l in text.splitlines() if l.startswith("SEQUENCE:")][0].split(":")[1])

    first = sequence()
    kit.client.put(f"/api/events/{event['id']}", json={"venue_name": "Other Hall"}, headers=org.h)
    second = sequence()
    assert second > first
    kit.client.post(f"/api/events/{event['id']}/cancel", headers=org.h)
    assert sequence() > second
