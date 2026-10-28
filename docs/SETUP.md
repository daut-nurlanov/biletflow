# BiletFlow, Local Setup Guide

This document has two jobs. First, it walks you through getting a working copy of the BiletFlow database and backend running on your own laptop, from a completely empty starting point. Second, it tells you honestly what already works, what is only partly built, and what has not been started at all, so you know exactly what you can safely build against right now.

Expect the setup itself to take about 20 to 25 minutes the first time you do it.

**Note:** the backend lives in the `backend-python` folder. (An old Node.js `backend` folder used to exist; it has been deleted.)

---

## Part 1: What is actually going on here, in plain terms

The project has two moving pieces that live on your own computer:

1. **A database.** Think of this as a big, permanent filing cabinet. It holds every user, event, ticket, and order. It runs inside something called Docker, which is a tool that lets a program run in its own isolated little box on your computer, so it does not interfere with anything else you have installed.

2. **A backend.** This is a program, written in Python using a tool called FastAPI, that sits between the filing cabinet and everything else (a website, a phone app) and answers questions like "give me the list of events" or "create a new ticket." You never touch the database directly. You always go through the backend.

Everyone on the team sets up and runs their own copy of both of these, on their own laptop. Nobody's laptop needs to stay on for anyone else to work, and nobody depends on anyone else's machine. Each person's data is separate from everyone else's, which is completely fine for building and testing screens.

---

## Part 2: Setting it up from scratch

There are two ways to do this. **Option A is much shorter and is what we recommend.** Option B is the same thing done by hand, step by step, in case Option A gives you trouble.

### Option A: one command with Docker Compose (recommended)

1. Do **Step 1** (get the project files) and **Step 2** (install Docker Desktop) from Option B below.
2. If you set up the database by hand earlier, remove that old container first so it does not clash on port 5432:
   ```bash
   docker rm -f biletflow-db
   ```
3. From the `biletflow` folder, run:
   ```bash
   docker compose up -d --build
   ```
   The first time takes a few minutes while Docker downloads things. It starts the database, loads the tables and all the demo data automatically, and starts the backend too.
4. Open http://localhost:8000/docs . If you see the list of endpoints, you are done. You do **not** need Python installed for this option. Skip to Part 3.

Everyday use: open Docker Desktop, then `docker compose up -d`. To stop: `docker compose down`.

**To wipe everything and start from fresh demo data** (do this before every rehearsal): run `reset-demo.bat` on Windows or `./reset-demo.sh` on Mac/Linux. It deletes the database and rebuilds it. Note: this deletes anything you created while testing.

**If you already ran `docker compose up` before Oct 28:** the database only loads the demo files the very first time, when it is empty. Your old copy does not have the demo logins or the new tables. Wipe and rebuild it once:
```bash
docker compose down -v
docker compose up -d --build
```
(`-v` deletes the stored database. That is what you want here.) After this, `reset-demo.bat` / `reset-demo.sh` does the same thing in one click.

*Heads up: the Dockerfile changed on Oct 28 (the backend is now several files, not one). `--build` is needed so Docker picks that up. If it fails, tell Daut what it printed and use Option B in the meantime.*

### Option B: step by step by hand

### Step 1: Get the project files

If you have not already done this, you need a copy of the repository on your own computer.

```bash
git clone https://github.com/daut-nurlanov/biletflow.git
cd biletflow
```

Every command from here on assumes you are inside this `biletflow` folder, unless a step tells you to move into a specific subfolder like `backend-python`.

### Step 2: Install Docker Desktop

1. Download it from https://www.docker.com/products/docker-desktop/
2. Install it, then open the actual application. Look for a small whale icon in your system tray or menu bar. It needs to be running in the background the whole time you work on this project.
3. Confirm it worked by opening a terminal and typing:
   ```bash
   docker --version
   ```
   If you see a version number, you are good.

### Step 3: Start the database

