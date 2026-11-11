"""Business-rule and validation checks found by hunting for bugs."""
from conftest import fetch_one, notifications_for, run_sql

def mk(kit, **kw):
    org = kit.user("organizer"); ev, tt = kit.event(org, **kw); return org, ev, tt

def test_assigned_event_requires_seat(kit):
    org, ev, tt = mk(kit, has_assigned_seating=True)
    kit.seats(org, ev["id"])
    b = kit.user()
    assert kit.buy(b, ev["id"], tt["id"]).status_code != 201

def test_ticket_types_over_capacity(kit):
    org, ev, tt = mk(kit, capacity=10, quantity=10)
    r = kit.client.post(f"/api/events/{ev['id']}/ticket-types", json={"name":"VIP","price":1,"total_quantity":50}, headers=org.h)
    assert r.status_code == 400

def test_suspended_event_cannot_be_republished_by_organizer(kit):
    org, ev, tt = mk(kit)
    run_sql("UPDATE events SET status='suspended' WHERE id=%s",(ev["id"],))
    assert kit.client.post(f"/api/events/{ev['id']}/publish", headers=org.h).status_code != 200
    assert kit.client.post(f"/api/events/{ev['id']}/unpublish", headers=org.h).status_code != 200
    assert kit.client.put(f"/api/events/{ev['id']}", json={"title":"x"}, headers=org.h).status_code in (403,409)

def test_capacity_below_sold(kit):
    org, ev, tt = mk(kit, quantity=10)
    b = kit.user(); assert kit.buy(b, ev["id"], tt["id"], quantity=5).status_code==201
    r = kit.client.put(f"/api/events/{ev['id']}", json={"capacity":2}, headers=org.h)
    assert r.status_code == 400

def test_ticket_type_quantity_below_sold_and_price_edit(kit):
    org, ev, tt = mk(kit, quantity=10)
    b = kit.user(); kit.buy(b, ev["id"], tt["id"], quantity=5)
    r = kit.client.put(f"/api/ticket-types/{tt['id']}", json={"total_quantity":3}, headers=org.h)
    assert r.status_code == 409
    r = kit.client.put(f"/api/ticket-types/{tt['id']}", json={"total_quantity":20}, headers=org.h)
    assert r.status_code == 200
    assert fetch_one("select quantity_available from ticket_types where id=%s",(tt["id"],))["quantity_available"]==15

def test_end_before_start(kit):
    org = kit.user("organizer")
    r = kit.client.post("/api/events", json={"title":"x","venue_name":"v","start_time":"2030-01-01T19:00:00+05:00","end_time":"2030-01-01T10:00:00+05:00","capacity":5}, headers=org.h)
    assert r.status_code == 400

def test_negative_values(kit):
    org, ev, tt = mk(kit)
    assert kit.client.post(f"/api/events/{ev['id']}/ticket-types", json={"name":"n","price":-5,"total_quantity":1}, headers=org.h).status_code==400
    assert kit.client.post(f"/api/events/{ev['id']}/ticket-types", json={"name":"n","price":5,"total_quantity":0}, headers=org.h).status_code==400
    assert kit.client.post("/api/events", json={"title":"x","venue_name":"v","start_time":"2030-01-01T19:00:00+05:00","capacity":-1}, headers=org.h).status_code==400
    assert kit.client.post("/api/events", json={"title":" ","venue_name":"v","start_time":"2030-01-01T19:00:00+05:00"}, headers=org.h).status_code==400

def test_admin_settings_validation(kit):
    adm = kit.user("platform_admin")
    for body in ({"processing_fee_rate":5},{"processing_fee_rate":-1},{"activation_fee":-10}):
        assert kit.client.put("/api/admin/settings", json=body, headers=adm.h).status_code==400, body

def test_promo_refund_frees_redemption(kit):
    org, ev, tt = mk(kit)
    kit.client.post(f"/api/events/{ev['id']}/promo-campaigns", headers=org.h, json={"code":"ONEUSE","discount_type":"fixed","discount_value":100,"max_redemptions":1})
    b = kit.user(); o = kit.buy(b, ev["id"], tt["id"], promo_code="ONEUSE").json()["order"]
    kit.client.post(f"/api/orders/{o['id']}/refund", json={}, headers=org.h)
    assert fetch_one("select redemptions_count from promo_campaigns where event_id=%s",(ev["id"],))["redemptions_count"]==0

def test_register_email_case_and_dupe(kit):
    r1 = kit.client.post("/api/auth/register", json={"email":"CaseTest99@Example.com","password":"password123","full_name":"A","role":"attendee"})
    assert r1.status_code==201, r1.text
    try:
        r2 = kit.client.post("/api/auth/register", json={"email":"casetest99@example.com","password":"password123","full_name":"A","role":"attendee"})
        assert r2.status_code==409
    finally:
        run_sql("delete from notifications where user_id in (select id from users where lower(email)='casetest99@example.com')")
        run_sql("delete from users where lower(email)='casetest99@example.com'")

def test_register_cannot_be_admin(kit):
    r = kit.client.post("/api/auth/register", json={"email":"evil88@example.com","password":"password123","full_name":"A","role":"platform_admin"})
    run_sql("delete from notifications where user_id in (select id from users where email='evil88@example.com')")
    run_sql("delete from organizer_profiles where user_id in (select id from users where email='evil88@example.com')")
    run_sql("delete from users where email='evil88@example.com'")
    assert r.status_code in (400,403,422)

