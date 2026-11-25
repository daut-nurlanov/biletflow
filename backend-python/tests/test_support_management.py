from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import pytest

from conftest import fetch, fetch_one, notifications_for, run_sql


def setup_case(kit):
    org, buyer, admin = kit.user("organizer"), kit.user(), kit.user("platform_admin")
    event, _ = kit.event(org)
    response = kit.client.post("/api/support/cases", headers=buyer.h, json={
        "event_id": event["id"], "category": "payment", "message": "Please help with payment"})
    assert response.status_code == 201
    case = response.json()
    return org, buyer, admin, event, case, f"/api/support/cases/{case['id']}"


def test_event_and_kind_filters_preserve_all_existing_visibility_rules(kit):
    org, buyer, admin, event, case, url = setup_case(kit)
    other_org = kit.user("organizer")
    other_event, _ = kit.event(other_org)
    other_case = kit.client.post("/api/support/cases", headers=buyer.h, json={
        "event_id": other_event["id"], "category": "refund", "message": "Other event question"}).json()
    own_case = kit.client.post("/api/support/cases", headers=org.h, json={
        "event_id": event["id"], "category": "activation", "message": "Activation question"}).json()
    root = "/api/support/cases"
    def listed(who, **params):
        response = kit.client.get(root, headers=who.h, params=params)
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        return {row["id"] for row in response.json()}
    assert listed(org) == {case["id"], own_case["id"]}
    assert listed(org, event_id=event["id"], kind="attendee", status="open", escalated=False) == {case["id"]}
    assert listed(org, kind="organizer") == {own_case["id"]}
    assert listed(org, event_id=other_event["id"]) == set()
    assert listed(buyer, event_id=event["id"], kind="attendee") == {case["id"]}
    assert other_case["id"] in listed(buyer)
    assert listed(admin, event_id=event["id"], kind="attendee") == set()
    assert kit.client.post(url + "/escalate", headers=org.h).status_code == 200
    assert listed(admin, event_id=event["id"], kind="attendee", escalated=True) == {case["id"]}
    assert listed(org, event_id=str(uuid4())) == set()
    assert kit.client.get(root, params={"event_id": event["id"]}).status_code == 401


@pytest.mark.parametrize("params", [{"event_id": "invalid"}, {"kind": "admin"}])
def test_invalid_new_list_filters_return_validation_errors(kit, params):
    org = kit.user("organizer")
    assert kit.client.get("/api/support/cases", headers=org.h, params=params).status_code == 422


def test_context_names_are_available_without_broadening_case_access(kit):
    org, buyer, admin, event, case, url = setup_case(kit)
    staff = kit.user("event_admin")
    kit.client.post(f"/api/events/{event['id']}/staff", headers=org.h, json={"email": staff.email})
    kit.client.put(url, headers=org.h, json={"assigned_to": org.id})
    data = kit.client.get(url, headers=org.h).json()
    assert data["event_title"] == event["title"]
    assert data["opened_by_name"] == "Test attendee"
    assert data["assigned_to_name"] == "Test organizer"
    assert data["your_role_in_case"] == "handler" and len(data["messages"]) == 1
    for outsider in (staff, kit.user("organizer"), admin):
        assert kit.client.get(url, headers=outsider.h).status_code == 404
        assert kit.client.put(url, headers=outsider.h, json={"status": "resolved"}).status_code == 404


def test_notification_links_to_support_and_can_only_be_read_by_recipient(kit):
    organizer, buyer, admin, _, case, url = setup_case(kit)
    assert kit.client.put(url, headers=organizer.h, json={"status": "in_progress"}).is_success
    unread = kit.client.get("/api/notifications?unread_only=true", headers=buyer.h).json()
    notification = next(n for n in unread if n["subject"] == "Your support case changed status")
    assert notification["target_type"] == "support"
    assert notification["target_id"] == case["id"]
    target = f"/api/notifications/{notification['id']}/read"
    assert kit.client.post(target, headers=admin.h).status_code == 404
    assert kit.client.post(target).status_code == 401
    for _ in range(2):
        assert kit.client.post(target, headers=buyer.h).json()["is_read"] is True
    remaining = kit.client.get("/api/notifications?unread_only=true", headers=buyer.h).json()
    assert notification["id"] not in {item["id"] for item in remaining}
    assert kit.client.get(url, headers=buyer.h).is_success
    assert kit.client.get(url, headers=admin.h).status_code == 404


