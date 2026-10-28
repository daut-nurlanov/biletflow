# BiletFlow: Status and Tasks

Last updated: October 28, 2026 (week 11 of 12). Final presentation: second half of November.

Key dates (our own, because the SRS schedule says features stop after week 9 and we are behind it):
- **Nov 1:** everyone has pushed something to GitHub.
- **Nov 8:** the core flow works in the browser end to end (section 3).
- **Nov 12:** scanner app can check a ticket in.
- **Nov 16:** feature freeze. After this, only bug fixes and polish.
- **Nov 17 to 22:** integration, testing, demo data, slides.
- **Nov 23 onward:** rehearsals. Nobody starts a new feature.

---

## 0. The big picture in plain words (read this first)

**What are we building?** BiletFlow is a website and an app for selling event tickets in Kazakhstan. An organizer creates an event and sells tickets. A person buys a ticket and gets a QR code. At the door, staff scan the QR code to let them in. An admin keeps an eye on the whole platform.

**How is it put together?** Think of a restaurant.
- **The kitchen** is the *backend and database*. It stores everything (events, tickets, orders) and follows the rules (no selling the same seat twice, no using a promo code more than allowed). **The kitchen is built and tested.**
- **The menu** is the *list of endpoints* in `docs/DATA_MODELS_AND_APIS.md`. It says exactly what you can ask the kitchen for.
- **The dining room** is what people actually see: the *web pages*, the *scanner app* and the *admin pages*. **This is what is not built yet, and it is all the work that is left.**

Nobody on the front end needs to touch the kitchen. Your job is to build screens that ask the kitchen for things (for example "give me the list of events") and show the answer nicely, and that send the person's choices back (for example "this person wants 2 tickets").

**What is already done**
- The database with all its tables, and demo data (3 events, users, promo codes).
- The backend with 86 endpoints and 104 automated tests. It runs with one command.
- Login, tickets with QR codes and PDFs, promo codes with QR codes, refunds, door check-in, organizer numbers, support chat, admin tools.
- Documentation: how to set up (`SETUP.md`), what you can ask the backend (`DATA_MODELS_AND_APIS.md`), and this plan.
- A first set of mobile screens (attendee screens by Insar, organizer screens by Farzad). The SRS does not require them, but their code is useful for the scanner app.

**What is left to do**
- The attendee web pages, the organizer web pages, the scanner app, and the admin pages (section 3).
- Joining everything together and testing the demo flow end to end.
- Slides and rehearsals.

**How a screen gets built, in 4 steps (this applies to everyone)**
1. Run the backend on your laptop (`docker compose up -d --build`) and open http://localhost:8000/docs. This page lists everything the backend can do, and you can click "Try it out" on any endpoint to see what it returns.
2. Find the endpoint your screen needs in `DATA_MODELS_AND_APIS.md` and try it in `/docs` first, so you know what the answer looks like.
3. In your code, send that request, take the answer, and show it on the screen.
4. If the person must be signed in, add the `token` you got from login to the request (`Authorization: Bearer <token>`).

If an endpoint does not behave as documented, tell Daut or Aldiyar. Do not work around it silently.

---

## 1. What the SRS actually requires (and what it does not)

Read from `docs/BiletFlow_SRS_Initial_Draft.pdf`, sections 2, 8 and 13.

**Required (the base MVP):**
1. **Responsive web app** for attendees and organizers.
2. **One mobile app: the React Native door scanner** for event staff (online verification).
3. **Admin web portal.**
4. Backend, database, Docker demo setup.

**Explicitly excluded** (SRS section 8): native attendee mobile app, native organizer mobile app, real payments and payouts, real identity verification, offline scanner sync, app store publication, advanced refund and dispute workflows.

**Bonus, cut first if we run short** (SRS 13.4): assigned seating UI, calendar export, advanced analytics, refund simulation.

**The one flow the demo must show** (SRS 13.4):
create event, make a promo campaign QR, scan the QR and land on the event with the code applied, pick a ticket, simulated checkout, receive the ticket, open a support request, staff verifies entry at the door.

