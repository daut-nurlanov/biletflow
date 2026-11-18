# BiletFlow native visual QA — 17 November 2026

Tested the rendered Android application with Expo's recommended `agent-device`
tooling, including real form entry, scrolling, navigation, purchases, support
messages and camera barcode recognition. This was an Android emulator session;
no iPhone or iOS Simulator verification is claimed.

## Device, access and isolation

- Windows host; Pixel 7 AVD `BiletFlow_API35`, serial `emulator-5554`.
- Android 15 / API 35, x86_64, 1080 × 2400, density 420.
- Android Emulator 37.2.13; WHPX acceleration was already usable. No Windows
  feature changes, administrator configuration or reboot was needed.
- `agent-device` 0.21.39, EAS CLI 27.10.0, Expo SDK 58.0.26,
  React Native 0.88.1. Checked the SDK 58 documentation before API/config work.
- EAS authentication was available, but this app has no linked EAS project.
  `eas simulator:availability --json --non-interactive` could not complete its
  access check. Remote iOS availability therefore remains unknown. No project
  linking, paid simulator, account changes or cloud build was performed.
- Started with official Android Expo Go 58.0.5, then built and installed the
  app's own SDK 58 debug APK, package `com.biletflow.mobile`. Paid/free purchase,
  organizer and staff tests used that APK and its native modules.
- Free Android SDK/emulator/build downloads and generated native output are
  under ignored `mobile/.expo/device-qa/` and `mobile/android/`.
- Tested against a cloned database, `biletflow_visualqa_20261117`, through
  container `biletflow-visual-qa-api` on host port 8004. The original database
  and seed SQL were not modified. Live automated tests add their own synthetic
  accounts/events only to this clone.
- Used a separate Metro server on 8084 with process-only
  `EXPO_PUBLIC_API_URL=http://10.0.2.2:8004`. `mobile/.env` and the existing
  servers on ports 8000/8081 were preserved.
- Work is uncommitted on `fix/mobile-visual-qa`, starting from the existing
  promo recovery commit `fd32e4c`. No commit, push or merge was performed.

## Interactive results

Screenshots below are original emulator captures. The registration captures
were taken in Expo Go after the startup fix; the remaining native captures use
the app's own debug build unless explicitly labeled otherwise.