```bash
docker run --name biletflow-db -e POSTGRES_PASSWORD=devpassword -e POSTGRES_DB=biletflow -p 5432:5432 -d postgres
```

In plain terms, this tells Docker to download PostgreSQL (the actual database program) and start it running in the background, with the password set to `devpassword` and a database inside it named `biletflow`.

Confirm it is running:
```bash
docker ps
```
You should see a row with `biletflow-db` and a status starting with `Up`.

Important: only run that `docker run` command once, ever, on your machine. After the first time, if the database ever needs restarting (like after closing your laptop), use this instead:
```bash
docker start biletflow-db
```
`docker run` creates a brand new, empty database. `docker start` wakes up the one you already built. Running `docker run` a second time with the same name will give you an error rather than a second database, that is expected and not a problem, it just means you already did this step.

### Step 4: Load the actual structure and sample data

Connect to the database:
```bash
docker exec -it biletflow-db psql -U postgres -d biletflow
```
Your terminal prompt should change to `biletflow=#`. That means you are now typing directly into the database.

Open the file `docs/schema.sql` from this repository (the one you cloned in Step 1). Select all of its text, copy it, and paste it into your terminal, then press enter. This builds all 20 tables the project needs. You should see a stream of lines saying `CREATE TABLE`, with no lines saying `ERROR`.

Then do the same thing with `docs/walkthrough_demo.sql`. This fills the empty tables with realistic sample data, an organizer, an event, some ticket types, a purchased ticket, and so on, so you have real data to look at immediately instead of an empty database.

Finally, do the same with `docs/demo_events.sql`. This adds two events in the future that you can actually buy tickets for (a meetup with free and paid tickets, and a rock night with assigned seats), plus two promo codes. The first event is dated in the past, so without this file there is nothing to buy in a demo.

**If you set up your database by hand before Oct 28:** the simplest fix is to wipe it (see Troubleshooting) and load the three files again. The old demo users have a fake password, so nobody can log in as them until you reload `walkthrough_demo.sql`. Pasting `schema.sql` again alone also works for the structure: its last section adds all new columns and tables to your existing ones, and lines saying `NOTICE ... already exists, skipping` are normal and harmless.

When you are done, type `\q` and press enter to leave.

### Step 5: Confirm Python is installed

```bash
python --version
```

You need Python 3.10 or newer. If this command fails, or shows a much older version, download Python from https://www.python.org/downloads/ and install it before continuing. On Windows, make sure the installer's "Add python.exe to PATH" checkbox is checked.

### Step 6: Set up and run the backend

The backend code lives in the `backend-python` folder of this repository (remember, not `backend`, see the note at the top of this document).

```bash
cd backend-python
pip install -r requirements.txt
```

That installs the tools the backend code depends on. Then start it:
```bash
python -m uvicorn main:app --reload --port 8000
```

(The first run installs a few new packages: `fpdf2` for PDF tickets, `segno` for QR codes, `tzdata` for Almaty time.) You are looking for a line that says `Application startup complete`. Leave this terminal window open and running, it needs to stay alive while you work. Open a separate, new terminal window for anything else you need to do (like the browser tests below).

### Step 7: Confirm everything actually works

Open a web browser and go to:
```
http://localhost:8000/api/events
```
You should see a page full of text that starts with a square bracket and includes the words "Almaty Jazz Night." That text is called JSON, it is just how the backend hands data back.

Also worth bookmarking, this next link is a page that lists every single thing the backend can do, and lets you test each one by clicking buttons, no typing commands required:
```
http://localhost:8000/docs
```

If both of those work, your setup is complete.

---

## Part 3: What to actually do with this, based on your role

Once the steps above are done, here is what changes for you specifically. The SRS (`docs/BiletFlow_SRS_Initial_Draft.pdf`) decides what we build: a responsive **web app** for organizers and attendees, one **mobile app for door staff (the scanner)**, and an **admin web portal**. The native attendee and organizer mobile apps are listed as excluded in the SRS. `docs/TASKS.md` has the exact split.