def test_reset_token_single_use(kit):
    u = kit.user()
    kit.client.post("/api/auth/forgot-password", json={"email":u.email})
    n = notifications_for(u.id,"reset_password")[0]
    import re
    tok = re.search(r"[A-Za-z0-9_\-]{20,}\.[0-9a-f]{64}", n["message"] if "message" in n else str(n)).group(0)
    assert kit.client.post("/api/auth/reset-password", json={"token":tok,"new_password":"newpass123"}).status_code==200
    assert kit.client.post("/api/auth/reset-password", json={"token":tok,"new_password":"another123"}).status_code!=200

def test_scan_refunded_and_before_event_and_other_staff(kit):
    org, ev, tt = mk(kit); b = kit.user()
    o = kit.buy(b, ev["id"], tt["id"]).json(); t = o["ticket"]
    stranger = kit.user("event_admin")
    r = kit.client.post("/api/checkin/verify-qr", json={"qr_code_hash":t["qr_code_hash"]}, headers=stranger.h)
    assert r.status_code==403
    kit.client.post(f"/api/orders/{o['order']['id']}/refund", json={}, headers=org.h)
    r = kit.client.post("/api/checkin/verify-qr", json={"qr_code_hash":t["qr_code_hash"]}, headers=org.h)
    assert r.json()["result"]=="refunded", r.text

def test_other_organizer_cannot_touch(kit):
    org, ev, tt = mk(kit); other = kit.user("organizer"); b=kit.user()
    o = kit.buy(b, ev["id"], tt["id"]).json()["order"]
    for m,u,body in [("put",f"/api/events/{ev['id']}",{"title":"h"}),("post",f"/api/events/{ev['id']}/cancel",None),
        ("post",f"/api/orders/{o['id']}/refund",{}),("get",f"/api/events/{ev['id']}/analytics",None),
        ("get",f"/api/events/{ev['id']}/attendees",None),("get",f"/api/events/{ev['id']}/orders",None),
        ("post",f"/api/events/{ev['id']}/seats",{"section":"A","category":"standard","rows":1,"seats_per_row":1}),
        ("put",f"/api/ticket-types/{tt['id']}",{"price":1}),
        ("post",f"/api/events/{ev['id']}/staff",{"email":b.email}),("get",f"/api/events/{ev['id']}/timeline",None)]:
        r = getattr(kit.client,m)(u, headers=other.h, **({"json":body} if body is not None else {}))
        assert r.status_code==403,(m,u,r.status_code)


def test_capacity_and_ticket_totals_stay_consistent(kit):
    org, ev, tt = mk(kit, capacity=10, quantity=10)
    # raising a ticket type above capacity is refused, lowering capacity below the ticket total too
    assert kit.client.put(f"/api/ticket-types/{tt['id']}", json={"total_quantity": 11}, headers=org.h).status_code == 400
    assert kit.client.put(f"/api/events/{ev['id']}", json={"capacity": 5}, headers=org.h).status_code == 400
    assert kit.client.put(f"/api/events/{ev['id']}", json={"capacity": 20}, headers=org.h).status_code == 200
    assert kit.client.post(f"/api/events/{ev['id']}/ticket-types", json={"name": "B", "price": 1, "total_quantity": 10},
                           headers=org.h).status_code == 201


def test_promo_redemption_comes_back_on_cancel_and_history_stays(kit):
    org, ev, tt = mk(kit, free=True)
    kit.client.post(f"/api/events/{ev['id']}/promo-campaigns", headers=org.h,
                    json={"code": "FREEONE", "discount_type": "fixed", "discount_value": 100, "max_redemptions": 1})
    b = kit.user()
    order = kit.buy(b, ev["id"], tt["id"], promo_code="FREEONE").json()["order"]
    assert fetch_one("select redemptions_count from promo_campaigns where event_id=%s", (ev["id"],))["redemptions_count"] == 1
    assert kit.client.post(f"/api/orders/{order['id']}/cancel", headers=org.h).status_code == 200
    assert fetch_one("select redemptions_count from promo_campaigns where event_id=%s", (ev["id"],))["redemptions_count"] == 0
    assert fetch_one("select count(*) n from promo_redemptions where order_id=%s", (order["id"],))["n"] == 1


def test_assigned_seating_needs_one_seat_per_ticket(kit):
    org, ev, tt = mk(kit, quantity=5)
    seats = kit.seats(org, ev["id"], per_row=3)
    b = kit.user()
    assert kit.buy(b, ev["id"], tt["id"]).status_code == 400
    assert kit.buy(b, ev["id"], tt["id"], quantity=2, seat_ids=seats[:1]).status_code == 400
    assert kit.buy(b, ev["id"], tt["id"], seat_ids=seats[:2]).status_code == 201


def test_suspended_event_is_locked_for_its_organizer(kit):
    org, ev, tt = mk(kit)
    run_sql("UPDATE events SET status='suspended' WHERE id=%s", (ev["id"],))
    assert kit.client.put(f"/api/events/{ev['id']}", json={"title": "x"}, headers=org.h).status_code == 403
    adm = kit.user("platform_admin")
    assert kit.client.put(f"/api/events/{ev['id']}", json={"title": "x"}, headers=adm.h).status_code == 200
