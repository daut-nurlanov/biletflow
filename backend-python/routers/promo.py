import os
import secrets
import string

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel

from db import audit, tx
from security import assert_manager, require_roles
from routers.orders import qr_png

router = APIRouter()

BASE_URL = os.getenv("PUBLIC_BASE_URL", "http://localhost:3000")


class CampaignCreate(BaseModel):
    code: str | None = None
    discount_type: str
    discount_value: float
    max_redemptions: int
    valid_from: str | None = None
    valid_until: str | None = None
    ticket_type_ids: list[str] | None = None


def campaign_link(campaign):
    #the QR code opens the event page with an opaque token. the token is only
    #a lookup key: the discount itself is always looked up and calculated on
    #the server, so editing the link can never change a price
    return f"{BASE_URL}/events/{campaign['event_id']}?c={campaign['qr_token']}"


def with_link(campaign):
    return {**campaign, "campaign_link": campaign_link(campaign)}


@router.post("/api/events/{event_id}/promo-campaigns", status_code=201)
def create_campaign(event_id: str, payload: CampaignCreate, user=Depends(require_roles("organizer", "platform_admin"))):
    if payload.discount_type not in ("percentage", "fixed"):
        raise HTTPException(status_code=400, detail="discount_type must be percentage or fixed")
    if payload.discount_value <= 0 or (payload.discount_type == "percentage" and payload.discount_value > 100):
        raise HTTPException(status_code=400, detail="Discount must be above 0 (and at most 100 for percentages)")
    if payload.max_redemptions < 1:
        raise HTTPException(status_code=400, detail="max_redemptions must be at least 1")
    code = (payload.code or "").strip().upper() or "".join(
        secrets.choice(string.ascii_uppercase + string.digits) for _ in range(8))
    with tx() as cur:
        assert_manager(cur, user, event_id)
        if payload.ticket_type_ids:
            cur.execute("SELECT count(*) AS n FROM ticket_types WHERE event_id = %s AND id = ANY(%s::uuid[])",
                        (event_id, payload.ticket_type_ids))
            if cur.fetchone()["n"] != len(set(payload.ticket_type_ids)):
                raise HTTPException(status_code=400, detail="Some ticket types do not belong to this event")
        cur.execute("SELECT 1 FROM promo_campaigns WHERE code = %s", (code,))
        if cur.fetchone():
            raise HTTPException(status_code=409, detail="That promo code is already taken, choose another")
        cur.execute(
            """INSERT INTO promo_campaigns (event_id, code, discount_type, discount_value, max_redemptions,
                                            valid_from, valid_until, ticket_type_ids, qr_token, created_by)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s::uuid[], %s, %s)
               RETURNING *, ticket_type_ids::text[] AS ticket_type_ids""",
            (event_id, code, payload.discount_type, payload.discount_value, payload.max_redemptions,
             payload.valid_from, payload.valid_until, payload.ticket_type_ids or None,
             "cmp_" + secrets.token_urlsafe(12), user["id"]))
        campaign = cur.fetchone()
        audit(cur, user["id"], event_id, "promo_created", f"Promo code {code} created", "promo_campaign", campaign["id"])
        return with_link(campaign)


@router.get("/api/events/{event_id}/promo-campaigns")
def list_campaigns(event_id: str, user=Depends(require_roles("organizer", "platform_admin"))):
    with tx() as cur:
        assert_manager(cur, user, event_id)
        cur.execute("SELECT *, ticket_type_ids::text[] AS ticket_type_ids FROM promo_campaigns WHERE event_id = %s ORDER BY created_at DESC", (event_id,))
        return [with_link(c) for c in cur.fetchall()]


def _own_campaign(cur, campaign_id, user):
    cur.execute("SELECT *, ticket_type_ids::text[] AS ticket_type_ids FROM promo_campaigns WHERE id = %s", (campaign_id,))
    campaign = cur.fetchone()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    assert_manager(cur, user, campaign["event_id"])
    return campaign


def _set_active(campaign_id, user, active):
    with tx() as cur:
        campaign = _own_campaign(cur, campaign_id, user)
        cur.execute("UPDATE promo_campaigns SET is_active = %s WHERE id = %s RETURNING *, ticket_type_ids::text[] AS ticket_type_ids", (active, campaign_id))
        updated = cur.fetchone()
        audit(cur, user["id"], campaign["event_id"], "promo_enabled" if active else "promo_disabled",
              f"Promo code {campaign['code']} " + ("enabled" if active else "disabled"), "promo_campaign", campaign_id)
        return with_link(updated)


