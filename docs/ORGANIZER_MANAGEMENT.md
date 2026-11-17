# Organizer management: modules 1–5

Implemented in `feature/organizer-management`. This module covers the organizer
home, event overview, attendee lists, order management, analytics, event staff and
read-only event history and organizer support controls. Modules 1–4 are merged
into main through PR #15 (`667d8dc`). Support (module 5) is implemented locally
in `feature/organizer-support` from that baseline.

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

## Staff (module 3)

Open `/organizer/events/:eventId/staff` from the event's Staff tab.

- Assign an existing door-staff account by email, without entering or changing
  its password. Attendee/organizer accounts cannot be promoted through this form.
- Create and assign a new account with full name, email, initial password and
  password confirmation. Existing emails are rejected, not silently assigned.
  Passwords are not stored in browser storage and fields clear after success.
- Review active/revoked assignments and suspended-account indicators. Suspended
  accounts cannot be assigned or restored. Their access can still be revoked.
- Revoke with a confirmation naming both the person and event. Restore access
  without creating a second assignment or changing credentials. Other event
  assignments remain intact.
- Pending requests block duplicate actions; list errors disable mutations and
  offer retry. A lost response prompts refreshing the list before retrying.

The UI uses explicit `mode: "assign"` / `"create"`; older clients may omit it.
Repeated assignments/revocations do not duplicate audit or notification records.
The API validates ownership and roles independently of the organizer route guard.
No database schema changes are needed. Rebuild the API with the web changes.
Backend and browser tests cover validation, request payloads, credential handling,
revocation, restoration, suspension and event-level authorization. The live browser
scenario additionally creates a real staff account through the UI, assigns a second
event and proves revoking/restoring the first event preserves the second assignment.

## History (module 4)

Open `/organizer/events/:eventId/history` using the event's History tab.
The page shows newest activity first, including Almaty time down to seconds,
actor, action, affected entity and a description. Optional identifiers are tucked
under Record identifiers. Links open existing organizer orders, Staff, event
summary and shared support cases where appropriate. No editing/deletion controls
are provided. System/legacy rows and unknown future action types remain readable.

Date and activity filters persist in the URL. Invalid ranges avoid unnecessary
requests. The page loads 50 entries at a time; Load older activity preserves
already loaded records and offers retry without losing them if the next page
fails. Changing filters or refreshing starts from the newest page. The API's
existing array response/default limit remain compatible with older clients,
while stable timestamp/ID cursors make records beyond the first 500 reachable.
Newer records appear on refresh; the list does not poll automatically.

History uses actual activity dates; this differs from Analytics purchase-date
selection. Plain end dates include the full day in Almaty. Completed/cancelled
events retain their records; event ownership is checked on every API page.
The module also adds the missing audit entry for ticket-quantity changes without
logging rejected or identical changes. No schema migration is needed.

Implementation is based on SRS 4.16 and Aldiyar's event-history task. The latest
mobile changes from PRs #12–14 are included through main; no Git conflicts occurred.
The user authorized commit, push and PR merge on November 18.

## Support (module 5)

Open the event's Support tab at `/organizer/events/:eventId/support` to manage
attendee requests for that event, or `/support` for the shared inbox. The latter
separates attendee requests and the organizer's own platform requests. Filter by
event, request type, status and escalation; applied filters persist in the URL.
Event tabs enforce their event and attendee scope. Completed/cancelled event
requests remain available. Cards link to the existing shared conversation.

The conversation shows requester, event, order/ticket context, assignee and
escalation state. Handlers can assign the request to themselves and change its
status among Open, In progress, Waiting for customer and Resolved. Escalation to
platform support asks for confirmation; both sides can continue replying after
escalation. Customer/organizer-request owners get reply controls without handler
buttons. API authorization remains authoritative for all operations.

Reads poll sequentially ten seconds after completion, pause during mutations and
ignore superseded/unmounted responses. Reply drafts survive polling, refreshes,
status updates and recoverable errors. A synchronous write lock prevents duplicate
submissions; failed actions keep the draft/selection and show an error. A failed
read disables mutations until a successful refresh, avoiding edits on stale data.
The layout works on mobile and user messages render as escaped text.

The organizer's Contact platform support flow now works without requiring a
personal attendee order, and offers account/activation/payment/technical issues.
Attendees retain the existing ticket/order/event context and reply workflow.
Shared support pages are deliberately reused; no second conversation system or
new API endpoint was introduced. UI labels are English.

