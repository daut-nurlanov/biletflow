# Organizer management: module 1

Implemented in `feature/organizer-management`. This module covers the organizer
home, event overview, attendee lists and order management from Aldiyar's tasks.

## Run locally

From the repository root, start the existing API and database:

```sh
docker compose up -d --build
```

In another terminal:

```sh
cd web
npm ci
npm run dev
```

Open http://localhost:3000/login. Use the demo organizer account:
`aigerim@example.com`, password `demo1234`. Login takes organizers to
`/organizer`; the header also links there. For another API address, set
`VITE_API_URL` in an ignored `web/.env.local` and restart Vite.

## What works

- Organizer-only routes wait for session restoration before redirecting.
  Anonymous users return to their requested route after login. API failures
  during restoration offer retry instead of pretending the user signed out.
- `/organizer`: owned events, phase filter including completed/cancelled events,
  current ticket and check-in counts, revenue before processing fees.
- `/organizer/events/:eventId`: overview and navigation. Events must occur in
  the authenticated organizer's event list. The API independently enforces
  authorization for attendee and order requests.
- `.../attendees`: server-side name/email, status and ticket-type filters.
  Applied filters remain in the URL. Each row represents one ticket; email
  belongs to its purchaser. A row links to its order.
- `.../orders`: server-side order-status filter and links to order details.
- `.../orders/:orderId`: tickets, current statuses, promo code and refund history.
  Paid orders can receive a full simulated refund, free orders can be cancelled.
  Actions require confirmation and prevent duplicate submission while pending.
  Used tickets block actions; a later server rejection is explained in place.
- Requests are cancelled when their resource changes or unmounts; late responses
  cannot replace the latest filter results. Network errors have retry states.
- All amounts use KZT; timestamps include the year and use Asia/Almaty.
  Financial operations are clearly labelled simulations.
- Responsive layout, labelled form controls, keyboard focus and scrollable tables.

A timeout does not prove a financial action failed. The confirmation screen
explains that the organizer should refresh the order status before retrying.
The API remains the authority on eligibility, inventory release and audit records.
No backend routes or database schema were changed in this module.

## Validation

```sh
cd web
npm run build
npm run lint
```

The browser checks use real Chrome with an isolated temporary profile and
intercept API requests with deterministic fixtures. They do not touch PostgreSQL
or a user's Chrome profile. With the Vite server running on port 3000:

```sh
node --test tests/organizer.browser.test.mjs
```

Requires Node 22+ and Chrome/Chromium. Set `CHROME_BIN` if Chrome is installed in
another location. Set `TEST_BASE_URL` for another web address. The web server
must use the default API address `http://localhost:8000` for request interception.
The suite reports a skipped test when Chrome is unavailable.

Covered scenarios: anonymous deep link and login return, token headers, delayed
session restoration, completed-event filter, attendee filter query and selected
value, server rejection, duplicate-submit protection, successful refund, used
ticket restrictions, free cancellation, wrong event/order context, retry after
API error, empty list, mobile overflow, role restriction and expired session.
These checks verify the frontend with API fixtures; live database integration
and backend authorization still require the Docker stack and backend tests.

Manual integration walkthrough:

1. Sign in as Aigerim and open an event from the organizer home.
2. Filter attendees by name/email, status and ticket type; refresh the browser
   and confirm that applied filters remain selected.
3. Open an attendee's order and compare tickets, amount and status with the API.
4. On disposable demo data, refund an unused paid order. Verify invalid tickets,
   returned inventory, refund history and audit records on the backend.
5. Cancel a free registration. Try a used ticket and confirm the action is blocked.
6. Open a completed event, then try an event belonging to a different organizer.
7. Sign in as an attendee and try `/organizer` directly: access must be denied.

## Remaining modules

- Analytics page, sales graph, consistent backend date/type filtering and tests.
- Staff assignment, initial-account setup and access revocation.
- Read-only event history with action/date filters.
- Organizer support inbox, replies, statuses and escalation.
- Live end-to-end verification once Docker is running.
- Backend walkthrough with Daut (a team activity, not completed by this code).

Attendee checkout, event creation/editing, activation and campaign creation remain
with their respective owners in `TASKS.md`. Integration changes shared with the
attendee frontend are limited to `App.tsx`, `api.ts`, `auth.tsx` and `LoginPage.tsx`.
