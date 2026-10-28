from uuid import uuid4

from conftest import fetch_one, run_sql


def campaign(kit, org, event_id, **kw):
    body = {"discount_type": "percentage", "discount_value": 20, "max_redemptions": 5}
    body.update(kw)
    response = kit.client.post(f"/api/events/{event_id}/promo-campaigns", json=body, headers=org.h)
    return response


def test_create_campaign_generates_code_token_and_trackable_link(kit):
    org = kit.user("organizer")
    event, _ = kit.event(org)
    response = campaign(kit, org, event["id"])
    assert response.status_code == 201
    c = response.json()
    assert len(c["code"]) == 8 and c["qr_token"].startswith("cmp_") and c["is_active"] is True
    assert c["campaign_link"].endswith(f"/events/{event['id']}?c={c['qr_token']}")
    assert "20" not in c["campaign_link"].split("?c=")[1]            #the link carries no discount value
    other = campaign(kit, org, event["id"])
    assert other.json()["code"] != c["code"] and other.json()["qr_token"] != c["qr_token"]
    assert len(kit.client.get(f"/api/events/{event['id']}/promo-campaigns", headers=org.h).json()) == 2


def test_campaign_validation_and_ownership(kit):
    org, rival, attendee = kit.user("organizer"), kit.user("organizer"), kit.user()
    event, tt = kit.event(org)
    other_event, other_tt = kit.event(org)
    assert campaign(kit, org, event["id"], discount_type="free").status_code == 400
    assert campaign(kit, org, event["id"], discount_value=0).status_code == 400
    assert campaign(kit, org, event["id"], discount_value=150).status_code == 400
    assert campaign(kit, org, event["id"], discount_type="fixed", discount_value=150).status_code == 201
    assert campaign(kit, org, event["id"], max_redemptions=0).status_code == 400
    assert campaign(kit, org, event["id"], ticket_type_ids=[other_tt["id"]]).status_code == 400
    code = "MINE" + event["id"][:5].upper()
    assert campaign(kit, org, event["id"], code=code).status_code == 201
    assert campaign(kit, org, other_event["id"], code=code.lower()).status_code == 409           #codes are unique, any case
    assert campaign(kit, rival, event["id"]).status_code == 403
    assert campaign(kit, attendee, event["id"]).status_code == 403
    assert kit.client.get(f"/api/events/{event['id']}/promo-campaigns", headers=rival.h).status_code == 403


def test_codes_apply_only_to_chosen_ticket_types(kit):
    org, buyer = kit.user("organizer"), kit.user()
    event, general = kit.event(org)
    vip = kit.ticket_type(org, event["id"], name="VIP", price=5000)
    c = campaign(kit, org, event["id"], ticket_type_ids=[vip["id"]]).json()
    assert kit.buy(buyer, event["id"], general["id"], promo_code=c["code"]).status_code == 409
    ok = kit.buy(buyer, event["id"], vip["id"], promo_code=c["code"])
    assert ok.status_code == 201 and float(ok.json()["order"]["total_amount"]) == 4000


def test_disabled_expired_and_exhausted_codes_are_rejected_with_clear_messages(kit):
    org, buyer = kit.user("organizer"), kit.user()
    event, tt = kit.event(org)
    c = campaign(kit, org, event["id"]).json()
    assert kit.client.post(f"/api/promo-campaigns/{c['id']}/disable", headers=org.h).json()["is_active"] is False
    off = kit.buy(buyer, event["id"], tt["id"], promo_code=c["code"])
    assert off.status_code == 409 and "disabled" in off.json()["detail"]
    kit.client.post(f"/api/promo-campaigns/{c['id']}/enable", headers=org.h)
    assert kit.buy(buyer, event["id"], tt["id"], promo_code=c["code"]).status_code == 201
    old = campaign(kit, org, event["id"], valid_until="2000-01-01T00:00:00+00:00").json()
    assert "not valid right now" in kit.buy(buyer, event["id"], tt["id"], promo_code=old["code"]).json()["detail"]
    future = campaign(kit, org, event["id"], valid_from="2099-01-01T00:00:00+00:00").json()
    assert kit.buy(buyer, event["id"], tt["id"], promo_code=future["code"]).status_code == 409
    single = campaign(kit, org, event["id"], max_redemptions=1).json()
    assert kit.buy(buyer, event["id"], tt["id"], promo_code=single["code"]).status_code == 201
    assert "fully used" in kit.buy(buyer, event["id"], tt["id"], promo_code=single["code"]).json()["detail"]
    assert kit.buy(buyer, event["id"], tt["id"], promo_code="DOESNOTEXIST").status_code == 404
    #a code from a different event does not work here
    other_event, _ = kit.event(org)
    foreign = campaign(kit, org, other_event["id"]).json()
    assert kit.buy(buyer, event["id"], tt["id"], promo_code=foreign["code"]).status_code == 404


