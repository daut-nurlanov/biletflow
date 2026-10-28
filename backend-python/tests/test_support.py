from uuid import uuid4

from conftest import notifications_for


def open_case(kit, who, **kw):
    body = {"category": "ticket_delivery", "message": "I never got my ticket"}
    body.update(kw)
    return kit.client.post("/api/support/cases", json=body, headers=who.h)


def scenario(kit):
    org, buyer, stranger, admin = kit.user("organizer"), kit.user(), kit.user(), kit.user("platform_admin")
    event, tt = kit.event(org)
    order = kit.buy(buyer, event["id"], tt["id"]).json()
    return org, buyer, stranger, admin, event, order


def test_case_from_a_ticket_fills_in_the_context_itself(kit):
    org, buyer, stranger, admin, event, order = scenario(kit)
    response = open_case(kit, buyer, ticket_id=order["ticket"]["id"])
    assert response.status_code == 201
    case = response.json()
    assert case["event_id"] == event["id"] and case["order_id"] == order["order"]["id"] and case["kind"] == "attendee"
    assert case["status"] == "open"
    from_order = open_case(kit, buyer, order_id=order["order"]["id"], category="refund").json()
    assert from_order["event_id"] == event["id"]
    assert open_case(kit, buyer, event_id=event["id"], category="seating").status_code == 201
    assert notifications_for(org.id, "support")                            #the organizer is told


def test_case_validation(kit):
    org, buyer, stranger, admin, event, order = scenario(kit)
    assert open_case(kit, buyer, ticket_id=order["ticket"]["id"], category="gossip").status_code == 400
    assert open_case(kit, buyer, ticket_id=order["ticket"]["id"], message="  ").status_code == 400
    assert open_case(kit, buyer).status_code == 400                                              #no event/order/ticket
    assert open_case(kit, stranger, ticket_id=order["ticket"]["id"]).status_code == 403          #not their ticket
    assert open_case(kit, stranger, order_id=order["order"]["id"]).status_code == 403
    assert open_case(kit, buyer, event_id=str(uuid4())).status_code == 404
    assert open_case(kit, admin).status_code == 403                                              #admins do not open cases
    assert kit.client.post("/api/support/cases", json={"category": "payment", "message": "x"}).status_code == 401


def test_only_the_right_people_can_see_a_case(kit):
    org, buyer, stranger, admin, event, order = scenario(kit)
    rival = kit.user("organizer")
    case = open_case(kit, buyer, ticket_id=order["ticket"]["id"]).json()
    url = f"/api/support/cases/{case['id']}"
    assert kit.client.get(url, headers=buyer.h).json()["your_role_in_case"] == "owner"
    assert kit.client.get(url, headers=org.h).json()["your_role_in_case"] == "handler"
    for outsider in (stranger, rival, admin):                    #admin only sees organizer cases or escalated ones
        assert kit.client.get(url, headers=outsider.h).status_code == 404
    assert kit.client.get(url).status_code == 401
    assert kit.client.post(f"{url}/messages", json={"message": "hi"}, headers=stranger.h).status_code == 404
    assert [c["id"] for c in kit.client.get("/api/support/cases", headers=stranger.h).json()] == []
    assert [c["id"] for c in kit.client.get("/api/support/cases", headers=org.h).json()] == [case["id"]]
    assert [c["id"] for c in kit.client.get("/api/support/cases", headers=buyer.h).json()] == [case["id"]]


