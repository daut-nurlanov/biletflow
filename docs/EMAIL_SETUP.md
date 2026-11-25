# Local email capture and optional SMTP

BiletFlow stores messages in the in-app notification inbox. Server logs record
notification types and delivery errors without including verification or reset
codes.

For a local demo, set `BILETFLOW_EMAIL_OUTBOX` to a private directory writable by
the API process. Messages are captured as `.eml` files with any ticket PDF
attachments. Capture takes precedence over SMTP. Use synthetic addresses and
keep this directory out of Git and shared storage.

For Docker Compose, use `BILETFLOW_EMAIL_OUTBOX=/tmp/biletflow-email` and copy the
outbox to an ignored QA directory with
`docker compose cp backend:/tmp/biletflow-email mobile/.expo/biletflow-email`.
Read the most recent message for the synthetic recipient to retrieve a code.

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
default), messages remain in-app unless local capture is configured.

Demo payments stay simulated. Emails say that this is a university project.
