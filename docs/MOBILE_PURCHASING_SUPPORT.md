# Native mobile purchasing and support

Implemented November 16, 2026 on `feature/mobile-checkout-support`, from clean
`origin/main` at `db870fe`. Ancestry was checked: this includes all of
`feature/mobile-final-sync` (`073bc56`). No commits, pushes or merges were made.
This replaces the earlier decision to defer mobile purchasing. Existing session,
role routing, organizer analytics and staff tools remain in place.

## Feature-parity checklist

Status is based on current web routes, mobile screens, API modules and backend
handlers, checked against TASKS/DATA_MODELS_AND_APIS/MOBILE_SYNCHRONIZATION.

| Workflow | Website/backend | Mobile after this change |
| --- | --- | --- |
| Attendee registration/login/logout/restore | Implemented; backend provides bearer identity | Preserved through SessionContext and SecureStore; existing regressions pass |
| Public events/details | Public filter and detailed event/ticket response | Preserved; current-account requests, Almaty times, venue, descriptions/images, inventory, windows and refund policy |
| Ticket selection | One ticket type and integer quantity per order | Added native selection, name and quantity controls with availability/order-limit checks |
| Backend quote | POST /api/orders/quote | Added subtotal, discount, total and processing fee disclosure; organizer pays the fee |
| Promo codes | Server validation and pricing | Added apply/remove controls; invalid codes block purchase through quote errors |
| Campaign landing | Resolve opaque token and apply code | Paste a campaign link/token on Events to open the correct event's checkout with code applied, or paste on checkout and validate the event |
| Free/simulated paid checkout | POST /api/orders/checkout | Added native flow, server-confirmed receipt/order reference and Open My Tickets action |
| Duplicate/interrupted purchases | Backend Idempotency-Key remembers successful orders | Synchronous tap and cross-screen locks; persist exact payload/key before POST; resume the same attempt after navigation/relaunch |
| My Tickets/QR status | Authenticated tickets and public PNG links | Preserved and connected to purchase confirmation; current-account header; invalid/used/event-blocked QR rules unchanged |
| Ticket PDF | Backend public PDF | Added functional Open ticket PDF action through the system viewer/browser |
| Support creation | Contextual case endpoint | Added event/ticket help buttons, order selection for general requests, category/message validation and confirmed navigation |
| Support list/thread/replies | Authorized cases/messages | Added Support tab, refresh/retry, message threads, retained failed drafts and foreground-only polling |
| Organizer support handling | Handler/status/escalation APIs | Added role-aware status controls and confirmed escalation, plus organizer general platform requests |
| Organizer sales/attendance | Summary, analytics charts and staff management | Existing native analytics summary preserved; charts, detailed filters and staff editing stay web scope |
| Door staff | Assigned events, verify/search/undo/count APIs | Existing scanner/manual tools preserved and live-tested, including revocation and duplicate protection |
| Assigned seating | Backend supports seats; current website disables assigned-seat buying | Explicitly disabled on mobile with explanation; general-admission checkout is implemented. No fake seat picker |
| Verification/reset/inbox/admin portal | Backend exists; corresponding web UI remains incomplete | Not added to this focused purchasing/support change |

## Missing/broken behavior addressed

- Event details had no purchase action, despite a working backend checkout.
- My Tickets and details told users purchasing was website-only. They now describe
  both purchase paths and use the same logged-in account.
- Mobile lacked quote/promo/order types, Idempotency-Key header support and a
  native secure retry record.
- There was no mobile support entry point, contextual request form, conversation
  or reply flow. These now use actual backend responses, not sample records.
- Quote results must not remain purchasable after a selection changes. A result is
  bound to its type/quantity/promo; loading/error/expired results disable Buy.
- A response lost after server commit must not become another order on retry.
  The exact payload/key is stored before mutation and retained for uncertain
  outcomes; a resumed request returns the same backend order.
- Leaving during preflight must not submit from an abandoned screen. Mounted
  checks prevent this, while a per-account/event lock prevents two checkout
  instances from racing over storage. Saved attempts are rechecked inside the lock.
- Existing support context must not be silently reused for another ticket.
  New-request and thread routes have context/case IDs so drafts belong to the
  correct route instance.

## Native checkout behavior and guarantees

1. Choose a general-admission event/ticket type and quantity. The backend is the
   authority for all registration/sale windows, stock, activation and promo rules.
   Local checks provide early feedback without calculating the payable price.
2. Review a backend quote. Quotes are considered stale after 60 seconds. Editing
   type/quantity/promo invalidates the old result immediately. Refresh is explicit.
3. Buy revalidates the quote immediately before submission. A changed total,
   discount, fee or promo requires another review/tap; no checkout is sent then.
4. Save a cryptographically random idempotency key and exact checkout payload in
   SecureStore, scoped to account and event. Only then POST the purchase.
