# BiletFlow final system acceptance

- **Acceptance date** 25 November 2026, Asia/Qyzylorda
- **Branch** `feature/ui-redesign`, starting at `1b74a0e`
- **Main checked** Remote `origin/main` at `213e09de8353`, already an ancestor

## 1. Executive summary

**NOT READY — BLOCKING ISSUES REMAIN** for full SRS acceptance. The general-admission academic demonstration has rendered and automated coverage for event setup, simulated checkout, ticket issuance, organizer operations, and access control. The mandatory language coverage and general-admission reservation requirement remain open. Physical iPhone and printed-ticket acceptance require device access.

This pass closes anonymous and cross-account ticket asset access, requires sessions for checkout and seat holds, and verifies authenticated QR and PDF retrieval. It adds local MIME email capture with purchase attachments and removes verification and reset codes from API logs. It also fixes expired download recovery and copies historical event configuration into independent drafts. The redesigned catalogue header remains text-only. QA used disposable records and separate PostgreSQL databases.

## 2. Requirements and scope

[Requirements traceability CSV](REQUIREMENTS_TRACEABILITY.csv) maps 259 entries to code, platform, API, test, result, evidence, and remaining work. It covers SRS v0.3 §§3, 4.1–4.16, 5, 7, 8, 11 and 13.4, including the assigned-seating subsection and all 12 use cases. It also includes the 12 cross-platform acceptance scenarios. The CSV was imported back into a spreadsheet runtime and its 12 columns and unique row IDs were checked.

The [original SRS](BiletFlow_SRS_Initial_Draft.pdf) supplies requirement wording. [TASKS.md](TASKS.md) records the clarification that one Expo app serves attendee, organizer and door staff. Its checkbox history is advisory. [Architecture decisions](ARCHITECTURE_DECISIONS.md) document simulated KZT payments, event-scoped activation, web administration, and the deferred seat picker. [API contracts](DATA_MODELS_AND_APIS.md), [setup](SETUP.md), [demo script](DEMO_SCRIPT.md), [design system](UI_DESIGN_SYSTEM.md) and the [prior frontend audit](FRONTEND_FINAL_AUDIT.md) provide implementation and prior evidence.

**Evidence labels used below.** “Live” means the rendered interface communicated with the isolated API. “Browser regression” means rendered Chrome with controlled API responses. “API” means a test client or live request without interface interaction. “Prior” identifies results from an earlier pass. “Inspected” identifies source or render inventory only. “Open” means additional implementation or verification is needed. A screenshot proves a screen rendered in that state.

## 3. Screen and action inventory

### Website

