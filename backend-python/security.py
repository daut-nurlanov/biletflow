import base64
import hashlib
import hmac
import json
import math
import os
import re
import secrets
import time
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import bcrypt
from fastapi import Depends, Header, HTTPException

from db import tx

#set BILETFLOW_SECRET in the real environment. the default only exists so
#local development works with zero setup
#if nobody sets BILETFLOW_SECRET, make a random one. a fixed default would be public (this code is on
#GitHub), and anyone on the same network could then forge a login token for any account
SECRET = os.getenv("BILETFLOW_SECRET") or secrets.token_hex(32)
TOKEN_LIFETIME = 7 * 24 * 3600


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def check_password_rules(password: str):
    #bcrypt can only use the first 72 bytes and refuses longer passwords, so say so clearly
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    if len(password.encode()) > 72:
        raise HTTPException(status_code=400, detail="Password is too long (at most 72 bytes, about 70 characters)")


def check_email(email: str) -> str:
    email = email.strip().lower()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]{2,}", email) or len(email) > 254:
        raise HTTPException(status_code=400, detail="Enter a valid email address")
    return email


ALMATY = ZoneInfo("Asia/Almaty")


def _parse_moment(text, name, end_of_range):
    text = text.strip()
    try:
        if len(text) == 10:
            #a plain date means the whole day in Kazakhstan, so the end of the range is the start of the NEXT day
            day = date.fromisoformat(text)
            moment = datetime(day.year, day.month, day.day, tzinfo=ALMATY)
            return moment + timedelta(days=1) if end_of_range else moment
        moment = datetime.fromisoformat(text.replace("Z", "+00:00"))
        return moment if moment.tzinfo else moment.replace(tzinfo=ALMATY)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"{name} must look like 2026-11-30 or 2026-11-30T18:00:00+05:00")


def day_range(date_from, date_to):
    """Turns the ?date_from / ?date_to filters into exact moments. Both ends are INCLUDED:
    date_to=2026-11-30 covers all of the 30th (Almaty time)."""
    start = _parse_moment(date_from, "date_from", False) if date_from else None
    end = _parse_moment(date_to, "date_to", True) if date_to else None
    return start, end


def check_number(value, name):
    #JSON from some clients can contain NaN or Infinity, which Python and PostgreSQL both accept as numbers
    if value is not None and not math.isfinite(value):
        raise HTTPException(status_code=400, detail=f"{name} must be a normal number")


def check_password(password: str, password_hash: str | None) -> bool:
    if not password_hash:
        return False
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:
        return False


def _sign(text: str) -> str:
    return hmac.new(SECRET.encode(), text.encode(), hashlib.sha256).hexdigest()


def make_token(user_id: str, purpose: str = "access", ttl: int = TOKEN_LIFETIME, extra: str = "") -> str:
    #a token is: base64(who + what-for + expiry) + "." + a signature only
    #the server can produce. change one character and the signature fails.
    #"purpose" keeps a password-reset token from working as a login token
    body = json.dumps({"u": str(user_id), "p": purpose, "e": int(time.time()) + ttl, "x": extra})
    payload = base64.urlsafe_b64encode(body.encode()).decode().rstrip("=")
    return payload + "." + _sign(payload)


def read_token(token: str, purpose: str = "access"):
    try:
        payload, signature = token.split(".", 1)
        if not hmac.compare_digest(signature, _sign(payload)):
            return None
        data = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    except Exception:
        return None
    if data.get("p") != purpose or data.get("e", 0) < time.time():
        return None
    return data


def _user_from_header(authorization):
    if not authorization:
        return None
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Use the header: Authorization: Bearer <token>")
    data = read_token(authorization[7:].strip(), "access")
    if not data:
        raise HTTPException(status_code=401, detail="Your session is invalid or has expired, please sign in again")
    with tx() as cur:
        cur.execute(
            "SELECT id, email, full_name, role, is_suspended, is_email_verified FROM users WHERE id = %s",
            (data["u"],))
        user = cur.fetchone()
    if not user:
        raise HTTPException(status_code=401, detail="Account not found")
    if user["is_suspended"]:
        raise HTTPException(status_code=403, detail="This account has been suspended")
    return user


def optional_user(authorization: str | None = Header(default=None)):
    #for endpoints that work for guests but behave better when signed in
    return _user_from_header(authorization)


def current_user(authorization: str | None = Header(default=None)):
    user = _user_from_header(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Please sign in first")
    return user


def require_roles(*roles):
    def dependency(user=Depends(current_user)):
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Your account type is not allowed to do this")
        return user
    return dependency


def load_event(cur, event_id, lock=False):
    cur.execute("SELECT * FROM events WHERE id = %s" + (" FOR UPDATE" if lock else ""), (event_id,))
    event = cur.fetchone()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return event


def can_manage(user, event) -> bool:
    #the organizer who owns the event, or platform staff
    return bool(user) and (user["role"] == "platform_admin" or str(event["organizer_id"]) == str(user["id"]))


def assert_manager(cur, user, event_id, lock=False):
    event = load_event(cur, event_id, lock)
    if not can_manage(user, event):
        raise HTTPException(status_code=403, detail="You do not manage this event")
    return event


def is_assigned_staff(cur, user, event_id) -> bool:
    cur.execute(
        "SELECT 1 FROM staff_assignments WHERE user_id = %s AND event_id = %s AND status = 'active'",
        (user["id"], event_id))
    return cur.fetchone() is not None


def assert_event_staff(cur, user, event_id):
    #allowed: staff assigned to this event, the organizer who owns it, or a platform admin
    event = load_event(cur, event_id)
    if can_manage(user, event) or (user["role"] == "event_admin" and is_assigned_staff(cur, user, event_id)):
        return event
    raise HTTPException(status_code=403, detail="You are not assigned to this event")


def resolve_actor(user, claimed_id, what="attendee_id"):
    #attendee-facing endpoints (buying, holding seats, my tickets) work two ways:
    #  - signed in: the person is taken from the token. if the request also
    #    names somebody, it has to be that same person
    #  - not signed in (older clients): the request must name the person.
    #    this is the one deliberately weak spot, kept so the mobile app that
    #    already exists keeps working. it goes away once every client sends a token
    if user:
        if claimed_id and str(claimed_id) != str(user["id"]):
            raise HTTPException(status_code=403, detail="You can only act as yourself")
        return str(user["id"])
    if not claimed_id:
        raise HTTPException(status_code=401, detail=f"Sign in, or send {what}")
    return str(claimed_id)
