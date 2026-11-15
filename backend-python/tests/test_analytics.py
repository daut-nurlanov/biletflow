from datetime import datetime

import pytest

from conftest import run_sql


def campaign(kit, organizer, event_id):
    response = kit.client.post(f"/api/events/{event_id}/promo-campaigns", headers=organizer.h, json={
        "discount_type": "percentage", "discount_value": 10, "max_redemptions": 20})
    assert response.status_code == 201, response.text
    return response.json()


def purchase(kit, buyer, event, ticket_type, at, **options):
    response = kit.buy(buyer, event["id"], ticket_type["id"], **options)
    assert response.status_code == 201, response.text
    result = response.json()
    run_sql("UPDATE orders SET created_at = %s WHERE id = %s", (at, result["order"]["id"]))
    return result


def report(kit, organizer, event_id, **params):
    response = kit.client.get(f"/api/events/{event_id}/analytics", headers=organizer.h, params=params)
    assert response.status_code == 200, response.text
    return response.json()


def test_date_and_type_filters_apply_to_every_sales_breakdown(kit):
    org, buyer = kit.user("organizer"), kit.user()
    event, general = kit.event(org, price=1000, quantity=20)
    vip = kit.ticket_type(org, event["id"], name="VIP", price=5000, quantity=10)
    promo = campaign(kit, org, event["id"])
    purchase(kit, buyer, event, general, "2029-04-09T12:00:00+05:00", quantity=2, promo_code=promo["code"])
    purchase(kit, buyer, event, vip, "2029-04-10T12:00:00+05:00", quantity=1, promo_code=promo["code"])
    purchase(kit, buyer, event, general, "2029-04-10T18:00:00+05:00", quantity=3)

    data = report(kit, org, event["id"], date_from="2029-04-10", date_to="2029-04-10", ticket_type_id=vip["id"])
    assert data["ticket_counts"]["sold"] == 1
    assert float(data["money"]["net_revenue"]) == 4500
    assert len(data["by_ticket_type"]) == 1
    assert data["by_ticket_type"][0]["sold"] == 1
    assert data["sales_over_time"] == [{"day": "2029-04-10", "orders": 1, "revenue": 4500, "tickets": 1}]
    row = data["campaigns"][0]
    assert row["redemptions"] == 1 and row["tickets"] == 1
    assert float(row["net_revenue"]) == 4500
    assert float(row["discount_given"]) == 500
    assert row["active_redemptions_all_dates"] == 2

    daily = report(kit, org, event["id"], date_from="2029-04-10", date_to="2029-04-10")
    counts = {row["id"]: row["sold"] for row in daily["by_ticket_type"]}
    assert counts == {general["id"]: 3, vip["id"]: 1}
    assert sum(row["sold"] for row in daily["by_ticket_type"]) == daily["ticket_counts"]["sold"]
    empty = report(kit, org, event["id"], date_from="2029-04-11", date_to="2029-04-11")
    assert empty["money"]["net_revenue"] == 0
    assert all(row["sold"] == 0 for row in empty["by_ticket_type"])
    assert all(row["tickets"] == row["redemptions"] == row["orders"] == 0 for row in empty["campaigns"])
    assert all(row["net_revenue"] == row["gross_sales"] == row["discounts"] == row["refunds"] == 0 for row in empty["campaigns"])
    assert empty["inventory"] == daily["inventory"]
    assert daily["inventory"]["sold"] == 6 and daily["inventory"]["remaining"] == 24
    assert datetime.fromisoformat(daily["generated_at"]).tzinfo is not None


def test_day_boundaries_use_almaty_and_include_the_whole_end_date(kit):
    org, buyer = kit.user("organizer"), kit.user()
    event, ticket_type = kit.event(org)
    promo = campaign(kit, org, event["id"])
    for at in ["2029-04-09T18:59:59Z", "2029-04-09T19:00:00Z", "2029-04-10T18:59:59Z", "2029-04-10T19:00:00Z"]:
        purchase(kit, buyer, event, ticket_type, at, promo_code=promo["code"])
    data = report(kit, org, event["id"], date_from="2029-04-10", date_to="2029-04-10")
    assert data["ticket_counts"]["sold"] == 2
    assert data["by_ticket_type"][0]["sold"] == 2
    assert data["campaigns"][0]["redemptions"] == 2
    assert data["sales_over_time"] == [{"day": "2029-04-10", "orders": 2, "revenue": 1800, "tickets": 2}]


def test_refunds_failed_payments_and_free_cancellations_reconcile(kit):
    org, buyer = kit.user("organizer"), kit.user()
    event, ticket_type = kit.event(org, price=1000)
    free = kit.ticket_type(org, event["id"], name="Free", price=0)
    promo = campaign(kit, org, event["id"])
    keep = purchase(kit, buyer, event, ticket_type, "2029-04-10T12:00:00+05:00", quantity=2, promo_code=promo["code"])
    refund = purchase(kit, buyer, event, ticket_type, "2029-04-10T13:00:00+05:00", promo_code=promo["code"])
    assert kit.client.post(f"/api/orders/{refund['order']['id']}/refund", headers=org.h).status_code == 200
    cancelled = purchase(kit, buyer, event, free, "2029-04-10T14:00:00+05:00", promo_code=promo["code"])
    assert kit.client.post(f"/api/orders/{cancelled['order']['id']}/cancel", headers=org.h).status_code == 200
    assert kit.buy(buyer, event["id"], ticket_type["id"], promo_code=promo["code"], simulate_payment="fail").status_code == 402
    assert kit.client.post("/api/checkin/verify-qr", headers=org.h, json={"qr_code_hash": keep["tickets"][0]["qr_code_hash"], "event_id": event["id"]}).status_code == 200
    data = report(kit, org, event["id"], date_from="2029-04-10", date_to="2029-04-10")
    money = data["money"]
    assert money == {"gross_sales": 3000, "discounts": 300, "refunds": 900, "net_revenue": 1800,
                     "processing_fee_simulated": 54, "estimated_payout": 1746, "payout_status": "not_started"}
    assert data["ticket_counts"]["sold"] == 2 and data["ticket_counts"]["refunded"] == 1
    assert data["attendance"] == {"registered": 2, "checked_in": 1, "absent": 1, "percent_checked_in": 50}
    assert data["sales_over_time"] == [{"day": "2029-04-10", "orders": 1, "revenue": 1800, "tickets": 2}]
    row = data["campaigns"][0]
    assert row["orders"] == 2 and row["refunded_orders"] == 1 and row["redemptions"] == 1
    assert row["gross_sales"] == 3000 and row["discounts"] == 300 and row["refunds"] == 900
    assert row["net_revenue"] == row["gross_sales"] - row["discounts"] - row["refunds"] == 1800
    assert row["tickets"] == 2