| Route or surface | Available actions reviewed | Evidence and gaps |
| --- | --- | --- |
| Shared header, menu and fallback | Logo, Events, My tickets, My orders, Support, Notifications, role workspace links, sign in, register, sign out, language selection, mobile menu, Escape, skip link, unknown-route recovery | Four widths captured. Language coverage is uneven across pages. Full keyboard and screen reader coverage open. |
| `/` | Browse cards, search title/venue/category, category selector, open detail, clear filters, loading, empty, retry | Live Chrome catalogue and Android discovery. Text-only banner. Exhaustive filters and network states open. |
| `/events/:id` | View image, dates, venue, capacity and policy, report event, contextual support, calendar download, choose type/quantity, attendee name, promo apply/remove, refresh quote, buy, reopen confirmation, recover order | Live paid and free purchase, browser regression for promo recovery, closed and draft states, duplicate click and stale quote. Optional seat picker deferred. |
| `/login` | Sign in, password entry, reset link, sign-up link, return to guarded route | Live role sign-in and password-change sign-in. API tests for suspension, invalid password and expiration. |
| `/register` | Enter name/email/password, submit, sign in link | Live Unicode byte limit and registration. API tests cover duplicated accounts and disallowed privileged role registration. |
| `/verify-email` | Enter code, submit, resend, return to events | Live captured verification email. Complete resend and expired/replayed-code UI matrix open. |
| `/forgot-password`, `/reset-password` | Request reset, enter code, new and confirmation password, submit, return to sign-in | Live local mail and reset. Backend exercises wrong and reused codes. |
| `/my-tickets` and ticket dialog | Refresh on focus, current/inactive grouping, open/close, QR load/retry, download PDF, contextual support, active/cancelled calendar export | Live protected PNG and saved PDF. Browser covers historical and ineligible states, Escape and distinct labels. Physical print open. |
| `/my-orders` | List orders, refresh, open details, status, support, cancel eligible free registration, confirmations | API and browser evidence. Repeat all UI error states on fresh records. |
| `/notifications` | All/unread filter, manual refresh, mark all, error/retry, empty inbox | Live mark-read and browser failures, filter, repeat-click and expired session coverage. Causes such as payout changes need independent delivery acceptance. |
| `/support`, `/support/new`, `/support/:id` | Scope and status filters, case details, contextual identifiers, issue category, send/cancel, message history, reply, refresh, assignment, status changes, confirm/cancel escalation | Live conversation and organizer operations, browser-controlled errors, polling and response ordering. Complete rendered admin reply and interrupted-write recovery remain open. |
| `/organizer` | List/filter events, create, open, profile, organizer support | Live organizer workspace. Completed/cancelled and empty-state coverage varies. |
| `/organizer/new`, `/organizer/events/:eventId/edit` | Edit details, dropdowns, visibility, event/registration dates, capacity, cover file, validation, save/cancel, preview | Fresh live create, upload and draft preview. Prior edit and invalid input coverage. |
| `/organizer/profile` | Update contact/payout, simulate identity verification, save, error/retry | API and mobile profile regressions, Chrome capture. Fresh rendered edit/reload matrix open. |
| `/organizer/events/:eventId` | Overview, related pages, edit, preview, refresh, reuse historic configuration | Live reachability. Detailed duplicate-history recorded under E2E-10. |
| `…/setup` | Add/edit ticket type, price/stock, per-order limit, sale windows, hide, activate paid sales and accept terms, confirm publish/unpublish/cancel | Live create types, activation and publish, API lifecycle validation, prior cancel. |
| `…/promotions` | Create campaign, dates and type restrictions, limit, enable/disable, stats, open/close QR, share/copy link | Live restricted percentage campaign and QR. API fixed-amount precision, expiry and redemption-limit tests. All editing and error states open. |
| `…/attendees` | Filter/search attendee list, review admission and ticket information, refresh | Chromium render, live API, prior native reconciliation. Broad filter and empty-state actions open. |
| `…/orders`, `…/orders/:orderId` | Filter/search, open order, confirm/decline simulated refund or free cancellation, refresh after uncertainty, order tickets/accounting | Live orders, prior refund, browser and native regression for ambiguous refund recovery. |
| `…/analytics` | Date and ticket-type filters, capacity/sales, revenue/fees/payout, graph, campaigns, attendance, refresh | Live displayed report and exact API reconciliation for sampled paid/free/admission data. Remaining filters and date boundaries open. |
| `…/staff` | Create/invite or assign existing staff, search, confirm removal, duplicate handling and refresh | Live existing assignment. API and browser cover invite validation, removal and isolation. |
| `…/history` | Read timeline, action/date filters, paging, refresh, retained history | Live filtered staff revocation and retained records after cancellation. Automated pagination and permissions. |
| `…/support` | Scope event, filter status/assignee, open conversations | Live thread management, browser scope/filter regression. |
| `/admin` | Overview, operational counts, refresh and quick links | Live render. All links and counts need independent reconciliation. |
| `/admin/users` | Search, filter, suspend/reinstate, confirm/cancel | Live render, API coverage. Fresh write verification open. |
| `/admin/events` | Search, status, publish state, suspend/reinstate, freeze paid sales, reports | Prior affirmative live controls, live render in this pass and automated authorization. |
| `/admin/orders`, `/admin/payment-failures` | Search/filter orders, status, transactions/refunds, failure list, retry | Live render and browser coverage of failure guard, values, mobile view, no results and retry. |
| `/admin/moderation` | View reports and actions, act/dismiss, refresh, access event/support context | Live render and API coverage. Mutating actions and escalated threads need full rendered replay. |
| `/admin/money` | Activation, change fee/settings, payout list and status, promo statistics, operational CSV export | Live render, API coverage. Write and file contents acceptance open. |

Organizer routes marked `…` use `/organizer/events/:eventId`. Web administrative support uses the shared support paths with the admin workspace wrapper and server authorization.

### Expo SDK 58 application

