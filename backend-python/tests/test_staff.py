from uuid import uuid4

import pytest

from conftest import fetch_one, run_sql
from security import check_password


def assign(kit, org, event, **body):
    return kit.client.post(f"/api/events/{event['id']}/staff", headers=org.h, json=body)


def test_explicit_creation_creates_staff_and_does_not_expose_password(kit):
    org = kit.user("organizer")
    event, _ = kit.event(org)
    email = f"new-{uuid4()}@test.invalid"
    response = assign(kit, org, event, mode="create", email=email.upper(), full_name="  Door Staff  ", password="initial-pass-123")
    assert response.status_code == 201, response.text
    data = response.json()
    kit.user_ids.append(data["staff"]["id"])
    assert data["staff"]["email"] == email and data["staff"]["full_name"] == "Door Staff"
    assert data["assignment"]["status"] == "active" and data["already_assigned"] is False
    assert "password" not in response.text
    account = fetch_one("SELECT * FROM users WHERE id = %s", (data["staff"]["id"],))
    assert account["role"] == "event_admin" and check_password("initial-pass-123", account["password_hash"])
    login = kit.client.post("/api/auth/login", json={"email": email, "password": "initial-pass-123"})
    assert login.status_code == 200
    staff_headers = {"Authorization": "Bearer " + login.json()["token"]}
    assert [row["id"] for row in kit.client.get("/api/staff/events", headers=staff_headers).json()] == [event["id"]]


def test_assignment_is_idempotent_and_preserves_existing_credentials(kit):
    org, staff = kit.user("organizer"), kit.user("event_admin")
    event, _ = kit.event(org)
    before = fetch_one("SELECT password_hash FROM users WHERE id = %s", (staff.id,))["password_hash"]
    first = assign(kit, org, event, mode="assign", email=staff.email)
    second = assign(kit, org, event, mode="assign", email=staff.email)
    assert first.status_code == second.status_code == 201
    assert first.json()["already_assigned"] is False and second.json()["already_assigned"] is True
    assert first.json()["assignment"]["id"] == second.json()["assignment"]["id"]
    assert fetch_one("SELECT password_hash FROM users WHERE id = %s", (staff.id,))["password_hash"] == before
    assert fetch_one("SELECT count(*) AS n FROM audit_log WHERE event_id = %s AND action = 'staff_assigned'", (event["id"],))["n"] == 1
    assert fetch_one("SELECT count(*) AS n FROM notifications WHERE user_id = %s AND kind = 'staff_assigned'", (staff.id,))["n"] == 1


def test_create_never_silently_assigns_or_changes_an_existing_account(kit):
    org, staff = kit.user("organizer"), kit.user("event_admin")
    event, _ = kit.event(org)
    response = assign(kit, org, event, mode="create", email=staff.email, full_name="Changed", password="replacement123")
    assert response.status_code == 409
    assert kit.client.get(f"/api/events/{event['id']}/staff", headers=org.h).json() == []
    assert kit.client.post("/api/auth/login", json={"email": staff.email, "password": "replacement123"}).status_code == 401


def test_explicit_assign_never_creates_account(kit):
    org = kit.user("organizer")
    event, _ = kit.event(org)
    email = f"missing-{uuid4()}@test.invalid"
    response = assign(kit, org, event, mode="assign", email=email, full_name="Unused", password="unused-pass-123")
    assert response.status_code == 404
    assert fetch_one("SELECT id FROM users WHERE email = %s", (email,)) is None


def test_revoke_only_affects_selected_event_and_can_be_restored(kit):
    org, buyer, staff = kit.user("organizer"), kit.user(), kit.user("event_admin")
    first, tt = kit.event(org)
    second, _ = kit.event(org)
    ticket = kit.buy(buyer, first["id"], tt["id"]).json()["ticket"]
    for event in [first, second]:
        assert assign(kit, org, event, mode="assign", email=staff.email).status_code == 201
    url = f"/api/events/{first['id']}/staff/{staff.id}"
    assert kit.client.delete(url, headers=org.h).status_code == 200
    assert kit.client.delete(url, headers=org.h).status_code == 200
    assert {row["id"] for row in kit.client.get("/api/staff/events", headers=staff.h).json()} == {second["id"]}
    scan = {"event_id": first["id"], "qr_code_hash": ticket["qr_code_hash"]}
    assert kit.client.post("/api/checkin/verify-qr", headers=staff.h, json=scan).status_code == 403
    assert fetch_one("SELECT count(*) AS n FROM audit_log WHERE event_id = %s AND action = 'staff_revoked'", (first["id"],))["n"] == 1
    assert assign(kit, org, first, mode="assign", email=staff.email).status_code == 201
    assert kit.client.post("/api/checkin/verify-qr", headers=staff.h, json=scan).json()["result"] == "valid"
    assert fetch_one("SELECT count(*) AS n FROM staff_assignments WHERE event_id = %s AND user_id = %s", (first["id"], staff.id))["n"] == 1


def test_staff_management_requires_event_owner_and_role(kit):
    org, other, attendee, staff = kit.user("organizer"), kit.user("organizer"), kit.user(), kit.user("event_admin")
    event, _ = kit.event(org)
    root = f"/api/events/{event['id']}/staff"
    assert assign(kit, org, event, mode="assign", email=staff.email).status_code == 201
    for headers, status in [({}, 401), (other.h, 403), (attendee.h, 403), (staff.h, 403)]:
        assert kit.client.get(root, headers=headers).status_code == status
        assert kit.client.post(root, headers=headers, json={"mode": "assign", "email": staff.email}).status_code == status
        assert kit.client.delete(root + "/" + staff.id, headers=headers).status_code == status
    assert kit.client.delete(root + "/" + str(uuid4()), headers=org.h).status_code == 404


def test_wrong_roles_and_suspended_accounts_cannot_be_assigned(kit):
    org, attendee, staff = kit.user("organizer"), kit.user(), kit.user("event_admin")
    event, _ = kit.event(org)
    assert assign(kit, org, event, mode="assign", email=attendee.email).status_code == 409
    run_sql("UPDATE users SET is_suspended = true WHERE id = %s", (staff.id,))
    assert assign(kit, org, event, mode="assign", email=staff.email).status_code == 409
    assert kit.client.get(f"/api/events/{event['id']}/staff", headers=org.h).json() == []


@pytest.mark.parametrize("fields", [
    {"full_name": "   ", "password": "password123"},
    {"full_name": "n" * 121, "password": "password123"},
    {"full_name": "Name", "password": "short"},
    {"full_name": "Name", "password": "é" * 37},
])
def test_new_account_validation_is_atomic(kit, fields):
    org = kit.user("organizer")
    event, _ = kit.event(org)
    email = f"invalid-{uuid4()}@test.invalid"
    assert assign(kit, org, event, mode="create", email=email, **fields).status_code == 400
    assert fetch_one("SELECT id FROM users WHERE email = %s", (email,)) is None


def test_existing_assignment_reports_account_suspension(kit):
    org, staff = kit.user("organizer"), kit.user("event_admin")
    event, _ = kit.event(org)
    assign(kit, org, event, mode="assign", email=staff.email)
    run_sql("UPDATE users SET is_suspended = true WHERE id = %s", (staff.id,))
    row = kit.client.get(f"/api/events/{event['id']}/staff", headers=org.h).json()[0]
    assert row["is_suspended"] is True and row["status"] == "active"
    assert kit.client.delete(f"/api/events/{event['id']}/staff/{staff.id}", headers=org.h).status_code == 200
    assert assign(kit, org, event, mode="assign", email=staff.email).status_code == 409
