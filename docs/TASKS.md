# BiletFlow: Status and Tasks

Last updated: November 2, 2026. Final presentation: second half of November.

Key dates (our own, because the SRS schedule says features stop after week 9 and we are behind it):
- **Nov 2:** team meeting. Confirm the split in section 4.
- **Nov 4:** everyone has run the new backend. The shared `web/` project exists. Farzad's scanner PR (#2) is merged and the mobile app picks its screens by role after login.
- **Nov 9:** attendee flow works on the web and in the app. An organizer can create and publish an event on the web.
- **Nov 12:** the scanner checks a ticket in. An organizer can make a promo campaign and show its QR. The admin portal logs in and lists users.
- **Nov 16:** feature freeze. After this, only bug fixes and polish.
- **Nov 17 to 22:** integration, testing, demo data, slides.
- **Nov 23 onward:** rehearsals. Nobody starts a new feature.

---

## 0. The big picture in plain words (read this first)

**What are we building?** BiletFlow is a way to sell event tickets in Kazakhstan. An organizer creates an event and sells tickets. A person buys a ticket and gets a QR code. At the door, staff scan the QR code to let them in. An admin keeps an eye on the whole platform. People use it through a **website** and through **one mobile app**.

**How is it put together?** Think of a restaurant.
- **The kitchen** is the *backend and database*. It stores everything (events, tickets, orders) and follows the rules (no selling the same seat twice, no using a promo code more than allowed). **The kitchen is built and tested.**
- **The menu** is the *list of endpoints* in `docs/DATA_MODELS_AND_APIS.md`. It says exactly what you can ask the kitchen for.
- **The dining room** is what people actually see: the *website*, the *mobile app* and the *admin pages*. **This is not built yet, and it is all the work that is left.**

Nobody on the front end needs to touch the kitchen. Your job is to build screens that ask the kitchen for things (for example "give me the list of events") and show the answer nicely, and that send the person's choices back (for example "this person wants 2 tickets").

