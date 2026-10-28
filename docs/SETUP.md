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

*Heads up: the Compose setup was added late and the backend container could not be tested by the person who wrote it. If `docker compose up` fails, tell Daut what it printed and use Option B in the meantime.*

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

Open the file `docs/schema.sql` from this repository (the one you cloned in Step 1). Select all of its text, copy it, and paste it into your terminal, then press enter. This builds all 16 tables the project needs. You should see a stream of lines saying `CREATE TABLE`, with no lines saying `ERROR`.

Then do the same thing with `docs/walkthrough_demo.sql`. This fills the empty tables with realistic sample data, an organizer, an event, some ticket types, a purchased ticket, and so on, so you have real data to look at immediately instead of an empty database.

Finally, do the same with `docs/demo_events.sql`. This adds two events in the future that you can actually buy tickets for (a meetup with free and paid tickets, and a rock night with assigned seats), plus two promo codes. The first event is dated in the past, so without this file there is nothing to buy in a demo.

**If you set up your database before Oct 28:** you do not need to wipe it. Just paste `docs/schema.sql` again. Its last section adds the new event columns to your existing table. Lines saying `NOTICE ... already exists, skipping` are normal and harmless. Then paste `docs/demo_events.sql`.

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

You are looking for a line that says `Application startup complete`. Leave this terminal window open and running, it needs to stay alive while you work. Open a separate, new terminal window for anything else you need to do (like the browser tests below).

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

Once the steps above are done, here is what changes for you specifically.

**If you are building the website (Attendee and Organizer pages):**
You can now write real code that calls `http://localhost:8000/api/events` and similar addresses, and get real, live data back, instead of typing out fake sample data by hand. Start with the simplest screens (the event list, the event detail page) since those just read data. Save anything requiring a full login system for a little later, see Part 4 below about that.

**If you are building the mobile app (Attendee side and the Event Admin scanner):**
Same idea, just from a phone or an emulator instead of a browser. One important difference: a phone cannot reach `localhost` the way your own laptop's browser can, since `localhost` always means "this exact device," and a phone is a different device from your laptop, even though your laptop is the one running everything. You will need **your own** laptop's network address instead (on Windows, run `ipconfig` and look for "IPv4 Address"), and your phone or emulator needs to be on the same WiFi network as your own laptop for this to work. This is not about depending on anyone else's laptop, everyone sets this up independently, on their own machine, exactly like the web team does.

**If you are building the mobile app (Organizer side):**
Same setup as above. Worth pairing with whoever is doing the Attendee and Scanner mobile screens early on, so you are both using the same shared visual style instead of building two mismatched halves of one app.

**If you are doing QA, testing, or the Admin portal:**
You can start immediately by deliberately trying to break things, buying the last ticket of a type twice in a row, trying to book an already taken seat, sending incomplete data to an endpoint, and writing down what happens. This becomes the beginning of a real test suite. You can also start building actual Admin portal screens once the corresponding backend endpoints exist, see the list below for what is and is not ready yet.

---

## Part 4: What is actually finished, and what is not

This section is checked against `docs/DATA_MODELS_AND_APIS.md`, which has the full technical breakdown if you want more detail than what is here. The backend currently has 20 endpoints and 24 automated tests.

### Fully built and tested (safe to build against right now)

- Creating an account and logging in
- Viewing the list of events (all of them, or only the public on-sale ones with `?public=true`), and one event's full detail
- Creating a new event, with description, category, address, end time and visibility
- Updating an event's details, including publishing it (status `upcoming`)
- Creating ticket types for an event, and listing them
- Creating a block of seats for an event
- Turning on paid ticket sales for an event
- Viewing the seat map for an event
- Temporarily holding a seat for 5 minutes (expired holds free themselves)
- Completing a purchase: one or several tickets, with or without a seat, with or without a promo code. It correctly refuses sold-out tickets, taken seats, seats held by someone else, events that are not on sale, paid tickets before paid sales are on, ticket types outside their sale window, and bad or used-up promo codes
- Viewing a single ticket, or all of one person's tickets
- Downloading a ticket as a PDF (the check-in code is printed as text, not as a QR picture; the app should draw the QR itself)
- Downloading an event as a calendar file
- Scanning a ticket's code to check someone in, including detecting already used or invalid tickets
- Manually searching for an attendee by name, for when a code will not scan

If your screen only needs the features above, the backend is ready today.

### Database tables exist, but nothing can use them yet

- Refunds
- Support chat, both the cases and the messages inside them
- Creating promo codes (applying one at checkout works, but organizers cannot create them through the API yet)
- Inviting someone as event staff, and limiting scanning to assigned staff
- The automatic activity log, right now nothing writes to this on its own

If your screen needs any of the above, it is not ready yet. Please check with the backend owner before building deeply against it, since the exact shape may still change.

### Known simplifications (be honest about these in the presentation)

- Login returns the user's id; there are no tokens or sessions, and endpoints do not check who is calling. Anyone who knows an id can act as that user.
- Payment is simulated. Orders are marked paid immediately with a fake reference.
- "Activate paid sales" just flips a switch; there is no real verification.
- Confirmation emails are not sent.

### Not started at all

The entire Admin portal side of things has no backend yet: searching across users and events, suspending a user or event (the `suspended` status exists, but there is no admin endpoint that sets it), reviewing paid sales activation requests, monitoring disputes, handling escalated support cases, changing platform settings, and exporting reports.

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
DROP TABLE IF EXISTS audit_log, promo_redemptions, promo_campaigns, support_messages, support_cases, staff_assignments, checkin_records, refunds, tickets, orders, seat_holds, seats, ticket_types, events, organizer_profiles, users CASCADE;
```
Then repeat Step 4 above, loading `schema.sql`, `walkthrough_demo.sql` and `demo_events.sql` again. (With Option A, just run `reset-demo.bat` or `./reset-demo.sh` instead.)

**Everyday startup with Option A:** open Docker Desktop, then `docker compose up -d` from the `biletflow` folder.

**Everyday startup with Option B, once the setup above is already done once**
In this order:
1. Open Docker Desktop
2. Run `docker start biletflow-db`
3. `cd backend-python`
4. `python -m uvicorn main:app --reload --port 8000`