| Stack and screen | Available actions reviewed | Evidence and gaps |
| --- | --- | --- |
| Session startup, sign-in and role gate | Restore session, sign in, password visibility, reset/register links, sign out, retry, platform-admin web guidance | Live Android attendee session. Prior organizer and staff roles. Physical iOS and full stale-token/restart matrix open. |
| `RegisterScreen`, `ForgotPasswordScreen` | Register with validation, request reset, submit new password and code, navigate back | Prior Android registration and keyboard evidence, API recovery; current Android local-outbox account workflow open. |
| `EventsScreen` | Search, open event, pull-to-refresh, campaign link input, loading/empty/retry | Live Android search and web-created catalogue entry. Prior deep link input and retry. |
| `EventDetailsScreen`, `CheckoutScreen`, purchase confirmation | Venue/time/cover, type choices, report, support, quantity/name/promo, fresh quote, buy, retry saved request and open tickets | Android render and live mobile integration. Regression cases cover stale, invalid, changed and late quotes. Detailed current-run record below. |
| `MyTicketsScreen` and ticket modal | Current/inactive list, refresh, QR load/retry, close, PDF share, contextual support, order history | Live Android showed the protected PNG. The ticket PDF reached the Android share sheet and rendered as one readable page in system print preview. |
| `OrderHistoryScreen` and order details | List, refresh, expand, receipt details, contextual support, eligible free cancellation | Automated and prior Android coverage. Native PDF hand-off and OS share destinations need separate device tests. |
| `SupportListScreen`, `SupportNewScreen`, `SupportThreadScreen` | List/filter, contextual request, category, draft, send, open, reply/refresh, organizer status, escalation where exposed | Mobile live client and prior Android conversations. Full network interruption and admin round trip open. |
| `NotificationsScreen` | View inbox, unread, refresh, mark read | Automated client evidence. Full notification kinds and source navigation open. |
| `OrganizerEventsScreen` | List, filter/navigation, refresh, New event, organizer profile | Prior Android rendered setup and current source verified. |
| New/Edit organizer event, `EventSetupScreen` | Details, changes, visibility and windows, create draft, edit, publish/unpublish/cancel, paid sales, ticket forms | Prior Android fixture creation and lifecycle tests. Rich file upload, preview and historical reuse handled in web workspace. |
| `OrganizerTicketTypeFormScreen` | Create/edit names, prices, stock, limit, sale windows, hide, validation | Prior rendered Android and native organizer-setup regressions. |
| `OrganizerProfileScreen`, `PaidSalesActivationScreen` | Edit contact and payout, verification, validate prerequisites, accept terms, confirm simulated fee, refresh | Mobile unit and prior isolated organizer-profile review. |
| `EventDashboardScreen`, `EventActivityScreen` | Refresh metrics, capacity/sales/attendance, navigate sections, activity entries and filters where exposed | Prior Android analytics; live API tests for authoritative data. Full web filter/report parity has separate coverage. |
| `EventStaffScreen`, `EventAttendeesScreen` | Assign/remove staff, search attendees, view status and refresh | Prior Android assignment/revocation and staff list. Native regression for stale scope. |
| `EventOrdersScreen`, organizer `OrderDetailScreen` | Filter/list, open order, confirm/cancel refund, reconcile uncertainty with refresh | Native automated recovery and prior Android refund reviews. |
| `EventPromotionsScreen` | Create, discount type/value/limits, list, enable/disable, share campaign link and QR | Native regressions and prior rendered actions. Full web date and type-restriction configuration is web workspace coverage. |
| `StaffEventsScreen`, `ScanScreen`, `StaffToolsScreen` | Select assigned event, camera permission, validate/admit, errors/retry, attendee/ID lookup, manual admit, confirm/cancel undo, counters | Current Android run opted out of the camera permission once and then granted it, admitted the ticket optically, and rejected duplicate, campaign and invalid codes. Manual search, cancel-undo, confirm-undo and re-admission all rendered, with the counter moving 1 → 0 → 1. Wrong-event, refunded and cancelled codes have prior optical and current server coverage. |

The source scan found unused development attendee and organizer identity settings. Removed them from the Expo configuration helper and environment template. Checkout, wallet and organizer actions use `SessionContext`. Placeholder strings used for fields or loading indicators remain in place.

## 4. Cross-platform scenarios

All dates, contacts and payment records used here are synthetic. Browser and Android share the localhost QA server and its own database. The baseline demonstration is general admission.