def test_message_thread_and_notifications(kit):
    org, buyer, stranger, admin, event, order = scenario(kit)
    case = open_case(kit, buyer, ticket_id=order["ticket"]["id"]).json()
    url = f"/api/support/cases/{case['id']}"
    assert kit.client.post(f"{url}/messages", json={"message": "Resent your ticket by email"}, headers=org.h).status_code == 201
    assert kit.client.post(f"{url}/messages", json={"message": "Got it, thanks"}, headers=buyer.h).status_code == 201
    assert kit.client.post(f"{url}/messages", json={"message": " "}, headers=buyer.h).status_code == 400
    thread = kit.client.get(url, headers=buyer.h).json()["messages"]
    assert [m["message"] for m in thread] == ["I never got my ticket", "Resent your ticket by email", "Got it, thanks"]
    assert thread[1]["sender_name"] == "Test organizer" and thread[0]["sender_name"] == "Test attendee"
    assert any("Resent" in n["body"] for n in notifications_for(buyer.id, "support"))


def test_status_changes_by_support_side_only(kit):
    org, buyer, stranger, admin, event, order = scenario(kit)
    case = open_case(kit, buyer, ticket_id=order["ticket"]["id"]).json()
    url = f"/api/support/cases/{case['id']}"
    assert kit.client.put(url, json={"status": "resolved"}, headers=buyer.h).status_code == 403
    assert kit.client.put(url, json={"status": "banana"}, headers=org.h).status_code == 400
    assert kit.client.put(url, json={"status": "waiting_customer", "assigned_to": org.id}, headers=org.h).json()["status"] == "waiting_customer"
    assert kit.client.put(url, json={"assigned_to": buyer.id}, headers=org.h).status_code == 400      #cannot assign to an attendee
    assert notifications_for(buyer.id, "support")
    #the customer replying while we wait puts it back in progress
    kit.client.post(f"{url}/messages", json={"message": "Here is more detail"}, headers=buyer.h)
    assert kit.client.get(url, headers=buyer.h).json()["status"] == "in_progress"
    kit.client.put(url, json={"status": "resolved"}, headers=org.h)
    actions = [r["action"] for r in kit.client.get(f"/api/events/{event['id']}/timeline", headers=org.h).json()]
    assert actions.count("support_case_status_changed") == 2


def test_escalation_hands_the_case_to_platform_admins(kit):
    org, buyer, stranger, admin, event, order = scenario(kit)
    case = open_case(kit, buyer, ticket_id=order["ticket"]["id"], category="payment").json()
    url = f"/api/support/cases/{case['id']}"
    assert case["id"] not in [c["id"] for c in kit.client.get("/api/support/cases?escalated=true", headers=admin.h).json()]
    assert kit.client.post(f"{url}/escalate", headers=buyer.h).status_code == 403
    assert kit.client.post(f"{url}/escalate", headers=stranger.h).status_code == 403
    assert kit.client.post(f"{url}/escalate", headers=org.h).json()["escalated"] is True
    assert kit.client.get(url, headers=admin.h).json()["your_role_in_case"] == "admin"
    mine = [c["id"] for c in kit.client.get("/api/support/cases?escalated=true", headers=admin.h).json()]
    assert case["id"] in mine
    assert kit.client.put(url, json={"status": "in_progress", "assigned_to": admin.id}, headers=admin.h).status_code == 200
    assert notifications_for(admin.id, "support")


def test_organizer_cases_go_to_platform_admins(kit):
    org, buyer, stranger, admin, event, order = scenario(kit)
    other_org = kit.user("organizer")
    case = open_case(kit, org, category="activation", message="My paid sales will not activate", event_id=event["id"])
    assert case.status_code == 201 and case.json()["kind"] == "organizer"
    url = f"/api/support/cases/{case.json()['id']}"
    assert kit.client.get(url, headers=admin.h).json()["your_role_in_case"] == "admin"
    assert kit.client.get(url, headers=buyer.h).status_code == 404
    assert kit.client.get(url, headers=other_org.h).status_code == 404
    assert open_case(kit, other_org, event_id=event["id"], category="account").status_code == 403    #not their event
    assert kit.client.post(f"{url}/messages", json={"message": "Checking now"}, headers=admin.h).status_code == 201
    assert notifications_for(org.id, "support")
    assert open_case(kit, org, category="account", message="Cannot change my phone number").status_code == 201   #no event needed
