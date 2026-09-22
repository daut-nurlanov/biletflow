# BiletFlow, Local Setup Guide

This document has two jobs. First, it walks you through getting a working copy of the BiletFlow database and backend running on your own laptop. Second, it tells you honestly what already works, what is only partly built, and what has not been started at all, so you know exactly what you can safely build against right now.

Expect the setup itself to take about 15 to 20 minutes the first time you do it.

---

## Part 1: What is actually going on here, in plain terms

The project has two moving pieces that live on your own computer:

1. **A database.** Think of this as a big, permanent filing cabinet. It holds every user, event, ticket, and order. It runs inside something called Docker, which is a tool that lets a program run in its own isolated little box on your computer, so it does not interfere with anything else you have installed.

2. **A backend.** This is a small program, written in Python using a tool called FastAPI, that sits between the filing cabinet and everything else (a website, a phone app) and answers questions like "give me the list of events" or "create a new ticket." You never touch the database directly. You always go through the backend.

Everyone on the team runs their own copy of both of these on their own laptop. Nobody's laptop needs to stay on for anyone else to work. Each person's data is separate from everyone else's, which is fine for building and testing screens.

---

## Part 2: Setting it up

### Step 1: Install Docker Desktop

1. Download it from https://www.docker.com/products/docker-desktop/
2. Install it, then open the actual application. Look for a small whale icon in your system tray or menu bar. It needs to be running in the background the whole time you work on this project.
3. Confirm it worked by opening a terminal and typing:
   ```bash
   docker --version
   ```
   If you see a version number, you are good.

### Step 2: Start the database

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
`docker run` creates a brand new, empty database. `docker start` wakes up the one you already built.

### Step 3: Load the actual structure and sample data

Connect to the database:
```bash
docker exec -it biletflow-db psql -U postgres -d biletflow
```
Your terminal prompt should change to `biletflow=#`. That means you are now typing directly into the database.

Open the file `docs/schema.sql` from this repository. Select all of its text, copy it, and paste it into your terminal, then press enter. This builds all 16 tables the project needs. You should see a stream of lines saying `CREATE TABLE`, with no lines saying `ERROR`.

Then do the same thing with `docs/walkthrough_demo.sql`. This fills the empty tables with realistic sample data, an organizer, an event, some ticket types, a purchased ticket, and so on, so you have real data to look at immediately instead of an empty database.

When you are done, type `\q` and press enter to leave.

### Step 4: Set up and run the backend

The backend code lives in the `backend-python` folder of this repository.

```bash
cd backend-python
pip install fastapi uvicorn psycopg2-binary bcrypt fpdf2
```

That installs the five tools the backend code depends on. Then start it:
```bash
python -m uvicorn main:app --reload --port 8000
```

You are looking for a line that says `Application startup complete`. Leave this terminal window open and running, it needs to stay alive while you work.

### Step 5: Confirm everything actually works

Open a web browser and go to:
```
http://localhost:8000/api/events
```
You should see a page full of text that starts with a square bracket and includes the words "Almaty Jazz Night." That text is called JSON, it is just how the backend hands data back.

Also worth bookmarking, this next link is a page that lists every single thing the backend can do, and lets you test each one by clicking buttons, no typing commands required:
```
http://localhost:8000/docs
```

---

## Part 3: What to actually do with this, based on your role

Once the steps above are done, here is what changes for you specifically.

**If you are building the website (Attendee and Organizer pages):**
You can now write real code that calls `http://localhost:8000/api/events` and similar addresses, and get real, live data back, instead of typing out fake sample data by hand. Start with the simplest screens (the event list, the event detail page) since those just read data. Save anything requiring a full login system for a little later, see Part 4 below about that.

**If you are building the mobile app (Attendee side and the Event Admin scanner):**
Same idea, just from a phone or an emulator instead of a browser. One important difference, a phone cannot reach `localhost` the way your own laptop can, since `localhost` always means "this exact device." You will need Daut's laptop's actual network address instead (found using `ipconfig` on Windows, look for "IPv4 Address"), and both devices need to be on the same WiFi network for this to work during testing.