### What this means for the existing mobile work
Insar's Expo attendee screens and Farzad's organizer screens (PR #1) are not required by the SRS. They are not wasted: the API client, the shared components and the screen logic are reusable in the scanner app, and the screens can be shown as extra work. But nobody should build more attendee or organizer mobile screens until the required parts below are done.

---

## 2. What the backend already does

Everything the three required front ends need exists as endpoints: **86 endpoints, 104 automated tests** (`backend-python/`). Full list with who may call each: `docs/DATA_MODELS_AND_APIS.md`. Live, clickable version: http://localhost:8000/docs.

| Area | Ready |
|---|---|
| Accounts | Register, login (token), email verification, password reset, suspension |
| Events | Create, edit, publish, cancel, duplicate, ticket types, seats, public list |
| Buying | Quote, checkout (quantity, seat hold, promo), tickets with QR image and PDF |
| Door | Staff accounts, scan, undo, manual search, live stats |
| Promo | Campaign with auto code, campaign QR image, report, scan-to-resolve |
| Organizer | Activation checklist, dashboard by phase, attendees, orders, analytics, timeline, refunds |
| Support | Cases, messages, escalation |
| Admin | User/event/order search, suspend, freeze paid sales, reports, CSV, settings |

Nobody on the backend needs to add features. From now on backend work is bug fixing and answering front-end questions.

### Things front-end people must know
- **Sign in once, send the token every time:** `Authorization: Bearer <token>`. Demo logins are in `docs/SETUP.md` (password `demo1234`).
- Organizer, staff and admin endpoints **require** the token. Buying and "my tickets" still also accept the old `attendee_id` (so the current mobile app keeps working), but new code should use the token.
- To publish an event: the organizer's email must be verified (the code is in `GET /api/notifications`), and the event needs at least one ticket type.
- To sell **paid** tickets: organizer profile verified, then `POST /api/events/{id}/activate-paid` with `{"accept_terms": true}`. The demo events are already activated.
- Event status is changed with `publish`, `unpublish`, `cancel`, not with `PUT`.
- "Emails" are rows in `GET /api/notifications`. Show them in an inbox page for the demo.
- **The web app must have a page at `/events/:id`.** Campaign QR codes and calendar files link to `<PUBLIC_BASE_URL>/events/<event id>?c=<token>`. The default base address is `http://localhost:3000` (set in `docker-compose.yml`); change it if the web app runs elsewhere.

---

## 3. Remaining work: the user interfaces

This is where all the remaining effort goes. **Proposed split** (the team should confirm or change it in the first call):

### A. Attendee web pages: Assanali
- [ ] Event list (`GET /api/events?public=true`) and event detail.
- [ ] Landing page for a scanned campaign QR: read `?c=...` from the link, call `GET /api/campaigns/resolve?token=`, show the event with the promo code already filled in.
- [ ] Register, login, verify email (paste the code), reset password.
- [ ] Ticket selection (quantity, `POST /api/orders/quote` to show the price with the promo), optional seat picker (bonus, skip if short), simulated checkout, confirmation.
- [ ] My Tickets: ticket card with QR image (`/api/tickets/{id}/qr.png`), PDF download button, order history, cancel a free registration.
- [ ] Support: open a request from an order or ticket, see replies (`/api/support/cases`).
- [ ] Notifications inbox.
- [ ] Must be responsive (works on a phone screen). Send a first push by Nov 1; there is nothing visible in the repo yet.

### B. Organizer web pages: Insar, Daut and Aldiyar
- [ ] Register as organizer, organizer profile page with the verify button (`/api/organizer/profile`).
- [ ] Create event form, edit, publish, cancel, duplicate.
- [ ] Ticket types (price, quantity, sale window, per-order limit), seats block (bonus).
- [ ] Paid sales activation page: the checklist and the activate button.
- [ ] **Promo campaigns:** create form, list, enable/disable, show and download the QR image (`/api/promo-campaigns/{id}/qr.png`), campaign report.
- [ ] **Dashboard:** events grouped by phase (`GET /api/organizer/events`), analytics page with numbers and a sales-over-time chart (`/api/events/{id}/analytics`, with date and ticket type filters).
- [ ] Attendee list and orders with filters, refund button.
- [ ] Staff: invite by email, list, revoke.
- [ ] Event history page (`/api/events/{id}/timeline`).
- [ ] Support inbox: attendee cases for your events, reply, escalate.
- [ ] Suggested split: **Insar** takes the "set up" side (profile, the events-by-phase home list, create/edit event, ticket types, activation, promo and QR, staff). **Daut** takes attendee list, orders and refunds. **Aldiyar** takes analytics, event history and the support inbox. Daut and Aldiyar built the backend and share the leftover UI work evenly. Everyone starts from the same web project, so agree on one folder structure first.

### C. Scanner mobile app (React Native): Farzad
- [ ] Login screen (staff account), list of assigned events (`GET /api/staff/events`).
- [ ] Camera scanner calling `POST /api/checkin/verify-qr`. Show a big clear result for each of: `valid`, `already_checked_in`, `cancelled`, `refunded`, `event_cancelled`, `event_suspended`, plus an error screen for "Not a valid ticket" (404) and "promo campaign QR" (400).
- [ ] Live counter (`GET /api/events/{id}/checkin-stats`).
- [ ] Manual search by name or email (`POST /api/checkin/manual-search`) with a check-in button, and an undo (`POST /api/checkin/undo`).
- [ ] Reuse Insar's API client and shared components from `mobile/`. Push a first commit by Nov 1.

### D. Admin web portal: Daut (Aldiyar helps if he finishes B early)
- [ ] Login as platform admin.
- [ ] Search users, suspend and unsuspend.
- [ ] Search events, suspend and reinstate, freeze and restore paid sales.
- [ ] Order search, refunds list, activations list, promo activity.
- [ ] Event reports inbox (dismiss or action).
- [ ] Support: organizer cases and escalated attendee cases.
- [ ] Settings page (activation fee, processing fee), summary numbers, CSV download button.
- [ ] A plain table-based UI is enough. This portal is judged on working, not on looks.

### Also needed, unowned
- [ ] **Shared web project setup:** one repo folder (`web/`), router, a small API helper that adds the token. Whoever starts A or B first creates it, everyone else copies its pattern. Decide this on the Nov 1 call.
- [ ] **Daut:** demo script, slides, room test (section 5), merge PR #1 so organizer screen logic is not lost.
- [ ] **Aldiyar:** walk-through of the backend with Daut (30 min), then the organizer analytics, history and support inbox pages (B), bug fixes, and keeping tests green when anything changes.
- [ ] **Farzad:** after the first scanner push, merge PR #1 (his organizer screens) so that work is kept in `main`.

---

## 4. If time runs short (cut in this order)

The SRS lists what to cut first: assigned seating UI, calendar export, advanced analytics, refund simulation. In practice:

1. **Cut first:** seat picker UI, calendar buttons, analytics charts (keep the numbers), refund button.
2. **Cut next:** event duplicate, organizer history page, CSV export, settings page, password reset UI.
3. **Never cut:** the demo flow in section 1: event creation, campaign QR with promo, checkout, ticket, support request, scan at the door. Plus a simple admin page.

Be honest in the presentation about what is simulated (payments, emails, identity verification, payouts) and what is not built. The list is in `docs/SETUP.md`, Part 4.

---

## 5. Decisions the team must make this week

1. **Confirm the split in section 3.** Assanali has the heaviest share. If he cannot show a first push by Nov 1, move the checkout and ticket pages to someone else.
2. **Ask the professor once:** "The SRS excludes native attendee and organizer apps. Is the responsive web app enough for those two roles?" The SRS already says yes; the answer in writing protects the existing mobile screens from being counted as missing.
3. **Demo setup.** Simplest: one laptop runs Docker and the API; the scanner phone joins the same WiFi (or a phone hotspot). University WiFi can block device-to-device traffic, so test it in the actual room.

---

## 6. Weekly checkpoints

- **Nov 1:** everyone pushed. Everyone ran `docker compose down -v` then `docker compose up -d --build` once (see `docs/SETUP.md`). Web project folder exists.
- **Nov 8:** attendee flow works in the browser: register, open a campaign link, buy, see the ticket with QR. Organizer can create and publish an event.
- **Nov 12:** scanner app can log in and check a ticket in. Organizer can create a promo campaign and show its QR.
- **Nov 16:** feature freeze. The whole demo flow runs from a clean `docker compose up`, including a basic admin page.
- **Nov 22:** two full rehearsals done.

---

## 7. Your task in plain words

For each person: what you are building, how it fits in, what is ready for you, and what to do first. The checklists in section 3 are the detailed version.

### Assanali: the pages a ticket buyer sees
- **What:** the public website. A visitor sees the events, opens one, creates an account, picks tickets, "pays" (it is pretend), and gets a ticket with a QR code. They can also write to support if something is wrong.
- **How it fits:** this is the first half of the demo. When an organizer shows a campaign QR code, scanning it must open *your* event page with the promo code already filled in.
- **Ready for you:** every endpoint you need (events, login, price quote, checkout, tickets, QR image, PDF, support). Demo logins and test events are loaded.
- **Start with:** a page that lists events from `GET /api/events?public=true`. When that works, add the event detail page, then login, then checkout. Push something by Nov 1, even if it is ugly.

### Insar, Daut and Aldiyar: the pages an organizer uses
- **What:** the website for people who run events. They create an event, set ticket types and prices, make promo codes with QR codes, and watch sales. Insar does the "create and set up" side. Daut does the people-and-money side (attendee lists, orders, refunds). Aldiyar does the numbers and records side (analytics, history, support).
- **How it fits:** this is the start of the demo (the event and the campaign QR are created here) and the part the professor will look at for "organizer analytics".
- **Ready for you:** all organizer endpoints, plus a demo organizer (`aigerim@example.com`, password `demo1234`) who already owns the three demo events (one has a sample purchase; buy a few tickets yourself to see the numbers move).
- **Start with:** agree on one shared project folder with Assanali (`web/`). Then Insar: login and "create event" form. Daut: attendee list for one event (`GET /api/events/{id}/attendees`). Aldiyar: the analytics page for one event (`GET /api/events/{id}/analytics`).
- **Tip:** your existing mobile code is a good reference for what each screen needs, but the new work is web, not mobile.

### Farzad: the door scanner app
- **What:** a phone app for staff at the entrance. They log in, choose the event, point the camera at a ticket's QR code, and the app answers with a big green or red result ("valid", "already used", "refunded"). If a QR will not scan, they search by name.
- **How it fits:** this is the last step of the demo, and the only mobile app the SRS requires. It is the proof that a ticket bought on the website really works at the door.
- **Ready for you:** your PR #1 organizer screens already show how the app talks to the backend (merge them once the scanner has a first push). `POST /api/checkin/verify-qr` does all the checking and tells you exactly what to show. Demo door staff login: `nurlan@example.com`, password `demo1234`. Insar's mobile project already has an API client and shared components you can reuse.
- **Start with:** login screen, then the list of events, then the camera. A tip for testing: open a ticket's QR image from `/api/tickets/{id}/qr.png` on your laptop screen and scan it with the phone.

### Daut: admin pages, glue, and the demo
- **What:** the admin portal (search users and events, suspend, see reports, change fees), plus making sure everything works together and the demo runs smoothly.
- **How it fits:** an admin can stop a suspicious event, which the SRS requires. It is also the safety net for the demo: if something goes wrong, the admin tools and reset script get you back to a clean state.
- **Ready for you:** all `/api/admin/` endpoints. Login: `admin@example.com`, password `demo1234`. `reset-demo.bat` restores the demo data in one click.
- **Start with:** a login page and one table (users, with a suspend button). Copy that pattern for events and orders. Also be the person who keeps the demo data clean and the room test done. Aldiyar walks you through the backend first (30 minutes), then he is the person everyone asks when an endpoint answers something strange.

### Everyone, every week
1. `git pull` before you start work, `git push` your own branch when you stop.
2. Push something small by Nov 1, even if it is unfinished. It shows progress and avoids a panic on Nov 16.
3. If you are stuck for more than an hour, ask. Do not wait until the next meeting.
