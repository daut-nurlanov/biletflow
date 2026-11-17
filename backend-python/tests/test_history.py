from datetime import datetime, timezone
from uuid import uuid4

import pytest

from conftest import fetch_one, run_sql


def add_entry(org, event_id, at, action="event_updated", record_id=None, actor=True):
    record_id = record_id or str(uuid4())
    run_sql("""INSERT INTO audit_log (id, actor_id, event_id, action, details, entity_type, entity_id, created_at)
               VALUES (%s,%s,%s,%s,%s,'event',%s,%s)""",
            (record_id, org.id if actor else None, event_id, action, "Historical description", event_id, at))
    return record_id


def history(kit, org, event_id, **params):
    response = kit.client.get(f"/api/events/{event_id}/timeline", headers=org.h, params=params)
    assert response.status_code == 200, response.text
    return response.json()


def test_history_dates_are_almaty_inclusive_and_actions_filter_exactly(kit):
    org = kit.user("organizer")
    event, _ = kit.event(org)
    eid = event["id"]
    run_sql("DELETE FROM audit_log WHERE event_id = %s", (eid,))
    add_entry(org, eid, "2029-04-09T18:59:59Z", "event_published")
    midnight = add_entry(org, eid, "2029-04-09T19:00:00Z", "event_published")
    last = add_entry(org, eid, "2029-04-10T18:59:59Z", "staff_assigned")
    add_entry(org, eid, "2029-04-10T19:00:00Z", "event_published")
    rows = history(kit, org, eid, date_from="2029-04-10", date_to="2029-04-10")
    assert [row["id"] for row in rows] == [last, midnight]
    assert rows[0]["actor"] and rows[0]["actor_id"] == org.id
    assert rows[0]["entity_type"] == "event" and rows[0]["entity_id"] == eid
    assert rows[0]["details"] == "Historical description"
    filtered = history(kit, org, eid, date_from="2029-04-10", date_to="2029-04-10", action="event_published")
    assert [row["id"] for row in filtered] == [midnight]
    assert history(kit, org, eid, action="not_a_real_action") == []


def test_cursor_keeps_equal_timestamps_ordered_without_gaps_and_ignores_newer_inserts(kit):
    org = kit.user("organizer")
    event, _ = kit.event(org)
    eid = event["id"]
    run_sql("DELETE FROM audit_log WHERE event_id = %s", (eid,))
    ids = [add_entry(org, eid, "2029-04-10T10:00:00Z") for _ in range(7)]
    page = history(kit, org, eid, limit=3)
    assert [row["id"] for row in page] == sorted(ids, reverse=True)[:3]
    new = add_entry(org, eid, "2029-04-11T10:00:00Z")
    collected = list(page)
    while len(page) == 3:
        last = page[-1]
        page = history(kit, org, eid, limit=3, before=last["timestamp"] + "|" + last["id"])
        collected.extend(page)
    assert [row["id"] for row in collected] == sorted(ids, reverse=True)
    assert history(kit, org, eid, limit=1)[0]["id"] == new


def test_more_than_500_records_remain_accessible_and_legacy_list_is_preserved(kit):
    org = kit.user("organizer")
    event, _ = kit.event(org)
    eid = event["id"]
    run_sql("DELETE FROM audit_log WHERE event_id = %s", (eid,))
    run_sql("""INSERT INTO audit_log (actor_id,event_id,action,details,created_at)
               SELECT %s,%s,'event_updated','Bulk history', '2029-04-10T10:00:00Z'::timestamptz
               FROM generate_series(1,505)""", (org.id, eid))
    first = history(kit, org, eid)
    assert isinstance(first, list) and len(first) == 500
    last = first[-1]
    remaining = history(kit, org, eid, before=last["timestamp"] + "|" + last["id"])
    assert len(remaining) == 5
    assert len({row["id"] for row in first + remaining}) == 505


@pytest.mark.parametrize("params,status", [
    ({"date_from": "2029-04-11", "date_to": "2029-04-10"}, 400),
    ({"date_from": "invalid"}, 400), ({"date_to": "2029-02-30"}, 400),
    ({"before": "bad"}, 400),
    ({"before": "2029-04-10T10:00:00|" + str(uuid4())}, 400),
    ({"before": "2029-04-10T10:00:00Z|not-a-uuid"}, 400),
    ({"before": "not-a-date|" + str(uuid4())}, 400),
    ({"limit": 0}, 422), ({"limit": 501}, 422),
])
def test_invalid_history_filters_are_rejected(kit, params, status):
    org = kit.user("organizer")
    event, _ = kit.event(org)
    response = kit.client.get(f"/api/events/{event['id']}/timeline", headers=org.h, params=params)
    assert response.status_code == status


def test_event_access_and_read_only_permissions_apply_to_every_page(kit):
    org, other, attendee, staff, admin = kit.user("organizer"), kit.user("organizer"), kit.user(), kit.user("event_admin"), kit.user("platform_admin")
    event, _ = kit.event(org)
    eid = event["id"]
    kit.client.post(f"/api/events/{eid}/staff", headers=org.h, json={"email": staff.email})
    root = f"/api/events/{eid}/timeline"
    cursor = "2029-04-10T10:00:00Z|" + str(uuid4())
    for headers, status in [({},401), (other.h,403), (attendee.h,403), (staff.h,403)]:
        assert kit.client.get(root, headers=headers, params={"before": cursor}).status_code == status
    assert kit.client.get(root, headers=admin.h).status_code == 200
    assert kit.client.get(f"/api/events/{uuid4()}/timeline", headers=org.h).status_code == 404
    before = fetch_one("SELECT count(*) AS n FROM audit_log WHERE event_id = %s", (eid,))["n"]
    for method in ["post", "put", "patch", "delete"]:
        assert getattr(kit.client, method)(root, headers=org.h).status_code == 405
    after = fetch_one("SELECT count(*) AS n FROM audit_log WHERE event_id = %s", (eid,))["n"]
    assert before == after