| ID | Preconditions, platform and steps | Expected and actual result | Status and evidence |
| --- | --- | --- | --- |
| E2E-01 | Chrome organizer and Android attendee and staff on one fixture. Create draft, upload and preview cover, add paid/free tiers, activate, publish, buy in Android, then scan the ticket optically. | Android found the Chrome-created event, rejected an invalid promotion, recovered to the regular quote, applied the valid discount and paid 4,000 KZT. The wallet rendered the protected QR and PDF. The virtual camera admitted it once and rejected repetition. Chrome analytics and the API reconciled one sale and one check-in. | **PASS**. `draft-preview-with-upload.png`, `organizer-android-purchase-confirmed.png`, agent-device scan result observations, `organizer-android-manual-search.png`, and `chrome-android-admission-reconciled.png`. |
| E2E-02 | Organizer signs in on the rebuilt Android APK, creates a draft for general admission, adds eight free tickets, and confirms publication. Chrome discovers the event and buys a ticket. Android attendee opens that ticket, then assigned Android staff admits it optically. | The same ticket ID suffix appeared in Android and the Chrome purchase record. The native camera admitted it once and rejected the repeat. Staff found the checked-in ticket by its eight-character suffix. After an authorized undo, the same ticket was admitted again and the count returned to one. | **PASS**. `organizer-android-debug-published.png`, `chrome-ticket-from-android-event.png`, `organizer-android-debug-web-purchased-ticket.png`, `organizer-android-debug-id-lookup.png`, and `organizer-android-debug-web-ticket-admitted.png`. |
| E2E-03 | Organizer creates a percentage campaign. Open its URL in Chrome, see the discount, buy and reconcile. Present the backend-generated campaign QR to Android staff. | Live checkout applied 20% and charged 4,000 KZT in the simulation. Organizer sees attributed redemption and revenue. Android optically recognized the exact campaign QR and displayed “Promo QR, not a ticket.” | **PASS**. `web/tests/live-integration.browser.test.mjs`, `organizer-android-optical-campaign-rejected.png`, `test_promo.py`, and `test_checkin.py`. |
| E2E-04 | Public no-charge tier. Chrome selects and buys, opens My Tickets, and cancels the unused order from My Orders. Reconcile with organizer and staff API. | Browser confirmed 0 KZT and a real PNG. Organizer analytics counted the registration. After the attendee confirmed cancellation, its ticket became Cancelled and the staff API returned `cancelled`. | **PASS** for the rendered web flow and API admission verification. `web/tests/live-integration.browser.test.mjs`, `test_purchase_rules.py`. |
| E2E-05 | Buy an unused paid ticket in Chrome. Repeat as organizer for the refund and as attendee for the wallet and inbox. | Chrome confirmed refund and attendee notification. The refreshed wallet hid the QR. The backend now denies generating a refunded PNG and omits it from a new PDF. Prior emulator showed the same refunded ticket. | **PARTIAL**. `refund-confirmed.png`, `wallet-refund-and-suspension.png`, prior Android audit, `test_refund_concurrency.py`. Fresh optical refund rejection remains open. |
| E2E-06 | Attendee opens a contextual case. Organizer replies, updates status, assigns and escalates. Web admin sends a reply from the escalated case. | Live Chrome and the isolated API confirmed thread, status, escalation and rendered admin send. Prior native organizer reply and attendee receipt observed. | **PARTIAL**. `support-conversation.png`, `admin-escalated-support.png`, browser and mobile live suites. Fresh cross-client interruption replay open. |
| E2E-07 | Web admin moderates disposable event with paid and free ticket types. Pause paid sales, test free selection, then suspend the event. | Current Chrome confirmed paid checkout blocked, free tier available under a payment freeze and event access restricted after suspension. | **PARTIAL**. `paid-freeze-checkout.png`, `admin-suspended.png`, `test_admin.py`. Mobile synchronization covered in the prior pass. |
| E2E-08 | Cancel published event, revisit attendee and organizer views. | Live retained history and cancelled calendar with stable UID; prior Android search removed cancelled event; earlier confirmation and cancellation notification proof. | **PARTIAL**. Live browser, `backend-python/tests/test_events.py` and prior audit. Fresh rendered cancelled-code scanner replay open. |
| E2E-09 | Register in Chrome, reject a Unicode password over 72 bytes, verify from captured mail, reset from captured mail, authenticate with new password, reload wallet. | Live browser verification and reset succeeded. The account retained verified status. | **PARTIAL**. `accounts.mjs` in local QA. Existing-ticket retention and fresh recovery on Android are open. |
| E2E-10 | Cancelled QA event with an existing simulated refund. Open History and Setup in Chrome, then duplicate and open the new draft. | Chrome displayed the retained refund and cancellation. The copy had an independent uploaded cover, full starting availability and zero orders. The original kept its order. | **PASS**. `historical-event-copied-to-draft.png`, `history-live.mjs`, `test_events.py`, `test_images_and_email.py`. Duplication is allocated to web. |
| E2E-11 | Interrupt quote, checkout commit response, refund, support and scan. Resume and reconcile. | Mocked request failures and late responses tested for checkout, refund and support. Prior Android scan interruption recovered. | **PARTIAL**. `promo-recovery.test.cjs`, `organizer-refund-recovery.test.cjs`, support suites. Fresh coordinated API outage on all four workflows open. |
| E2E-12 | Separate users and roles on a disposable database. Exercise protected assets and organizer/admin operations. | API rejects anonymous access and cross-account ticket detail/QR/PDF. Role and resource scopes also verified for organizer orders, staff assignments, support and admin. Legitimate Chrome download and mobile API succeeded. | **PARTIAL**. `test_purchase_rules.py`, `test_auth.py`, `test_support_management.py`, `test_admin.py`, live browser and mobile. Full unauthorized UI path matrix open. |

