from uuid import uuid4

from conftest import fetch, fetch_one, notifications_for, run_sql


def test_only_organizers_can_create_events(kit):
    attendee = kit.user("attendee")
    body = {"title": "x", "venue_name": "y", "start_time": "2030-01-01T10:00:00+05:00"}
    assert kit.client.post("/api/events", json=body).status_code == 401
    assert kit.client.post("/api/events", json=body, headers=attendee.h).status_code == 403
    other = kit.user("organizer")
    org = kit.user("organizer")
    assert kit.client.post("/api/events", json={**body, "organizer_id": other.id}, headers=org.h).status_code == 403


def test_event_fields_roundtrip_and_default_is_draft(kit):
    org = kit.user("organizer")
    event, _ = kit.event(org, publish=False, description="desc", category="music", venue_address="Somewhere 1",
                         end_time="2030-01-01T23:00:00+05:00")
    assert event["status"] == "draft" and event["visibility"] == "public"
    got = kit.client.get(f"/api/events/{event['id']}", headers=org.h).json()
    assert got["description"] == "desc" and got["category"] == "music" and got["venue_address"] == "Somewhere 1"
    updated = kit.client.put(f"/api/events/{event['id']}", json={"visibility": "unlisted", "description": "new"}, headers=org.h)
    assert updated.json()["visibility"] == "unlisted" and updated.json()["description"] == "new"
    assert kit.client.put(f"/api/events/{event['id']}", json={"visibility": "bogus"}, headers=org.h).status_code == 400
    assert kit.client.put(f"/api/events/{event['id']}", json={}, headers=org.h).status_code == 400
    assert kit.client.put(f"/api/events/{event['id']}", json={"capacity": 0}, headers=org.h).status_code == 400


def test_status_cannot_be_changed_through_put(kit):
    org = kit.user("organizer")
    event, _ = kit.event(org, publish=False)
    response = kit.client.put(f"/api/events/{event['id']}", json={"status": "cancelled"}, headers=org.h)
    #unknown field is ignored, so there is nothing to update
    assert response.status_code == 400
    assert fetch_one("SELECT status FROM events WHERE id = %s", (event["id"],))["status"] == "draft"


def test_organizers_only_manage_their_own_events(kit):
    org, rival, attendee = kit.user("organizer"), kit.user("organizer"), kit.user("attendee")
    event, tt = kit.event(org, publish=False)
    eid = event["id"]
    assert kit.client.put(f"/api/events/{eid}", json={"title": "hijack"}, headers=rival.h).status_code == 403
    assert kit.client.put(f"/api/events/{eid}", json={"title": "hijack"}, headers=attendee.h).status_code == 403
    assert kit.client.put(f"/api/events/{eid}", json={"title": "hijack"}).status_code == 401
    assert kit.client.post(f"/api/events/{eid}/publish", headers=rival.h).status_code == 403
    assert kit.client.post(f"/api/events/{eid}/ticket-types", headers=rival.h,
                           json={"name": "x", "price": 1, "total_quantity": 1}).status_code == 403
    assert kit.client.post(f"/api/events/{eid}/seats", headers=rival.h,
                           json={"section": "A", "category": "standard", "rows": 1, "seats_per_row": 1}).status_code == 403
    assert kit.client.put(f"/api/ticket-types/{tt['id']}", json={"price": 1}, headers=rival.h).status_code == 403
    assert kit.client.post(f"/api/events/{eid}/duplicate", headers=rival.h).status_code == 403
    assert kit.client.put(f"/api/events/{eid}", json={"title": "mine"}, headers=org.h).status_code == 200


