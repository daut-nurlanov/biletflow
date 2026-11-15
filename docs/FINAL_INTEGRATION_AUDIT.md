# BiletFlow final integration audit

Reviewed November 15, 2026. Base: `origin/main` / `3de9464`, fetched and confirmed
current at the start of the audit. Working branch: `fix/final-demo-integration`.
The starting working tree was clean. No commits, pushes, merges, volume resets,
demo-data reloads or edits to local environment files were performed.

## Readiness assessment

**The attendee purchase-to-admission path is demonstrable after these fixes.
The complete product is not feature-complete.** Important organizer, scanner and
administrator interfaces remain unfinished. API-only setup is possible for a
rehearsal, but does not substitute for those required user interfaces.

Reviewed the root README, TASKS, SETUP, DATA_MODELS_AND_APIS,
ORGANIZER_MANAGEMENT, the 20-page SRS, schema/demo SQL, all API router modules,
the web routes/pages, mobile screens/navigation/session code and Docker setup.
The SRS's section 8 scope and the instructor clarification recorded in TASKS
take precedence over older schedule/checklist claims. Seat selection, calendar
export, advanced analytics, production payments and offline scanning are deferred.

| Area | Actual implementation and evidence | Readiness |
| --- | --- | --- |
| Backend | 88 documented API operations. Auth, event lifecycle, inventory, transactions, promo campaigns, quotes, checkout, QR/PDF, support, scanner and admin routes exist. All 183 tests pass against isolated PostgreSQL, including concurrent-purchase and validation suites. | Tested API foundation; not a guarantee against every possible bug. |
| Attendee website | Register, login/logout, events/details, ticket type/quantity, manual promo and campaign-link resolution, server quote, simulated checkout, ticket QR/PDF links and support list/thread/reply are wired. | Free/paid purchase and QR loading verified in real Chrome against Docker. Support covered by backend integration; full browser support conversation still needs rehearsal. |
| Organizer website | Role guard, event list/phase filtering, summary counts/revenue, attendee search/filtering, orders and refund/free-cancellation actions. | Existing browser suite passes. Creation/editing/publication, ticket setup, activation, campaign authoring/QR presentation, staff management, analytics detail and timeline pages are absent. |
| Attendee mobile | Registration via SessionContext; role-based login; public event browsing/details after login; token-based My Tickets; backend PNG QR with loading, error/retry, 15-second timeout and blocked-status rules. | TypeScript/lint/SDK checks pass. New headless regressions check registration, token use and all 24 ticket/event status combinations. Native session/keyboard/camera behavior remains a device check. |
| Mobile organizer | Authenticated own-events list and inventory-based dashboard; organizer can access scanner. | Existing implementation preserved. Inventory summaries are not the full revenue/refund/attendance analytics dashboard. |
| Mobile scanner | Camera permission, scan lock, event ID, result states, wrong-event and promo rejection, duplicate protection and retry. | API behavior tested; physical camera not tested. Manual attendee search, undo and live-count controls are absent from mobile, although backend endpoints work. |
| Administration | Moderation, user/event/order search, activation/refund/promo review, settings, reports and CSV APIs. | Backend tests pass; no admin web routes/pages. Mobile's instruction to use the website currently points to an unfinished destination. |
| Other required/account features | Backend verification, password reset and simulated notifications exist. | User-facing verification/reset/inbox screens are absent. Website registration creates attendees, not new organizers. |
| Optional features | Backend seating/holds and calendar endpoints exist. Website explicitly disables assigned-seat purchases; no seat-picker UI. | Deferred; use a general-admission event for the base demo. |

## Checkout incident: evidence and root cause

The running database contained the older `events` table with 16 columns, ending
at `paid_sales_suspended`. It lacked `registration_opens_at`,
`registration_closes_at`, image/refund/payout fields and later order additions.
Docker initializes mounted SQL only when the PostgreSQL volume is empty; pulling
new code and rebuilding the API had not upgraded this persistent volume.

The original container log showed:

```text
OPTIONS /api/orders/quote 200 OK
POST /api/orders/quote 500 Internal Server Error
routers/orders.py, price_order: event["registration_opens_at"]
KeyError: 'registration_opens_at'
```