5. Show confirmation only for a returned paid order with issued ticket IDs. Free
   orders use the same backend paid/confirmed status with zero amount. Confirmation
   includes quantity, total, order reference and a working My Tickets action.
6. Network/5xx/expired-auth uncertainty retains the attempt. Its original choices
   stay locked. Reopening as the same account offers a safe retry or My Tickets.
   Recovered orders are explicitly labelled as existing orders, not new purchases.
7. Definitive validation/payment failures allow correction. An old saved order
   that is refunded/cancelled/failed is explained without claiming new success.
   Storage failures block an unsafe mutation rather than silently dropping the key.

The API has no binding quote ID/version or price reservation. Quotes are advisory;
revalidation narrows the change window, but the backend still calculates the final
amount atomically at checkout. This is the existing simulated-payment contract,
not a guarantee of a locked real-money price. No card fields/provider were added.

Expo Crypto (~58.0.8) was installed with `npx expo install` for native UUIDs. It is
included in Expo Go for SDK 58. No app/native-project configuration was changed.
SecureStore tests on the host use a storage double; actual iPhone keychain/relaunch
behavior is part of device acceptance, not claimed as a physical test.

## Support behavior

- Event/ticket help supplies backend context automatically. From the Support tab,
  attendees select an existing order; without an order they can open help from an
  event. Organizers can open an account/platform request without event context.
- Categories match the backend. Empty/over-4,000-character messages are rejected;
  input remains available after a failed request. Synchronous guards prevent
  double taps. Navigation happens after creation succeeds.
- Threads refresh every 10 seconds while focused/active and support manual
  refresh. Replies clear the draft only after success. Only backend-returned
  handler/admin roles see status controls; an event organizer can confirm escalation.
- Support mutation endpoints have no idempotency contract. After an uncertain
  connection failure the UI tells the user to refresh before resending; automatic
  mutation retries are not performed.

## Changed files

All runtime changes are in mobile; website/backend source and local environment
files are unchanged. Paths below are relative to `mobile/` unless stated otherwise.

| Files | Purpose |
| --- | --- |
| `src/api/client.ts` | Allow request headers while preserving bearer/JSON/timeout behavior |
| `src/api/orders.ts`, `src/types/order.ts` | Current quote, checkout and own-order contracts |
| `src/api/promotions.ts`, `src/components/CampaignEntry.tsx` | Safe campaign-token parsing/server resolution; never fetch a pasted external URL |
| `src/auth/PurchaseAttempt.ts` | Account/event recovery storage and cross-screen purchase lock |
| `src/hooks/useCheckout.ts`, `src/utils/checkout.ts` | Quote lifecycle, validation, preflight, purchase confirmation and safe recovery |
| `src/screens/CheckoutScreen.tsx` | Native ticket form, quote/fee disclosure and confirmation |
| `src/api/support.ts`, `src/types/support.ts` | Authorized support case/message/status/escalation endpoints |
| `src/screens/SupportListScreen.tsx`, `src/screens/SupportNewScreen.tsx`, `src/screens/SupportThreadScreen.tsx` | Support list, contextual creation, conversations/replies and handler actions |
| `src/theme/forms.ts` | Shared native form/choice/error styles |
| `src/navigation/types.ts`, `src/navigation/RootNavigator.tsx` | Typed checkout and Support stack/tab routes |
| `src/screens/EventsScreen.tsx`, `src/screens/EventDetailsScreen.tsx` | Campaign landing, Choose tickets and event-help actions |
| `src/screens/MyTicketsScreen.tsx`, `src/components/TicketCard.tsx`, `src/api/tickets.ts` | Current-account copy, ticket support and PDF actions; QR behavior preserved |
| `src/types/ticket.ts` | Current ticket-type maximum/hidden flags |
| `package.json`, `package-lock.json` | SDK-compatible Expo Crypto dependency only |
| `tests/checkout-runtime.cjs`, `tests/checkout.test.cjs`, `tests/support.test.cjs`, `tests/live-purchase-support.test.cjs` | New controller/UI/HTTP integration regressions |
| `tests/attendee.test.cjs` | Existing QR test mock updated for the ticket-card action component |
| `mobile/README.md`, `docs/MOBILE_SYNCHRONIZATION.md`, this document | Current scope, parity, recovery and acceptance instructions |

## Tests and results

| Check | Result |
| --- | --- |
| Full existing/new mobile test set, including both opt-in live suites | 30 passed, 0 failed/skipped in the integration run |
| Relevant backend orders/purchase/support/check-in/staff/analytics suite | 65 passed; one upstream Starlette TestClient deprecation warning |
| `npx tsc --noEmit` | Pass |
| `npx expo lint` | Pass |
| `npx expo install --check` | Dependencies up to date |
| `npx expo-doctor` | 20/20 checks passed |
| iOS Metro export | Bundled successfully, 926 modules, in ignored `.expo/checkout-ios` |
| `git diff --check` | Pass |

