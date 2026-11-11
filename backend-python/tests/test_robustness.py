"""More bug-hunt checks: bad input never gives a server error, isolation between users, staff and suspension rules."""
from conftest import fetch_one, notifications_for, run_sql

def mk(kit, **kw):
    org = kit.user("organizer"); ev, tt = kit.event(org, **kw); return org, ev, tt

def test_bad_ids_never_500(kit):
    u = kit.user(); org = kit.user("organizer"); adm = kit.user("platform_admin")
    for m, url, h in [("get","/api/events/abc",u.h),("get","/api/tickets/abc",u.h),("get","/api/orders/abc",u.h),("get","/api/tickets/abc/pdf",u.h),
        ("get","/api/events/abc/export.ics",u.h),("post","/api/events/abc/publish",org.h),("get","/api/events/abc/analytics",org.h),
        ("get","/api/support/cases/abc",u.h),("post","/api/orders/abc/refund",org.h),("put","/api/admin/events/abc/payout-status",adm.h),
        ("get","/api/events?organizer_id=abc",u.h),("get","/api/tickets/my-tickets?attendee_id=abc",{}),("get","/api/events/abc/seats",u.h),
        ("get","/api/promo-campaigns/abc/qr.png",org.h),("get","/api/campaigns/resolve?token=zz",{}),("post","/api/promo-campaigns/abc/disable",org.h)]:
        kw = {"json": {"status":"paid"}} if m in ("put",) else ({"json":{}} if m=="post" else {})
        r = getattr(kit.client,m)(url, headers=h, **kw)
        assert r.status_code < 500, (m,url,r.status_code,r.text[:100])

def test_checkout_garbage_never_500(kit):
    org, ev, tt = mk(kit); b = kit.user()
    for body in [{"event_id":"x","ticket_type_id":tt["id"],"attendee_name":"a"},{"event_id":ev["id"],"ticket_type_id":"x","attendee_name":"a"},
                 {"event_id":ev["id"],"ticket_type_id":tt["id"],"attendee_name":"a","quantity":0},{"event_id":ev["id"],"ticket_type_id":tt["id"],"attendee_name":"a","quantity":-3},
                 {"event_id":ev["id"],"ticket_type_id":tt["id"],"attendee_name":"a","seat_ids":["zz"]},{"event_id":ev["id"],"ticket_type_id":tt["id"],"attendee_name":"a","seat_ids":[]},
                 {"event_id":ev["id"],"ticket_type_id":tt["id"],"attendee_name":"a","promo_code":"  "}]:
        r = kit.client.post("/api/orders/checkout", json=body, headers=b.h)
        assert r.status_code < 500, (body, r.status_code, r.text[:100])

def test_seat_duplicates(kit):
    org, ev, tt = mk(kit)
    kit.seats(org, ev["id"], rows=1, per_row=2)
    r = kit.client.post(f"/api/events/{ev['id']}/seats", headers=org.h, json={"section":"T","category":"standard","rows":1,"seats_per_row":2})
    assert r.status_code in (400,409), r.text
    r = kit.client.post(f"/api/events/{ev['id']}/seats", headers=org.h, json={"section":"Z","category":"standard","rows":1000,"seats_per_row":1000})
    assert r.status_code == 400

def test_seats_beyond_capacity(kit):
    org, ev, tt = mk(kit, capacity=10, quantity=10)
    r = kit.client.post(f"/api/events/{ev['id']}/seats", headers=org.h, json={"section":"Z","category":"standard","rows":5,"seats_per_row":10})
    assert r.status_code == 400

def test_suspended_user_cannot_login_or_use_token(kit):
    u = kit.user(); run_sql("update users set is_suspended=true where id=%s",(u.id,))
    r = kit.client.post("/api/auth/login", json={"email":u.email,"password":"password123"})
    assert r.status_code in (401,403)
    assert kit.client.get("/api/auth/me", headers=u.h).status_code==403

def test_suspended_organizer_events_hidden_and_unbuyable(kit):
    org, ev, tt = mk(kit); b = kit.user()
    adm = kit.user("platform_admin")
    kit.client.post(f"/api/admin/users/{org.id}/suspend", headers=adm.h)
    assert ev["id"] not in [e["id"] for e in kit.client.get("/api/events").json()]
    assert kit.buy(b, ev["id"], tt["id"]).status_code != 201