def test_parallel_support_retry_returns_one_case_and_one_reply(kit):
    organizer, buyer = kit.user("organizer"), kit.user()
    event, _ = kit.event(organizer)
    payload = {"event_id": event["id"], "category": "payment", "message": "A single question"}
    headers = {**buyer.h, "Idempotency-Key": str(uuid4())}
    with ThreadPoolExecutor(max_workers=2) as pool:
        created = list(pool.map(lambda _: kit.client.post("/api/support/cases", headers=headers, json=payload), range(2)))
    assert [response.status_code for response in created] == [201, 201]
    case_id = created[0].json()["id"]
    assert case_id == created[1].json()["id"]
    url = f"/api/support/cases/{case_id}/messages"
    headers = {**organizer.h, "Idempotency-Key": str(uuid4())}
    with ThreadPoolExecutor(max_workers=2) as pool:
        replies = list(pool.map(lambda _: kit.client.post(url, headers=headers, json={"message": "One reply"}), range(2)))
    assert [response.status_code for response in replies] == [201, 201]
    assert replies[0].json()["id"] == replies[1].json()["id"]
    assert len(notifications_for(buyer.id, "support")) == 1
    assert len(notifications_for(organizer.id, "support")) == 1


def test_assignment_notifies_once_and_rejects_unauthorized_or_suspended_assignees(kit):
    org, buyer, admin, event, case, url = setup_case(kit)
    for _ in range(2):
        assert kit.client.put(url, headers=org.h, json={"assigned_to": org.id}).status_code == 200
    notices = [n for n in notifications_for(org.id, "support") if n["subject"] == "Support case assigned to you"]
    assert len(notices) == 1 and case["id"] in notices[0]["body"]
    assert kit.client.put(url, headers=org.h, json={"assigned_to": admin.id}).status_code == 400
    assert kit.client.put(url, headers=buyer.h, json={"assigned_to": org.id}).status_code == 403
    suspended = kit.user("platform_admin")
    run_sql("UPDATE users SET is_suspended = true WHERE id = %s", (suspended.id,))
    kit.client.post(url + "/escalate", headers=org.h)
    assert kit.client.put(url, headers=admin.h, json={"assigned_to": suspended.id}).status_code == 400
    assert kit.client.put(url, headers=admin.h, json={"assigned_to": buyer.id}).status_code == 400
    assert kit.client.get(url, headers=org.h).json()["assigned_to"] == org.id
    assert kit.client.put(url, headers=admin.h, json={"assigned_to": admin.id}).status_code == 200
    assert any(n["subject"] == "Support case assigned to you" for n in notifications_for(admin.id, "support"))


def test_repeated_concurrent_escalation_has_one_audit_and_notification(kit):
    org, buyer, admin, event, case, url = setup_case(kit)
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _: kit.client.post(url + "/escalate", headers=org.h), range(2)))
    assert all(response.status_code == 200 and response.json()["escalated"] for response in responses)
    rows = fetch("SELECT * FROM audit_log WHERE entity_id = %s AND action = 'support_case_escalated'", (case["id"],))
    assert len(rows) == 1
    assert len([n for n in notifications_for(admin.id, "support") if n["subject"] == "Escalated support case" and case["id"] in n["body"]]) == 1
    assert kit.client.get(url, headers=buyer.h).status_code == 200
    assert kit.client.get(url, headers=admin.h).json()["your_role_in_case"] == "admin"
    own = kit.client.post("/api/support/cases", headers=org.h, json={"category": "technical", "message": "Help"}).json()
    assert kit.client.post(f"/api/support/cases/{own['id']}/escalate", headers=org.h).status_code == 403


def test_repeated_concurrent_status_update_records_one_actual_transition(kit):
    org, buyer, admin, event, case, url = setup_case(kit)
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _: kit.client.put(url, headers=org.h, json={"status": "resolved"}), range(2)))
    assert all(response.status_code == 200 for response in responses)
    assert fetch_one("SELECT count(*) AS n FROM audit_log WHERE entity_id = %s AND action = 'support_case_status_changed'", (case["id"],))["n"] == 1
    assert len([n for n in notifications_for(buyer.id, "support") if n["subject"] == "Your support case changed status"]) == 1


def test_customer_reply_reopens_resolved_or_waiting_case_with_audit_and_retained_context(kit):
    org, buyer, admin, event, case, url = setup_case(kit)
    for status, reopened in [("waiting_customer", "in_progress"), ("resolved", "open")]:
        assert kit.client.put(url, headers=org.h, json={"status": status}).status_code == 200
        assert kit.client.post(url + "/messages", headers=buyer.h, json={"message": "More information"}).status_code == 201
        assert kit.client.get(url, headers=org.h).json()["status"] == reopened
    assert kit.client.post(f"/api/events/{event['id']}/cancel", headers=org.h).status_code == 200
    detail = kit.client.get(url, headers=org.h).json()
    assert len(detail["messages"]) == 3 and detail["event_id"] == event["id"]
    audit = kit.client.get(f"/api/events/{event['id']}/timeline", headers=org.h).json()
    transitions = [row for row in audit if row["action"] == "support_case_status_changed"]
    assert len(transitions) == 4
    automatic = [row for row in transitions if row["actor_id"] == buyer.id]
    assert len(automatic) == 2 and all("after customer reply" in row["details"] for row in automatic)