Mobile regressions cover selection/stock/order limits, promo/campaign handling,
expired quotes, changed prices, duplicate taps, cross-screen races, malformed
success, 402 failure, 500/401 recovery, account/event storage isolation, resumed
refunded orders, support creation/replies/roles, and all existing QR/session/staff
cases. A real Docker run used the unchanged backend on port 8003 with separate
`biletflow_checkout_support_20261116` PostgreSQL data; no demo records were bought,
scanned, edited or deleted.

The live test drives the actual native purchase hook and mobile API modules,
renders the confirmation action, and verifies paid promo purchase (two 2,000 KZT
tickets discounted to 3,200), free purchase, My Tickets/PNG, staff admission and
duplicate rejection, refreshed used status, support messages/status/reopen/access
control, and stock changing between quote and purchase. It also drops a response
after the backend committed, remounts checkout, and verifies `repeated: true`
without increasing the order count. Existing live tests reverify organizer
analytics, staff revocation, search/undo/counters and session errors.

Headless views/hooks are test doubles for React Native. They do not prove native
layout, a physical camera scan, keychain behavior or universal links.

From `mobile`, normal regression/static checks:

```powershell
node --test tests/attendee.test.cjs tests/synchronization.test.cjs tests/checkout.test.cjs tests/support.test.cjs
npx tsc --noEmit
npx expo lint
npx expo install --check
npx expo-doctor
```

For live tests, start an API against a separate initialized test database, then:

```powershell
$env:MOBILE_TEST_API_URL='http://127.0.0.1:8003'
$env:MOBILE_PURCHASE_TEST_API_URL='http://127.0.0.1:8003'
node --test tests/live-backend.test.cjs tests/live-purchase-support.test.cjs
```

Live scripts create unique synthetic records and retain them in the isolated test
database. Never target shared demo or production data. The temporary API is
stopped after validation; main services, databases and volumes remain intact.

## Physical iPhone test instructions

1. Install locked dependencies (`npm ci`), set the existing local API URL to the
   reachable LAN backend, and run `npx expo start --lan`. Use SDK 58-compatible
   Expo Go and reload after adding Expo Crypto.
2. Register/sign in as a disposable attendee. Browse a future general-admission
   event, open details, select a type and quantity, and check name/limits/stock.
3. Apply a valid promo, remove it and try an invalid code. Paste a real campaign
   link on Events and verify correct event/code; another event's code must not be
   silently applied to the current checkout.
4. Review subtotal, discount, total and organizer fee. Change quantity/type and
   confirm old totals cannot be purchased. Wait over a minute and verify expiry
   requires refresh. Test sold out, closed registration and suspended/inactive sales.
5. Buy a free ticket and a simulated paid ticket. Rapid taps must create one order.
   Confirm the receipt and Open My Tickets, then compare the website under the same
   account. A failed request must never display purchase success.
6. During a disposable purchase, interrupt networking/background/force-close.
   Reopen checkout as the same account. Retry the saved attempt and compare order
   count/receipt; do not clear app storage to force a second purchase. A declined
   payment can be exercised through the existing backend's `simulate_payment: fail`
   test/API path; native checkout normally submits simulated success.
7. Show the purchased QR on one device/print and physically scan with a staff
   iPhone. Verify success, duplicate rejection and refreshed attendee status/QR
   hiding. Recheck manual search, confirmed undo, counters and revoked assignment.
8. From the ticket/event create support, then view it in Support. Reply as the
   organizer, change status/escalate where authorized, and reply as attendee.
   Verify drafts survive errors and unrelated accounts cannot open the thread.
9. Check PDF opening, keyboard scrolling, large text, VoiceOver, safe areas,
   native alerts, session restoration, app switching and timeout/retry behavior.

## Remaining functional gaps and deliberate boundaries

- Assigned-seat selection is disabled with an explanation. The backend supports
  it, but the current website also lacks a usable seat picker. This native flow
  completes general-admission free/paid purchasing; it is not a seating UI.
- Campaign links can be pasted/resolved inside the app. Automatic OS-level HTTPS
  universal-link association is not configured for Expo Go and is not claimed.
- Quotes do not reserve price/stock; final checkout remains authoritative. A
  binding quote guarantee would require a coordinated backend contract change.
- Native support has no attachments/push delivery and uses foreground polling.
  Backend support mutation idempotency is unavailable; uncertain sends require
  checking the thread/list before manual resend.
- Organizer event creation/editing/activation, ticket setup, campaign authoring,
  staff editing and detailed chart filters remain web/backend responsibilities;
  large management forms are deliberately not duplicated in this task. Existing
  native summaries/scanner tools work and remain available. Some setup interfaces
  are still absent from the current website despite the backend endpoints.
- Email verification/reset/inbox and platform-admin native UI were not added.
  Production payments, offline admissions and app-store distribution remain out
  of scope. Physical iPhone acceptance above is still required.
