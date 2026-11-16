from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from db import audit, notify, tx
from security import assert_manager, check_email, check_password_rules, hash_password, require_roles

router = APIRouter()


class StaffInvite(BaseModel):
    email: str
    full_name: str | None = None
    password: str | None = None  #only needed when this person has no account yet
    mode: Literal["assign", "create"] | None = None


@router.post("/api/events/{event_id}/staff", status_code=201)
def invite_staff(event_id: str, payload: StaffInvite, user=Depends(require_roles("organizer", "platform_admin"))):
    #the organizer either assigns someone who already has an event admin
    #account, or creates that account right here by giving a name and a
    #starting password (which they pass on to the person themselves)
    email = check_email(payload.email)
    with tx() as cur:
        event = assert_manager(cur, user, event_id)
        cur.execute("SELECT * FROM users WHERE email = %s", (email,))
        staff = cur.fetchone()
        if staff:
            if payload.mode == "create":
                raise HTTPException(status_code=409, detail="An account with this email already exists. Assign it if it is a door-staff account, or use another email.")
            if staff["role"] != "event_admin":
                raise HTTPException(status_code=409, detail="That email belongs to an account that is not a door-staff account")
            if staff["is_suspended"]:
                raise HTTPException(status_code=409, detail="This staff account is suspended. Contact a platform administrator.")
        else:
            if payload.mode == "assign":
                raise HTTPException(status_code=404, detail="No door-staff account found for this email. Use Create new staff account instead.")
            if not payload.full_name or not payload.full_name.strip() or not payload.password:
                raise HTTPException(status_code=400, detail="New staff need full_name and a password of at least 8 characters")
            if len(payload.full_name.strip()) > 120:
                raise HTTPException(status_code=400, detail="Staff name must be at most 120 characters")
            check_password_rules(payload.password)
            cur.execute(
                """INSERT INTO users (email, password_hash, full_name, role, is_email_verified)
                   VALUES (%s, %s, %s, 'event_admin', true) RETURNING *""",
                (email, hash_password(payload.password), payload.full_name.strip()))
            staff = cur.fetchone()
        cur.execute(
            """INSERT INTO staff_assignments (user_id, event_id, invited_by, status)
               VALUES (%s, %s, %s, 'active')
               ON CONFLICT (user_id, event_id) DO UPDATE SET status = 'active', invited_by = EXCLUDED.invited_by
               WHERE staff_assignments.status <> 'active'
               RETURNING *""", (staff["id"], event_id, user["id"]))
        assignment = cur.fetchone()
        already_assigned = assignment is None
        if already_assigned:
            cur.execute("SELECT * FROM staff_assignments WHERE user_id = %s AND event_id = %s", (staff["id"], event_id))
            assignment = cur.fetchone()
        else:
            audit(cur, user["id"], event_id, "staff_assigned", f"{staff['full_name']} assigned as door staff", "user", staff["id"])
            notify(cur, staff["id"], "staff_assigned", f"You were assigned to {event['title']}",
                   "Open the BiletFlow scanner app to see this event.")
        return {"assignment": assignment, "already_assigned": already_assigned,
                "staff": {"id": staff["id"], "email": staff["email"], "full_name": staff["full_name"]}}


@router.get("/api/events/{event_id}/staff")
def list_staff(event_id: str, user=Depends(require_roles("organizer", "platform_admin"))):
    with tx() as cur:
        assert_manager(cur, user, event_id)
        cur.execute(
            """SELECT users.id, users.email, users.full_name, users.is_suspended, sa.status
               FROM staff_assignments sa JOIN users ON sa.user_id = users.id
               WHERE sa.event_id = %s ORDER BY users.full_name""", (event_id,))
        return cur.fetchall()


@router.delete("/api/events/{event_id}/staff/{staff_id}")
def revoke_staff(event_id: str, staff_id: str, user=Depends(require_roles("organizer", "platform_admin"))):
    with tx() as cur:
        assert_manager(cur, user, event_id)
        cur.execute("UPDATE staff_assignments SET status = 'revoked' WHERE event_id = %s AND user_id = %s AND status <> 'revoked' RETURNING *",
                    (event_id, staff_id))
        if not cur.fetchone():
            cur.execute("SELECT 1 FROM staff_assignments WHERE event_id = %s AND user_id = %s", (event_id, staff_id))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="That person is not assigned to this event")
        else:
            audit(cur, user["id"], event_id, "staff_revoked", "Door staff access removed", "user", staff_id)
        return {"message": "Access removed"}
