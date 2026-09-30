from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

import main


@pytest.fixture
def checkout_records():
    organizer_id = str(uuid4())
    attendee_ids = [str(uuid4()), str(uuid4())]
    event_id = str(uuid4())
    ticket_type_ids = [str(uuid4()), str(uuid4())]
    seat_id = str(uuid4())
    connection = main.get_connection()
    cursor = connection.cursor()

    try:
        users = [(organizer_id, "organizer")] + [(item, "attendee") for item in attendee_ids]
        for user_id, role in users:
            cursor.execute(
                "INSERT INTO users (id, email, full_name, role) VALUES (%s, %s, %s, %s)",
                (user_id, f"{user_id}@test.invalid", "Checkout Test User", role),
            )
        cursor.execute(
            """INSERT INTO events
               (id, organizer_id, title, venue_name, start_time, capacity, status, has_assigned_seating)
               VALUES (%s, %s, 'Checkout Test Event', 'Test Venue', now(), 10, 'upcoming', true)""",
            (event_id, organizer_id),
        )
        for index, ticket_type_id in enumerate(ticket_type_ids):
            cursor.execute(
                """INSERT INTO ticket_types
                   (id, event_id, name, price, total_quantity, quantity_available)
                   VALUES (%s, %s, %s, 1000, 1, 1)""",
                (ticket_type_id, event_id, f"Test Tier {index + 1}"),
            )
        cursor.execute(
            """INSERT INTO seats (id, event_id, section, row_label, seat_number, category)
               VALUES (%s, %s, 'TEST', '1', '1', 'standard')""",
            (seat_id, event_id),
        )
        connection.commit()
        yield {
            "attendee_ids": attendee_ids,
            "event_id": event_id,
            "seat_id": seat_id,
            "ticket_type_ids": ticket_type_ids,
        }
    finally:
        connection.rollback()
        cursor.execute("DELETE FROM tickets WHERE event_id = %s", (event_id,))
        cursor.execute("DELETE FROM orders WHERE event_id = %s", (event_id,))
        cursor.execute("DELETE FROM seat_holds WHERE seat_id = %s", (seat_id,))
        cursor.execute("DELETE FROM seats WHERE id = %s", (seat_id,))
        cursor.execute("DELETE FROM ticket_types WHERE event_id = %s", (event_id,))
        cursor.execute("DELETE FROM events WHERE id = %s", (event_id,))
        for user_id in [organizer_id, *attendee_ids]:
            cursor.execute("DELETE FROM users WHERE id = %s", (user_id,))
        connection.commit()
        cursor.close()
        connection.close()


def checkout_payload(records, attendee_id, ticket_type_id, seat_id=None):
    return {
        "attendee_id": attendee_id,
        "event_id": records["event_id"],
        "ticket_type_id": ticket_type_id,
        "attendee_name": "Checkout Test Attendee",
        "seat_id": seat_id,
    }


def test_checkout_rejects_missing_required_fields():
    with TestClient(main.app) as client:
        response = client.post("/api/orders/checkout", json={})

    assert response.status_code == 422


def test_checkout_rejects_sold_out_ticket_type(checkout_records):
    connection = main.get_connection()
    cursor = connection.cursor()
    cursor.execute(
        "UPDATE ticket_types SET quantity_available = 0 WHERE id = %s",
        (checkout_records["ticket_type_ids"][0],),
    )
    connection.commit()
    cursor.close()
    connection.close()

    with TestClient(main.app) as client:
        response = client.post(
            "/api/orders/checkout",
            json=checkout_payload(
                checkout_records,
                checkout_records["attendee_ids"][0],
                checkout_records["ticket_type_ids"][0],
            ),
        )

    assert response.status_code == 409
    assert response.json()["detail"] == "Sold out"


def test_checkout_rejects_already_sold_seat(checkout_records):
    with TestClient(main.app) as client:
        first_response = client.post(
            "/api/orders/checkout",
            json=checkout_payload(
                checkout_records,
                checkout_records["attendee_ids"][0],
                checkout_records["ticket_type_ids"][0],
                checkout_records["seat_id"],
            ),
        )
        second_response = client.post(
            "/api/orders/checkout",
            json=checkout_payload(
                checkout_records,
                checkout_records["attendee_ids"][1],
                checkout_records["ticket_type_ids"][1],
                checkout_records["seat_id"],
            ),
        )

    assert first_response.status_code == 201
    assert second_response.status_code == 409
    assert second_response.json()["detail"] == "That seat is already taken"


def test_concurrent_checkout_cannot_oversell_last_ticket(checkout_records):
    barrier = Barrier(2)

    def purchase(attendee_id):
        with TestClient(main.app) as client:
            barrier.wait(timeout=10)
            return client.post(
                "/api/orders/checkout",
                json=checkout_payload(
                    checkout_records,
                    attendee_id,
                    checkout_records["ticket_type_ids"][0],
                ),
            )

    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = list(executor.map(purchase, checkout_records["attendee_ids"]))

    assert sorted(response.status_code for response in responses) == [201, 409]


def test_concurrent_checkout_cannot_sell_same_seat_across_ticket_types(checkout_records):
    barrier = Barrier(2)

    def purchase(index):
        with TestClient(main.app) as client:
            barrier.wait(timeout=10)
            return client.post(
                "/api/orders/checkout",
                json=checkout_payload(
                    checkout_records,
                    checkout_records["attendee_ids"][index],
                    checkout_records["ticket_type_ids"][index],
                    checkout_records["seat_id"],
                ),
            )

    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = list(executor.map(purchase, range(2)))

    assert sorted(response.status_code for response in responses) == [201, 409]