def test_admin_cannot_suspend_self_or_admin(kit):
    a1, a2 = kit.user("platform_admin"), kit.user("platform_admin")
    assert kit.client.post(f"/api/admin/users/{a1.id}/suspend", headers=a1.h).status_code in (400,403,409)
    assert kit.client.post(f"/api/admin/users/{a2.id}/suspend", headers=a1.h).status_code in (400,403,409)

def test_support_isolation(kit):
    org, ev, tt = mk(kit); a, b = kit.user(), kit.user()
    r = kit.client.post("/api/support/cases", headers=a.h, json={"category":"payment","subject":"s","message":"m","event_id":ev["id"]})
    assert r.status_code==201, r.text
    cid = r.json()["id"]
    assert kit.client.get(f"/api/support/cases/{cid}", headers=b.h).status_code in (403,404)
    assert kit.client.post(f"/api/support/cases/{cid}/messages", headers=b.h, json={"message":"hi"}).status_code in (403,404)
    other = kit.user("organizer")
    assert kit.client.get(f"/api/support/cases/{cid}", headers=other.h).status_code in (403,404)
    assert kit.client.put(f"/api/support/cases/{cid}", headers=a.h, json={"status":"resolved"}).status_code==403
    assert kit.client.post("/api/support/cases", headers=a.h, json={"category":"nope","subject":"s","message":"m"}).status_code==400

def test_staff_rules(kit):
    org, ev, tt = mk(kit); stf = kit.user("event_admin"); b = kit.user()
    r1 = kit.client.post(f"/api/events/{ev['id']}/staff", headers=org.h, json={"email":stf.email}); assert r1.status_code==201, r1.text
    r2 = kit.client.post(f"/api/events/{ev['id']}/staff", headers=org.h, json={"email":stf.email}); assert r2.status_code<500
    assert kit.client.post(f"/api/events/{ev['id']}/staff", headers=org.h, json={"email":"nobody@x.invalid"}).status_code in (400,404)
    # attendee gets staff role? 
    t = kit.buy(b, ev["id"], tt["id"]).json()["ticket"]
    assert kit.client.post("/api/checkin/verify-qr", headers=stf.h, json={"qr_code_hash":t["qr_code_hash"]}).json()["result"]=="valid"
    assert kit.client.post("/api/checkin/verify-qr", headers=stf.h, json={"qr_code_hash":t["qr_code_hash"]}).json()["result"]=="already_checked_in"
    assert kit.client.post(f"/api/orders/{t['order_id']}/refund", headers=org.h, json={}).status_code==409
    kit.client.delete(f"/api/events/{ev['id']}/staff/{stf.id}", headers=org.h)
    assert kit.client.post("/api/checkin/verify-qr", headers=stf.h, json={"qr_code_hash":t["qr_code_hash"]}).status_code==403

def test_free_event_registration_limits(kit):
    org, ev, tt = mk(kit, free=True, quantity=2); b = kit.user()
    assert kit.buy(b, ev["id"], tt["id"], quantity=2).status_code==201
    assert kit.buy(b, ev["id"], tt["id"]).status_code==409

def test_unverified_user_buy_and_register_validation(kit):
    for body in [{"email":"notanemail","password":"password123","full_name":"A","role":"attendee"},{"email":"a1@x.invalid","password":"short","full_name":"A","role":"attendee"},{"email":"a2@x.invalid","password":"password123","full_name":"  ","role":"attendee"}]:
        r = kit.client.post("/api/auth/register", json=body)
        if r.status_code==201:
            run_sql("delete from notifications where user_id in (select id from users where email=%s)",(body["email"],)); run_sql("delete from users where email=%s",(body["email"],))
        assert r.status_code in (400,422), body

def test_order_view_isolation(kit):
    org, ev, tt = mk(kit); a, b = kit.user(), kit.user()
    o = kit.buy(a, ev["id"], tt["id"]).json()["order"]
    assert kit.client.get(f"/api/orders/{o['id']}", headers=b.h).status_code==403
    assert kit.client.post(f"/api/orders/{o['id']}/cancel", headers=b.h).status_code==403
    assert kit.client.get("/api/tickets/my-tickets", headers=b.h).json()==[]
    assert all(x["id"]!=o["id"] for x in kit.client.get("/api/orders/my-orders", headers=b.h).json())
