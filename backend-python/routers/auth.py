import time

import psycopg2
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from db import notify, tx
from security import (check_email, check_password, check_password_rules, current_user, hash_password,
                      make_token, read_token)

router = APIRouter()

PUBLIC_ROLES = ("attendee", "organizer")

#too many wrong passwords for one email in a short time: stop guessing for a while.
#kept in memory, so it resets when the server restarts (fine for this project)
MAX_FAILED_LOGINS = 10
LOCKOUT_SECONDS = 15 * 60
failed_logins = {}


def login_locked(email):
    now = time.time()
    recent = [t for t in failed_logins.get(email, []) if now - t < LOCKOUT_SECONDS]
    failed_logins[email] = recent
    return len(recent) >= MAX_FAILED_LOGINS


class RegisterRequest(BaseModel):
    email: str
    password: str
    full_name: str
    role: str = "attendee"


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenRequest(BaseModel):
    token: str


class ForgotRequest(BaseModel):
    email: str


class ResetRequest(BaseModel):
    token: str
    new_password: str


def send_verification(cur, user_id, email):
    token = make_token(user_id, "verify_email", ttl=3 * 24 * 3600)
    notify(cur, user_id, "verify_email", "Verify your BiletFlow email",
           f"Use this code to verify {email}: {token}")


@router.post("/api/auth/register", status_code=201)
def register(payload: RegisterRequest):
    #only attendee and organizer accounts can be created here. event admins
    #are created by an organizer (staff invite) and platform admins by us,
    #otherwise anyone could simply register as an admin
    if payload.role not in PUBLIC_ROLES:
        raise HTTPException(status_code=400, detail="You can register as an attendee or an organizer")
    check_password_rules(payload.password)
    if not payload.full_name.strip() or len(payload.full_name) > 120:
        raise HTTPException(status_code=400, detail="Enter your name (at most 120 characters)")
    email = check_email(payload.email)
    try:
        with tx() as cur:
            cur.execute(
                """INSERT INTO users (email, password_hash, full_name, role)
                   VALUES (%s, %s, %s, %s) RETURNING id, email, full_name, role, is_email_verified, created_at""",
                (email, hash_password(payload.password), payload.full_name.strip(), payload.role))
            user = cur.fetchone()
            if payload.role == "organizer":
                cur.execute("INSERT INTO organizer_profiles (user_id) VALUES (%s)", (user["id"],))
            send_verification(cur, user["id"], email)
    except psycopg2.errors.UniqueViolation:
        raise HTTPException(status_code=409, detail="An account with that email already exists")
    return {**user, "token": make_token(user["id"])}


@router.post("/api/auth/login")
def login(payload: LoginRequest):
    email = payload.email.strip().lower()
    if login_locked(email):
        raise HTTPException(status_code=429, detail="Too many failed attempts. Wait 15 minutes or reset your password")
    with tx() as cur:
        cur.execute("SELECT * FROM users WHERE email = %s", (email,))
        user = cur.fetchone()
    if not user or not check_password(payload.password, user["password_hash"]):
        failed_logins.setdefault(email, []).append(time.time())
        raise HTTPException(status_code=401, detail="Invalid email or password")
    failed_logins.pop(email, None)
    if user["is_suspended"]:
        raise HTTPException(status_code=403, detail="This account has been suspended")
    return {"id": user["id"], "email": user["email"], "full_name": user["full_name"],
            "role": user["role"], "is_email_verified": user["is_email_verified"],
            "token": make_token(user["id"])}


@router.post("/api/auth/logout")
def logout():
    #tokens are stateless, so there is nothing to cancel on the server.
    #the app signs out by throwing its copy of the token away
    return {"message": "Logged out"}


@router.get("/api/auth/me")
def me(user=Depends(current_user)):
    return user


@router.post("/api/auth/verify-email")
def verify_email(payload: TokenRequest):
    data = read_token(payload.token, "verify_email")
    if not data:
        raise HTTPException(status_code=400, detail="That verification code is invalid or has expired")
    with tx() as cur:
        cur.execute("UPDATE users SET is_email_verified = true WHERE id = %s RETURNING id", (data["u"],))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Account not found")
    return {"message": "Email verified"}


@router.post("/api/auth/resend-verification")
def resend_verification(user=Depends(current_user)):
    if user["is_email_verified"]:
        return {"message": "Your email is already verified"}
    with tx() as cur:
        send_verification(cur, user["id"], user["email"])
    return {"message": "Verification code sent, see your notifications"}


@router.post("/api/auth/forgot-password")
def forgot_password(payload: ForgotRequest):
    #always answers the same way, so nobody can use this to find out which
    #emails have accounts
    with tx() as cur:
        cur.execute("SELECT id, password_hash FROM users WHERE email = %s", (payload.email.strip().lower(),))
        user = cur.fetchone()
        if user:
            #the first characters of the current hash go inside the token, so
            #once the password changes the same link can never be used again
            token = make_token(user["id"], "reset_password", ttl=3600, extra=(user["password_hash"] or "")[7:23])
            notify(cur, user["id"], "reset_password", "Reset your BiletFlow password",
                   f"Use this code to choose a new password: {token}")
    return {"message": "If that email has an account, a reset code was sent"}


@router.post("/api/auth/reset-password")
def reset_password(payload: ResetRequest):
    check_password_rules(payload.new_password)
    data = read_token(payload.token, "reset_password")
    if not data:
        raise HTTPException(status_code=400, detail="That reset code is invalid or has expired")
    with tx() as cur:
        cur.execute("SELECT id, password_hash FROM users WHERE id = %s", (data["u"],))
        user = cur.fetchone()
        if not user or (user["password_hash"] or "")[7:23] != data["x"]:
            raise HTTPException(status_code=400, detail="That reset code is invalid or has expired")
        cur.execute("UPDATE users SET password_hash = %s WHERE id = %s RETURNING email",
                    (hash_password(payload.new_password), user["id"]))
        failed_logins.pop(cur.fetchone()["email"], None)
    return {"message": "Password changed, you can sign in now"}