## 5. Defects and changes

| Severity | Finding and cause | Change and verification |
| --- | --- | --- |
| P0 | Ticket detail, QR and PDF could be opened by ticket ID without authentication. PDFs contain personal details and may contain an admission credential. | `orders.py` requires a session and owner match, returns 404 outside ownership, and marks responses private and non-cacheable. Both clients now fetch with the session. Added independent anonymous, owner, cross-account, organizer and ineligible-state coverage. |
| P1 | The legacy identity fallback let an unauthenticated request name a buyer or seat holder. | Checkout, wallet and seat hold require the token; the optional claimed ID must match. Concurrency fixtures now authenticate. |
| P1 | Regenerated inactive PDFs still contained a QR and an active-admission statement. | Print the existing ticket record with an unavailable-admission message. Valid tickets preserve their black-on-white QR. An earlier printout is still checked against server status. |
| P1 | The initial native image request omitted the bearer header in the rendered Android app, so protected QR requests returned 401. | The native QR component now uses the authenticated API client with its existing timeout and retries. It passes a local data URI to the image component. The same purchased ticket rendered after reloading the updated Android bundle. |
| P1 | Verification and reset secrets were emitted in the ordinary process log. | Capture actual MIME locally into an opt-in private .eml outbox. SMTP is bypassed when capture is configured. Notification logs record kind only. Rendered browser account flows and backend reset/attachment regression verify the change. |
| P1 | A historical duplicate pointed to the original event's uploaded cover and omitted registration windows. | Copy the window fields and independently duplicate the uploaded image in the same transaction. Chrome exercised the copy from a cancelled event with a refunded order. |
| P2 | Already verified accounts could accept the same verification code again. Password resets checked the current password before locking the account row. | Account verification now changes the verified state once. Password resets serialize token validation and password replacement. Auth regressions cover expired, reused and concurrent requests. |
| P2 | The manual lookup field accepted attendee names and emails only. An operator could see a printed ticket ID but could not search for it directly. | Search the assigned event for the full ID or its last eight characters through the existing route. Updated the Android label and validation. Focused tests cover exact IDs, uppercase UUIDs, suffixes, and unauthorized requests. |
| P2 | Unknown public links rendered an empty content area. | Added a localized error route and events link while keeping organizer fallback. |
| P2 | A calendar action could start against the anonymous view while the stored session was still loading. Session restoration replaced the action and aborted its request. | Calendar waits for session restoration. Calendar and PDF actions release their request locks and busy states in `finally`. Chrome covers calendar success, retry and anonymous links. Its harness also waits for the new document before reading the DOM and synchronizes the unread and support draft assertions. |
| P1 | Mobile dependency audit reported a critical `shell-quote` and high `zod` advisory. | Updated compatible lockfile resolutions. The second advisory scan reports zero high or critical findings. Moderate advisories remain. |

## 6. Automated verification

The browsed app uses real database state. Browser mocked suites and API integration are explicitly identified. Full command output and screenshots are local under Git-ignored `mobile/.expo/acceptance/`.

