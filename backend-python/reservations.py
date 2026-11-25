from datetime import timedelta

from fastapi import HTTPException

HOLD_DURATION = timedelta(minutes=5)
RETRY_DELAY = timedelta(seconds=30)


def clock(cur):
    cur.execute("SELECT clock_timestamp() AS now")
    return cur.fetchone()["now"]


def lock_attendee(cur, attendee_id):
    # Keep the idempotency lookup, reservation edits and checkout in one order
    # even when two requests from the attendee select different ticket types.
    cur.execute("SELECT pg_advisory_xact_lock(362, hashtext(%s))", (str(attendee_id),))


def get_reservation(cur, attendee_id):
    cur.execute("SELECT * FROM ticket_reservations WHERE attendee_id = %s", (attendee_id,))
    return cur.fetchone()


def held_quantity(cur, ticket_type_id, now, exclude=None):
    cur.execute(
        """SELECT COALESCE(sum(quantity), 0) AS held FROM ticket_reservations
           WHERE ticket_type_id = %s AND expires_at > %s AND id IS DISTINCT FROM %s""",
        (ticket_type_id, now, exclude),
    )
    return cur.fetchone()["held"]


def reserve(cur, attendee_id, existing, event, ticket_type, quantity, now):
    if existing and existing["expires_at"] <= now < existing["expires_at"] + RETRY_DELAY:
        raise HTTPException(status_code=429, detail="Wait 30 seconds after your reservation ends before reserving again.")
    expiry = now + HOLD_DURATION
    if existing and existing["expires_at"] > now:
        expiry = existing["expires_at"]
    expiry = min(value for value in (
        expiry, ticket_type["sales_end_time"], event["registration_closes_at"],
        event["end_time"] or event["start_time"] + timedelta(hours=2),
    ) if value is not None)
    if expiry <= now:
        raise HTTPException(status_code=409, detail="Ticket sales are closed.")
    # Reusing a matching selection makes identical quote retries safe. Changing
    # the selection rotates the ID without extending the attendee's hold window.
    cur.execute(
        """INSERT INTO ticket_reservations (attendee_id, ticket_type_id, quantity, expires_at)
           VALUES (%s, %s, %s, %s)
           ON CONFLICT (attendee_id) DO UPDATE SET
             id = CASE WHEN ticket_reservations.ticket_type_id = EXCLUDED.ticket_type_id
                            AND ticket_reservations.quantity = EXCLUDED.quantity
                            AND ticket_reservations.expires_at > %s
                       THEN ticket_reservations.id ELSE gen_random_uuid() END,
             ticket_type_id = EXCLUDED.ticket_type_id, quantity = EXCLUDED.quantity,
             expires_at = EXCLUDED.expires_at
           RETURNING id, expires_at""",
        (attendee_id, ticket_type["id"], quantity, expiry, now),
    )
    hold = cur.fetchone()
    return {**hold, "remaining_seconds": (hold["expires_at"] - now).total_seconds()}