def test_campaign_report_numbers_add_up(kit):
    org, buyer = kit.user("organizer"), kit.user()
    event, tt = kit.event(org, price=1000)
    c = campaign(kit, org, event["id"], discount_value=10).json()          #10 percent
    first = kit.buy(buyer, event["id"], tt["id"], quantity=2, promo_code=c["code"]).json()["order"]    #2000 - 200 = 1800
    kit.buy(buyer, event["id"], tt["id"], quantity=1, promo_code=c["code"])                             #1000 - 100 = 900
    report = kit.client.get(f"/api/promo-campaigns/{c['id']}/report", headers=org.h).json()
    assert report["redemptions"] == 2 and report["tickets_sold"] == 3
    assert float(report["gross_revenue"]) == 3000 and float(report["discount_given"]) == 300 and float(report["net_revenue"]) == 2700
    kit.client.post(f"/api/orders/{first['id']}/refund", headers=org.h)
    after = kit.client.get(f"/api/promo-campaigns/{c['id']}/report", headers=org.h).json()
    assert after["tickets_sold"] == 1 and float(after["net_revenue"]) == 900 and float(after["refunded_amount"]) == 1800
    assert after["refunded_or_cancelled_orders"] == 1
    assert kit.client.get(f"/api/promo-campaigns/{c['id']}/report", headers=kit.user("organizer").h).status_code == 403
    assert kit.client.get(f"/api/promo-campaigns/{uuid4()}/report", headers=org.h).status_code == 404


def test_campaign_qr_image_is_a_png_and_private_to_the_organizer(kit):
    org = kit.user("organizer")
    event, _ = kit.event(org)
    c = campaign(kit, org, event["id"]).json()
    png = kit.client.get(f"/api/promo-campaigns/{c['id']}/qr.png", headers=org.h)
    assert png.status_code == 200 and png.content.startswith(b"\x89PNG")
    assert kit.client.get(f"/api/promo-campaigns/{c['id']}/qr.png").status_code == 401
    assert kit.client.get(f"/api/promo-campaigns/{c['id']}/qr.png", headers=kit.user("organizer").h).status_code == 403


def test_resolve_campaign_link(kit):
    org = kit.user("organizer")
    event, _ = kit.event(org)
    c = campaign(kit, org, event["id"], discount_value=15).json()
    ok = kit.client.get("/api/campaigns/resolve", params={"token": c["qr_token"]})
    assert ok.status_code == 200
    assert ok.json()["event_id"] == event["id"] and ok.json()["promo_code"] == c["code"] and float(ok.json()["discount_value"]) == 15
    assert kit.client.get("/api/campaigns/resolve", params={"token": "cmp_made_up"}).status_code == 404
    kit.client.post(f"/api/promo-campaigns/{c['id']}/disable", headers=org.h)
    assert kit.client.get("/api/campaigns/resolve", params={"token": c["qr_token"]}).status_code == 409
    kit.client.post(f"/api/promo-campaigns/{c['id']}/enable", headers=org.h)
    run_sql("UPDATE promo_campaigns SET redemptions_count = max_redemptions WHERE id = %s", (c["id"],))
    assert "fully used" in kit.client.get("/api/campaigns/resolve", params={"token": c["qr_token"]}).json()["detail"]


def test_promo_actions_are_in_the_activity_timeline(kit):
    org = kit.user("organizer")
    event, _ = kit.event(org)
    c = campaign(kit, org, event["id"]).json()
    kit.client.post(f"/api/promo-campaigns/{c['id']}/disable", headers=org.h)
    actions = {r["action"] for r in kit.client.get(f"/api/events/{event['id']}/timeline", headers=org.h).json()}
    assert {"promo_created", "promo_disabled"} <= actions