| Check | Command and environment | Outcome |
| --- | --- | --- |
| Backend full suite | `python -m pytest backend-python/tests -q` with `DB_HOST=127.0.0.1`, `DB_PORT=5433`, disposable `DB_NAME` | Final source 265 passed, 0 failed, 0 skipped, exit 0. FastAPI emitted one TestClient dependency deprecation warning. Initial run 258 passed and five legacy unauthenticated checkout fixtures failed. |
| Backend focused reruns | `python -m pytest backend-python/tests/test_checkout.py backend-python/tests/test_purchase_rules.py backend-python/tests/test_images_and_email.py backend-python/tests/test_migrations.py backend-python/tests/test_refund_concurrency.py -q` and `python -m pytest backend-python/tests/test_auth.py -q` | 34 passed and 12 passed, both exit 0. Separate event suite 19 passed, exit 0. The full run after event duplication was 264 passed before adding the last auth regression. |
| Ticket lookup and related scanner safety | `python -m pytest backend-python/tests/test_checkin.py backend-python/tests/test_refund_concurrency.py -q` | 14 passed, 0 failed, 0 skipped, exit 0, after the final lookup change. |
| Fresh and existing migrations | Initialize disposable DB with `docs/schema.sql`, run `python backend-python/migrate.py` twice and run `test_legacy_upgrade_preserves_orders_and_is_repeatable` | Two migration files applied once. Test upgrades a legacy schema and checks the order, custom fee and migration records survive the second pass. |
| Live Chrome | From web, `node --test tests/live-integration.browser.test.mjs` with `LIVE_API_URL=http://127.0.0.1:8126`, `TEST_BASE_URL=http://127.0.0.1:3126` | 1 passed, 0 skipped, exit 0. Browser saved an authenticated PDF and checked its signature. |
| Chrome regression | From web, `node --test --test-concurrency=1 'tests/*.browser.test.mjs'` with mocked API URL and `TEST_BASE_URL=http://127.0.0.1:3028` | 75 passed, 0 failed, exit 0. One live test skipped in the mocked run and passed in the isolated live run above. |
| Mobile regression including live | From mobile, `node --test --test-concurrency=2 'tests/*.test.cjs'` with `MOBILE_TEST_API_URL` and `MOBILE_PURCHASE_TEST_API_URL=http://127.0.0.1:8126` | 68 passed, 0 failed, 0 skipped, exit 0. Both live suites ran. |
| Web checks | `npm run build`, `npm run lint` | TypeScript/Vite and ESLint exit 0. |
| Mobile checks | `npx tsc --noEmit`, `npx expo lint`, `npx expo install --check`, `npx expo-doctor` | Exit 0, dependencies compatible, Expo Doctor 20/20. |
| Android local build | Gradle 9.4.1 `:app:assembleDebug -PreactNativeArchitectures=x86_64 -PreactNativeDevServerPort=8090 --max-workers=1 --offline --console=plain` with the local QA CMake init script | Exit 0, 73.6 MB debug APK. `adb install -r` passed and the BiletFlow package rendered. Initial attempts encountered the Windows path limit and native compiler resource limits. A shorter isolated Gradle cache, official newer Ninja binary and two native compiler jobs resolved both. |
| iOS JS | `npx expo export --platform ios --output-dir .expo/acceptance/ios-export-release` | Exit 0, Hermes bundle about 2.3 MB. Device installation and iOS native modules still need verification. |
| Python advisory scan | `python -m pip_audit -r backend-python/requirements.txt --timeout 5 --format json`, separate ignored audit environment | Exit 0. No known advisories reported for the resolved backend dependencies. |
| Repository | `git diff --check`, worktree inspection and QA ignore verification | Exit 0. See Git handoff. |

## 7. Security and reliability

- **Ownership.** Ticket ID download endpoints require both signed-in identity and ownership. Checkout and hold APIs derive actor identity from the token. Organizer and staff operational routes retain their own permission checks. Admission uses current server state even when a valid PDF was obtained earlier.
- **Concurrency and accounting.** Last-ticket, last-seat, promo-redemption and refund/admission safety have automated PostgreSQL transaction coverage. Order idempotency and uncertain response recovery are tested on both client code paths. The local HTTP smoke submitted 12 concurrent free orders for eight available tickets, issued eight unique tickets, and returned four sold-out responses. Checkout p50 was 621 ms and p95 was 768 ms. Eight concurrent QR admissions had p50 of 166 ms and p95 of 181 ms. The repeat scan was rejected and the counter finished at eight. These loopback readings exclude device camera time, WAN latency and production-scale load. General admission rechecks stock atomically in checkout and has no expiring pre-purchase hold.
- **Account protection.** Passwords are bcrypt-hashed. Roles and suspension are validated server-side. The demo creates verification/reset notifications in the account's own inbox. That convenience does not demonstrate independently controlled mailbox ownership. Consider this a production security gate alongside TLS, at-rest encryption, revocable sessions and mailbox delivery.
- **Local email.** The QA server ran with SMTP disabled. The outbox receives actual MIME and PDF data. Treat all mail, ticket files, passwords and QR captures as local-only QA material.
- **Backup and restore.** Reviewed `backup.bat`, `restore.bat`, and [backup documentation](BACKUP_RECOVERY.md). Used `pg_dump -Fc` on the QA database, created a separately named restore database, and used `pg_restore --exit-on-error` into it. Sampled counts matched for two migrations, three seeded events and two QA cover uploads. Shared volume and presentation tables were preserved. Production backup scheduling and off-host retention remain open.
- **Advisories.** Initial mobile audit found eight moderate, one high and one critical. Updated `shell-quote` within v1 and `zod` to the patched v4 line accepted by the lint plugin. Reaudit found eight moderate and no high or critical. Web audit found nine moderate and no high or critical. npm audit exits 1 for outstanding advisories. Major forced upgrades were avoided.