def test_drafts_and_private_events_are_hidden_from_the_public(kit):
    org, other = kit.user("organizer"), kit.user("attendee")
    event, _ = kit.event(org, publish=False)
    eid = event["id"]
    assert kit.client.get(f"/api/events/{eid}").status_code == 404
    assert kit.client.get(f"/api/events/{eid}", headers=other.h).status_code == 404
    assert kit.client.get(f"/api/events/{eid}", headers=org.h).status_code == 200   #preview
    kit.publish(org, eid)
    assert kit.client.get(f"/api/events/{eid}").status_code == 200
    kit.client.put(f"/api/events/{eid}", json={"visibility": "private"}, headers=org.h)
    assert kit.client.get(f"/api/events/{eid}").status_code == 404
    kit.client.put(f"/api/events/{eid}", json={"visibility": "unlisted"}, headers=org.h)
    assert kit.client.get(f"/api/events/{eid}").status_code == 200   #reachable by link


def test_public_list_filter(kit):
    org = kit.user("organizer")
    event, _ = kit.event(org)
    eid = event["id"]
    def listed():
        return eid in [e["id"] for e in kit.client.get("/api/events?public=true").json()]
    assert listed()
    kit.client.put(f"/api/events/{eid}", json={"visibility": "unlisted"}, headers=org.h)
    assert not listed()
    kit.client.put(f"/api/events/{eid}", json={"visibility": "public"}, headers=org.h)
    run_sql("UPDATE events SET status = 'suspended' WHERE id = %s", (eid,))
    assert not listed()
    assert eid in [e["id"] for e in kit.client.get(f"/api/events?organizer_id={org.id}").json()]


def test_publish_rules(kit):
    unverified = kit.user("organizer", verified=False)
    event, _ = kit.event(unverified, publish=False)
    assert kit.client.post(f"/api/events/{event['id']}/publish", headers=unverified.h).status_code == 403
    org = kit.user("organizer")
    bare = kit.client.post("/api/events", headers=org.h, json={"title": "x", "venue_name": "y", "start_time": "2030-01-01T10:00:00+05:00"}).json()
    assert kit.client.post(f"/api/events/{bare['id']}/publish", headers=org.h).status_code == 409   #no ticket type yet
    kit.ticket_type(org, bare["id"])
    assert kit.client.post(f"/api/events/{bare['id']}/publish", headers=org.h).json()["status"] == "upcoming"
    assert kit.client.post(f"/api/events/{bare['id']}/publish", headers=org.h).status_code == 409   #already published


def test_unpublish_blocked_once_tickets_are_sold(kit):
    org, buyer = kit.user("organizer"), kit.user("attendee")
    event, tt = kit.event(org)
    assert kit.client.post(f"/api/events/{event['id']}/unpublish", headers=org.h).json()["status"] == "draft"
    kit.publish(org, event["id"])
    run_sql("UPDATE events SET is_paid_sales_active = true WHERE id = %s", (event["id"],))
    assert kit.buy(buyer, event["id"], tt["id"]).status_code == 201
    assert kit.client.post(f"/api/events/{event['id']}/unpublish", headers=org.h).status_code == 409


def test_cancel_event_notifies_holders_and_stops_sales_and_scanning(kit):
    org, buyer, late = kit.user("organizer"), kit.user("attendee"), kit.user("attendee")
    event, tt = kit.event(org)
    ticket = kit.buy(buyer, event["id"], tt["id"]).json()["ticket"]
    cancelled = kit.client.post(f"/api/events/{event['id']}/cancel", headers=org.h)
    assert cancelled.status_code == 200 and cancelled.json()["status"] == "cancelled"
    assert notifications_for(buyer.id, "event_cancelled")
    assert kit.buy(late, event["id"], tt["id"]).status_code == 409
    scan = kit.client.post("/api/checkin/verify-qr", json={"qr_code_hash": ticket["qr_code_hash"]}, headers=org.h)
    assert scan.json()["result"] == "event_cancelled"
    assert kit.client.put(f"/api/events/{event['id']}", json={"title": "x"}, headers=org.h).status_code == 409
    assert kit.client.post(f"/api/events/{event['id']}/cancel", headers=org.h).status_code == 409
    ics = kit.client.get(f"/api/events/{event['id']}/export.ics").text
    assert "STATUS:CANCELLED" in ics and "METHOD:CANCEL" in ics