Backend additions are optional event/kind list filters and context names, row
locks for case mutations, idempotent escalation, assignment notifications and
audit entries when a customer reply automatically changes status. Existing
mobile clients remain compatible, and no database migration is needed. This
implements SRS 4.10, 4.13 and support activity retention under 4.16.

The user authorized commit, push and PR merge for module 5 on November 18.

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
node --test tests/organizer.browser.test.mjs tests/staff.browser.test.mjs tests/history.browser.test.mjs tests/support.browser.test.mjs
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
On November 16, the branch was synchronized with `origin/main` (`3de9464`) and
reviewed migration/checkout fixes (`64fe04a`). The combined version passed:

- Web production build and lint.
- Mobile TypeScript, lint and 3 headless attendee regression tests.
- All 194 backend tests against an isolated PostgreSQL 16 database, including
  legacy-schema migration, concurrent checkout and analytics consistency.
- All 27 fixture-browser checks for organizer and attendee checkout behavior.
- A live browser scenario against the real API/database: campaign discount,
  paid/free purchases, real QR images, duplicate-admission prevention, organizer
  analytics reflecting those purchases and organizer replies visible to the
  attendee through the shared support conversation.

The live scenario is opt-in: point `LIVE_API_URL` at a disposable database's API
and `TEST_BASE_URL` at a Vite server configured with the matching `VITE_API_URL`,
then run `node --test tests/live-integration.browser.test.mjs` from `web/`.
It creates synthetic accounts/events/orders only; never point it at production.
Physical camera, native device layout and app-store builds remain device checks.

Run the backend regressions against a disposable database initialized from
`docs/schema.sql` (set `DB_HOST`, `DB_PORT`, `DB_NAME` and `DB_PASSWORD` first):

```sh
cd backend-python
python -m pytest tests/test_analytics.py tests/test_organizer.py tests/test_history.py tests/test_support.py tests/test_support_management.py
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

- Backend walkthrough with Daut (a team activity, not completed by this code).

Attendee checkout, event creation/editing, activation and campaign creation remain
with their respective owners in `TASKS.md`. Integration also updates shared Support pages and types, preserving attendee
creation/reply behavior and reusing the existing conversation routes.

## Staff verification (November 16)

Module 3 passed 206 backend cases on isolated PostgreSQL 16, 37 fixture-browser
checks across staff/organizer/checkout, web build and lint. A real browser/API test
created a staff account through this page, authenticated it, revoked and restored
one event assignment while verifying the other assignment stayed available.
The focused Staff/check-in backend subset contains 24 passing cases.
No demo data or production records were modified; the temporary test DB was removed.

## History verification (November 17)

Module 4 passed the final full suite of 223 backend cases on isolated PostgreSQL
16, web production build and lint, and 46 fixture-browser checks across History,
Staff, organizer pages and attendee checkout. History regressions cover Almaty
date boundaries, equal-timestamp pagination, more than 500 records, authorization,
read-only endpoints and successful/failed ticket-quantity updates.

The live browser/API scenario passed with actual purchases, staff changes and
support status changes visible in History, a working activity filter and retained
records after cancellation. Documentation checks confirm all 88 API endpoints
match the code. No seeded/demo or production data was modified. Temporary test
servers and the disposable database were stopped after validation.

## Support verification (November 18)

The final full backend suite passed 231 cases against disposable PostgreSQL 16.
The focused support/history subset passed 32 cases, including real concurrent
status/escalation requests and exact audit/notification counts. Web production
build and lint passed; all 88 documented endpoints match the code.

All 59 fixture-browser checks passed: 13 Support checks plus the existing 46
organizer, Staff, History and attendee checkout regressions. Support checks cover scoped
filters and URL restoration, role boundaries, failed writes, confirmation,
double submission, escaped messages, draft preservation, sequential polling,
superseded reads, errors/retry, mobile overflow and organizer platform requests.

The live browser/API test passed real assignment, status updates, reopening after
a customer reply, escalation, the event inbox and organizer activation inquiries,
alongside attendee checkout, QR admission, Staff and cancelled-event History.
An initial live attempt timed out in Chrome setup before app interaction; the
retry passed. Only synthetic accounts/events and two disposable databases were
used. No demo or production data was modified. Temporary API/web servers and
the disposable databases were stopped after validation.

## Synchronization workflow

Modules 1–4 and integration fixes are merged into `main` (`667d8dc`). Module 5
is local in `feature/organizer-support`, based on that main. No Git conflicts
occurred. Publication is authorized. Before publishing,
fetch main again, integrate new changes locally and rerun relevant checks if
anything overlaps. A push itself does not resolve conflicts.
