# BiletFlow — Current Status & Next Tasks
*Last updated: Week 5, after the first working backend + database session.*

---

## ✅ What's already done

- Full SRS, data model doc, and 12-week roadmap written
- **Database is live**: PostgreSQL running via Docker, 16 tables built, matching `DATA_MODELS_AND_APIS.md`
- **Backend API is live**: Express server with 5 working, tested endpoints:
  - `GET /api/events`
  - `GET /api/events/:id` (includes ticket types)
  - `POST /api/events`
  - `GET /api/tickets/:id`
  - `POST /api/orders/checkout` — full transaction: checks inventory, prevents double-booking a seat, creates order + ticket, updates inventory, all atomically
- Concurrency protection tested and confirmed working (can't double-book a seat, can't oversell a ticket type)
- Repo initialized, first push done

**Files to look at:** `backend/server.js`, `docs/DATA_MODELS_AND_APIS.md`, `docs/schema.sql`, `docs/walkthrough_demo.sql`

---

## 🔲 My next tasks (Daut — Database & Backend)

- [ ] Write `SETUP.md` (exact steps to run the DB + API locally) — **do this first, it unblocks everyone below**
- [ ] Add CORS support to `server.js` so the web/mobile frontends can actually call it (`npm install cors`, then `app.use(cors())`)
- [ ] Build `POST /api/auth/register` and `POST /api/auth/login`
- [ ] Build `POST /api/checkin/verify-qr`
- [ ] Build `GET /api/tickets/my-tickets`
- [ ] Add an optional `?organizer_id=` filter to `GET /api/events`

---

## 🔲 Web Frontend

**Tasks:**
- [ ] Set up React project in `web/`
- [ ] Event list page → `GET /api/events`
- [ ] Event detail page → `GET /api/events/:id`
- [ ] Checkout form → `POST /api/orders/checkout`

**Needs from me first:**
- CORS enabled on the API (in progress above)
- A test attendee ID to use before real login exists (will provide)
- Not blocked on anything else to start

---

## 🔲 Mobile Lead (Attendee + Event Admin scanner)

**Tasks:**
- [ ] Set up React Native (Expo) project in `mobile/`
- [ ] Browse events + event detail screens
- [ ] "My tickets" screen (hardcoded attendee ID for now)
- [ ] Scanner screen UI (can't be wired to real check-in yet)

**Needs from me first:**
- My laptop's local IP address (`localhost` won't work from a phone/emulator) — will share
- CORS enabled (same as above)
- `POST /api/checkin/verify-qr` before the scanner can go live — not needed to start building the UI
- Auth endpoints before a real login screen — not needed to start building other screens

---

## 🔲 Mobile Organizer

**Tasks:**
- [ ] Pair with Mobile Lead **first** on a shared component library (do this before splitting into separate screens)
- [ ] Organizer events list screen
- [ ] Ticket sales overview screen
- [ ] Activation checklist screen (UI only, no backend for this yet)

**Needs from me first:**
- A test organizer ID to use (will provide)
- The `?organizer_id=` filter on `GET /api/events` (in progress above) — can filter client-side in the meantime if needed sooner

---

## 🔲 QA / Admin / Integration

**Tasks:**
- [ ] Scaffold admin portal in `admin/` — start with a page listing `GET /api/events`
- [ ] Stress-test `POST /api/orders/checkout`: buy the last ticket twice, try an already-taken seat, submit missing fields — document what happens
- [ ] Set up a basic GitHub Actions workflow (at minimum: does `npm install` succeed on push)
- [ ] Start building realistic demo data for future presentations

**Needs from me first:**
- Nothing blocking — can start immediately once `SETUP.md` exists

---

## One thing true for everyone

Nobody is fully blocked starting **today** — the database and API already exist and work. The only real prerequisite is `SETUP.md` so everyone can run this on their own machine instead of only testing against mine.