**If you are building the website (organizer and attendee pages):**
Call `http://localhost:8000/api/events?public=true` and the other endpoints in `docs/DATA_MODELS_AND_APIS.md`. Register or log in, keep the `token` from the response, and send it as `Authorization: Bearer <token>` on every request that needs a signed-in user.

**If you are building the scanner app (mobile):**
A phone cannot reach `localhost` the way your laptop's browser can, since `localhost` always means "this exact device". Use your laptop's network address instead (on Windows, run `ipconfig` and look for "IPv4 Address"), and keep the phone on the same WiFi. Log in as door staff (see the logins below), then use `GET /api/staff/events`, `POST /api/checkin/verify-qr`, `POST /api/checkin/manual-search`, and `GET /api/events/{id}/checkin-stats`.

**If you are building the admin portal:**
Log in as the platform admin (below). Every endpoint under `/api/admin/` is ready.

**If you are doing QA or testing:**
Try to break things: buy the last ticket twice, take a seat someone else holds, scan a ticket twice, scan with the wrong staff account. The automated tests do many of these already (see "Run the tests" in the README), so read `backend-python/tests/` first to avoid repeating them.

---

## Part 4: What is actually finished, and what is not

This section is checked against `docs/DATA_MODELS_AND_APIS.md`, which lists every endpoint (a script, `docs/check_docs.py`, confirms the list matches the code). The backend has **86 endpoints** and **104 automated tests**.

### Built and tested

- **Accounts:** register (attendee or organizer), login with a signed token, email verification and password reset (the "email" is a row in the `notifications` table, visible through `GET /api/notifications`), account suspension by an admin.
- **Events:** create, edit, publish, unpublish, cancel, duplicate; ticket types (free or priced, per-order limit, sale window, hidden); seat blocks; public listing with visibility rules; report an event.
- **Buying:** price quote, checkout with one or several tickets, optional seat (with a 5 minute hold) and promo code. Refused when sold out, seat taken, event not on sale, paid sales not active, outside the sale window, or the promo code is bad or used up. Nobody can get the same seat or the last ticket twice, even when two people click at the same moment.
- **Tickets:** list, detail, QR image, PDF (with QR, supports Kazakh and Russian), calendar file and Google Calendar link.
- **Orders:** list, detail, organizer refund (full), cancel a free registration.
- **Door scanner:** staff accounts per event, QR check-in, undo, manual search by name or email, live check-in numbers. Promo campaign QR codes are rejected at the door.
- **Promo campaigns:** create, enable and disable, QR image, report, public lookup of a scanned campaign QR.
- **Organizer dashboard:** profile and simulated identity verification, paid-sales activation checklist and activation, events grouped by phase, attendee and order lists with filters, analytics (capacity, money, per ticket type, over time, campaigns, attendance), activity timeline.
- **Support:** attendees and organizers open cases, organizers handle attendee cases and can escalate, the platform team handles organizer cases and escalations, messages both ways.
- **Admin:** search users, events and orders; suspend and reinstate users and events; freeze paid sales; activations, refunds, event reports, promo activity; change the activation fee and processing fee; summary report and CSV export.

### Known simplifications (be honest about these in the presentation)

- **Payment is simulated.** Orders are marked paid immediately with a fake reference. Refunds, activation fees and identity verification are simulated too.
- **Emails are simulated.** They are saved in the `notifications` table and printed in the server log. Nothing is sent.
- **Buying still accepts the old `attendee_id`** instead of a token (`checkout`, `seats/hold`, `tickets/my-tickets`). This keeps the existing mobile app working. A real launch would make the token compulsory.
- **Ticket links are open.** `GET /api/tickets/{id}`, its `.png` and `.pdf` need no login; the random id is the secret.
- **Tokens are simple signed strings** (7 days, no refresh, no server-side logout). The signing secret defaults to a development value; set `BILETFLOW_SECRET` for anything real.
- **No rate limiting, no real password-strength rules** beyond 8 characters.
- **Seat maps are generated blocks** (sections, rows, numbers), not a drawn floor plan.

