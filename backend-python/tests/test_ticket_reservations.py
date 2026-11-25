from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4

from conftest import fetch_one, run_sql


def choice(event, tier, quantity=1):
    return {"event_id": event["id"], "ticket_type_id": tier["id"], "quantity": quantity}


def hold(kit, buyer, selection):
    return kit.client.post("/api/orders/quote", json={**selection, "reserve_inventory": True}, headers=buyer.h)


def buy(kit, buyer, selection, **extra):
    key = extra.pop("key", str(uuid4()))
    return kit.client.post("/api/orders/checkout", json={
        **selection, "attendee_name": "QA buyer", **extra,
    }, headers={**buyer.h, "Idempotency-Key": key})


def race(first, second):
    barrier = Barrier(2)

    def run(action):
        barrier.wait(timeout=10)
        return action()

    with ThreadPoolExecutor(max_workers=2) as pool:
        return list(pool.map(run, [first, second]))


def test_reservations_compete_with_legacy_checkout_under_postgres_locks(kit):
    organizer, alice, bob = kit.user("organizer"), kit.user(), kit.user()
    event, tier = kit.event(organizer, quantity=1)
    selection = choice(event, tier)
    reserved, purchased = race(lambda: hold(kit, alice, selection), lambda: buy(kit, bob, selection))
    assert (reserved.status_code, purchased.status_code) in [(200, 409), (409, 201)]
    if reserved.is_success:
        identifier = reserved.json()["reservation"]["id"]
        assert buy(kit, alice, selection, reservation_id=identifier).status_code == 201
    assert fetch_one("SELECT quantity_available FROM ticket_types WHERE id = %s", (tier["id"],))["quantity_available"] == 0
    assert fetch_one("SELECT count(*) AS n FROM tickets WHERE event_id = %s", (event["id"],))["n"] == 1


def test_only_one_buyer_can_reserve_last_ticket_and_legacy_cannot_take_it(kit):
    organizer, alice, bob = kit.user("organizer"), kit.user(), kit.user()
    event, tier = kit.event(organizer, quantity=1)
    selection = choice(event, tier)
    first, second = race(lambda: hold(kit, alice, selection), lambda: hold(kit, bob, selection))
    assert sorted((first.status_code, second.status_code)) == [200, 409]
    winner, other = (alice, bob) if first.is_success else (bob, alice)
    identifier = (first if first.is_success else second).json()["reservation"]["id"]
    assert kit.client.delete(f"/api/orders/reservations/{identifier}", headers=other.h).status_code == 204
    assert buy(kit, other, selection, reservation_id=identifier).status_code == 409
    assert buy(kit, other, selection).status_code == 409
    assert buy(kit, winner, selection, reservation_id=identifier).status_code == 201


def test_reservation_edit_expiry_and_recovery_do_not_double_deduct(kit):
    organizer, alice, bob = kit.user("organizer"), kit.user(), kit.user()
    event, tier = kit.event(organizer, quantity=3)
    selection = choice(event, tier)
    assert kit.client.post("/api/orders/quote", json={**selection, "reserve_inventory": True}).status_code == 401
    first = hold(kit, alice, choice(event, tier, 2)).json()["reservation"]
    smaller = hold(kit, alice, selection).json()["reservation"]
    repeated = hold(kit, alice, selection).json()["reservation"]
    assert first["id"] != smaller["id"] == repeated["id"]
    assert first["expires_at"] == smaller["expires_at"] == repeated["expires_at"]
    assert buy(kit, alice, selection, reservation_id=first["id"]).status_code == 409
    assert buy(kit, alice, selection, reservation_id=smaller["id"], expected_total=1).status_code == 409
    run_sql("UPDATE ticket_reservations SET expires_at = clock_timestamp() - interval '1 second' WHERE attendee_id = %s", (alice.id,))
    assert hold(kit, alice, selection).status_code == 429
    assert buy(kit, alice, selection, reservation_id=smaller["id"]).status_code == 409
    bob_hold = hold(kit, bob, selection).json()["reservation"]["id"]
    key = str(uuid4())
    paid = buy(kit, bob, selection, reservation_id=bob_hold, key=key)
    repeated = buy(kit, bob, selection, reservation_id=bob_hold, key=key)
    assert paid.status_code == 201 and repeated.status_code == 201
    assert repeated.json()["repeated"] is True
    assert paid.json()["order"]["id"] == repeated.json()["order"]["id"]
    assert fetch_one("SELECT quantity_available FROM ticket_types WHERE id = %s", (tier["id"],))["quantity_available"] == 2


def test_failed_payment_keeps_hold_and_applies_promo_once_on_recovery(kit):
    organizer, alice = kit.user("organizer"), kit.user()
    event, tier = kit.event(organizer, quantity=1, price=1000)
    code = "HOLD" + uuid4().hex[:8].upper()
    assert kit.client.post(f"/api/events/{event['id']}/promo-campaigns", headers=organizer.h, json={
        "code": code, "discount_type": "percentage", "discount_value": 25, "max_redemptions": 2,
    }).status_code == 201
    selection = {**choice(event, tier), "promo_code": code}
    quoted = hold(kit, alice, selection).json()
    reservation = quoted["reservation"]["id"]
    assert float(quoted["total"]) == 750
    key = str(uuid4())
    assert buy(kit, alice, selection, reservation_id=reservation, expected_total=750, simulate_payment="fail", key=key).status_code == 402
    assert hold(kit, alice, selection).json()["reservation"]["id"] == reservation
    assert buy(kit, alice, selection, reservation_id=reservation, expected_total=750, key=key).status_code == 201
    assert kit.client.delete(f"/api/orders/reservations/{reservation}", headers=alice.h).status_code == 204
    assert fetch_one("SELECT redemptions_count FROM promo_campaigns WHERE code = %s", (code,))["redemptions_count"] == 1


def test_reservation_appears_in_inventory_and_can_be_released(kit):
    organizer, alice, bob = kit.user("organizer"), kit.user(), kit.user()
    event, tier = kit.event(organizer, quantity=5)
    selection = choice(event, tier, 4)
    identifier = hold(kit, alice, selection).json()["reservation"]["id"]
    url = f"/api/events/{event['id']}/ticket-types"
    alice_tier = kit.client.get(url, headers=alice.h).json()[0]
    bob_tier = kit.client.get(url, headers=bob.h).json()[0]
    assert alice_tier["quantity_available"] == 5
    assert bob_tier["quantity_available"] == 1
    result = kit.client.get(f"/api/events/{event['id']}/analytics", headers=organizer.h).json()
    assert result["ticket_counts"]["available"] == 1
    assert result["inventory"]["general_admission_reserved"] == 4
    edit = kit.client.put(f"/api/ticket-types/{tier['id']}", headers=organizer.h, json={"total_quantity": 3})
    assert edit.status_code == 409
    assert kit.client.delete(f"/api/orders/reservations/{identifier}", headers=alice.h).status_code == 204
    assert hold(kit, alice, selection).status_code == 429
    assert hold(kit, bob, selection).status_code == 200