## 8. Visual, accessibility and localization

Rendered Chrome at 1440×900, 1024×768, 768×1024 and 390×844. The 39 captured views showed no measured horizontal overflow. Axe-core 4.14.1 reported zero WCAG-tagged violations in nine sampled states including catalogue, login, event details, checkout, wallet, organizer setup, admin orders, Russian mobile catalogue and Kazakh mobile wallet. At 390×844, keyboard input exercised the skip link, main focus, menu activation, tab order and Escape focus restoration. The new unknown-path recovery link returned to the catalogue. Remaining manual keyboard, assistive technology, zoom/reflow, long text and error-state coverage is open.

The `BiletFlow_API35` Android 15 Pixel 7-class emulator ran Expo Go and the rebuilt `com.biletflow.mobile` debug APK. The protected PNG reached the ticket modal and the downloaded PDF rendered after handoff to system Print. The preview included the correct event, venue, date, attendee, ticket ID and QR. Evidence is in `organizer-android-authenticated-qr.png` and `organizer-android-pdf-print-result.png`. No printer was selected. Physical printed QR acceptance remains open. The Expo Go floating development control partly overlapped some header actions. The debug bundle showed a development warning about the native Blob bridge for the small QR PNG.

English, Russian and Kazakh catalogue/wallet screenshots demonstrate some web translation and persistence. Organizer, account and support strings have gaps, and native remains English. Full customer-facing language coverage and a persistent native locale selector are missing. KZT/Almaty formatting is used by the application; translated validation copy and date/time output need a locale-specific acceptance matrix.

Web bundles Inter variable WOFF2 with Latin, Cyrillic and extended Cyrillic subsets (roughly 93 KB total) plus its SIL OFL file under `web/public/fonts`. The ticket PDFs embed DejaVu Sans 2.37. The full copyright and license notice was extracted from both bundled font files and added beside them. Native uses system fonts and ten bundled raster icons totaling roughly 18 KB. The 55,718-byte native catalogue photo arrived in redesign commit `1b74a0e`. The design documentation names the bundled file and use, with original artwork attribution and distribution rights still to confirm. Organizer-uploaded image delivery was verified through Chrome preview and the Android event detail. [DejaVu notice](../backend-python/fonts/LICENSE-DejaVu.txt) · [UI design system](UI_DESIGN_SYSTEM.md)

## 9. Remaining acceptance gates

- **Missing requirements, P1.** Full Kazakh, Russian and English customer-facing localization, and expiring general-admission checkout inventory reservation. Added coverage should preserve quote and idempotency guarantees.
- **Unverified requirements.** All administrative writes and exports, a coordinated interruption across all four workflows, physical printed QR, and full keyboard and assistive-technology coverage.
- **Web allocations.** Platform administration, richer event preview/upload and detailed reporting use the web workspace. Core attendee, organizer and staff roles remain in the one native app.
- **Bonus and excluded.** The team deferred interactive assigned-seat selection. Seat layout, holds and atomic seat sale already exist server-side. Calendar remains a supported web bonus. Offline check-in, GA4, real payments/payouts, production identity checks, resale, file attachments and app-store rollout stay under the documented scope decisions.
- **Production.** Audit transport encryption, secret management, log retention, session revocation, independent email proof, monitoring, load capacity and restore operations on the deployment target.

## 10. Physical iPhone acceptance

1. Install the SDK 58 developer build with the current FileSystem and Sharing native modules. Point it at an isolated API reachable from the phone.
2. Start cold, register a synthetic account, verify from the private outbox, sign in, force close and reopen. Try a second role and an expired session.
3. Open event search, details and checkout. Verify keyboard overlap and persistent accessibility labels. Attempt invalid promo, correct it, then complete a simulated purchase and reopen My Tickets.
4. Open the QR and download the PDF to Files. Reopen and print the PDF in grayscale, then confirm the physical camera admits its QR once.
5. Deny camera access, grant it in iOS Settings and scan again. Test duplicate, wrong-event and refunded tickets, plus a revoked staff assignment.
6. Verify selected language, KZT/date formats, Dynamic Type, VoiceOver, safe areas and back/navigation gestures when full locale support is available.

## 11. Repeatable demonstration

