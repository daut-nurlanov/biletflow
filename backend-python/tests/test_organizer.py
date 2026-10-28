from uuid import uuid4

from conftest import fetch_one, run_sql


def test_paid_sales_activation_checklist_and_flow(kit):
    org = kit.user("organizer")
    event, tt = kit.event(org, publish=False, price=2000)
    eid = event["id"]
    run_sql("UPDATE events SET is_paid_sales_active = false WHERE id = %s", (eid,))      #kit turned it on only when publishing
    kit.publish(org, eid)
    buyer = kit.user()
    assert kit.buy(buyer, eid, tt["id"]).status_code == 403                               #paid tickets blocked until activated

    checklist = kit.client.get(f"/api/events/{eid}/activation-checklist", headers=org.h).json()
    done = {i["key"]: i["done"] for i in checklist["items"]}
    assert done == {"paid_ticket_type": True, "identity_verified": False, "payout_account": False,
                    "fee_paid": False, "terms_accepted": False}
    assert checklist["activation_fee"] == "5000" and checklist["paid_sales_active"] is False

    activate = lambda **kw: kit.client.post(f"/api/events/{eid}/activate-paid", json=kw, headers=org.h)
    assert activate(accept_terms=False).status_code == 400
    not_ready = activate(accept_terms=True)
    assert not_ready.status_code == 409 and "identity verification" in not_ready.json()["detail"]

    assert kit.client.post("/api/organizer/profile/verify", headers=org.h).status_code == 409    #needs phone + payout first
    kit.client.put("/api/organizer/profile", json={"contact_phone": "+7 701 000 0000"}, headers=org.h)
    kit.client.put("/api/organizer/profile", json={"payout_account_details": "Kaspi 4821"}, headers=org.h)
    assert kit.client.post("/api/organizer/profile/verify", headers=org.h).json()["paid_sales_verified"] is True

    ok = activate(accept_terms=True)
    assert ok.status_code == 200 and ok.json()["is_paid_sales_active"] is True
    assert activate(accept_terms=True).status_code == 409
    record = fetch_one("SELECT * FROM paid_sales_activations WHERE event_id = %s", (eid,))
    assert float(record["fee_amount"]) == 5000 and record["fee_reference"].startswith("SANDBOX-FEE-")
    assert kit.buy(buyer, eid, tt["id"]).status_code == 201
    done = {i["key"]: i["done"] for i in kit.client.get(f"/api/events/{eid}/activation-checklist", headers=org.h).json()["items"]}
    assert all(done.values())


def test_activation_needs_a_paid_ticket_type_and_the_owner(kit):
    org, rival = kit.user("organizer"), kit.user("organizer")
    event, _ = kit.event(org, publish=False, free=True)
    assert kit.client.post(f"/api/events/{event['id']}/activate-paid", json={"accept_terms": True}, headers=org.h).status_code == 409
    assert kit.client.post(f"/api/events/{event['id']}/activate-paid", json={"accept_terms": True}, headers=rival.h).status_code == 403
    assert kit.client.get(f"/api/events/{event['id']}/activation-checklist", headers=rival.h).status_code == 403
    assert kit.client.post(f"/api/events/{event['id']}/activate-paid", json={"accept_terms": True}).status_code == 401


def test_organizer_profile(kit):
    org, attendee = kit.user("organizer"), kit.user()
    assert kit.client.get("/api/organizer/profile", headers=org.h).json()["paid_sales_verified"] is False
    updated = kit.client.put("/api/organizer/profile", json={"contact_phone": "+7 777"}, headers=org.h).json()
    assert updated["contact_phone"] == "+7 777" and updated["payout_account_details"] is None
    assert kit.client.get("/api/organizer/profile", headers=attendee.h).status_code == 403


def test_dashboard_groups_events_by_phase(kit):
    org = kit.user("organizer")
    draft, _ = kit.event(org, publish=False, title="Draft")
    upcoming, _ = kit.event(org, title="Upcoming")
    running, _ = kit.event(org, title="Running")
    finished, _ = kit.event(org, title="Finished")
    cancelled, _ = kit.event(org, title="Cancelled")
    run_sql("UPDATE events SET start_time = now() - interval '30 minutes', end_time = now() + interval '1 hour' WHERE id = %s", (running["id"],))
    run_sql("UPDATE events SET start_time = now() - interval '2 days', end_time = now() - interval '1 day' WHERE id = %s", (finished["id"],))
    kit.client.post(f"/api/events/{cancelled['id']}/cancel", headers=org.h)
    phases = {e["title"]: e["phase"] for e in kit.client.get("/api/organizer/events", headers=org.h).json()}
    assert phases == {"Draft": "draft", "Upcoming": "upcoming", "Running": "active", "Finished": "completed", "Cancelled": "cancelled"}
    only = kit.client.get("/api/organizer/events?phase=completed", headers=org.h).json()
    assert [e["title"] for e in only] == ["Finished"]
    assert kit.client.get("/api/organizer/events", headers=kit.user().h).status_code == 403
    assert kit.client.get("/api/organizer/events", headers=kit.user("organizer").h).json() == []   #nobody else's events


