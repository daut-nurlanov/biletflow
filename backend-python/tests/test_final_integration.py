"""Regressions for browser checkout, CORS errors and the presentation workflow."""
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi import Depends
from fastapi.testclient import TestClient

import main
from routers.orders import QuoteRequest


@pytest.mark.parametrize("origin", ["http://localhost:3000", "http://localhost:3001",
                                  "http://127.0.0.1:3000", "http://127.0.0.1:3001"])
def test_preflight_and_unhandled_errors_have_cors(origin):
    app = main.CorsFastAPI()

    def broken_database():
        raise RuntimeError("synthetic database failure")

    @app.post("/api/orders/quote")
    def broken_quote(payload: QuoteRequest, db=Depends(broken_database)):
        return {}

    with TestClient(app, raise_server_exceptions=False) as client:
        preflight = client.options("/api/orders/quote", headers={
            "Origin": origin, "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type,idempotency-key"})
        assert preflight.status_code == 200
        assert preflight.headers["access-control-allow-origin"] == "*"
        response = client.post("/api/orders/quote", headers={"Origin": origin}, json={
            "event_id": "event", "ticket_type_id": "type"})
        assert response.status_code == 500
        assert response.headers["access-control-allow-origin"] == "*"
        assert "synthetic database failure" not in response.text


@pytest.mark.parametrize("free", [True, False])
def test_campaign_quote_checkout_ticket_support_and_scanner(kit, free):
    org, buyer, staff = kit.user("organizer"), kit.user(), kit.user("event_admin")
    event, ticket_type = kit.event(org, free=free)
    event_id = event["id"]
    campaign = kit.client.post(f"/api/events/{event_id}/promo-campaigns", headers=org.h,
                               json={"discount_type": "percentage", "discount_value": 20,
                                     "max_redemptions": 10})
    assert campaign.status_code == 201, campaign.text
    campaign = campaign.json()
    qr = kit.client.get(f"/api/promo-campaigns/{campaign['id']}/qr.png", headers=org.h)
    assert qr.status_code == 200 and qr.content.startswith(b"\x89PNG")
    token = parse_qs(urlparse(campaign["campaign_link"]).query)["c"][0]
    resolved = kit.client.get("/api/campaigns/resolve", params={"token": token})
    assert resolved.status_code == 200
    body = {"event_id": event_id, "ticket_type_id": ticket_type["id"],
            "quantity": 2, "promo_code": resolved.json()["promo_code"]}
    quote = kit.client.post("/api/orders/quote", headers=buyer.h, json=body)
    assert quote.status_code == 200, quote.text
    assert float(quote.json()["total"]) == (0 if free else 1600)
    body["attendee_name"] = "Integration Attendee"
    headers = {**buyer.h, "Idempotency-Key": f"integration-{event_id}"}
    bought = kit.client.post("/api/orders/checkout", headers=headers, json=body)
    assert bought.status_code == 201, bought.text
    repeated = kit.client.post("/api/orders/checkout", headers=headers, json=body)
    assert repeated.json()["order"]["id"] == bought.json()["order"]["id"]
    ticket = bought.json()["tickets"][0]
    image = kit.client.get(f"/api/tickets/{ticket['id']}/qr.png", headers=buyer.h)
    assert image.status_code == 200 and image.content.startswith(b"\x89PNG")
    mine = kit.client.get("/api/tickets/my-tickets", headers=buyer.h).json()
    assert len(mine) == 2 and mine[0]["event_status"] == "upcoming"
    assert kit.client.post("/api/support/cases", headers=buyer.h, json={
        "ticket_id": ticket["id"], "category": "ticket_delivery", "message": "Test support request"
    }).status_code == 201
    assert kit.client.post(f"/api/events/{event_id}/staff", headers=org.h,
                           json={"email": staff.email}).status_code == 201
    other_event, _ = kit.event(org, free=True)
    assert kit.client.post(f"/api/events/{other_event['id']}/staff", headers=org.h,
                           json={"email": staff.email}).status_code == 201
    scan = {"event_id": other_event["id"], "qr_code_hash": ticket["qr_code_hash"]}
    assert kit.client.post("/api/checkin/verify-qr", headers=staff.h, json=scan).json()["result"] == "wrong_event"
    scan["event_id"] = event_id
    scan["qr_code_hash"] = campaign["campaign_link"]
    assert kit.client.post("/api/checkin/verify-qr", headers=staff.h, json=scan).status_code == 400
    scan["qr_code_hash"] = ticket["qr_code_hash"]
    assert kit.client.post("/api/checkin/verify-qr", headers=staff.h, json=scan).json()["result"] == "valid"
    assert kit.client.post("/api/checkin/verify-qr", headers=staff.h, json=scan).json()["result"] == "already_checked_in"
    stats = kit.client.get(f"/api/events/{event_id}/checkin-stats", headers=staff.h).json()
    assert stats["registered"] == 2 and stats["checked_in"] == 1
    assert kit.client.post("/api/checkin/undo", headers=staff.h, json={"ticket_id": ticket["id"]}).status_code == 200
    assert kit.client.post("/api/checkin/manual-search", headers=staff.h,
                           json={"event_id": event_id, "name": "Integration"}).status_code == 200