| Flow | Observed result | Screenshots |
| --- | --- | --- |
| Registration | Empty submission displayed name/email/password/confirmation errors. Valid registration created the attendee and opened authenticated Events. Tested normal Android soft keyboard. | [Validation](qa/2026-11-17/04-registration-validation.png), [keyboard](qa/2026-11-17/06-registration-real-keyboard.png), [registered](qa/2026-11-17/07-registration-result.png) |
| Login | Incorrect password showed a clear error without locking the form; correcting it signed in. Organizer/staff sign-in and sign-out also worked. | [Login](qa/2026-11-17/18-native-login-ready.png), [invalid password](qa/2026-11-17/19-invalid-login.png) |
| Events/details | Opened Almaty Tech Meetup, checked venue, dates, Almaty time, paid/free ticket types and availability. Details and checkout scrolled. | [Details, Expo Go](qa/2026-11-17/08-event-details.png) |
| Ticket selection | Switched paid/free types; entered quantity 11 above the limit of 10, then corrected to 2 and obtained a valid quote. | [Quantity keyboard, Expo Go](qa/2026-11-17/10-quantity-limit-keyboard.png) |
| Invalid promo recovery | `INVALID-PROMO` showed validation and disabled Buy. Removing it automatically restored a fresh full-price quote of 6,000 KZT. | [Invalid](qa/2026-11-17/20-native-invalid-promo.png), [removed](qa/2026-11-17/21-native-promo-removed.png) |
| Valid promo | `MEETUP10` on two Supporter tickets quoted subtotal 6,000, discount 600, total 5,400 KZT. Buy became enabled. A quote that expired during inspection correctly required refresh. | [Discounted quote](qa/2026-11-17/22-native-meetup10.png) |
| Simulated paid checkout | Completed one 5,400 KZT order issuing two Supporter tickets. Confirming state locked the controls, followed by the receipt. | [Paid confirmation](qa/2026-11-17/23-paid-checkout-result.png) |
| Free checkout | Completed a separate 0 KZT order issuing one Community ticket. Navigating to My Tickets and back retained its receipt after the fix. | [Free confirmation](qa/2026-11-17/26-free-confirmation.png), [return navigation](qa/2026-11-17/28-receipt-retained-after-navigation.png) |
| Tickets/QR | Backend PNG QR images rendered for valid purchased tickets. After staff check-in, the attendee saw Checked in, the used-ticket explanation and no admission QR. | [Valid QR](qa/2026-11-17/27-free-qr-ticket.png), [checked in](qa/2026-11-17/48-ticket-header-spacing-fixed.png) |
| Support | Created an event-linked request as attendee, opened it in the organizer inbox, sent a reply, signed back in as attendee and read that reply. All messages are synthetic QA content. | [Organizer reply](qa/2026-11-17/33-organizer-reply-sent.png), [attendee receives reply](qa/2026-11-17/47-attendee-reply-received.png) |
| Organizer/analytics | Opened Tech Meetup dashboard and per-ticket-type analytics. At that stage, SQL matched 7 sold / 150, 143 remaining, revenue 14,100 KZT, refunds 0, payout 13,677, 2 checked in / 7 registered. | [Dashboard](qa/2026-11-17/29-organizer-dashboard.png), [analytics](qa/2026-11-17/30-organizer-analytics.png) |
| Staff/manual tools | Assigned events loaded; empty search showed validation. Email search found the attendee's three tickets. Manual check-in changed attendance 2 → 3. Undo required confirmation and later reduced attendance 5 → 4; presenting the ticket to the camera again admitted it again. | [Search](qa/2026-11-17/37-staff-search.png), [manual admission](qa/2026-11-17/38-manual-check-in.png), [undo](qa/2026-11-17/45-undo-check-in.png) |
| Staff camera scanner | Granted Android camera permission; toggled flashlight state. With the emulator's virtual scene camera, actual barcode recognition checked in both paid tickets. Re-presenting a used QR displayed Already checked in and refused duplicate admission. | [Permission](qa/2026-11-17/35-camera-permission.png), [virtual camera](qa/2026-11-17/40-virtual-camera.png), [admitted](qa/2026-11-17/44-optical-scan-success.png), [duplicate rejected](qa/2026-11-17/43-optical-duplicate-rejected.png) |

Read-only SQL confirmed exactly two orders for the interactive attendee:

| Order | Total | Promo | Tickets |
| --- | --- | --- | --- |
| `8216c0cd-6437-4fe2-9516-e85d5176c488` | 5,400 KZT | MEETUP10 | 2 Supporter |
| `d9793cf6-19da-4101-8e4a-9d579dea366c` | 0 KZT | None | 1 Community |

Expired-quote attempts and tab navigation produced no extra orders. Automated
tests also passed duplicate-submission and lost-response recovery checks.
At the end, all three interactive tickets were checked in, making
attendance 5 checked in / 2 not arrived / 7 registered including existing demo
attendees. Earlier dashboard screenshots intentionally show the pre-staff-test
counts.

## Reproducible problems fixed

1. **Startup crash in the available Expo Go APK.** Importing checkout eagerly
   loaded `expo-crypto`, which threw `Cannot find native module 'ExpoCrypto'`
   before login could render. [Original error](qa/2026-11-17/01-launch.png).
   Crypto now loads only inside guarded purchase-key generation. A missing
   native module gives a clear build/update error without persisting a purchase
   attempt or submitting checkout. Secure UUID generation, idempotency and
   recovery remain intact. Native checkout succeeded in the app's own build.
   This mitigation does not repair Expo Go's native binary.