### Not built

- Any user interface. This repo only contains the backend and the early mobile screens. Web pages, the scanner app, and the admin portal screens still have to be built on top of these endpoints.
- Real payments, real email, real SMS.
- Partial refunds (the SRS excludes them).

---

## Reference data, for testing without creating your own records

These are real IDs already sitting in your database once you have loaded `walkthrough_demo.sql` in Step 4.

| What | ID |
|---|---|
| Organizer, Aigerim | `11111111-1111-1111-1111-111111111111` |
| Attendee, Dana | `22222222-2222-2222-2222-222222222222` |
| Event Admin, Nurlan | `33333333-3333-3333-3333-333333333333` |
| Event, Almaty Jazz Night | `44444444-4444-4444-4444-444444444444` |
| Ticket type, General Admission | `66666666-6666-6666-6666-666666666662` |
| Ticket type, VIP Balcony | `66666666-6666-6666-6666-666666666661` |
| Event, Almaty Tech Meetup (no seats, on sale) | `44444444-4444-4444-4444-444444444445` |
| Ticket type, Community (free) | `66666666-6666-6666-6666-666666666671` |
| Ticket type, Supporter (3000) | `66666666-6666-6666-6666-666666666672` |
| Event, Astana Rock Night (assigned seats, on sale) | `44444444-4444-4444-4444-444444444446` |
| Ticket type, Front Row (premium seats, 12000) | `66666666-6666-6666-6666-666666666681` |
| Ticket type, Standard Seat (standard seats, 6000) | `66666666-6666-6666-6666-666666666682` |

Promo codes: `MEETUP10` (10 percent off the meetup), `ROCK1000` (1000 off the rock night), `SUMMER20` (20 percent off Almaty Jazz Night).

### Demo logins (password for all of them: `demo1234`)

| Who | Email | Role |
|---|---|---|
| Aigerim | `aigerim@example.com` | organizer |
| Dana | `dana@example.com` | attendee |
| Nurlan | `nurlan@example.com` | door staff, assigned to all three events |
| Platform admin | `admin@example.com` | platform_admin |

To try it: `POST /api/auth/login` with the email and password, copy the `token`, click **Authorize** at the top of http://localhost:8000/docs and paste the token. Now every endpoint you click runs as that person.

---

## Troubleshooting

**"Connection refused" or "connection to server failed"**
PostgreSQL is not running. Run `docker ps` to check. If `biletflow-db` is not listed, run `docker start biletflow-db`.

**A Docker command fails with something about a pipe or engine**
Docker Desktop itself is not open. Launch the actual application, wait for the whale icon to stop moving, then try again.

**`python` is not recognized as a command**
Python is not installed, or was installed without being added to your system's PATH. Reinstall from https://www.python.org/downloads/ and make sure the PATH checkbox is checked during installation.

**Old test data is getting in your way**
Your local database is yours alone, so it is completely safe to wipe it and start over:
```sql
DROP TABLE IF EXISTS event_reports, platform_settings, paid_sales_activations, notifications, audit_log, promo_redemptions, promo_campaigns, support_messages, support_cases, staff_assignments, checkin_records, refunds, tickets, orders, seat_holds, seats, ticket_types, events, organizer_profiles, users CASCADE;
```
Then repeat Step 4 above, loading `schema.sql`, `walkthrough_demo.sql` and `demo_events.sql` again. (With Option A, just run `reset-demo.bat` or `./reset-demo.sh` instead.)

**Everyday startup with Option A:** open Docker Desktop, then `docker compose up -d` from the `biletflow` folder.

**Everyday startup with Option B, once the setup above is already done once**
In this order:
1. Open Docker Desktop
2. Run `docker start biletflow-db`
3. `cd backend-python`
4. `python -m uvicorn main:app --reload --port 8000`