def test_duplicate_copies_setup_but_not_transactions(kit):
    org, buyer = kit.user("organizer"), kit.user("attendee")
    event, tt = kit.event(org, description="keep me")
    kit.seats(org, event["id"], rows=2, per_row=3)
    kit.buy(buyer, event["id"], tt["id"])
    copy = kit.client.post(f"/api/events/{event['id']}/duplicate", headers=org.h)
    assert copy.status_code == 201
    new = copy.json()
    assert new["status"] == "draft" and new["title"].endswith("(copy)") and new["description"] == "keep me"
    types = kit.client.get(f"/api/events/{new['id']}/ticket-types", headers=org.h).json()
    assert len(types) == 1 and types[0]["quantity_available"] == types[0]["total_quantity"] == 10
    assert len(kit.client.get(f"/api/events/{new['id']}/seats").json()) == 6
    assert fetch_one("SELECT count(*) AS n FROM orders WHERE event_id = %s", (new["id"],))["n"] == 0
    assert fetch_one("SELECT count(*) AS n FROM tickets WHERE event_id = %s", (new["id"],))["n"] == 0


def test_ticket_type_create_list_validation(kit):
    org = kit.user("organizer")
    event, _ = kit.event(org, publish=False)
    eid = event["id"]
    for bad in ({"name": "x", "price": 1, "total_quantity": 0}, {"name": "x", "price": -1, "total_quantity": 1},
                {"name": "x", "price": 1, "total_quantity": 1, "max_per_order": 0},
                {"name": "x", "price": 1, "total_quantity": 1, "seat_category": "vip"}):
        assert kit.client.post(f"/api/events/{eid}/ticket-types", json=bad, headers=org.h).status_code == 400
    assert kit.client.post(f"/api/events/{uuid4()}/ticket-types", json={"name": "x", "price": 1, "total_quantity": 1}, headers=org.h).status_code == 404


def test_hidden_ticket_types_are_invisible_and_unbuyable(kit):
    org, buyer = kit.user("organizer"), kit.user("attendee")
    event, tt = kit.event(org)
    secret = kit.ticket_type(org, event["id"], name="Secret", price=0, is_hidden=True)
    public_names = [t["name"] for t in kit.client.get(f"/api/events/{event['id']}/ticket-types").json()]
    owner_names = [t["name"] for t in kit.client.get(f"/api/events/{event['id']}/ticket-types", headers=org.h).json()]
    assert "Secret" not in public_names and "Secret" in owner_names
    assert "Secret" not in [t["name"] for t in kit.client.get(f"/api/events/{event['id']}").json()["ticket_types"]]
    assert kit.buy(buyer, event["id"], secret["id"]).status_code == 409
    shown = kit.client.put(f"/api/ticket-types/{secret['id']}", json={"is_hidden": False}, headers=org.h)
    assert shown.status_code == 200 and kit.buy(buyer, event["id"], secret["id"]).status_code == 201


def test_ticket_type_update_protects_sold_tickets(kit):
    org, buyer = kit.user("organizer"), kit.user("attendee")
    event, tt = kit.event(org, quantity=10)
    kit.buy(buyer, event["id"], tt["id"], quantity=4)
    assert kit.client.put(f"/api/ticket-types/{tt['id']}", json={"total_quantity": 3}, headers=org.h).status_code == 409
    ok = kit.client.put(f"/api/ticket-types/{tt['id']}", json={"total_quantity": 8, "price": 1500}, headers=org.h).json()
    assert ok["total_quantity"] == 8 and ok["quantity_available"] == 4 and float(ok["price"]) == 1500
    assert kit.client.put(f"/api/ticket-types/{tt['id']}", json={}, headers=org.h).status_code == 400
    assert kit.client.put(f"/api/ticket-types/{uuid4()}", json={"price": 1}, headers=org.h).status_code == 404


