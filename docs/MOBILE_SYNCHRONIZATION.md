# Mobile synchronization with main

Historical synchronization milestone: the website-only purchasing decision below
was superseded by [Native mobile purchasing and support](MOBILE_PURCHASING_SUPPORT.md).
Use that report for the current attendee checkout/support scope and tests.

November 16, 2026. Base: `origin/main` at `3a7de06` (staff-management merge).
Fetched and confirmed current before creating `feature/mobile-final-sync` from
a clean checkout. No other working trees were changed. No commits, pushes,
merges, dependency upgrades or local `.env` changes were made.

## Website versus mobile parity

This comparison comes from the routes, screens, API modules and backend handlers,
with TASKS/DATA_MODELS_AND_APIS/ORGANIZER_MANAGEMENT used as references. Checklist
dates and older mobile milestone notes are not implementation status.

| Role / workflow | Latest web/backend | Mobile before this work | Mobile now |
| --- | --- | --- | --- |
| Attendee accounts | Registration, login/logout, bearer session | Already implemented through SessionContext/SecureStore | Preserved; explicit tests for token restoration, offline cached session and expired-session handling |
| Events | Public list uses `?public=true`; details include address, description, images, refund policy and sales windows | Same list, but public requests omitted session token and details showed fewer fields | Same public filter with bearer token; richer native details, bounded image loading, sale-window and unavailable-paid-sales information |
| Event dates | Website formats in Asia/Almaty | Phone time zone could differ; staff Today grouping also used phone time | All event timestamps and staff day grouping use Asia/Almaty, with an explicit time-zone label |
| Purchase and promo | Website quote/checkout/campaign landing | Deliberately absent | Remain on website; mobile explains that the same account receives those tickets |
| My Tickets | Authenticated joined ticket response and backend PNG | Already token-based; refresh on focus/pull; QR state rules already correct | Ticket type, venue and seat information added; resource also reloads on return from background, preserving QR rules, error/retry and image timeout |
| Organizer events | Own events, attendees, orders, analytics charts and staff management | Own-events list plus inventory calculations | Current analytics inventory, net revenue, refunds, estimated payout and attendance summary; platform-suspended paid-sales label |
| Organizer management | Staff create/assign/revoke and analytics are implemented on web; event creation/publication/activation APIs exist, but no corresponding setup routes were found in this web checkout | Limited native summary | Staff editing, setup and detailed charts remain website responsibilities per TASKS; no desktop screens duplicated |
| Scanner | Current verify endpoint enforces staff assignment/event/ticket; wrong-event response has no attendee data | Camera scan, cooldown and error/result states | Preserved, plus focus/background request cancellation, camera suspension and in-flight retry guard |
| Manual admission | Search, undo and attendance endpoints exist; TASKS sections 3/4 explicitly require these on mobile | Missing UI | New Attendees screen from scanner: name/email search, server-validated check-in, confirmed undo and attendance polling |
| Assignment changes | Revocation removes an event and makes scanner APIs return 403 | Event picker already token-scoped | Preserved and live-tested; permission refusal keeps the session, while expiry/account suspension signs out |

## Inconsistencies fixed

1. `VerifyQrResponse` incorrectly required personal fields for `wrong_event`.
   The type now permits the real minimal response. Old comments claiming the
   backend ignores `event_id` were removed.
2. SessionContext treated every 403 containing “suspended” as account suspension.
   Event/paid-sales suspension now remains a scoped error. Only 401 or explicit
   account-suspension 403 ends the session.
3. Returning to a still-focused ticket screen from another app did not fetch
   current admission status. Focused resources now reload on foreground and
   cancel background/blurred requests. Late responses cannot overwrite newer data.
4. Phone-local times disagreed with the website for travelers or differently
   configured devices. Timestamps and Today/Upcoming/Past grouping now share the
   website's Almaty time zone. Overnight events retain the existing running-event rule.
5. Event and ticket presentation omitted useful fields available from the API.
   Address, end time, description, image, refund/registration policy, ticket type
   and seat information are now shown where returned.
6. The organizer summary ignored the merged analytics API. It now uses current
   authoritative inventory and unfiltered money/attendance summaries. Paid-sales
   suspension takes precedence over the activation flag.
7. Mobile lacked the agreed manual-search/undo/count controls. They are added
   without backend changes or organizer staff-management duplication.
8. The scanner aborted requests only on unmount. Blur/background now cancels
   requests and prevents stale results; the camera is unmounted in the background.
   Repeated callbacks/retry taps are locked while a request is in flight.

