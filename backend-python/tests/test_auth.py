from uuid import uuid4

from conftest import PASSWORD, fetch_one, notifications_for, run_sql


def register(kit, **kw):
    email = f"{uuid4()}@test.invalid"
    body = {"email": email, "password": PASSWORD, "full_name": "New Person", "role": "attendee"}
    body.update(kw)
    response = kit.client.post("/api/auth/register", json=body)
    if response.status_code == 201:
        kit.user_ids.append(response.json()["id"])
    return response, body


def test_register_returns_token_and_never_the_password(kit):
    response, body = register(kit)
    assert response.status_code == 201
    data = response.json()
    assert data["token"] and "password" not in str(data).lower().replace("is_email_verified", "")
    assert kit.client.get("/api/auth/me", headers={"Authorization": "Bearer " + data["token"]}).json()["email"] == body["email"]


def test_register_rules(kit):
    assert register(kit, password="short")[0].status_code == 400
    assert register(kit, email="not-an-email")[0].status_code == 400
    assert register(kit, role="platform_admin")[0].status_code == 400
    assert register(kit, role="event_admin")[0].status_code == 400
    first, body = register(kit)
    again = kit.client.post("/api/auth/register", json=body)
    assert first.status_code == 201 and again.status_code == 409
    #emails are not case sensitive
    assert kit.client.post("/api/auth/register", json={**body, "email": body["email"].upper()}).status_code == 409


def test_organizer_registration_creates_a_profile(kit):
    response, _ = register(kit, role="organizer")
    assert fetch_one("SELECT * FROM organizer_profiles WHERE user_id = %s", (response.json()["id"],))


def test_login_success_and_failures(kit):
    _, body = register(kit)
    ok = kit.client.post("/api/auth/login", json={"email": body["email"], "password": PASSWORD})
    assert ok.status_code == 200 and ok.json()["token"] and ok.json()["role"] == "attendee"
    assert kit.client.post("/api/auth/login", json={"email": body["email"], "password": "wrong-password"}).status_code == 401
    assert kit.client.post("/api/auth/login", json={"email": "nobody@test.invalid", "password": PASSWORD}).status_code == 401


def test_suspended_account_cannot_log_in_or_use_old_token(kit):
    user = kit.user()
    assert kit.client.get("/api/auth/me", headers=user.h).status_code == 200
    run_sql("UPDATE users SET is_suspended = true WHERE id = %s", (user.id,))
    assert kit.client.get("/api/auth/me", headers=user.h).status_code == 403
    assert kit.client.post("/api/auth/login", json={"email": user.email, "password": PASSWORD}).status_code == 403


def test_bad_tokens_are_rejected(kit):
    user = kit.user()
    assert kit.client.get("/api/auth/me").status_code == 401
    assert kit.client.get("/api/auth/me", headers={"Authorization": "Bearer nonsense"}).status_code == 401
    assert kit.client.get("/api/auth/me", headers={"Authorization": user.token}).status_code == 401
    tampered = user.token[:-3] + ("aaa" if not user.token.endswith("aaa") else "bbb")
    assert kit.client.get("/api/auth/me", headers={"Authorization": "Bearer " + tampered}).status_code == 401


def test_other_purpose_tokens_do_not_work_as_login(kit):
    import security
    user = kit.user()
    reset_token = security.make_token(user.id, "reset_password")
    assert kit.client.get("/api/auth/me", headers={"Authorization": "Bearer " + reset_token}).status_code == 401
    expired = security.make_token(user.id, ttl=-10)
    assert kit.client.get("/api/auth/me", headers={"Authorization": "Bearer " + expired}).status_code == 401


def test_email_verification_flow(kit):
    response, body = register(kit)
    user_id = response.json()["id"]
    assert response.json()["is_email_verified"] is False
    code = notifications_for(user_id, "verify_email")[0]["body"].split(": ")[-1]
    assert kit.client.post("/api/auth/verify-email", json={"token": "garbage"}).status_code == 400
    assert kit.client.post("/api/auth/verify-email", json={"token": code}).status_code == 200
    assert fetch_one("SELECT is_email_verified FROM users WHERE id = %s", (user_id,))["is_email_verified"] is True
    h = {"Authorization": "Bearer " + response.json()["token"]}
    assert kit.client.post("/api/auth/resend-verification", headers=h).json()["message"].startswith("Your email is already")


def test_password_reset_flow_and_single_use(kit):
    user = kit.user()
    kit.client.post("/api/auth/forgot-password", json={"email": user.email})
    code = notifications_for(user.id, "reset_password")[0]["body"].split(": ")[-1]
    assert kit.client.post("/api/auth/reset-password", json={"token": code, "new_password": "short"}).status_code == 400
    assert kit.client.post("/api/auth/reset-password", json={"token": code, "new_password": "brand-new-pass"}).status_code == 200
    assert kit.client.post("/api/auth/login", json={"email": user.email, "password": "brand-new-pass"}).status_code == 200
    assert kit.client.post("/api/auth/login", json={"email": user.email, "password": PASSWORD}).status_code == 401
    #the same code cannot be used a second time
    assert kit.client.post("/api/auth/reset-password", json={"token": code, "new_password": "another-pass-1"}).status_code == 400


def test_forgot_password_does_not_reveal_which_emails_exist(kit):
    known = kit.user()
    a = kit.client.post("/api/auth/forgot-password", json={"email": known.email})
    b = kit.client.post("/api/auth/forgot-password", json={"email": "ghost@test.invalid"})
    assert a.status_code == b.status_code == 200 and a.json() == b.json()


def test_notifications_list_and_mark_read(kit):
    _, _ = register(kit)
    user = kit.user()
    kit.client.post("/api/auth/forgot-password", json={"email": user.email})
    items = kit.client.get("/api/notifications", headers=user.h).json()
    assert len(items) == 1 and items[0]["is_read"] is False
    assert kit.client.post("/api/notifications/read-all", headers=user.h).json()["marked_read"] == 1
    assert kit.client.get("/api/notifications?unread_only=true", headers=user.h).json() == []
    assert kit.client.get("/api/notifications").status_code == 401