The browser's payload was valid: `event_id`, `ticket_type_id`, integer `quantity`
and optional `promo_code`. Public GETs did not access the missing fields, so they
continued to return 200. Preflight allowed POST/authorization/content-type.
The original CORS placement was inside the server-error middleware; an unhandled
500 therefore lost its CORS headers and appeared to fetch as a network failure.
Changing Vite ports or widening allowed origins alone could not repair the quote.

Implemented a versioned, transactional migration for the existing base schema,
covering the November 11 additions already present in `docs/schema.sql`:

- New event fields, payout/status rules, per-order processing fee and idempotency key.
- Processing-fee backfill once for historical paid/refunded orders, using the
  documented original 3% rate; existing IDs, amounts, tickets and stock are retained.
- Uniqueness and numeric constraints to protect seats and inventory.
- A migration ledger, advisory lock and five-second lock timeout. Failed upgrades
  roll back and stop startup instead of serving against a half-upgraded schema.
- Docker applies migrations before Uvicorn. Direct local Python startup must run
  `python migrate.py` first against the same `DB_*` configuration.
- CORS wraps the complete middleware stack, retaining FastAPI route/OpenAPI access.
  Unhandled errors now have CORS headers and can be distinguished from connection loss.

The live database was backed up to
`/tmp/biletflow-pre-audit-20261115.dump` **inside the existing database container**.
Only the backend container was rebuilt. All pre-existing table row counts were
unchanged after migration; `schema_migrations` was the only added table.
No user/event/order/ticket records were removed. The backup is container-local,
not an off-machine backup. Without a configured stable signing secret, rebuilding
the API invalidates old sessions; sign in again if prompted.

After repair, the existing Tech Meetup's Supporter quote returns HTTP 200,
3,000 KZT total and 90 KZT organizer processing fee. Its Community ticket returns
HTTP 200 with zero total/fee. A localhost:3001 Origin receives the CORS header.
Tests also exercise localhost/127.0.0.1 on both 3000 and 3001.

## Prioritized issue table

| Priority | Feature / specific problem | Recommended fix / owner | Status |
| --- | --- | --- | --- |
| P0 | Existing PostgreSQL volume lacks fields used by quote/checkout, causing 500s. | Transactional, repeatable schema upgrade before API startup. Integration/backend. | Fixed and applied locally with backup; regression checks preservation and reruns. |
| P1 | Unhandled backend errors lack CORS headers and masquerade as network failures. | Apply CORS outside the server-error middleware. Integration/backend. | Fixed; preflight and failure tests pass for all four local origins. |
| P1 | Old price quote remains usable after changing type/quantity/promo while a new quote is pending. | Bind quote to the exact selection and signed-in user; block purchase until current quote resolves. Attendee web. | Fixed and browser-tested. |
| P1 | Purchase fields can change in flight; two rapid handler calls can submit twice. | Freeze inputs, add synchronous submission guard, retain idempotency key across retries. Attendee web. | Fixed and browser-tested. Backend still owns inventory/price authority. |
| P1 | Organizer cannot create/publish an event, activate sales, create campaign/QR or assign staff through the website. | Finish the agreed organizer setup/campaign module with Daut; do not duplicate teammate work. | Missing UI; API sequence verified. Blocks a fully UI-driven core demo. |
| P1 | Platform administration UI is absent. | Deliver the minimum moderation/search/report screens with the admin owner. | Missing UI; backend tested. |
| P1 | Scanner has no manual search, undo or attendance-count controls. | Connect existing endpoints in Farzad's scanner module. | Missing mobile UI; API behavior verified. |
| P1 | Legacy unauthenticated `attendee_id` can act as another attendee. | Backend owner should remove fallback once legacy callers/tests migrate. | Known intentional demo weakness; unchanged to avoid breaking the existing contract. Current web/mobile use bearer tokens. Not suitable for production. |
| P1 | Organizer analytics/history requirements have only summary/phase views. | Add agreed analytics/timeline/duplication interfaces with organizer owner. | Partial UI; backend aggregations/authorization tested. |
| P2 | Website shows admission QR for checked-in/cancelled/refunded tickets or blocked events. | Use ticket and event statuses consistently with mobile. | Fixed; 12 web status combinations tested. PDF downloads remain available as records, while scanner enforces admission. |
| P2 | Quote failure has no explicit retry; fractional quantities can be submitted; simulation is not clearly labelled. | Add retry/loading, integer quantities and demo-payment/fee disclosure. | Fixed and browser-tested. |
| P2 | Verification, password-reset and notification UI absent. | Coordinate account/inbox screens; prioritize required verification journey over optional features. | Backend only. Simulated verification is available through API notifications. |
| P2 | Older README/SETUP/TASKS/mobile comments describe already-fixed gaps or recommend resetting volumes. | Use this code-based assessment; update upgrade instructions. | Root README/SETUP/Compose upgrade instructions fixed. Historical milestone sections remain stale. |
| P2 | Seeded Almaty Jazz Night is in October but still marked upcoming; buying it now is correctly refused as ended. | Rehearse with Tech Meetup (Nov 20), or create future general-admission demo data through the API. | Existing seed data preserved. No silent date/stock edits. |
| P2 | Campaign PUBLIC_BASE_URL defaults to localhost:3000, inaccessible to a phone; Vite fallback port 3001 can disagree. | Set the actual reachable web origin before generating physical demo campaign QR images. | Configuration/rehearsal task; no local env files changed. |
| P2 | Mobile attendee purchase/promo flow absent; event image/refund policy absent from mobile details. | Confirm website-first demo scope. Insar can polish details and cross-client ticket refresh now; mobile buying remains deferred. | Not implemented, respecting the prior request and avoiding a new checkout implementation during stabilization. |
| P3 | Assigned-seat UI, calendar export, advanced analytics/localization polish. | Defer while required UI is incomplete. | Optional per scope controls. |