def test_cancelled_completed_events_and_unknown_actors_keep_history(kit):
    org = kit.user("organizer")
    event, _ = kit.event(org)
    eid = event["id"]
    record = add_entry(org, eid, "2029-04-10T10:00:00Z", "future_action", actor=False)
    for status in ["completed", "cancelled"]:
        run_sql("UPDATE events SET status = %s WHERE id = %s", (status, eid))
        rows = history(kit, org, eid, action="future_action")
        assert len(rows) == 1 and rows[0]["id"] == record
        assert rows[0]["actor"] is None and rows[0]["actor_id"] is None
        assert datetime.fromisoformat(rows[0]["timestamp"].replace("Z", "+00:00")).tzinfo == timezone.utc


def test_cursor_cannot_escape_event_and_action_filters(kit):
    org = kit.user("organizer")
    first, _ = kit.event(org)
    second, _ = kit.event(org)
    for event in [first, second]:
        add_entry(org, event["id"], "2029-04-10T10:00:00Z", "event_updated")
        add_entry(org, event["id"], "2029-04-09T10:00:00Z", "staff_revoked")
        add_entry(org, event["id"], "2029-04-08T10:00:00Z", "event_updated")
    page = history(kit, org, first["id"], action="event_updated", limit=1)
    next_page = history(kit, org, first["id"], action="event_updated", before=page[0]["timestamp"] + "|" + page[0]["id"])
    assert len(next_page) == 1
    assert all(row["entity_id"] == first["id"] and row["action"] == "event_updated" for row in next_page)
    assert not any(row["entity_id"] == second["id"] for row in page + next_page)


def test_required_audit_actions_are_recorded_and_retained_after_cancellation(kit):
    org, buyer, staff = kit.user("organizer"), kit.user(), kit.user("event_admin")
    event, tt = kit.event(org)
    eid = event["id"]
    promo = kit.client.post(f"/api/events/{eid}/promo-campaigns", headers=org.h, json={
        "discount_type": "percentage", "discount_value": 10, "max_redemptions": 10}).json()
    order = kit.buy(buyer, eid, tt["id"], promo_code=promo["code"]).json()["order"]
    assert kit.client.post(f"/api/orders/{order['id']}/refund", headers=org.h).status_code == 200
    ticket = kit.buy(buyer, eid, tt["id"]).json()["ticket"]
    assert kit.client.post(f"/api/events/{eid}/staff", headers=org.h, json={"email": staff.email}).status_code == 201
    assert kit.client.post("/api/checkin/verify-qr", headers=staff.h, json={"qr_code_hash": ticket["qr_code_hash"], "event_id": eid}).status_code == 200
    assert kit.client.post("/api/checkin/undo", headers=staff.h, json={"ticket_id": ticket["id"]}).status_code == 200
    assert kit.client.put(f"/api/ticket-types/{tt['id']}", headers=org.h, json={"price": 1500}).status_code == 200
    assert kit.client.put(f"/api/events/{eid}", headers=org.h, json={"capacity": 120}).status_code == 200
    case = kit.client.post("/api/support/cases", headers=buyer.h, json={"event_id": eid, "category": "event_information", "message": "Question about this event"}).json()
    assert kit.client.put(f"/api/support/cases/{case['id']}", headers=org.h, json={"status": "in_progress"}).status_code == 200
    assert kit.client.post(f"/api/promo-campaigns/{promo['id']}/disable", headers=org.h).status_code == 200
    assert kit.client.post(f"/api/events/{eid}/cancel", headers=org.h).status_code == 200
    rows = history(kit, org, eid)
    assert {"event_published", "event_cancelled", "ticket_price_changed", "capacity_changed", "order_refunded",
            "promo_created", "promo_disabled", "support_case_status_changed", "check_in", "check_in_reversed"} <= {row["action"] for row in rows}
    assert all(row["timestamp"] and row["actor"] and row["entity_type"] and row["entity_id"] and row["details"] for row in rows)


def test_ticket_quantity_changes_are_audited_once_and_failed_edits_leave_no_history(kit):
    org, buyer = kit.user("organizer"), kit.user()
    event, tt = kit.event(org)
    url = f"/api/ticket-types/{tt['id']}"
    for quantity in [12, 12]:
        assert kit.client.put(url, headers=org.h, json={"total_quantity": quantity}).status_code == 200
    rows = history(kit, org, event["id"], action="ticket_quantity_changed")
    assert len(rows) == 1
    assert rows[0]["entity_id"] == tt["id"] and rows[0]["entity_type"] == "ticket_type"
    assert "10 to 12" in rows[0]["details"] and rows[0]["actor_id"] == org.id
    assert kit.buy(buyer, event["id"], tt["id"], quantity=3).status_code == 201
    assert kit.client.put(url, headers=org.h, json={"total_quantity": 2}).status_code == 409
    assert history(kit, org, event["id"], action="ticket_quantity_changed") == rows