**If you are building the mobile app (Organizer side):**
Same setup as above. Worth pairing with whoever is doing the Attendee/Scanner mobile screens early on, so you are both using the same shared visual style instead of building two mismatched halves of one app.

**If you are doing QA, testing, or the Admin portal:**
You can start immediately by deliberately trying to break things, buying the last ticket of a type twice in a row, trying to book an already taken seat, sending incomplete data to an endpoint, and writing down what happens. This becomes the beginning of a real test suite. You can also start building actual Admin portal screens once the corresponding backend endpoints exist, see the list below for what is and is not ready yet.

---

## Part 4: What is actually finished, and what is not

This is the honest, current state of the backend, so nobody wastes time assuming something exists that does not.

### Fully built and tested (safe to build against right now)

- Creating an account and logging in
- Viewing the list of events, and one event's full detail
- Creating a new event
- Updating an event's details
- Turning on paid ticket sales for an event
- Viewing the seat map for an event
- Temporarily holding a seat before buying it
- Completing a full ticket purchase, including correctly blocking a sold out ticket type or an already taken seat
- Viewing a single ticket, or all of one person's tickets
- Downloading a ticket as an actual PDF file
- Downloading an event as a calendar file
- Scanning a ticket's QR code to check someone in at the door, including correctly detecting an already used or invalid ticket
- Manually searching for an attendee by name, for when a QR code will not scan

If you are building a screen that only needs the features above, the backend is ready for you today.

### Database tables exist, but nothing can use them yet

These exist as empty or lightly tested structures in the database, but there is no working code yet that lets an app actually create, read, or update this information through the backend:

- Refunds
- Support chat, both the cases and the messages inside them
- Promotional codes and campaigns, including applying a discount during checkout
- Inviting someone as event staff
- The automatic activity log, right now nothing writes to this on its own

If your screen needs any of the above, it is not ready yet. Please check with Daut before building deeply against it, since the exact shape of these endpoints may still change once they are actually written.

### Not started at all

The entire Admin portal side of things has no backend yet: searching across users and events, suspending a user or event, reviewing paid sales activation requests, monitoring disputes, handling escalated support cases, changing platform settings, and exporting reports.

This is expected at this stage of the project, not a sign anything went wrong. Please do not start building deeply against this section yet, it may take real shape differently than currently planned.

---

## Reference data, for testing without creating your own records

| What | ID |
|---|---|
| Organizer, Aigerim | `11111111-1111-1111-1111-111111111111` |
| Attendee, Dana | `22222222-2222-2222-2222-222222222222` |
| Event Admin, Nurlan | `33333333-3333-3333-3333-333333333333` |
| Event, Almaty Jazz Night | `44444444-4444-4444-4444-444444444444` |
| Ticket type, General Admission | `66666666-6666-6666-6666-666666666662` |
| Ticket type, VIP Balcony | `66666666-6666-6666-6666-666666666661` |

---

## Troubleshooting

**"Connection refused" or "connection to server failed"**
PostgreSQL is not running. Run `docker ps` to check. If `biletflow-db` is not listed, run `docker start biletflow-db`.

**A Docker command fails with something about a pipe or engine**
Docker Desktop itself is not open. Launch the actual application, wait for the whale icon to stop moving, then try again.

**Old test data is getting in your way**
Your local database is yours alone, so it is completely safe to wipe it and start over:
```sql
DROP TABLE IF EXISTS audit_log, promo_redemptions, promo_campaigns, support_messages, support_cases, staff_assignments, checkin_records, refunds, tickets, orders, seat_holds, seats, ticket_types, events, organizer_profiles, users CASCADE;
```
Then repeat Step 3 above, loading `schema.sql` and `walkthrough_demo.sql` again.

**Everyday startup, once the setup above is already done once**
In this order:
1. Open Docker Desktop
2. Run `docker start biletflow-db`
3. `cd backend-python`
4. `python -m uvicorn main:app --reload --port 8000`