## Changed files

| Files | Change |
| --- | --- |
| `backend-python/migrate.py`, `backend-python/migrations/001_checkout_schema.sql` | Transactional versioned upgrade; no volume reset. |
| `backend-python/Dockerfile`, `backend-python/.dockerignore` | Run upgrade before API; exclude local virtual environment from image builds. |
| `backend-python/main.py` | Global CORS error coverage while preserving FastAPI APIs. |
| `web/src/pages/EventDetailPage.tsx` | Current-selection quotes, cancellation, quote retry/loading, submission lock, integer quantities and simulation disclosure. |
| `web/src/pages/MyTicketsPage.tsx`, `web/src/types.ts` | Event-status-aware admission QR visibility. |
| `backend-python/tests/test_migrations.py`, `backend-python/tests/test_final_integration.py` | Legacy migration, CORS and full free/paid API regressions. |
| `web/tests/browser-helper.mjs`, `web/tests/checkout.browser.test.mjs` | Real headless Chrome with deterministic API fixtures for checkout, retries and QR states. |
| `web/tests/live-integration.browser.test.mjs` | Opt-in real browser/Docker integration with unique audit records. |
| `web/tests/organizer.browser.test.mjs` | Windows browser discovery, hidden process, both local API hosts and expected cancelled-request handling. Existing scenarios retained. |
| `mobile/tests/attendee.test.cjs` | Registration boundaries, authenticated requests and QR-status matrix, without new dependencies. |
| `README.md`, `docs/SETUP.md`, `docker-compose.yml` | Replace reset-as-upgrade guidance with migrations and backup instructions. |
| `docs/FINAL_INTEGRATION_AUDIT.md` | Findings, priorities, verification and handoff. |

No mobile production screens, SessionContext, SDK versions, package manifests,
lockfiles, role routing, organizer screens or scanner screens were changed.

## Verification results

| Check | Result |
| --- | --- |
| `mobile: npx tsc --noEmit` | Pass. |
| `mobile: npx expo lint` | Pass, including added tests. |
| `mobile: npx expo install --check` | Dependencies up to date. |
| `mobile: npx expo-doctor` | 20/20 checks pass. |
| `mobile: node --test tests/attendee.test.cjs` | 3 tests pass; QR test covers 24 combinations. |
| `web: npm run build` | Pass; production bundle created. |
| `web: npm run lint` | Pass. |
| Existing organizer plus new checkout Chrome suites | 20 Node test results pass, no skips. Uses mocked API fixtures. |
| Opt-in live browser suite | 1 test passes against separate Docker API/real PostgreSQL, no mocked API. |
| `backend: python -m pytest -q` | 183 pass in 255 seconds against isolated `biletflow_audit_20261115`. One upstream Starlette warning about its httpx TestClient adapter; no failures. |
| `backend: python ../docs/check_docs.py` | 88 code operations and 88 documented; no mismatches. Run from backend-python. |
| Existing demo Docker API quote requests | Free and paid HTTP 200 after migration; no demo records purchased or scanned. |
| Migration regression | Builds the old schema in a rolled-back temporary schema, preserves historical orders/IDs, backfills once and reruns without overwriting fees. |
| `git diff --check` | Pass. |