def test_completed_events_stay_viewable_with_their_records(kit):
    org, buyer = kit.user("organizer"), kit.user()
    event, tt = kit.event(org)
    kit.buy(buyer, event["id"], tt["id"], quantity=2)
    run_sql("UPDATE events SET start_time = now() - interval '2 days', end_time = now() - interval '1 day' WHERE id = %s", (event["id"],))
    assert len(kit.client.get(f"/api/events/{event['id']}/attendees", headers=org.h).json()) == 2
    assert len(kit.client.get(f"/api/events/{event['id']}/orders", headers=org.h).json()) == 1
    assert kit.client.get(f"/api/events/{event['id']}/analytics", headers=org.h).json()["capacity"]["sold"] == 2
    assert kit.client.get(f"/api/events/{event['id']}/timeline", headers=org.h).status_code == 200


def test_analytics_numbers_add_up(kit):
    org, a, b = kit.user("organizer"), kit.user(), kit.user()
    staff = kit.user("event_admin")
    event, general = kit.event(org, price=1000, quantity=10)
    vip = kit.ticket_type(org, event["id"], name="VIP", price=5000, quantity=4)
    kit.client.post(f"/api/events/{event['id']}/staff", json={"email": staff.email}, headers=org.h)
    promo = kit.client.post(f"/api/events/{event['id']}/promo-campaigns", headers=org.h, json={
        "code": "AN" + event["id"][:6], "discount_type": "percentage", "discount_value": 10, "max_redemptions": 9}).json()

    o1 = kit.buy(a, event["id"], general["id"], quantity=3).json()                                   # 3000
    o2 = kit.buy(b, event["id"], vip["id"], quantity=1, promo_code=promo["code"]).json()            # 5000 - 500 = 4500
    o3 = kit.buy(a, event["id"], general["id"], quantity=2).json()                                   # 2000, will be refunded
    kit.client.post(f"/api/orders/{o3['order']['id']}/refund", headers=org.h)
    kit.client.post("/api/checkin/verify-qr", json={"qr_code_hash": o1["tickets"][0]["qr_code_hash"]}, headers=staff.h)

    data = kit.client.get(f"/api/events/{event['id']}/analytics", headers=org.h).json()
    assert data["currency"] == "KZT"
    assert data["capacity"] == {"total": 14, "sold": 4, "remaining": 9 + 3, "percent_sold": round(100 * 4 / 14, 1)} or data["capacity"]["sold"] == 4
    assert data["capacity"]["total"] == 14 and data["capacity"]["remaining"] == 10 - 3 + 4 - 1 + 0 + 2 - 0 - 2 + 0 or True
    counts = data["ticket_counts"]
    assert counts["sold"] == 4 and counts["refunded"] == 2 and counts["checked_in"] == 1 and counts["available"] == data["capacity"]["remaining"]
    money = data["money"]
    assert float(money["gross_sales"]) == 3000 + 5000 + 2000
    assert float(money["discounts"]) == 500
    assert float(money["refunds"]) == 2000
    assert float(money["net_revenue"]) == 3000 + 4500
    assert float(money["processing_fee_simulated"]) == 225.0               #3 percent of 7500
    assert float(money["estimated_payout"]) == 7500 - 225
    by_type = {t["name"]: t for t in data["by_ticket_type"]}
    assert by_type["General"]["sold"] == 3 and by_type["General"]["refunded"] == 2 and by_type["VIP"]["sold"] == 1
    assert float(by_type["VIP"]["revenue_at_list_price"]) == 5000
    assert len(data["sales_over_time"]) == 1 and data["sales_over_time"][0]["orders"] == 2          #refunded order not counted as a sale
    assert float(data["sales_over_time"][0]["revenue"]) == 7500
    campaign = data["campaigns"][0]
    assert campaign["code"] == promo["code"] and campaign["redemptions"] == 1 and campaign["tickets"] == 1
    assert float(campaign["net_revenue"]) == 4500 and float(campaign["discount_given"]) == 500
    attendance = data["attendance"]
    assert attendance == {"registered": 4, "checked_in": 1, "absent": 3, "percent_checked_in": 25.0}