def test_seat_creation_and_listing(kit):
    org = kit.user("organizer")
    event, _ = kit.event(org, publish=False)
    eid = event["id"]
    assert len(kit.seats(org, eid, rows=2, per_row=3)) == 6
    again = kit.client.post(f"/api/events/{eid}/seats", headers=org.h,
                            json={"section": "T", "category": "standard", "rows": 1, "seats_per_row": 1})
    assert again.status_code == 409
    assert kit.client.post(f"/api/events/{eid}/seats", headers=org.h,
                           json={"section": "Z", "category": "gold", "rows": 1, "seats_per_row": 1}).status_code == 400
    assert kit.client.post(f"/api/events/{eid}/seats", headers=org.h,
                           json={"section": "Z", "category": "standard", "rows": 100, "seats_per_row": 100}).status_code == 400
    assert fetch_one("SELECT has_assigned_seating FROM events WHERE id = %s", (eid,))["has_assigned_seating"] is True


def test_calendar_export_and_links(kit):
    org = kit.user("organizer")
    event, _ = kit.event(org, description="Bring a friend; bring snacks, too", venue_address="Abay 1",
                         end_time="2030-01-01T23:00:00+05:00")
    ics = kit.client.get(f"/api/events/{event['id']}/export.ics")
    assert ics.headers["content-type"].startswith("text/calendar")
    text = ics.text
    assert f"UID:{event['id']}@biletflow" in text           #stable id so updates replace the old entry
    assert "DTSTART:20300101T140000Z" in text and "DTEND:20300101T180000Z" in text
    assert "LOCATION:Test Hall\\, Abay 1" in text and "URL:" in text
    assert r"Bring a friend\; bring snacks\, too" in text
    links = kit.client.get(f"/api/events/{event['id']}/calendar-links").json()
    assert links["google"].startswith("https://calendar.google.com/") and links["ics"].endswith("export.ics")
    assert kit.client.get(f"/api/events/{uuid4()}/export.ics").status_code == 404


def test_audit_log_records_important_changes(kit):
    org = kit.user("organizer")
    event, tt = kit.event(org, publish=False)
    kit.client.put(f"/api/events/{event['id']}", json={"capacity": 50}, headers=org.h)
    kit.client.put(f"/api/ticket-types/{tt['id']}", json={"price": 2500}, headers=org.h)
    kit.publish(org, event["id"])
    actions = [r["action"] for r in fetch("SELECT action FROM audit_log WHERE event_id = %s", (event["id"],))]
    for expected in ("event_created", "ticket_type_created", "capacity_changed", "ticket_price_changed", "event_published"):
        assert expected in actions
    assert not any(r.endswith("/audit") for r in [str(r.path) for r in kit.client.app.routes if hasattr(r, "path")])  #no edit/delete routes


def test_report_event(kit):
    org, user = kit.user("organizer"), kit.user("attendee")
    event, _ = kit.event(org)
    assert kit.client.post(f"/api/events/{event['id']}/report", json={"reason": "  "}).status_code == 400
    assert kit.client.post(f"/api/events/{event['id']}/report", json={"reason": "Looks like a scam"}, headers=user.h).status_code == 201
    assert kit.client.post(f"/api/events/{event['id']}/report", json={"reason": "anonymous report"}).status_code == 201
    assert kit.client.post(f"/api/events/{uuid4()}/report", json={"reason": "x"}).status_code == 404


def test_bad_ids_give_clean_errors_not_crashes(kit):
    org = kit.user("organizer")
    assert kit.client.get("/api/events/not-a-uuid").status_code == 400
    assert kit.client.get(f"/api/events/{uuid4()}").status_code == 404
    assert kit.client.get("/api/tickets/not-a-uuid").status_code == 400
    assert kit.client.post("/api/events", headers=org.h, json={"title": "x", "venue_name": "y", "start_time": "garbage"}).status_code == 400
