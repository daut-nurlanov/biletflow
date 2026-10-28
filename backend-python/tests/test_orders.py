from uuid import uuid4

from conftest import fetch_one, notifications_for


def stock(ticket_type_id):
    return fetch_one("SELECT quantity_available FROM ticket_types WHERE id = %s", (ticket_type_id,))["quantity_available"]


def test_refund_makes_tickets_invalid_restores_stock_and_frees_the_seat(kit):
    org, buyer, next_buyer = kit.user("organizer"), kit.user(), kit.user()
    event, tt = kit.event(org, quantity=5)
    seat = kit.seats(org, event["id"])[0]
    order = kit.buy(buyer, event["id"], tt["id"], seat_id=seat).json()["order"]
    assert stock(tt["id"]) == 4
    assert kit.buy(next_buyer, event["id"], tt["id"], seat_id=seat).status_code == 409
    refunded = kit.client.post(f"/api/orders/{order['id']}/refund", json={"reason": "asked nicely"}, headers=org.h)
    assert refunded.status_code == 200
    assert refunded.json()["order"]["status"] == "refunded" and float(refunded.json()["refund"]["amount"]) == 1000
    assert stock(tt["id"]) == 5
    assert fetch_one("SELECT status FROM tickets WHERE order_id = %s", (order["id"],))["status"] == "refunded"
    assert kit.buy(next_buyer, event["id"], tt["id"], seat_id=seat).status_code == 201        #seat is free again
    assert notifications_for(buyer.id, "refund_completed")
    assert fetch_one("SELECT count(*) AS n FROM audit_log WHERE event_id = %s AND action = 'order_refunded'", (event["id"],))["n"] == 1


def test_refund_permissions_and_repeat(kit):
    org, rival, buyer = kit.user("organizer"), kit.user("organizer"), kit.user()
    event, tt = kit.event(org)
    order = kit.buy(buyer, event["id"], tt["id"]).json()["order"]
    url = f"/api/orders/{order['id']}/refund"
    assert kit.client.post(url).status_code == 401
    assert kit.client.post(url, headers=buyer.h).status_code == 403          #attendees cannot refund themselves
    assert kit.client.post(url, headers=rival.h).status_code == 403
    assert kit.client.post(url, headers=org.h).status_code == 200
    assert kit.client.post(url, headers=org.h).status_code == 409            #already refunded
    assert kit.client.post(f"/api/orders/{uuid4()}/refund", headers=org.h).status_code == 404


def test_cannot_refund_used_tickets_or_free_orders(kit):
    org, buyer = kit.user("organizer"), kit.user()
    event, tt = kit.event(org)
    order = kit.buy(buyer, event["id"], tt["id"]).json()
    kit.client.post("/api/checkin/verify-qr", json={"qr_code_hash": order["ticket"]["qr_code_hash"]}, headers=org.h)
    assert kit.client.post(f"/api/orders/{order['order']['id']}/refund", headers=org.h).status_code == 409
    free = kit.ticket_type(org, event["id"], name="Free", price=0)
    free_order = kit.buy(buyer, event["id"], free["id"]).json()["order"]
    assert kit.client.post(f"/api/orders/{free_order['id']}/refund", headers=org.h).status_code == 409


def test_cancel_free_registration_by_attendee_or_organizer(kit):
    org, buyer, stranger = kit.user("organizer"), kit.user(), kit.user()
    event, _ = kit.event(org, free=True)
    free = kit.client.get(f"/api/events/{event['id']}/ticket-types").json()[0]
    first = kit.buy(buyer, event["id"], free["id"]).json()["order"]
    second = kit.buy(buyer, event["id"], free["id"]).json()["order"]
    assert stock(free["id"]) == 8
    assert kit.client.post(f"/api/orders/{first['id']}/cancel", headers=stranger.h).status_code == 403
    assert kit.client.post(f"/api/orders/{first['id']}/cancel", headers=buyer.h).json()["status"] == "cancelled"
    assert kit.client.post(f"/api/orders/{second['id']}/cancel", headers=org.h).json()["status"] == "cancelled"
    assert stock(free["id"]) == 10
    assert notifications_for(buyer.id, "registration_cancelled")        #only the organizer's cancellation notifies
    assert kit.client.post(f"/api/orders/{first['id']}/cancel", headers=buyer.h).status_code == 409


def test_paid_orders_cannot_be_cancelled_only_refunded(kit):
    org, buyer = kit.user("organizer"), kit.user()
    event, tt = kit.event(org)
    order = kit.buy(buyer, event["id"], tt["id"]).json()["order"]
    assert kit.client.post(f"/api/orders/{order['id']}/cancel", headers=buyer.h).status_code == 409


def test_order_visibility(kit):
    org, rival, buyer, stranger = kit.user("organizer"), kit.user("organizer"), kit.user(), kit.user()
    event, tt = kit.event(org)
    order = kit.buy(buyer, event["id"], tt["id"], quantity=2).json()["order"]
    url = f"/api/orders/{order['id']}"
    assert len(kit.client.get(url, headers=buyer.h).json()["tickets"]) == 2
    assert kit.client.get(url, headers=org.h).status_code == 200
    assert kit.client.get(url, headers=stranger.h).status_code == 403
    assert kit.client.get(url, headers=rival.h).status_code == 403
    assert kit.client.get(url).status_code == 401
    mine = kit.client.get("/api/orders/my-orders", headers=buyer.h).json()
    assert len(mine) == 1 and mine[0]["ticket_count"] == 2
    assert kit.client.get("/api/orders/my-orders", headers=stranger.h).json() == []


def test_purchase_is_audited_and_confirmed(kit):
    org, buyer = kit.user("organizer"), kit.user()
    event, tt = kit.event(org)
    kit.buy(buyer, event["id"], tt["id"])
    assert fetch_one("SELECT count(*) AS n FROM audit_log WHERE event_id = %s AND action = 'order_paid'", (event["id"],))["n"] == 1
    assert notifications_for(buyer.id, "order_confirmation")