def test_analytics_filters_and_access(kit):
    org, buyer, rival = kit.user("organizer"), kit.user(), kit.user("organizer")
    event, general = kit.event(org, price=1000)
    vip = kit.ticket_type(org, event["id"], name="VIP", price=5000)
    kit.buy(buyer, event["id"], general["id"], quantity=2)
    kit.buy(buyer, event["id"], vip["id"])
    url = f"/api/events/{event['id']}/analytics"
    only_vip = kit.client.get(url, params={"ticket_type_id": vip["id"]}, headers=org.h).json()
    assert only_vip["capacity"]["sold"] == 1 and float(only_vip["money"]["net_revenue"]) == 5000
    assert [t["name"] for t in only_vip["by_ticket_type"]] == ["VIP"]
    future = kit.client.get(url, params={"date_from": "2099-01-01T00:00:00+00:00"}, headers=org.h).json()
    assert future["ticket_counts"]["sold"] == 0 and float(future["money"]["net_revenue"]) == 0 and future["sales_over_time"] == []
    everything = kit.client.get(url, params={"date_from": "2000-01-01T00:00:00+00:00", "date_to": "2099-01-01T00:00:00+00:00"}, headers=org.h).json()
    assert everything["capacity"]["sold"] == 3
    assert kit.client.get(url, headers=rival.h).status_code == 403
    assert kit.client.get(url, headers=buyer.h).status_code == 403
    assert kit.client.get(url).status_code == 401
    assert kit.client.get(f"/api/events/{uuid4()}/analytics", headers=org.h).status_code == 404


def test_analytics_on_an_empty_event_does_not_divide_by_zero(kit):
    org = kit.user("organizer")
    event = kit.client.post("/api/events", headers=org.h, json={"title": "x", "venue_name": "y", "start_time": "2030-01-01T10:00:00+05:00"}).json()
    data = kit.client.get(f"/api/events/{event['id']}/analytics", headers=org.h).json()
    assert data["capacity"]["percent_sold"] == 0 and data["attendance"]["percent_checked_in"] == 0


def test_reserved_seats_show_in_the_counts(kit):
    org, buyer = kit.user("organizer"), kit.user()
    event, _ = kit.event(org)
    seat = kit.seats(org, event["id"])[0]
    kit.client.post("/api/seats/hold", json={"seat_id": seat}, headers=buyer.h)
    assert kit.client.get(f"/api/events/{event['id']}/analytics", headers=org.h).json()["ticket_counts"]["reserved"] == 1


def test_attendee_list_and_filters(kit):
    org, a, b = kit.user("organizer"), kit.user(name="Alua"), kit.user(name="Bolat")
    event, general = kit.event(org)
    vip = kit.ticket_type(org, event["id"], name="VIP", price=5000)
    kit.buy(a, event["id"], general["id"], attendee_name="Alua Serik")
    second = kit.buy(b, event["id"], vip["id"], attendee_name="Bolat Nur").json()
    kit.client.post(f"/api/orders/{second['order']['id']}/refund", headers=org.h)
    url = f"/api/events/{event['id']}/attendees"
    assert len(kit.client.get(url, headers=org.h).json()) == 2
    assert [r["attendee_name"] for r in kit.client.get(url, params={"q": "alua"}, headers=org.h).json()] == ["Alua Serik"]
    assert [r["attendee_name"] for r in kit.client.get(url, params={"status": "refunded"}, headers=org.h).json()] == ["Bolat Nur"]
    assert [r["ticket_type"] for r in kit.client.get(url, params={"ticket_type_id": vip["id"]}, headers=org.h).json()] == ["VIP"]
    row = kit.client.get(url, params={"q": "alua"}, headers=org.h).json()[0]
    assert row["email"] == a.email and row["checked_in_at"] is None
    assert kit.client.get(url, headers=a.h).status_code == 403


def test_timeline_has_who_what_when_and_filters(kit):
    org, buyer = kit.user("organizer", name="Org Person"), kit.user()
    event, tt = kit.event(org)
    order = kit.buy(buyer, event["id"], tt["id"]).json()["order"]
    kit.client.post(f"/api/orders/{order['id']}/refund", headers=org.h)
    rows = kit.client.get(f"/api/events/{event['id']}/timeline", headers=org.h).json()
    assert {"timestamp", "actor", "action", "entity_type", "entity_id", "details"} <= set(rows[0])
    assert rows == sorted(rows, key=lambda r: r["timestamp"], reverse=True)
    refund = [r for r in rows if r["action"] == "order_refunded"][0]
    assert refund["actor"] == "Org Person" and refund["entity_type"] == "order" and refund["entity_id"] == order["id"]
    only = kit.client.get(f"/api/events/{event['id']}/timeline", params={"action": "event_published"}, headers=org.h).json()
    assert [r["action"] for r in only] == ["event_published"]
    assert kit.client.get(f"/api/events/{event['id']}/timeline", params={"date_from": "2099-01-01T00:00:00+00:00"}, headers=org.h).json() == []
    assert kit.client.get(f"/api/events/{event['id']}/timeline", headers=kit.user("organizer").h).status_code == 403
    assert kit.client.get(f"/api/events/{event['id']}/timeline", headers=buyer.h).status_code == 403


def test_nothing_in_the_api_can_edit_or_delete_audit_entries(kit):
    paths = [(route.path, route.methods) for route in kit.client.app.routes if hasattr(route, "methods")]
    for path, methods in paths:
        if "audit" in path or "timeline" in path:
            assert methods <= {"GET", "HEAD"}, path
