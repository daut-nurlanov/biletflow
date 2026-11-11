"""Throws strange input at EVERY endpoint, as every kind of user. The only thing checked:
the server must answer with a normal error (4xx), never crash (5xx)."""
import itertools
import uuid

import main

JUNK_BODIES = [
    {},
    {"title": None, "email": None, "token": None, "status": None, "message": None},
    {"title": "x" * 300, "venue_name": "", "start_time": "not a date", "capacity": "ten", "price": "free"},
    {"event_id": "nope", "ticket_type_id": "nope", "seat_id": "nope", "quantity": -1, "attendee_name": ""},
    {"email": "a@b.co", "password": "x" * 100, "token": "abc.def", "status": "weird", "reason": 5, "name": ""},
    {"quantity": 10 ** 12, "total_quantity": 10 ** 12, "capacity": 10 ** 12, "discount_value": 1e300},
    [],
    "text",
]


def test_no_endpoint_crashes_on_junk(kit):
    org = kit.user("organizer")
    event, tt = kit.event(org)
    buyer = kit.user()
    order = kit.buy(buyer, event["id"], tt["id"]).json()
    admin = kit.user("platform_admin")
    staff = kit.user("event_admin")
    real = {"event_id": event["id"], "ticket_type_id": tt["id"], "order_id": order["order"]["id"], "ticket_id": order["ticket"]["id"],
            "user_id": buyer.id, "staff_id": staff.id, "report_id": str(uuid.uuid4()), "case_id": str(uuid.uuid4()),
            "campaign_id": str(uuid.uuid4())}
    schema = main.app.openapi()
    problems = []
    actors = [None, buyer, org, admin, staff]
    for path, methods in schema["paths"].items():
        if path.endswith("/logout"):
            continue
        for method in methods:
            if method not in ("get", "post", "put", "delete"):
                continue
            for actor, pick in itertools.product(actors, ("real", "junk")):
                url = path
                for name in [p.strip("{}") for p in path.split("/") if p.startswith("{")]:
                    url = url.replace("{" + name + "}", real.get(name, str(uuid.uuid4())) if pick == "real" else "not-a-uuid'--")
                headers = actor.h if actor else {}
                bodies = JUNK_BODIES if method in ("post", "put") else [None]
                for body in bodies:
                    kw = {} if body is None else {"json": body}
                    r = getattr(kit.client, method)(url + "?date_from=x&limit=zz&status='", headers=headers, **kw)
                    if r.status_code >= 500:
                        problems.append((method.upper(), path, "real" if pick == "real" else "junk",
                                         actor.role if actor else "anon", str(body)[:60], r.status_code))
    assert not problems, "\n".join(map(str, problems[:15]))
