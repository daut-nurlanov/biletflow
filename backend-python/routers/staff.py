from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from db import audit, notify, tx
from security import assert_manager, hash_password, require_roles

router = APIRouter()


class StaffInvite(BaseModel):
    email: str
    full_name: str | None = None
    password: str | None = None  #only needed when this person has no account yet


@router.post("/api/events/{event_id}/staff", status_code=201)
def invite_staff(event_id: str, payload: StaffInvite, user=Depends(require_roles("organizer", "platform_admin"))):
    #the organizer either assigns someone who already has an event admin
    #account, or creates that account right here by giving a name and a
    #starting password (which they pass on to the person themselves)
    email = payload.email.strip().lower()
    with tx() as cur:
        event = assert_manager(cur, user, event_id)
        cur.execute("SELECT * FROM users WHERE email = %s", (email,))
        staff = cur.fetchone()
        if staff:
            if staff["role"] != "event_admin":
                raise HTTPException(status_code=409, detail="That email belongs to an account that is not a door-staff account")
        else:
            if not payload.full_name or not payload.password or len(payload.password) < 8:
                raise HTTPException(status_code=400, detail="New staff need full_name and a password of at least 8 characters")
            cur.execute(
                """INSERT INTO users (email, password_hash, full_name, role, is_email_verified)
                   VALUES (%s, %s, %s, 'event_admin', true) RETURNING *""",
                (email, hash_password(payload.password), payload.full_name))
            staff = cur.fetchone()
        cur.execute(
            """INSERT INTO staff_assignments (user_id, event_id, invited_by, status)
               VALUES (%s, %s, %s, 'active')
               ON CONFLICT (user_id, event_id) DO UPDATE SET status = 'active', invited_by = EXCLUDED.invited_by
               RETURNING *""", (staff["id"], event_id, user["id"]))
        assignment = cur.fetchone()
        audit(cur, user["id"], event_id, "staff_assigned", f"{staff['full_name']} assigned as door staff", "user", staff["id"])
        notify(cur, staff["id"], "staff_assigned", f"You were assigned to {event['title']}",
               "Open the BiletFlow scanner app to see this event.")
        return {"assignment": assignment, "staff": {"id": staff["id"], "email": staff["email"], "full_name": staff["full_name"]}}


@router.get("/api/events/{event_id}/staff")
def list_staff(event_id: str, user=Depends(require_roles("organizer", "platform_admin"))):
    with tx() as cur:
        assert_manager(cur, user, event_id)
        cur.execute(
            """SELECT users.id, users.email, users.full_name, sa.status
               FROM staff_assignments sa JOIN users ON sa.user_id = users.id
               WHERE sa.event_id = %s ORDER BY users.full_name""", (event_id,))
        return cur.fetchall()


@router.delete("/api/events/{event_id}/staff/{staff_id}")
def revoke_staff(event_id: str, staff_id: str, user=Depends(require_roles("organizer", "platform_admin"))):
    with tx() as cur:
        assert_manager(cur, user, event_id)
        cur.execute("UPDATE staff_assignments SET status = 'revoked' WHERE event_id = %s AND user_id = %s RETURNING *",
                    (event_id, staff_id))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="That person is not assigned to this event")
        audit(cur, user["id"], event_id, "staff_revoked", "Door staff access removed", "user", staff_id)
        return {"message": "Access removed"}