1. Start Docker Desktop. From the repository, run `docker compose up -d --build` for the documented local demo. Use a separately named database and API for any mutating rehearsals. Configure local mail using [email setup](EMAIL_SETUP.md).
2. With PostgreSQL reachable, set the isolated API process's `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_PASSWORD`, `PUBLIC_BASE_URL` and `BILETFLOW_EMAIL_OUTBOX`, and clear `SMTP_HOST`. From `backend-python`, run `python migrate.py` and `python -m uvicorn main:app --host 127.0.0.1 --port 8126`.
3. From `web`, set `VITE_API_URL=http://127.0.0.1:8126` and run `npm run dev -- --host 127.0.0.1 --port 3126`. From `mobile`, set `EXPO_PUBLIC_API_URL=http://10.0.2.2:8126` and run `npx expo start --port 8193 --localhost` for Android. Reverse the Metro port with `adb reverse tcp:8193 tcp:8193` for the Expo Go loopback URL. Reverse the debug package's remembered Metro port to the same server. In this run the debug package used `adb reverse tcp:8084 tcp:8193`.
4. Use isolated synthetic organizer, attendee and door staff accounts. Create a general-admission event with paid and free types, activate simulated paid sales and publish. Create the campaign and use its generated link at checkout. Review the confirmed price, open My Tickets, and scan through an assigned staff session.
5. Use a separate unused simulated paid order for the refund. Inspect the attendee's notification and inactive wallet state, then reconcile organizer totals. Use a distinct fixture for event cancellation or paid-sales suspension.

The following PowerShell commands show the QA ports. Run each service in its own terminal from the repository root. Set `BILETFLOW_QA_DB` to your already initialized disposable database and `BILETFLOW_QA_DB_PASSWORD` to its password before starting the API.

```powershell
# API terminal
$env:DB_HOST = '127.0.0.1'
$env:DB_PORT = '5433'
$env:DB_NAME = $env:BILETFLOW_QA_DB
$env:DB_PASSWORD = $env:BILETFLOW_QA_DB_PASSWORD
$env:SMTP_HOST = ''
$env:BILETFLOW_EMAIL_OUTBOX = Join-Path (Get-Location) 'mobile/.expo/acceptance/email'
$env:PUBLIC_BASE_URL = 'http://127.0.0.1:3126'
Set-Location backend-python
& ./.venv/Scripts/python.exe migrate.py
& ./.venv/Scripts/python.exe -m uvicorn main:app --host 127.0.0.1 --port 8126

# Website terminal
$env:VITE_API_URL = 'http://127.0.0.1:8126'
Set-Location web
npm.cmd run dev -- --host 127.0.0.1 --port 3126

# Mobile terminal, for the Android emulator
$env:EXPO_PUBLIC_API_URL = 'http://10.0.2.2:8126'
Set-Location mobile
npx.cmd expo start --port 8193 --localhost
```

## 12. Git handoff

Review these files together for a future commit.

- Backend `backend-python/db.py`, `security.py`, `routers/auth.py`, `routers/checkin.py`, `routers/events.py`, `routers/orders.py`, `tests/test_auth.py`, `tests/test_checkin.py`, `tests/test_checkout.py`, `tests/test_events.py`, `tests/test_final_integration.py`, `tests/test_images_and_email.py`, `tests/test_purchase_rules.py`, and root `docker-compose.yml`.
- Mobile `mobile/.env.example`, `app.json`, `package.json`, `package-lock.json`, `src/api/client.ts`, `src/api/tickets.ts`, `src/config/environment.ts`, `src/components/TicketCard.tsx`, `src/components/TicketQrCode.tsx`, `src/screens/MyTicketsScreen.tsx`, `src/screens/StaffToolsScreen.tsx`, `tests/attendee.test.cjs`, `tests/live-backend.test.cjs`, and `tests/live-purchase-support.test.cjs`.
- Website `web/src/App.tsx`, `src/components/CalendarButton.tsx`, `src/i18n.ts`, `src/pages/MyTicketsPage.tsx`, `tests/browser-helper.mjs`, `tests/checkout.browser.test.mjs`, `tests/live-integration.browser.test.mjs`, `tests/notifications-calendar-payments.browser.test.mjs`, and `tests/support.browser.test.mjs`.
- Documentation `docs/DATA_MODELS_AND_APIS.md`, `EMAIL_SETUP.md`, `SETUP.md`, `FINAL_SYSTEM_ACCEPTANCE_REPORT.md` and `REQUIREMENTS_TRACEABILITY.csv`.
- Bundled font notice `backend-python/fonts/LICENSE-DejaVu.txt`.

Screenshots, email captures, credentials, PDFs, QR posters, build caches and other QA material remain in ignored directories. Git tracks no contents under `mobile/.expo`, `mobile/android`, `mobile/.env`, the backend virtual environment or `backups`. The redesign branch already included main. No commits, pushes or merges were made during acceptance.