**What is already done**
- The database with all its tables, and demo data (3 events, users, promo codes).
- The backend with 88 endpoints and 176 automated tests. It runs with one command.
- Login, tickets with QR codes and PDFs, promo codes with QR codes, refunds, door check-in, organizer numbers, support chat, admin tools.
- Documentation: how to set up (`SETUP.md`), what you can ask the backend (`DATA_MODELS_AND_APIS.md`), and this plan.
- A start on the mobile app (`mobile/`): Events list, Event details and My Tickets screens, an API client and shared components (Insar). Organizer screens, My events and Event dashboard (Farzad, PR #1, merged on Nov 1).
- The door scanner (Farzad, PR #2, **opened Nov 2, not merged yet**): login, secure session, assigned events, camera check-in with a clear result screen for every case. It has one merge conflict with `main` and needs the role-based change below before it can be merged.

**What is left to do**
- The website for attendees and organizers, the one mobile app (attendee, organizer and door staff in the same app), and the admin pages (sections 3 and 4).
- Joining everything together and testing the demo flow end to end.
- Slides and rehearsals.

**How a screen gets built, in 4 steps (this applies to everyone)**
1. Run the backend on your laptop (`docker compose up -d --build`) and open http://localhost:8000/docs. This page lists everything the backend can do, and you can click "Try it out" on any endpoint to see what it returns.
2. Find the endpoint your screen needs in `DATA_MODELS_AND_APIS.md` and try it in `/docs` first, so you know what the answer looks like.
3. In your code, send that request, take the answer, and show it on the screen.
4. If the person must be signed in, add the `token` you got from login to the request (`Authorization: Bearer <token>`).

If an endpoint does not behave as documented, tell Daut or Aldiyar. Do not work around it silently.

---

## 1. What is required

Two sources: the SRS (`docs/BiletFlow_SRS_Initial_Draft.pdf`, posted on Moodle) and the instructors' clarification given to Daut on Nov 2.

**Instructors' clarification (overrides the SRS where they differ):** there must be a **single mobile app** where an attendee, an organizer or a QR checker can log in and use it. **Full feature parity with the website is not required.** We are free to choose which features go on mobile and which on the web. For example, QR scanning is useless on a laptop, so only the mobile app has it.

(The SRS draft said native attendee and organizer apps were excluded. The clarification replaces that. Daut should get the instructors' answer in writing, a Moodle message or an email, and keep it.)

**So the required parts are:**
1. **Website** (responsive, so it also works in a phone browser) for attendees and organizers.
2. **One mobile app** with three roles: attendee, organizer, door staff (the scanner).
3. **Admin web portal.**
4. Backend, database, Docker demo setup (done).

**Still excluded** (SRS section 8): real payments and payouts, real identity verification, offline scanner sync, app store publication, advanced refund and dispute workflows.

**Bonus, cut first if we run short** (SRS 13.4): assigned seating UI, calendar export, advanced analytics, refund simulation.

**The one flow the demo must show** (SRS 13.4):
create event, make a promo campaign QR, open the QR link and land on the event with the code applied, pick a ticket, simulated checkout, receive the ticket, open a support request, staff verifies entry at the door.

---

## 2. What the backend already does

Everything the web, the app and the admin portal need exists as endpoints: **88 endpoints, 176 automated tests** (`backend-python/`). Full list with who may call each: `docs/DATA_MODELS_AND_APIS.md`. Live, clickable version: http://localhost:8000/docs.

| Area | Ready |
|---|---|
| Accounts | Register, login (token and role), email verification, password reset, suspension |
| Events | Create, edit, publish, cancel, duplicate, ticket types, seats, public list |
| Buying | Quote, checkout (quantity, seat hold, promo), tickets with QR image and PDF |
| Door | Staff accounts, scan, undo, manual search, live stats |
| Promo | Campaign with auto code, campaign QR image, report, scan-to-resolve |
| Organizer | Activation checklist, dashboard by phase, attendees, orders, analytics, timeline, refunds |
| Support | Cases, messages, escalation |
| Admin | User/event/order search, suspend, freeze paid sales, reports, CSV, settings |

Nobody on the backend needs to add features. From now on backend work is bug fixing and answering front-end questions.

### Things front-end people must know
- **Sign in once, send the token every time:** `Authorization: Bearer <token>`. The login answer also contains the person's `role` (`attendee`, `organizer`, `event_admin` for door staff, `platform_admin`). The mobile app uses the role to decide which screens to show. Demo logins are in `docs/SETUP.md` (password `demo1234`).
- Organizer, staff and admin endpoints **require** the token. Buying and "my tickets" still also accept the old `attendee_id` (so the current mobile prototype keeps working), but new code should use the token.
- To publish an event: the organizer's email must be verified (the code is in `GET /api/notifications`), and the event needs at least one ticket type.
- To sell **paid** tickets: organizer profile verified, then `POST /api/events/{id}/activate-paid` with `{"accept_terms": true}`. The demo events are already activated.
- Event status is changed with `publish`, `unpublish`, `cancel`, not with `PUT`.
- "Emails" are rows in `GET /api/notifications`. Show them in an inbox page for the demo.
- **The website must have a page at `/events/:id`.** Campaign QR codes and calendar files link to `<PUBLIC_BASE_URL>/events/<event id>?c=<token>`. The default base address is `http://localhost:3000` (set in `docker-compose.yml`); change it if the web app runs elsewhere.
- **Draft events are private.** `GET /api/events` (and `?organizer_id=`) only lists public upcoming or active events to anyone who is not that organizer. An organizer must send their token to see their own drafts. The organizer screens merged in PR #1 call `?organizer_id=` without a token, so they will show only public events until they are switched to the token (Farzad, with the role-based change below).
- **Scanner: send `event_id` too.** `POST /api/checkin/verify-qr` takes the `qr_code_hash` and the `event_id` the scanner is open on. If the ticket is for another event the answer is `wrong_event` and nothing is checked in. Farzad's app already sends it.
- **A ticket's QR picture** is available at `/api/tickets/{id}/qr.png`. In the mobile app you can show it with a plain image component pointing at that address, no QR library needed.

---

## 3. What goes on the website and what goes in the mobile app

This is a proposal. The rule: the app gets what is useful on a phone, the website gets everything that needs a big form or a table.

| | Mobile app (one app, the role decides which screens appear) | Website only |
|---|---|---|
| **Attendee** | Register and login, browse events, event details, buy tickets (quantity, promo code), My Tickets with a big QR code to show at the door | Support requests, PDF download, order history and cancel, notifications inbox, calendar export, seat picker |
| **Organizer** | Login, "My events" list, event dashboard with the sales numbers (Farzad's PR #1 screens) | Create and edit events, ticket types, paid-sales activation, promo campaigns and QR, attendee list, orders, refunds, analytics charts, history, staff, support inbox |
| **Door staff** | Login, choose an event, scan the QR with the camera, clear result screen, manual search, undo, live counter | Nothing |
| **Admin** | Nothing (show "please use the website") | The whole admin portal |

The attendee also reaches the website from a phone browser, because the website is responsive.

---

## 4. Who builds what (proposal, confirm in the meeting)

Each person has a short plain-words description and a checklist.

### Farzad: login, role-based screens, organizer and scanner in the app
**In plain words:** you already built the hard part of the app's foundation: login, a saved session and the scanner. Now make the app work for everyone, not only door staff. After login, an attendee should see attendee screens, an organizer the organizer screens, and door staff the scanner. This is the "one mobile app" the instructors asked for. Your PR #2 is the base, so you lead the shell and Insar builds on it.
- [ ] **Fix the merge conflict** in PR #2: merge `main` into your branch. The only conflict is `mobile/src/navigation/types.ts`; keep both `OrganizerStackParamList` and `ScannerStackParamList`.
- [ ] **Role-based root:** keep your `SessionProvider` and `LoginScreen`, but let every role sign in (today `canScan` blocks non-staff). After login, choose by `user.role`:
  - `attendee`: Insar's tabs (Events, My Tickets) from `RootNavigator`
  - `organizer`: the My events and Event dashboard screens from PR #1
  - `event_admin` (door staff): your scanner screens
  - `platform_admin`: a message saying "please use the website"
  An organizer may also open the scanner for their own events; the backend allows it.
- [ ] Add a logout button in every role's screens, and an Account screen if there is time.
- [ ] Move the organizer screens from the demo organizer id to the login token: use `GET /api/organizer/events` (needs the token) instead of `/api/events?organizer_id=...`, and `GET /api/events/{id}/analytics` for the numbers on the dashboard.
- [ ] Push this as an update to PR #2 by **Nov 4**, even if the organizer part is rough, so Insar can build on it. Daut merges it when it is conflict-free and the app starts for all three roles.
- [ ] Scanner: it is already in good shape. Remaining: manual search by name or email (`POST /api/checkin/manual-search`) with a check-in button, undo (`POST /api/checkin/undo`), live counter (`GET /api/events/{id}/checkin-stats`). These three are not in the app yet. The `wrong_event` message is already there and the backend now returns it.
- [ ] Testing tips: open a ticket's QR picture (`/api/tickets/{id}/qr.png`) on a laptop screen and scan it with the phone. Door staff demo login: `nurlan@example.com`, password `demo1234`; organizer: `aigerim@example.com`; attendee: `dana@example.com` (all `demo1234`).

### Insar: the attendee screens in the app
**In plain words:** you own what an attendee does on the phone. You already have the Events list, Event details and My Tickets. They still work as a demo, but they use a fixed demo person. Once Farzad's login is in, connect your screens to the real signed-in person and add the buying step.
- [ ] Wait for Farzad's role-based root (Nov 4), or start now on your own branch using his `SessionContext` from PR #2 (`useSession`, and `authed(...)` for requests with the token).
- [ ] Replace the demo `attendee_id` (`mobile/src/config/environment.ts`) with the logged-in user. Send the token on requests (the client from PR #2 already supports it).
- [ ] Use `GET /api/events?public=true` for the event list.
- [ ] Buy flow: pick a ticket type and quantity, optional promo code (`POST /api/orders/quote` shows the price), `POST /api/orders/checkout`, then show the confirmation and go to My Tickets.
  - Also show: event `image_url` and `refund_policy`; the quote's `processing_fee` is only informational (the organizer pays it). If `POST /api/orders/checkout` answers **402** the payment failed: show the message and let the buyer retry. Send `simulate_payment: "fail"` only in the demo. If a registration window is set, a 409 says it is not open or closed. Several seats: send `seat_ids` (an assigned-seating event needs exactly one seat per ticket).
- [ ] My Tickets: show each ticket with its QR. Use `/api/tickets/{id}/qr.png` as an image.
- [ ] Register screen for new attendees (`POST /api/auth/register`), link from the login screen.
- [ ] If time is short, do browse and My Tickets with QR first and let buying happen on the website (section 5).

### Assanali: the attendee website
**In plain words:** the public website for buying a ticket. A visitor sees the events, opens one, creates an account, picks tickets, "pays" (pretend), and gets a ticket with a QR. They can also contact support. Work on a phone browser too (responsive).
- [ ] **Create the shared `web/` project folder first** (by **Nov 4**) with a router and a small helper that adds the token to every request. The other web people copy this pattern.
- [ ] Event list (`GET /api/events?public=true`) and event detail page at `/events/:id`.
- [ ] Landing for a campaign QR: read `?c=...`, call `GET /api/campaigns/resolve?token=`, show the event with the promo code already filled in.
- [ ] Register, login, verify email (paste the code), reset password.
- [ ] Ticket selection (quantity, `POST /api/orders/quote`), optional seat picker (bonus), simulated checkout, confirmation.
- [ ] My Tickets: ticket card with QR image, PDF download, order history, cancel a free registration.
- [ ] Support: open a request from an order or ticket, see replies (`/api/support/cases`).
- [ ] Notifications inbox.
- [ ] There is nothing visible in the repo yet. Send a first push by **Nov 4**.

### Daut: organizer set-up pages, admin portal, demo
**In plain words:** you build the pages where an organizer sets up an event and its promotion, then the admin portal. You are also the person who makes sure the demo runs smoothly.
- [ ] **Organizer web, set up side:** profile and verify button (`/api/organizer/profile`), create and edit event form, publish and cancel, ticket types, paid-sales activation page (checklist and button).
- [ ] **Promo campaigns:** create form, list, enable and disable, show and download the QR image (`/api/promo-campaigns/{id}/qr.png`), campaign report.
- [ ] **Admin portal** (plain tables are enough): login as `admin@example.com`; search users with suspend and unsuspend; search events with suspend, reinstate, freeze and restore paid sales; order search, refunds, activations, promo activity; event reports inbox; settings (activation fee, processing fee); summary numbers and CSV download.
- [ ] Demo script, slides, room test (section 6), keep demo data clean (`reset-demo.bat`).
- [ ] Get the instructors' answer about the mobile app in writing.

### Aldiyar: organizer web, the watch and manage side
**In plain words:** you build the pages where an organizer sees what is happening with an event: who bought tickets, how much money, what happened when, and support messages. You know the backend best, so you are also the person everyone asks when an endpoint answers something strange.
- [ ] 30-minute backend walkthrough with Daut.
- [ ] Organizer home: events grouped by phase (`GET /api/organizer/events`).
- [ ] Attendee list and orders with filters, refund button.
- [ ] Analytics page with numbers and a sales-over-time chart (`/api/events/{id}/analytics`, filters `date_from`, `date_to`, `ticket_type_id`).
- [ ] Staff: invite by email, list, revoke (`/api/events/{id}/staff`).
- [ ] Event history page (`/api/events/{id}/timeline`).
- [ ] Support inbox: attendee cases for your events, reply, escalate.
- [ ] Bug fixes on the backend, and keep the tests green (`python -m pytest`) whenever something changes.

### Everyone, every week
1. `git pull` before you start work, `git push` your own branch when you stop.
2. Push something small by Nov 4, even if it is unfinished. It shows progress and avoids a panic on Nov 16.
3. If you are stuck for more than an hour, ask. Do not wait until the next meeting.

### Phone testing tips (mobile app)
- The phone and the laptop must be on the same WiFi (or the laptop shares a hotspot).
- In `mobile/.env` set `EXPO_PUBLIC_API_URL=http://YOUR_LAPTOP_IP:8000` (find the IP with `ipconfig`, no `/api` at the end). Run the backend with `docker compose up -d --build`.
- If the phone cannot reach the laptop, Windows Firewall is usually the reason. Allow port 8000 for private networks when Windows asks.
- Details are in `mobile/README.md`.

---

## 5. If time runs short (cut in this order)

1. **Cut first:** seat picker, calendar buttons, analytics charts (keep the numbers), refund button, mobile attendee buy flow (keep browse and My Tickets with QR, buying stays on the website).
2. **Cut next:** event duplicate, history page, CSV export, settings page, password reset UI, mobile organizer dashboard.
3. **Never cut:** the demo flow in section 1: event creation, campaign QR with promo, checkout, ticket with QR, support request, scan at the door in the app, and a simple admin page. Plus the single app with login and roles.

Be honest in the presentation about what is simulated (payments, emails, identity verification, payouts) and what is not built. The list is in `docs/SETUP.md`, Part 4.

---

## 6. Decisions the team must make

1. **Confirm the split in section 4.** Farzad and Insar carry the mobile app, which is the new requirement. Farzad leads the shell (he already built login and the scanner) and Insar builds on it; check on Nov 4 that they are not blocked on each other. If Assanali has no first push by Nov 4, move part of the attendee website to someone else.
2. **PR #2 is not merged yet.** Do not merge it as it is: it turns the app into scanner-only. Merge it after the role-based update.
3. **Get the instructors' clarification about the single mobile app in writing.**
4. **Demo setup.** Simplest: one laptop runs Docker and the API; the phone joins the same WiFi (or a phone hotspot). University WiFi can block device-to-device traffic, so test it in the actual room.

---

## 7. Checkpoints

- **Nov 4:** everyone pushed. Everyone ran `docker compose down -v` then `docker compose up -d --build` once (see `docs/SETUP.md`). `web/` folder exists. PR #1 is merged. Farzad's PR #2 is updated (role-based root, conflict fixed) and merged.
- **Nov 9:** attendee flow works on the web (register, open a campaign link, buy, see the ticket with QR) and in the app (login, browse, see ticket with QR). An organizer can create and publish an event on the web.
- **Nov 12:** the scanner app checks a ticket in. An organizer can create a promo campaign and show its QR. Admin portal login and user list work.
- **Nov 16:** feature freeze. The whole demo flow runs from a clean `docker compose up`, including a basic admin page.
- **Nov 22:** two full rehearsals done.
