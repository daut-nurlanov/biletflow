from uuid import uuid4

from conftest import PASSWORD, fetch_one, notifications_for, run_sql


def test_every_admin_endpoint_rejects_non_admins(kit):
    org, attendee = kit.user("organizer"), kit.user()
    for method, path in [("get", "/api/admin/users"), ("get", "/api/admin/events"), ("get", "/api/admin/orders"),
                         ("get", "/api/admin/activations"), ("get", "/api/admin/refunds"), ("get", "/api/admin/event-reports"),
                         ("get", "/api/admin/promo-activity"), ("get", "/api/admin/settings"), ("get", "/api/admin/reports/summary"),
                         ("get", "/api/admin/reports/orders.csv"), ("put", "/api/admin/settings"),
                         ("post", f"/api/admin/users/{uuid4()}/suspend"), ("post", f"/api/admin/events/{uuid4()}/suspend")]:
        for who in (org, attendee):
            assert getattr(kit.client, method)(path, headers=who.h).status_code == 403, (path, who.role)
        assert getattr(kit.client, method)(path).status_code == 401, path


def test_search_users_events_orders(kit):
    admin, org, buyer = kit.user("platform_admin"), kit.user("organizer"), kit.user(name="Zhanar Unique")
    event, tt = kit.event(org, title="Findable Festival")
    order = kit.buy(buyer, event["id"], tt["id"]).json()["order"]
    ids = lambda path, **p: [r["id"] for r in kit.client.get(path, params=p, headers=admin.h).json()]
    assert buyer.id in ids("/api/admin/users", q="zhanar unique")
    assert buyer.id not in ids("/api/admin/users", q="zhanar unique", role="organizer")
    assert event["id"] in ids("/api/admin/events", q="findable")
    assert event["id"] in ids("/api/admin/events", q=org.email)
    assert event["id"] not in ids("/api/admin/events", q="findable", status="draft")
    assert order["id"] in ids("/api/admin/orders", q=order["id"][:8])
    assert order["id"] in ids("/api/admin/orders", q=buyer.email)
    assert order["id"] in ids("/api/admin/orders", q=order["payment_reference"])
    assert order["id"] not in ids("/api/admin/orders", q=buyer.email, status="refunded")


def test_suspend_and_reinstate_a_user(kit):
    admin, victim = kit.user("platform_admin"), kit.user()
    assert kit.client.post(f"/api/admin/users/{victim.id}/suspend", headers=admin.h).json()["is_suspended"] is True
    assert kit.client.get("/api/auth/me", headers=victim.h).status_code == 403
    assert kit.client.post("/api/auth/login", json={"email": victim.email, "password": PASSWORD}).status_code == 403
    assert kit.client.post(f"/api/admin/users/{victim.id}/unsuspend", headers=admin.h).json()["is_suspended"] is False
    assert kit.client.get("/api/auth/me", headers=victim.h).status_code == 200
    assert kit.client.post(f"/api/admin/users/{admin.id}/suspend", headers=admin.h).status_code == 400       #not yourself
    assert kit.client.post(f"/api/admin/users/{uuid4()}/suspend", headers=admin.h).status_code == 404
    actions = [r["action"] for r in __import__("conftest").fetch("SELECT action FROM audit_log WHERE entity_id = %s", (victim.id,))]
    assert actions == ["user_suspended", "user_reinstated"]


def test_suspend_and_reinstate_an_event(kit):
    admin, org, buyer = kit.user("platform_admin"), kit.user("organizer"), kit.user()
    event, tt = kit.event(org)
    assert kit.client.post(f"/api/admin/events/{event['id']}/suspend", headers=admin.h).json()["status"] == "suspended"
    assert event["id"] not in [e["id"] for e in kit.client.get("/api/events?public=true").json()]
    assert kit.client.get(f"/api/events/{event['id']}").status_code == 404
    assert kit.client.get(f"/api/events/{event['id']}", headers=org.h).status_code == 200
    assert kit.buy(buyer, event["id"], tt["id"]).status_code == 409
    assert notifications_for(org.id, "event_suspended")
    assert kit.client.post(f"/api/admin/events/{event['id']}/suspend", headers=admin.h).status_code == 409
    assert kit.client.post(f"/api/admin/events/{event['id']}/reinstate", headers=admin.h).json()["status"] == "upcoming"
    assert kit.buy(buyer, event["id"], tt["id"]).status_code == 201
    assert kit.client.post(f"/api/admin/events/{event['id']}/reinstate", headers=admin.h).status_code == 409


def test_suspend_and_restore_paid_sales(kit):
    admin, org, buyer = kit.user("platform_admin"), kit.user("organizer"), kit.user()
    event, tt = kit.event(org)
    assert kit.client.post(f"/api/admin/events/{event['id']}/suspend-paid-sales", headers=admin.h).json()["paid_sales_suspended"] is True
    assert kit.buy(buyer, event["id"], tt["id"]).status_code == 403
    assert kit.client.get(f"/api/events/{event['id']}/activation-checklist", headers=org.h).json()["suspended_by_admin"] is True
    assert kit.client.post(f"/api/admin/events/{event['id']}/restore-paid-sales", headers=admin.h).json()["paid_sales_suspended"] is False
    assert kit.buy(buyer, event["id"], tt["id"]).status_code == 201


