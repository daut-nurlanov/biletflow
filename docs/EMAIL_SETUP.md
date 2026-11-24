# Real emails (optional)

By default BiletFlow does not send real email. Every message is stored as a
notification (website: Notifications, mobile: Alerts tab) and printed in the
server log (`docker compose logs backend`). Verification and reset codes are
printed in full, so the demo works without any email account.

To also send real email, set these before starting Docker. Windows (CMD):

```
set SMTP_HOST=smtp.gmail.com
set SMTP_PORT=587
set SMTP_USER=youraddress@gmail.com
set SMTP_PASSWORD=your-16-letter-app-password
set SMTP_FROM=BiletFlow <youraddress@gmail.com>
docker compose up -d --build
```

Mac or Linux: use `export` instead of `set`.

- Gmail needs an "app password" (Google account, Security, 2-step verification,
  App passwords). Your normal password will not work.
- Port 465 with SSL: also set `SMTP_SSL=true`. Port 587 uses STARTTLS (default).
- Any SMTP provider works (SendGrid, Mailgun, a school mail server).

How it behaves: sending happens in the background after the message is saved. If
the mail server is down or the password is wrong, the purchase or registration
still succeeds and the log shows `[email FAILED]`. With `SMTP_HOST` empty (the
default) nothing is sent and nothing breaks.

Demo payments stay simulated. Emails say that this is a university project.