## Using the updated mobile flows

- **Attendee:** sign in with the account used on the website. Events and details
  remain read-only. My Tickets shows all returned tickets and admission QR images
  only for valid tickets whose events are not cancelled/suspended. Refocus,
  foreground or pull down to fetch a check-in/refund/cancellation change.
- **Organizer:** open an owned event for the sales/attendance summary. Figures
  cover all dates; net revenue is before processing fees and estimated payout
  subtracts simulated fees. Setup, staff editing and chart filters remain on web.
- **Staff/organizer scanner:** select an event, then use **Attendees** in the
  scanner header for search and attendance. This header action is also available
  when camera access is denied. Search needs at least two letters of a name/email.
  Valid rows offer Check in; checked-in rows offer Undo check-in with native
  confirmation; cancelled/refunded rows have no admission action.
- Counters refresh every 15 seconds only while that screen is focused/active;
  the manual refresh button and successful mutations also refresh them. Polling
  never replaces an outstanding request. There is no push notification or offline
  admission queue.
- Manual operations always use the server with the staff token. The row's cached
  status never overrides backend eligibility. After an uncertain network failure,
  refresh/search before retrying: the server may already have completed the action.

## Changed files

All production changes are in `mobile/`; website/backend behavior is unchanged.

| Files | Purpose |
| --- | --- |
| `src/api/events.ts`, `src/types/event.ts` | Token-bearing attendee loaders, current event details and organizer analytics summary |
| `src/api/checkin.ts`, `src/types/checkin.ts` | Current wrong-event contract; authenticated manual search, undo and attendance requests |
| `src/types/ticket.ts`, `src/components/TicketCard.tsx` | Joined venue, ticket-type and seat presentation; admission QR rules preserved |
| `src/auth/SessionContext.tsx` | Correct distinction between account suspension and scoped 403 errors |
| `src/hooks/useApiResource.ts` | Foreground refresh, background cleanup and optional non-overlapping polling |
| `src/screens/EventsScreen.tsx`, `src/screens/EventDetailsScreen.tsx`, `src/screens/MyTicketsScreen.tsx` | Current-account loaders and richer attendee information |
| `src/components/EventImage.tsx` | Relative/absolute API image source, loading, error fallback and 15-second timeout |
| `src/screens/EventDashboardScreen.tsx` | Native analytics/attendance summary and paid-sales status |
| `src/components/AttendanceSummary.tsx`, `src/screens/StaffToolsScreen.tsx` | Mobile manual admission, confirmed undo, live counters and retry states |
| `src/screens/ScanScreen.tsx` | Staff-tools entry point, camera lifecycle and request locking |
| `src/navigation/types.ts`, `src/navigation/ScannerNavigator.tsx`, `src/navigation/RootNavigator.tsx` | Typed staff-tools route for door staff and organizer scanner |
| `src/utils/formatting.ts`, `src/utils/eventTiming.ts` | Website-consistent event time zone and day grouping |
| `tests/runtime.cjs`, `tests/synchronization.test.cjs`, `tests/live-backend.test.cjs` | Isolated native-view/hook regression harness and opt-in live mobile API integration |
| `mobile/README.md`, `docs/MOBILE_SYNCHRONIZATION.md` | Current overview and verification/acceptance instructions |

Paths in the table are relative to `mobile/` except the documentation row.
Expo SDK 58 versions, app configuration, authentication storage keys, role
selection, original ticket QR loader and current registration/login UI are preserved.

## Verification

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | Pass |
| `npx expo lint` | Pass, no warnings after fixes |
| `npx expo install --check` | Dependencies up to date |
| `npx expo-doctor` | 20/20 checks passed |
| Existing attendee plus new synchronization/live tests | 13 passed, no skips in the integration run |
| Relevant backend staff/check-in/analytics tests | 35 passed against isolated PostgreSQL; one upstream Starlette TestClient deprecation warning |
| `git diff --check` | Pass |

From `mobile`:

```powershell
node --test tests/attendee.test.cjs tests/synchronization.test.cjs
npx tsc --noEmit
npx expo lint
npx expo install --check
npx expo-doctor
```

The live test is opt-in and creates unique synthetic accounts/events/orders.
Point it at a separate test API/database, never production/shared demo data:

```powershell
$env:MOBILE_TEST_API_URL='http://127.0.0.1:8002'
node --test tests/live-backend.test.cjs
```