@router.post("/api/promo-campaigns/{campaign_id}/disable")
def disable_campaign(campaign_id: str, user=Depends(require_roles("organizer", "platform_admin"))):
    return _set_active(campaign_id, user, False)


@router.post("/api/promo-campaigns/{campaign_id}/enable")
def enable_campaign(campaign_id: str, user=Depends(require_roles("organizer", "platform_admin"))):
    return _set_active(campaign_id, user, True)


@router.get("/api/promo-campaigns/{campaign_id}/qr.png")
def campaign_qr(campaign_id: str, user=Depends(require_roles("organizer", "platform_admin"))):
    #deliberately blue, while admission tickets are plain black. the scanner
    #endpoint also refuses these outright, so the two can't be confused
    with tx() as cur:
        campaign = _own_campaign(cur, campaign_id, user)
    return Response(content=qr_png(campaign_link(campaign), scale=10, dark="#1d4ed8"), media_type="image/png")


@router.get("/api/promo-campaigns/{campaign_id}/report")
def campaign_report(campaign_id: str, user=Depends(require_roles("organizer", "platform_admin"))):
    with tx() as cur:
        campaign = _own_campaign(cur, campaign_id, user)
        cur.execute(
            """SELECT count(*) AS redemptions,
                      count(*) FILTER (WHERE o.status = 'paid') AS active_orders,
                      count(*) FILTER (WHERE o.status IN ('refunded','cancelled')) AS refunded_or_cancelled_orders,
                      COALESCE(sum(r.discount_amount) FILTER (WHERE o.status = 'paid'), 0) AS discount_given,
                      COALESCE(sum(o.total_amount) FILTER (WHERE o.status = 'paid'), 0) AS net_revenue,
                      COALESCE(sum(o.total_amount + r.discount_amount) FILTER (WHERE o.status = 'paid'), 0) AS gross_revenue,
                      COALESCE(sum(o.total_amount) FILTER (WHERE o.status = 'refunded'), 0) AS refunded_amount
               FROM promo_redemptions r JOIN orders o ON r.order_id = o.id
               WHERE r.campaign_id = %s""", (campaign_id,))
        totals = cur.fetchone()
        cur.execute(
            """SELECT count(*) AS n FROM tickets t
               WHERE t.status IN ('valid','checked_in')
                 AND t.order_id IN (SELECT order_id FROM promo_redemptions WHERE campaign_id = %s)""", (campaign_id,))
        tickets_sold = cur.fetchone()["n"]
    return {"campaign_id": campaign_id, "code": campaign["code"], "max_redemptions": campaign["max_redemptions"],
            "tickets_sold": tickets_sold, **totals}


@router.get("/api/campaigns/resolve")
def resolve_campaign(token: str):
    #what the event page calls when someone arrives through a campaign QR link:
    #the server checks the campaign is usable and tells the page which code to apply
    with tx() as cur:
        cur.execute(
            """SELECT c.*, c.ticket_type_ids::text[] AS ticket_type_ids, e.status AS event_status FROM promo_campaigns c
               JOIN events e ON c.event_id = e.id WHERE c.qr_token = %s""", (token,))
        campaign = cur.fetchone()
        if not campaign:
            raise HTTPException(status_code=404, detail="This campaign link is not valid")
        cur.execute("SELECT now() AS now")
        now = cur.fetchone()["now"]
    if not campaign["is_active"]:
        raise HTTPException(status_code=409, detail="This promotion has been disabled")
    if (campaign["valid_from"] and now < campaign["valid_from"]) or (campaign["valid_until"] and now > campaign["valid_until"]):
        raise HTTPException(status_code=409, detail="This promotion is not valid right now")
    if campaign["redemptions_count"] >= campaign["max_redemptions"]:
        raise HTTPException(status_code=409, detail="This promotion has been fully used")
    return {"event_id": campaign["event_id"], "promo_code": campaign["code"],
            "discount_type": campaign["discount_type"], "discount_value": campaign["discount_value"],
            "ticket_type_ids": campaign["ticket_type_ids"]}