def test_price_changes_do_not_rewrite_financial_history(kit):
    org, buyer = kit.user("organizer"), kit.user()
    event, ticket_type = kit.event(org, price=1000)
    purchase(kit, buyer, event, ticket_type, "2029-04-10T12:00:00+05:00", quantity=2)
    response = kit.client.put(f"/api/ticket-types/{ticket_type['id']}", headers=org.h, json={"price": 2000})
    assert response.status_code == 200
    data = report(kit, org, event["id"])
    assert data["money"]["gross_sales"] == data["money"]["net_revenue"] == 2000
    assert data["sales_over_time"][0]["revenue"] == 2000
    assert data["by_ticket_type"][0]["revenue_at_list_price"] == 4000


@pytest.mark.parametrize("params", [
    {"date_from": "2029-04-11", "date_to": "2029-04-10"},
    {"date_from": "not-a-date"},
    {"date_to": "2029-02-30"},
])
def test_invalid_date_ranges_are_rejected(kit, params):
    org = kit.user("organizer")
    event, _ = kit.event(org)
    response = kit.client.get(f"/api/events/{event['id']}/analytics", headers=org.h, params=params)
    assert response.status_code == 400


def test_foreign_ticket_type_does_not_leak_data(kit):
    org, other = kit.user("organizer"), kit.user("organizer")
    event, _ = kit.event(org)
    foreign, ticket_type = kit.event(other)
    response = kit.client.get(f"/api/events/{event['id']}/analytics", headers=org.h, params={"ticket_type_id": ticket_type["id"]})
    assert response.status_code == 404
    assert kit.client.get(f"/api/events/{foreign['id']}/analytics", headers=org.h).status_code == 403


def test_analytics_uses_one_read_only_database_snapshot(kit, monkeypatch):
    from contextlib import contextmanager
    from routers import organizer
    from db import tx

    org = kit.user("organizer")
    event, _ = kit.event(org)
    settings = []

    @contextmanager
    def recording_tx():
        with tx() as cur:
            class Cursor:
                def execute(self, sql, params=None):
                    result = cur.execute(sql, params)
                    if "SET TRANSACTION" in sql:
                        cur.execute("SHOW transaction_isolation")
                        isolation = cur.fetchone()["transaction_isolation"]
                        cur.execute("SHOW transaction_read_only")
                        settings.append((isolation, cur.fetchone()["transaction_read_only"]))
                    return result

                def __getattr__(self, name):
                    return getattr(cur, name)
            yield Cursor()

    monkeypatch.setattr(organizer, "tx", recording_tx)
    report(kit, org, event["id"])
    assert settings == [("repeatable read", "on")]


def test_checkout_during_report_does_not_mix_database_snapshots(kit, monkeypatch):
    from contextlib import contextmanager
    from routers import organizer
    from db import tx

    org, buyer = kit.user("organizer"), kit.user()
    event, ticket_type = kit.event(org)
    created = []

    @contextmanager
    def concurrent_tx():
        with tx() as cur:
            class Cursor:
                def execute(self, sql, params=None):
                    result = cur.execute(sql, params)
                    if "SELECT now() AS generated_at" in sql and not created:
                        created.append(kit.buy(buyer, event["id"], ticket_type["id"]).status_code)
                    return result

                def __getattr__(self, name):
                    return getattr(cur, name)
            yield Cursor()

    monkeypatch.setattr(organizer, "tx", concurrent_tx)
    during = report(kit, org, event["id"])
    assert created == [201]
    assert during["inventory"]["sold"] == during["ticket_counts"]["sold"] == 0
    assert during["money"]["net_revenue"] == 0 and during["sales_over_time"] == []
    after = report(kit, org, event["id"])
    assert after["inventory"]["sold"] == after["ticket_counts"]["sold"] == 1
    assert after["money"]["net_revenue"] == 1000


def test_free_registrations_count_as_sales_without_inventing_revenue(kit):
    org, buyer = kit.user("organizer"), kit.user()
    event, ticket_type = kit.event(org, free=True, quantity=20)
    purchase(kit, buyer, event, ticket_type, "2029-04-10T12:00:00+05:00", quantity=2)
    data = report(kit, org, event["id"], date_from="2029-04-10", date_to="2029-04-10")
    assert data["inventory"]["sold"] == data["attendance"]["registered"] == 2
    assert data["inventory"]["remaining"] == 18
    assert data["sales_over_time"] == [{"day": "2029-04-10", "orders": 1, "tickets": 2, "revenue": 0}]
    assert data["by_ticket_type"][0]["sold"] == 2
    assert all(data["money"][name] == 0 for name in (
        "gross_sales", "discounts", "refunds", "net_revenue", "processing_fee_simulated", "estimated_payout"))
