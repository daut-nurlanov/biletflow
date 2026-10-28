import sys
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

#lets the tests say "import main" no matter where pytest is started from
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import main  # noqa: E402
import security  # noqa: E402

PASSWORD = "password123"
PASSWORD_HASH = security.hash_password(PASSWORD)  #hashed once, bcrypt is slow on purpose


def run_sql(sql, params=()):
    conn = main.get_connection()
    cur = conn.cursor()
    cur.execute(sql, params)
    conn.commit()
    cur.close()
    conn.close()


def fetch(sql, params=()):
    conn = main.get_connection()
    cur = conn.cursor()
    cur.execute(sql, params)
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return rows


def fetch_one(sql, params=()):
    rows = fetch(sql, params)
    return rows[0] if rows else None


class Actor:
    def __init__(self, user_id, email, role):
        self.id, self.email, self.role = user_id, email, role
        self.token = security.make_token(user_id)
        self.h = {"Authorization": f"Bearer {self.token}"}


class Kit:
    """Everything a test needs, with automatic cleanup afterwards."""

    def __init__(self):
        self.client = TestClient(main.app)
        self.user_ids = []

    def user(self, role="attendee", verified=True, name=None):
        user_id = str(uuid4())
        email = f"{user_id}@test.invalid"
        run_sql(
            """INSERT INTO users (id, email, password_hash, full_name, role, is_email_verified)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            (user_id, email, PASSWORD_HASH, name or f"Test {role}", role, verified))
        if role == "organizer":
            run_sql("INSERT INTO organizer_profiles (user_id) VALUES (%s)", (user_id,))
        self.user_ids.append(user_id)
        return Actor(user_id, email, role)

    def event(self, organizer, publish=True, free=False, price=1000, quantity=10, **extra):
        """An event owned by `organizer`. Published and on sale unless told otherwise.
        Returns (event, ticket_type)."""
        body = {"title": "Test Event", "venue_name": "Test Hall", "start_time": "2030-01-01T19:00:00+05:00",
                "capacity": 100}
        body.update(extra)
        response = self.client.post("/api/events", json=body, headers=organizer.h)
        assert response.status_code == 201, response.text
        event = response.json()
        ticket_type = self.ticket_type(organizer, event["id"], price=0 if free else price, quantity=quantity)
        if publish:
            self.publish(organizer, event["id"])
            if not free:
                run_sql("UPDATE events SET is_paid_sales_active = true WHERE id = %s", (event["id"],))
        return event, ticket_type

    def ticket_type(self, organizer, event_id, **kw):
        body = {"name": "General", "price": 1000, "total_quantity": 10}
        body.update({"total_quantity": kw.pop("quantity", body["total_quantity"]), **kw})
        response = self.client.post(f"/api/events/{event_id}/ticket-types", json=body, headers=organizer.h)
        assert response.status_code == 201, response.text
        return response.json()

    def publish(self, organizer, event_id):
        response = self.client.post(f"/api/events/{event_id}/publish", headers=organizer.h)
        assert response.status_code == 200, response.text
        return response.json()

    def seats(self, organizer, event_id, category="standard", rows=1, per_row=2, section="T"):
        response = self.client.post(f"/api/events/{event_id}/seats", headers=organizer.h, json={
            "section": section, "category": category, "rows": rows, "seats_per_row": per_row})
        assert response.status_code == 201, response.text
        return [s["id"] for s in self.client.get(f"/api/events/{event_id}/seats").json() if s["category"] == category]

    def buy(self, attendee, event_id, ticket_type_id, signed_in=True, **kw):
        body = {"event_id": event_id, "ticket_type_id": ticket_type_id, "attendee_name": "Buyer"}
        body.update(kw)
        if not signed_in:
            body["attendee_id"] = attendee.id
        return self.client.post("/api/orders/checkout", json=body, headers=attendee.h if signed_in else {})

    def cleanup(self):
        if not self.user_ids:
            return
        u = self.user_ids
        events = "(SELECT id FROM events WHERE organizer_id = ANY(%(u)s::uuid[]))"
        orders = f"(SELECT id FROM orders WHERE attendee_id = ANY(%(u)s::uuid[]) OR event_id IN {events})"
        tickets = f"(SELECT id FROM tickets WHERE order_id IN {orders} OR event_id IN {events})"
        cases = f"(SELECT id FROM support_cases WHERE opened_by = ANY(%(u)s::uuid[]) OR event_id IN {events})"
        for sql in [
            f"DELETE FROM support_messages WHERE case_id IN {cases} OR sender_id = ANY(%(u)s::uuid[])",
            f"DELETE FROM support_cases WHERE id IN {cases} OR assigned_to = ANY(%(u)s::uuid[])",
            f"DELETE FROM checkin_records WHERE ticket_id IN {tickets} OR checked_in_by = ANY(%(u)s::uuid[])",
            f"DELETE FROM refunds WHERE order_id IN {orders} OR issued_by = ANY(%(u)s::uuid[])",
            f"DELETE FROM promo_redemptions WHERE order_id IN {orders}",
            f"DELETE FROM tickets WHERE id IN {tickets}",
            f"DELETE FROM orders WHERE id IN {orders}",
            f"DELETE FROM seat_holds WHERE seat_id IN (SELECT id FROM seats WHERE event_id IN {events}) OR held_by_user_id = ANY(%(u)s::uuid[])",
            f"DELETE FROM seats WHERE event_id IN {events}",
            f"DELETE FROM promo_campaigns WHERE event_id IN {events} OR created_by = ANY(%(u)s::uuid[])",
            f"DELETE FROM ticket_types WHERE event_id IN {events}",
            f"DELETE FROM staff_assignments WHERE event_id IN {events} OR user_id = ANY(%(u)s::uuid[])",
            f"DELETE FROM audit_log WHERE event_id IN {events} OR actor_id = ANY(%(u)s::uuid[])",
            f"DELETE FROM paid_sales_activations WHERE event_id IN {events} OR activated_by = ANY(%(u)s::uuid[])",
            f"DELETE FROM event_reports WHERE event_id IN {events} OR reported_by = ANY(%(u)s::uuid[])",
            f"DELETE FROM events WHERE id IN {events}",
            "DELETE FROM notifications WHERE user_id = ANY(%(u)s::uuid[])",
            "DELETE FROM organizer_profiles WHERE user_id = ANY(%(u)s::uuid[])",
            "DELETE FROM users WHERE id = ANY(%(u)s::uuid[])",
        ]:
            run_sql(sql, {"u": u})


@pytest.fixture
def kit():
    k = Kit()
    yield k
    k.cleanup()


def notifications_for(user_id, kind=None):
    return fetch("SELECT * FROM notifications WHERE user_id = %s AND (%s::text IS NULL OR kind = %s) ORDER BY created_at",
                 (user_id, kind, kind))