During this task the latest backend source was mounted read-only in a separate
Docker API on port 8002 using `biletflow_mobile_sync_20261116`. Main demo services
were not rebuilt or reset. Synthetic test records are retained in that isolated
database. The temporary API is stopped after testing; the database/volume remain.

The live test used the website's quote/checkout HTTP contract to issue a ticket,
then the actual mobile API modules to read it under the same attendee token,
load its PNG, search/scan it as staff, reject wrong-event/duplicate entry, observe
checked-in status, undo, compare attendance/analytics and verify revoked access.
This is HTTP integration, not a browser purchase or optical camera test.

Headless native-view tests cover session persistence/offline restore, scoped
403s/expiry, all 24 ticket/event QR status combinations, foreground cancellation,
polling cleanup/concurrency, manual search validation, single-submit check-in,
confirmation before undo, invalid-row controls and camera callback interruption.
Native rendering, keyboard, camera hardware and keychain behavior need a device.

## Physical iPhone acceptance plan

Use separate disposable rehearsal accounts/events and the same LAN backend for
web and mobile. Set `mobile/.env` locally to the reachable computer IP, use an
SDK 58-compatible Expo Go client, and run `npx expo start --lan`.

1. **Website purchase:** register/sign in as an attendee, buy a future
   general-admission ticket (free and simulated paid). Record which account was
   used. Confirm the website ticket and QR first.
2. **Ticket appearance:** sign into mobile as that same attendee. Confirm Events
   matches the public website list. Open the event and compare time (Almaty),
   venue/address, description, inventory and policy. My Tickets must show the
   website purchase with attendee/type/seat information.
3. **QR validity:** verify a valid QR loads without cropping/tinting. Check used,
   cancelled/refunded tickets and cancelled/suspended events after refresh: no
   admission QR. Temporarily lose the network to test image timeout/retry.
4. **Physical scanning:** use a second staff device to scan the actual ticket
   PNG from a screen or print. Confirm green success, correct attendee, vibration,
   automatic return and no immediate repeat scan. Present it again after cooldown:
   expect Already checked in. A campaign QR must be rejected; another event's
   ticket must report Different event without admitting it.
5. **Status synchronization:** pull attendee My Tickets to refresh, or background
   and reopen the app. The scanned ticket becomes Checked in and loses its QR.
   Search for the same attendee on staff's Attendees screen; confirm counters.
6. **Manual search and undo:** test name/email, short input, empty results and
   failed search retry. Check in a valid disposable ticket once. Undo a checked-in
   ticket, cancel once and confirm once; counters and search results must update.
   Refresh the attendee app and confirm the undone ticket's QR returns.
7. **Permissions:** revoke staff in the website. Refresh assigned events and
   confirm removal. A stale scanner/search/undo/count request must be refused,
   while the staff session stays signed in. Reassign and refresh again.
8. **Session and interruptions:** force-close/reopen; verify keychain restoration.
   Test expired tokens, account suspension, network failure during a scan and
   recovery. An interrupted scan may have reached the server; consult search
   before admitting again. Open Attendees and return mid-request to test blur.
9. **Native usability:** deny camera permission and use manual search; later allow
   access in Settings. Test torch, app switching, keyboard scrolling, large text,
   VoiceOver labels, safe areas and the two staff entry paths (door staff/organizer).

## Remaining limitations and next work

- Buying, promo entry, PDF/support flows, organizer setup/staff editing and full
  chart/filter dashboards remain website scope. No native checkout was added.
- Ticket statuses synchronize on focus/foreground/pull, not via push; attendance
  polling runs only on the Attendees screen. There is no offline scanner mode.
- User-facing account verification/reset/inbox screens and platform-admin UI are
  outside this focused mobile change. The website checkout still limits assigned
  seating; use general admission for the core demo.
- The main web checkout has no event creation/publication/activation setup routes
  despite backend support. Do not describe those as completed web forms merely
  because organizer event management, analytics and staff pages have merged.
- Native alerts/permissions and actual iPhone camera/QR readability are unverified
  until the acceptance plan above is run. Expo/static checks do not prove them.

Next priority: perform the website-to-iPhone two-device rehearsal, then fix any
device-specific issue found. After feature freeze, consider explicit timestamped
attendance freshness, clearer retry diagnostics and deep links to the configured
website only if they solve an observed demo problem. Coordinate further scanner
changes with its owner; preserve the agreed website-first purchasing boundary.