2. **Confirmation/selection disappeared after switching tabs.** Focus refresh
   replaced the entire CheckoutForm with a loading screen, unmounting its
   state. Cached event data now keeps the same form mounted through background
   refresh and refresh errors, with inline loading/retry feedback. A regression
   test failed before the fix, passed afterward, and the native free receipt
   survived My Tickets → Events navigation.
3. **Past event labeled Upcoming.** The staff list grouped Jazz Night under
   Past but rendered its stored `upcoming` status. A past event with an open
   stored status now displays Past; cancelled/suspended/completed/draft remain
   explicit. No database status or scanner rule was changed.
   [Before](qa/2026-11-17/34-staff-assigned-events.png),
   [after](qa/2026-11-17/39-staff-past-label-fixed.png).
4. **My Tickets header action touched the screen edge.** Added end padding to
   the tab header's right container. Verified the rendered Sign out label and
   button position. [Before](qa/2026-11-17/46-attendee-check-in-status.png),
   [after](qa/2026-11-17/48-ticket-header-spacing-fixed.png).
5. **Local QA launch stalled while Metro watched the SDK cache.** Added a Metro
   block-list entry for `.expo/device-qa`, preserving Expo's default exclusions.
   The isolated server then responded and served the app normally.

The initial `emulated` Android camera source produced a black feed. Switching
this test AVD to the official `virtualscene` source produced a working preview
and successful optical scans. No camera-code change was needed for that setup
issue. Other inspected screens wrapped their text and scrolled; no further
blocking layout or navigation problem was reproduced at this device size.

## Actual demo promotions

Read seed SQL, schema, quote validation and both the original database
(read-only) and isolated clone. No codes or seed data were invented/changed.

| Code | Event restriction | Discount | Limit | Original DB usage | Validity |
| --- | --- | --- | --- | --- | --- |
| MEETUP10 | Almaty Tech Meetup only | 10% of subtotal | 50 redemptions | 1 | Active; no valid_from/valid_until; all event ticket types |
| ROCK1000 | Astana Rock Night only | 1,000 KZT, capped at subtotal | 20 redemptions | 0 | Active; no valid_from/valid_until; all event ticket types |
| SUMMER20 | Almaty Jazz Night only | 20% of subtotal | 200 redemptions | 1 | Active; no valid_from/valid_until; all event ticket types; event is in the past |

The interactive paid order increased MEETUP10 usage only in the clone, from
1 to 2. The quote endpoint enforces event match, active state, optional ticket
type restrictions, start/end validity boundaries and redemption limit; ordinary
event, registration, sales and inventory restrictions also apply. Null validity
dates impose no additional campaign date limit. This does not make a past
event purchasable. See `backend-python/routers/orders.py`, `docs/schema.sql`,
`docs/demo_events.sql` and `docs/walkthrough_demo.sql`.

## Checks run

| Check | Result |
| --- | --- |
| `node --test tests/*.test.cjs` with both live-test API variables set to port 8004 | 46 passed, 0 failed, 0 skipped |
| `npx tsc --noEmit` | Passed; rerun after final header change |
| `npx expo lint` | Passed; rerun after final header change |
| `npx expo install --check` | Dependencies up to date |
| `npx expo-doctor` | 20/20 checks passed |
| Android x86_64 `:app:assembleDebug` | Passed; APK installed and exercised |
| `git diff --check` | Passed |

Tests cover the existing invalid→remove, invalid→valid, valid→invalid→valid,
network error→retry and out-of-order quote cases, plus new missing-native-crypto,
checkout refresh preservation and staff past-label regressions. Live HTTP tests
also exercise quote/checkout, ticket PNG, duplicate scanning, staff permissions,
analytics and support. Race/timeout coverage in those automated tests is not
claimed as manual reproduction of every network timing on the emulator.

## Repeating the interactive tests

The emulator, isolated API on 8004 and Metro on 8084 were left running for
review. The app is signed in as the synthetic attendee. Build caches and the
isolated database were retained; the temporary B: build alias and QA Gradle
daemon were removed/stopped. No permanent environment variables were set.

From `mobile` in PowerShell, with the existing QA services available:

