# Organizer management: modules 1 and 2

Implemented in `feature/organizer-management`. This module covers the organizer
home, event overview, attendee lists, order management and analytics from Aldiyar's tasks.

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

The web interface uses English labels, statuses, confirmation messages and error
messages. Amounts remain in KZT and timestamps use Asia/Almaty. Event titles,
attendee names and other user-provided content retain their original language.

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
Module 1 added no backend routes or schema changes. Module 2 corrects the existing
analytics endpoint and adds response fields; the database schema is unchanged.

## Analytics (module 2)

Open `/organizer/events/:eventId/analytics`, or select Analytics in the event menu.
The page includes current inventory, revenue/discount/refund/fee/payout figures,
attendance, a revenue chart with exact daily values, ticket-type comparisons and
campaign performance. Date and ticket-type filters are stored in the URL.
All interface text is English, amounts use KZT and dates use Almaty time.

Current inventory is separated from purchase-date reporting. Campaign quota and
seat holds are labelled with their event-wide/all-date scope. List-price value
is labelled separately from real recorded revenue. Free registrations and empty
periods have explicit states; invalid date ranges do not issue analytics requests.
The chart is keyboard-scrollable on narrow screens and its data is also a table.

Backend fixes: dates/types now apply to campaign and ticket-type breakdowns;
invalid date ranges and unrelated ticket types are rejected. Reports use one
read-only database snapshot so concurrent checkout cannot mix old/new totals.
Full details: [API contract](DATA_MODELS_AND_APIS.md#organizer-analytics-contract).

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
These browser checks verify the frontend with API fixtures. Backend analytics
and authorization were also verified against an isolated real PostgreSQL 16
container: the full 186-case backend suite passed before the final free-ticket
regression was added; all 11 analytics cases, including that regression, pass.
These checks cover refunds, date boundaries, filter consistency, access control,
price changes and a checkout committed midway through an analytics request.

Run the backend regressions against a disposable database initialized from
`docs/schema.sql` (set `DB_HOST`, `DB_PORT`, `DB_NAME` and `DB_PASSWORD` first):

```sh
cd backend-python
python -m pytest tests/test_analytics.py tests/test_organizer.py
```

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

- Staff assignment, initial-account setup and access revocation.
- Read-only event history with action/date filters.
- Organizer support inbox, replies, statuses and escalation.
- Final live browser walkthrough with the shared attendee checkout after branch integration.
- Backend walkthrough with Daut (a team activity, not completed by this code).

Attendee checkout, event creation/editing, activation and campaign creation remain
with their respective owners in `TASKS.md`. Integration changes shared with the
attendee frontend are limited to `App.tsx`, `api.ts`, `auth.tsx` and `LoginPage.tsx`.
