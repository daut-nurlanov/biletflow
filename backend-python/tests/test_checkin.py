from uuid import uuid4

from conftest import PASSWORD, fetch_one


def setup(kit):
    org, buyer = kit.user("organizer"), kit.user(name="Aidos Nurlan")
    event, tt = kit.event(org)
    ticket = kit.buy(buyer, event["id"], tt["id"], attendee_name="Aidos Nurlan").json()["ticket"]
    staff = kit.user("event_admin")
    assigned = kit.client.post(f"/api/events/{event['id']}/staff", json={"email": staff.email}, headers=org.h)
    assert assigned.status_code == 201, assigned.text
    return org, buyer, event, tt, ticket, staff


def scan(kit, who, code):
    return kit.client.post("/api/checkin/verify-qr", json={"qr_code_hash": code}, headers=who.h)


def test_staff_scan_flow_valid_then_duplicate(kit):
    org, buyer, event, tt, ticket, staff = setup(kit)
    first = scan(kit, staff, ticket["qr_code_hash"])
    assert first.status_code == 200 and first.json()["result"] == "valid" and first.json()["attendee_name"] == "Aidos Nurlan"
    assert scan(kit, staff, ticket["qr_code_hash"]).json()["result"] == "already_checked_in"
    assert fetch_one("SELECT count(*) AS n FROM checkin_records WHERE ticket_id = %s", (ticket["id"],))["n"] == 1
    assert fetch_one("SELECT checked_in_by FROM checkin_records WHERE ticket_id = %s", (ticket["id"],))["checked_in_by"] == staff.id


def test_scanning_requires_sign_in_and_a_staff_role(kit):
    org, buyer, event, tt, ticket, staff = setup(kit)
    assert kit.client.post("/api/checkin/verify-qr", json={"qr_code_hash": ticket["qr_code_hash"]}).status_code == 401
    assert scan(kit, buyer, ticket["qr_code_hash"]).status_code == 403          #an attendee cannot scan
    assert scan(kit, staff, "no-such-code").status_code == 404


def test_staff_only_work_their_assigned_events(kit):
    org, buyer, event, tt, ticket, staff = setup(kit)
    outsider = kit.user("event_admin")
    rival = kit.user("organizer")
    assert scan(kit, outsider, ticket["qr_code_hash"]).status_code == 403
    assert scan(kit, rival, ticket["qr_code_hash"]).status_code == 403
    assert kit.client.get(f"/api/events/{event['id']}/checkin-stats", headers=outsider.h).status_code == 403
    assert scan(kit, org, ticket["qr_code_hash"]).json()["result"] == "valid"      #the owner may scan too


def test_revoked_staff_lose_access(kit):
    org, buyer, event, tt, ticket, staff = setup(kit)
    assert kit.client.delete(f"/api/events/{event['id']}/staff/{staff.id}", headers=org.h).status_code == 200
    assert scan(kit, staff, ticket["qr_code_hash"]).status_code == 403
    assert kit.client.get("/api/staff/events", headers=staff.h).json() == []
    assert kit.client.delete(f"/api/events/{event['id']}/staff/{uuid4()}", headers=org.h).status_code == 404


def test_refunded_and_cancelled_tickets_are_refused(kit):
    org, buyer, event, tt, ticket, staff = setup(kit)
    kit.client.post(f"/api/orders/{ticket['order_id']}/refund", headers=org.h)
    assert scan(kit, staff, ticket["qr_code_hash"]).json()["result"] == "refunded"


def test_campaign_qr_codes_never_admit_anyone(kit):
    org, buyer, event, tt, ticket, staff = setup(kit)
    campaign = kit.client.post(f"/api/events/{event['id']}/promo-campaigns", headers=org.h, json={
        "discount_type": "fixed", "discount_value": 100, "max_redemptions": 5}).json()
    for payload in (campaign["qr_token"], campaign["campaign_link"], "https://biletflow.kz/events/x?c=abc"):
        refused = scan(kit, staff, payload)
        assert refused.status_code == 400 and "campaign" in refused.json()["detail"].lower()