def test_admin_sees_activations_refunds_and_promo_activity(kit):
    admin, org, buyer = kit.user("platform_admin"), kit.user("organizer"), kit.user()
    event, tt = kit.event(org, publish=False)
    run_sql("UPDATE events SET is_paid_sales_active = false WHERE id = %s", (event["id"],))
    kit.publish(org, event["id"])
    kit.client.put("/api/organizer/profile", json={"contact_phone": "1", "payout_account_details": "x"}, headers=org.h)
    kit.client.post("/api/organizer/profile/verify", headers=org.h)
    kit.client.post(f"/api/events/{event['id']}/activate-paid", json={"accept_terms": True}, headers=org.h)
    promo = kit.client.post(f"/api/events/{event['id']}/promo-campaigns", headers=org.h, json={
        "discount_type": "fixed", "discount_value": 100, "max_redemptions": 3}).json()
    order = kit.buy(buyer, event["id"], tt["id"], promo_code=promo["code"]).json()["order"]
    kit.client.post(f"/api/orders/{order['id']}/refund", headers=org.h)
    assert event["id"] in [a["event_id"] for a in kit.client.get("/api/admin/activations", headers=admin.h).json()]
    refunds = [r for r in kit.client.get("/api/admin/refunds", headers=admin.h).json() if r["order_id"] == order["id"]]
    assert len(refunds) == 1 and refunds[0]["attendee_email"] == buyer.email and float(refunds[0]["amount"]) == 900
    activity = [p for p in kit.client.get("/api/admin/promo-activity", headers=admin.h).json() if p["id"] == promo["id"]]
    assert activity[0]["redemptions_count"] == 1 and activity[0]["organizer_email"] == org.email


def test_event_reports_review(kit):
    admin, org, user = kit.user("platform_admin"), kit.user("organizer"), kit.user()
    event, _ = kit.event(org)
    report = kit.client.post(f"/api/events/{event['id']}/report", json={"reason": "Fake event"}, headers=user.h).json()
    open_reports = lambda: [r["id"] for r in kit.client.get("/api/admin/event-reports", headers=admin.h).json()]
    assert report["id"] in open_reports()
    assert kit.client.put(f"/api/admin/event-reports/{report['id']}", json={"status": "bogus"}, headers=admin.h).status_code == 400
    assert kit.client.put(f"/api/admin/event-reports/{report['id']}", json={"status": "actioned"}, headers=admin.h).json()["status"] == "actioned"
    assert report["id"] not in open_reports()
    assert report["id"] in [r["id"] for r in kit.client.get("/api/admin/event-reports?status=actioned", headers=admin.h).json()]
    assert kit.client.put(f"/api/admin/event-reports/{uuid4()}", json={"status": "dismissed"}, headers=admin.h).status_code == 404


def test_platform_settings_drive_real_behaviour(kit):
    admin, org = kit.user("platform_admin"), kit.user("organizer")
    event, _ = kit.event(org, publish=False)
    before = kit.client.get("/api/admin/settings", headers=admin.h).json()
    try:
        updated = kit.client.put("/api/admin/settings", json={"activation_fee": 7500, "processing_fee_rate": 0.05}, headers=admin.h).json()
        assert updated["activation_fee"] == "7500.0" and updated["processing_fee_rate"] == "0.05"
        assert kit.client.get(f"/api/events/{event['id']}/activation-checklist", headers=org.h).json()["activation_fee"] == "7500.0"
        assert kit.client.put("/api/admin/settings", json={}, headers=admin.h).status_code == 400
        assert kit.client.put("/api/admin/settings", json={"processing_fee_rate": 3}, headers=admin.h).status_code == 400
        assert kit.client.put("/api/admin/settings", json={"activation_fee": -1}, headers=admin.h).status_code == 400
    finally:
        for key, value in before.items():
            run_sql("UPDATE platform_settings SET value = %s WHERE key = %s", (value, key))


def test_reports_summary_and_csv_export(kit):
    admin, org, buyer = kit.user("platform_admin"), kit.user("organizer"), kit.user()
    event, tt = kit.event(org, title="CSV, \"quoted\" Event")
    kit.buy(buyer, event["id"], tt["id"])
    summary = kit.client.get("/api/admin/reports/summary", headers=admin.h).json()
    assert summary["currency"] == "KZT" and summary["paid_orders"] >= 1 and summary["tickets_issued"] >= 1
    response = kit.client.get("/api/admin/reports/orders.csv", headers=admin.h)
    assert response.headers["content-type"].startswith("text/csv")
    import csv, io
    rows = list(csv.DictReader(io.StringIO(response.text)))
    mine = [r for r in rows if r["attendee"] == buyer.email]
    assert len(mine) == 1 and mine[0]["event"] == 'CSV, "quoted" Event' and float(mine[0]["total_kzt"]) == 1000