```powershell
. ./.expo/device-qa/Use-AndroidQa.ps1
adb -s emulator-5554 reverse tcp:8084 tcp:8084
npx --yes agent-device@0.21.39 open com.biletflow.mobile --platform android --serial emulator-5554 --session biletflow-visual --metro-host 127.0.0.1 --metro-port 8084 --no-test-ime
npx --yes agent-device@0.21.39 snapshot -i --session biletflow-visual
npx --yes agent-device@0.21.39 screenshot ./.expo/device-qa/review.png --session biletflow-visual
```

For a new Metro process, set `EXPO_PUBLIC_API_URL=http://10.0.2.2:8004` in that
PowerShell process before `npx expo start --port 8084 --localhost`. Do not use
the checked-in LAN URL when targeting this isolated API from the emulator.

Use a newly registered attendee to repeat purchases. Organizer and staff demo
fill buttons are available in the debug build. Choose Tech Meetup, two
Supporter tickets, try an invalid code, remove it, then apply MEETUP10 and verify
6,000 − 600 = 5,400 before buying. Repeat with one Community ticket for 0 KZT.
Switch to My Tickets and back to confirm the receipt remains. Create a support
request, sign in as organizer Aigerim to reply, then return as attendee to read
it. Sign in as staff Nurlan to search the attendee email and check in/undo.

For repeatable camera input, use the emulator's virtual scene source when
launching it (`-camera-back virtualscene`). Download a fresh valid ticket's
backend PNG to a local file, then:

```powershell
adb -s emulator-5554 emu virtualscene-image wall C:/absolute/path/ticket.png
adb -s emulator-5554 emu virtualscene-image table C:/absolute/path/ticket.png
adb -s emulator-5554 emu automation play "$sdkRoot/emulator/resources/macros/Walk_to_image_room"
```

Keep the real native scanner open. Observe the green admission result, followed
by duplicate rejection if the used QR stays in view. This tests virtual-camera
barcode recognition, not a physical lens, focus, flash or lighting conditions.

## Limits and remaining verification

- Remote iOS Simulator access, iPhone safe areas/keyboard, physical iPhone
  camera and native iOS build were not tested. Linking EAS/account changes and
  any paid remote session still need the user's authorization.
- No real payment provider or money was involved; both paid and free orders
  used the backend's simulated success flow.
- Physical flashlight output, low-light/damaged QR performance, other screen
  sizes and large accessibility font settings remain unverified.
- Cancelled/refunded/suspended QR combinations and network races have automated
  coverage; they were not all recreated interactively by altering demo records.
- Website checkout already calls quote/checkout and supports promo codes in
  `web/src/pages/EventDetailPage.tsx`; the website was not visually retested here.

## Modified files

- `mobile/app.json` — Android package for the local native build.
- `mobile/metro.config.js` — excludes the local QA tool cache from Metro.
- `mobile/src/hooks/useCheckout.ts` — guarded lazy native crypto import.
- `mobile/src/screens/CheckoutScreen.tsx` — retains form/receipt during refresh.
- `mobile/src/components/StaffEventCard.tsx` and `StatusBadge.tsx` — Past badge.
- `mobile/src/navigation/RootNavigator.tsx` — My Tickets header spacing.
- `mobile/tests/checkout-runtime.cjs`, `checkout.test.cjs`,
  `checkout-screen.test.cjs`, `synchronization.test.cjs` — regression coverage.
- This report and screenshots under `docs/qa/2026-11-17/`.

Official tooling references:
[Expo agent-device](https://docs.expo.dev/agents/agent-device.md),
[EAS Simulators setup](https://docs.expo.dev/eas/simulators/get-started.md),
[EAS simulator billing](https://docs.expo.dev/eas/simulators/reference/usage-and-billing.md),
[Android virtual camera](https://developer.android.com/studio/run/emulator-use-camera),
[emulator console](https://developer.android.com/studio/run/emulator-console),
[Expo SDK 58](https://docs.expo.dev/versions/v58.0.0/).