def test_undo_check_in(kit):
    org, buyer, event, tt, ticket, staff = setup(kit)
    assert kit.client.post("/api/checkin/undo", json={"ticket_id": ticket["id"]}, headers=staff.h).status_code == 409   #not checked in yet
    scan(kit, staff, ticket["qr_code_hash"])
    assert kit.client.post("/api/checkin/undo", json={"ticket_id": ticket["id"]}, headers=buyer.h).status_code == 403
    assert kit.client.post("/api/checkin/undo", json={"ticket_id": ticket["id"]}, headers=staff.h).json()["result"] == "reversed"
    assert fetch_one("SELECT status FROM tickets WHERE id = %s", (ticket["id"],))["status"] == "valid"
    assert fetch_one("SELECT reversed FROM checkin_records WHERE ticket_id = %s", (ticket["id"],))["reversed"] is True
    assert scan(kit, staff, ticket["qr_code_hash"]).json()["result"] == "valid"      #can be scanned again
    assert kit.client.post("/api/checkin/undo", json={"ticket_id": str(uuid4())}, headers=staff.h).status_code == 404


def test_checkin_stats(kit):
    org, buyer, event, tt, ticket, staff = setup(kit)
    second = kit.buy(buyer, event["id"], tt["id"], quantity=3).json()["tickets"]
    scan(kit, staff, ticket["qr_code_hash"])
    scan(kit, staff, second[0]["qr_code_hash"])
    stats = kit.client.get(f"/api/events/{event['id']}/checkin-stats", headers=staff.h).json()
    assert stats == {"registered": 4, "checked_in": 2, "not_arrived": 2, "percent_checked_in": 50.0}


def test_manual_search_by_name_or_email(kit):
    org, buyer, event, tt, ticket, staff = setup(kit)
    search = lambda text, who=staff: kit.client.post("/api/checkin/manual-search", json={"event_id": event["id"], "name": text}, headers=who.h)
    assert [t["id"] for t in search("aidos").json()] == [ticket["id"]]
    assert [t["id"] for t in search(buyer.email[:12]).json()] == [ticket["id"]]
    assert search("zzzz").json() == []
    assert search("a").status_code == 400
    assert search("aidos", buyer).status_code == 403
    assert search("aidos", kit.user("event_admin")).status_code == 403


def test_staff_only_see_assigned_events(kit):
    org, buyer, event, tt, ticket, staff = setup(kit)
    other_event, _ = kit.event(org)
    mine = kit.client.get("/api/staff/events", headers=staff.h).json()
    assert [e["id"] for e in mine] == [event["id"]]
    assert {e["id"] for e in kit.client.get("/api/staff/events", headers=org.h).json()} >= {event["id"], other_event["id"]}
    assert kit.client.get("/api/staff/events", headers=buyer.h).status_code == 403


def test_staff_invites(kit):
    org, rival, existing = kit.user("organizer"), kit.user("organizer"), kit.user("event_admin")
    event, _ = kit.event(org)
    url = f"/api/events/{event['id']}/staff"
    new_email = f"{uuid4()}@test.invalid"
    assert kit.client.post(url, json={"email": new_email}, headers=org.h).status_code == 400               #needs name + password
    created = kit.client.post(url, json={"email": new_email, "full_name": "Door Person", "password": PASSWORD}, headers=org.h)
    assert created.status_code == 201 and created.json()["staff"]["full_name"] == "Door Person"
    kit.user_ids.append(created.json()["staff"]["id"])
    login = kit.client.post("/api/auth/login", json={"email": new_email, "password": PASSWORD})
    assert login.status_code == 200 and login.json()["role"] == "event_admin"
    assert kit.client.post(url, json={"email": existing.email}, headers=org.h).status_code == 201
    assert kit.client.post(url, json={"email": existing.email}, headers=org.h).status_code == 201           #inviting again is harmless
    assert kit.client.post(url, json={"email": org.email}, headers=org.h).status_code == 409                #not a staff account
    assert kit.client.post(url, json={"email": existing.email}, headers=rival.h).status_code == 403
    listed = kit.client.get(url, headers=org.h).json()
    assert {s["email"] for s in listed} == {new_email, existing.email}
    assert kit.client.get(url, headers=rival.h).status_code == 403
