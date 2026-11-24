from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from threading import Event
from time import monotonic, sleep

import pytest

from conftest import fetch_one
from routers import checkin, orders


@pytest.mark.parametrize("first", ["scan", "refund"])
def test_refund_and_checkin_serialize_on_ticket_state(kit, monkeypatch, first):
    organizer, buyer = kit.user("organizer"), kit.user()
    event, ticket_type = kit.event(organizer, quantity=5)
    campaign = kit.client.post(f"/api/events/{event['id']}/promo-campaigns", headers=organizer.h, json={
        "discount_type": "percentage", "discount_value": 25, "max_redemptions": 1,
    }).json()
    purchase = kit.buy(buyer, event["id"], ticket_type["id"], promo_code=campaign["code"], quantity=2).json()
    order, ticket = purchase["order"], purchase["tickets"][1]
    order_path = f"/api/orders/{order['id']}"
    before_commit = Event()
    release_commit = Event()
    winner_pid = []
    router = checkin if first == "scan" else orders
    real_tx = router.tx

    @contextmanager
    def hold_winner():
        with real_tx() as cur:
            winner = not winner_pid
            if winner:
                winner_pid.append(cur.connection.get_backend_pid())
            yield cur
            if winner:
                before_commit.set()
                assert release_commit.wait(15), "winner did not get permission to commit"

    monkeypatch.setattr(router, "tx", hold_winner)
    actions = {
        "scan": lambda: kit.client.post("/api/checkin/verify-qr", headers=organizer.h, json={
            "event_id": event["id"], "qr_code_hash": ticket["qr_code_hash"],
        }),
        "refund": lambda: kit.client.post(order_path + "/refund", headers=organizer.h),
    }
    second = "refund" if first == "scan" else "scan"
    with ThreadPoolExecutor(max_workers=3) as pool:
        responses = {first: pool.submit(actions[first])}
        try:
            assert before_commit.wait(10), "winning request did not reach its transaction boundary"
            responses[second] = pool.submit(actions[second])
            if first == "refund":
                # Recovery reads must also wait for the order transaction.
                read = pool.submit(kit.client.get, order_path, headers=organizer.h)
            deadline = monotonic() + 8
            while monotonic() < deadline:
                blocked = fetch_one(
                    "SELECT count(*) AS n FROM pg_stat_activity WHERE %s = ANY(pg_blocking_pids(pid))",
                    (winner_pid[0],),
                )["n"]
                if blocked >= (2 if first == "refund" else 1):
                    break
                sleep(0.025)
            else:
                pytest.fail("the competing operations did not wait on PostgreSQL locks")
        finally:
            release_commit.set()
        scan, refund = (responses[action].result(timeout=10) for action in ("scan", "refund"))
        if first == "refund":
            recovered = read.result(timeout=10).json()
            assert recovered["status"] == "refunded" and len(recovered["refunds"]) == 1
            assert {row["status"] for row in recovered["tickets"]} == {"refunded"}

    assert (scan.status_code, scan.json()["result"]) == (200, "valid" if first == "scan" else "refunded")
    assert refund.status_code == (409 if first == "scan" else 200)
    assert fetch_one("SELECT status FROM tickets WHERE id = %s", (ticket["id"],))["status"] == (
        "checked_in" if first == "scan" else "refunded"
    )
    assert fetch_one("SELECT quantity_available FROM ticket_types WHERE id = %s", (ticket_type["id"],))["quantity_available"] == (
        3 if first == "scan" else 5
    )
    assert fetch_one("SELECT redemptions_count FROM promo_campaigns WHERE id = %s", (campaign["id"],))["redemptions_count"] == (
        1 if first == "scan" else 0
    )
    assert fetch_one("SELECT count(*) AS n FROM refunds WHERE order_id = %s", (order["id"],))["n"] == int(first == "refund")