The backend suite tests authorization, malformed input, sale/registration windows,
payment failure, promo limits, refunds, inventory/seat races, support permissions,
administration and scanner outcomes. Tests are evidence for those cases; they do
not constitute production security certification.

### Live integration performed

Using a separate Docker API on port 8001 connected to the audit database:

1. HTTP registration of a unique organizer; simulated email verification from
   notifications; profile/payout simulation; create future general-admission event.
2. Create free/paid ticket types, publish, activate paid sales and create campaign.
   Request campaign PNG and resolve its opaque token.
3. Real Chrome/Vite on port 3002 loads the campaign landing with a real attendee
   token. Paid quote displays 20% discount: 5,000 to 4,000 KZT. Buy through the UI.
4. Repeat for a free ticket. Real PostgreSQL stores two orders with totals 0/4,000.
   Both backend QR PNGs load as images in the browser.
5. Staff HTTP verification admits one ticket, rejects the duplicate, and returns
   attendance count 1. Reloading My Tickets hides that used ticket's admission QR.

API regressions additionally cover contextual support, wrong-event/promo rejection,
manual search, undo and counters. This is **not** a physical camera/optical PNG decode
test. The organizer setup uses HTTP because the UI is missing. Unique live-test
records are retained only in the audit database, never the seeded demo database.

Reproduce static/backend checks using the commands above. For the browser fixture
suites, start Vite, then run from `web`:

```powershell
$env:TEST_BASE_URL='http://127.0.0.1:3000'
node --test tests/organizer.browser.test.mjs tests/checkout.browser.test.mjs
```

The live test is opt-in: point `LIVE_API_URL` at a separate test API/database and
start Vite with `VITE_API_URL` set to that same API, then set `TEST_BASE_URL` to
that Vite origin and run `node --test tests/live-integration.browser.test.mjs`.
It creates real unique users/events/orders and must not target shared demo data.
Browser tests require Chrome/Chromium; `CHROME_BIN` overrides discovery. They report
skips if no browser is available, or if live-test variables are absent.

## Remaining manual acceptance tests and owner handoff

1. **Insar: physical iPhone attendee regression.** Open the SDK 58 app against the
   same LAN-reachable backend as the website. Register a new attendee, sign out/in,
   force-close/reopen and verify persistence. Exercise validation, timeout/retry,
   empty tickets, large text/VoiceOver, keyboard scrolling and safe areas.
2. **Insar + scanner owner: website-to-mobile ticket.** Buy a disposable future
   general-admission ticket on the website. Sign in as that exact attendee on the
   iPhone and focus/refresh My Tickets. Present the PNG on one device and scan it
   optically with the staff iPhone. Verify success, second-scan rejection and
   disappearance after attendee refresh. Test denied camera permission, torch,
   wrong event, promo QR and no-network recovery.
3. **Organizer/admin owners: finish required interfaces.** Agree on the minimum
   creation/publication/activation/campaign/QR screens, administrator moderation
   screens, scanner search/undo/counters, and required analytics/history. Until
   then label Swagger/HTTP setup honestly in the rehearsal.
4. **Support owner + Insar: full conversation.** Open help from a newly bought
   ticket in the browser, send a message, sign in as its organizer, reply and
   resolve/escalate. Confirm unrelated accounts cannot open the case.
5. **Integration owner: freeze the demo environment.** Use future general-admission
   data, a stable secret outside Git, and reachable API/web origins. Check campaign
   URLs on the actual phone/network. Keep backup and restoration instructions.
   Do not edit dates/inventory or reset the volume just to make a screenshot work.

Insar's next work should be device verification and small attendee integration
fixes (QR refresh/status clarity, event images/refund policy), then the agreed
website-to-mobile rehearsal. Obtain a team scope decision before starting mobile
purchasing; it remains deferred, and rebuilding organizer/admin modules would
duplicate other owners' work immediately before feature freeze.
