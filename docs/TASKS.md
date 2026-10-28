# BiletFlow: Status and Tasks

Last updated: October 28, 2026 (week 11 of 12). Final presentation: second half of November.

Key dates:
- **Nov 16:** feature freeze. After this, only bug fixes and polish.
- **Nov 17 to 22:** integration, testing, demo data, slides.
- **Nov 23 onward:** rehearsals. Nobody starts a new feature.

---

## 1. What the repo contains today

| Area | Owner | Status |
|---|---|---|
| Database | Daut | Done. 16 tables in `docs/schema.sql`, demo data in `docs/walkthrough_demo.sql` and `docs/demo_events.sql`. Events now have description, category, address, end time, visibility and a `suspended` status. |
| Backend | Daut, Aldiyar | 20 endpoints and 24 automated tests (`backend-python/`). Checkout enforces event status, paid sales, sale windows, seat holds, seat category, multi-ticket orders and promo codes. Seat holds expire after 5 minutes. Organizers can create ticket types and seats. |
| One-command setup | Daut | `docker compose up -d --build` starts database plus API with demo data. `reset-demo.bat` / `reset-demo.sh` wipe and reload. The backend container is untested, see section 2. |
| Mobile, attendee | Insar | Expo app: event list, event details, My Tickets, shared components, API client. No login, checkout or QR yet. |
| Mobile, organizer | Apayji (collaborator) | Branch `feature/mobile-organizer` (PR #1): My events and Event dashboard. **Not merged into `main` yet.** |
| Mobile, scanner | Farzad | Nothing visible in the repo. |
| Web | Assanali | Nothing visible in the repo. |

Last commit by anyone other than Daut before today: Oct 1.

---

## 2. Do first (this week)

1. **Daut: test the Docker setup.** Run `docker compose up -d --build` on your machine and open http://localhost:8000/docs. The database part was verified by loading the same files in order into a fresh Postgres, but the Dockerfile and compose backend service were not run. If it fails, send the error.
2. **Daut: rotate the Neon database password** that was shared in chat earlier.
3. **Everyone with an existing local database:** paste the new `docs/schema.sql` once (it upgrades your tables without wiping them), then `docs/demo_events.sql`. Or switch to `docker compose` and forget manual setup. Also run `pip install -r backend-python/requirements.txt` (new package: `fpdf2`).
4. **Merge PR #1** (organizer screens). Insar and Apayji then work from the merged `main`.
5. **Everyone: push something by Nov 1**, even if unfinished, on your own branch.

---

## 3. Remaining work by person

### Daut (database, docs, glue)
- [ ] Items 1 and 2 above.
- [ ] Walk Aldiyar through `main.py` (30 min call) so he can own the backend.
- [ ] Minimal admin page or endpoints (search users and events, suspend an event). Only if time allows.
- [ ] Decide the demo setup (section 5) and test it in the actual room.
- [ ] Presentation slides and demo script.

### Aldiyar (backend)
Done already by Aldiyar: seat locking fix in checkout and the first 5 tests.
- [ ] Refunds endpoint (table exists).
- [ ] Organizer reads: attendee list for an event, orders, basic sales numbers (tickets sold, revenue). The mobile dashboard needs these.
- [ ] Promo code creation endpoint for organizers.
- [ ] Staff invite endpoint, and only let assigned staff scan for an event.
- [ ] Login that returns a token instead of a bare user id, plus a check of who is calling. Do this only if the team agrees; otherwise keep the simple version and say so in the presentation.
- [ ] Keep adding tests next to `tests/test_features.py`.

### Assanali (web)
- [ ] Send the repo link or a first push this week. There is nothing visible yet, so progress cannot be judged.
- [ ] Must-have pages: event list (use `GET /api/events?public=true`), event detail, checkout (supports quantity and promo code), confirmation, register and login, My Tickets.
- [ ] Organizer pages: create event, add ticket types and seats (endpoints now exist), sales dashboard.
- [ ] If this is too much for one person, the organizer pages go to Daut or an unused mobile teammate.

### Insar (mobile, attendee)
- [ ] Merge PR #1 and keep working from the merged `main`.
- [ ] Switch the event list to `GET /api/events?public=true`. This resolves the TODO in `mobile/src/api/events.ts`: drafts and suspended events no longer show.
- [ ] Add register and login screen, checkout flow (ticket type, quantity, optional seat from `GET /api/events/{id}/seats`, optional promo code), ticket detail with a QR code drawn in the app from `qr_code_hash`.

### Farzad (mobile, scanner)
- [ ] Scanner screen using the phone camera, calling `POST /api/checkin/verify-qr`.
- [ ] Show clear results: valid, already checked in, cancelled or refunded, not a valid ticket.
- [ ] Manual search fallback using `POST /api/checkin/manual-search` (body: `event_id`, `name`).
- [ ] Push a first commit this week.

### Apayji (collaborator)
- [ ] Get PR #1 reviewed and merged.
- [ ] Next: create-event screen for organizers (`POST /api/events`, then `PUT` with status `upcoming` to publish).

---

## 4. If time runs short

1. Must work in the demo: browse events, buy a ticket (with a seat and a promo code), see the ticket with a QR, scan it at the door, see the sale on the organizer dashboard.
2. Nice to have: refunds, PDF ticket, calendar export, staff invites.
3. Cut without guilt: admin portal, support chat, audit log screens, password reset, real emails.

Be honest in the presentation about what is simulated (payments, emails, login) and what is not built. The list is in `docs/SETUP.md`, Part 4.

---

## 5. Decisions the team must make this week

1. **Demo setup.** Simplest: one laptop runs Docker and the API, phones join the same WiFi. Risk: university WiFi can block device-to-device traffic, so test it in the room or bring a phone hotspot.
2. **Does the professor accept the organizer app as mobile and the web as the full organizer experience?** Ask now, not on presentation day.
3. **Who owns web.** If Assanali cannot show progress by Nov 1, redistribute.

---

## 6. Weekly checkpoints

- **Nov 1:** everyone has pushed something. PR #1 merged. Everyone runs the new backend.
- **Nov 8:** purchase flow works end to end on one device.
- **Nov 16:** feature freeze. Full demo runs from a clean `docker compose up`.
- **Nov 22:** two full rehearsals done.
