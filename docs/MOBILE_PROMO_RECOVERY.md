# Native checkout promo recovery

Implemented on `fix/mobile-promo-quote-recovery`, based on `origin/main` at
`48091b1b99444a41e93dc3e4398a8573452e5212`. The working tree was clean before
creating the branch. No commit, push or merge was performed.

## Reproduction and cause

Two regression tests reproduced failures before the fix:

- Apply an invalid code in the actual checkout form, then clear its visible
  field. `CheckoutScreen` owned a separate input draft, so the hook still used
  the rejected code and Buy remained disabled. Editing that draft also left an
  older successful quote eligible until Apply was pressed.
- Fail the quote request with a network error, then apply the same code again.
  The quote loader depended on the unchanged input values, so it did not run
  again and the error continued to disable Buy.

`CampaignEntry`, the shared request client and the quote endpoint were also
inspected. The server correctly rejects invalid promotions; the client already
has a 15-second request timeout and abort handling. No API or database change
was needed.

## Behavior after the fix

The hook owns the displayed promo input. Each edit immediately invalidates the
previous quote and schedules recalculation after 350 ms; Apply can run it
immediately. Clearing the field or pressing Remove promotion requests a fresh
quote without a promotion. Input and Remove remain available while a campaign
link is resolving.

Promo validation appears beside the field with instructions to correct or remove
the code. Network errors remain distinct and can be retried with Refresh quote
and availability or by reapplying the same code. A code is described as applied
only after a successful server quote.

Each selection/edit/retry has a quote revision. Results and errors must match
the current selection and revision. Older request responses, queued debounce
callbacks and purchase handlers captured before an edit cannot authorize a
purchase. Purchase still revalidates the successful quote immediately before
checkout, compares all prices/discounts, and rejects changed prices. Expired
quotes remain blocked.

Saved attempts retain their original payload and idempotency key. Promo edits
and refresh actions cannot change an in-flight or recoverable attempt. The
account/event purchase lock, persist-before-submit behavior, ambiguous-response
recovery and duplicate-submission guard remain in place.

## Verified demo promotions

Read-only inspection of the local `biletflow` database on **2026-11-17**, plus
`docs/walkthrough_demo.sql`, `docs/demo_events.sql`, `docs/schema.sql` and
`backend-python/routers/orders.py`, found exactly these three campaigns:

| Code | Event restriction | Discount | Redeemed / limit | Current applicability |
| --- | --- | --- | --- | --- |
| `SUMMER20` | Almaty Jazz Night (`44444444-4444-4444-4444-444444444444`) | 20% of the order subtotal | 1 / 200 | Campaign enabled, but the event ended on 2026-10-14. Checkout rejects it even though its stored status says upcoming. Assigned seating is also outside the native checkout's current scope. |
| `MEETUP10` | Almaty Tech Meetup (`44444444-4444-4444-4444-444444444445`) | 10% of the order subtotal | 0 / 50 | Enabled and applicable to this upcoming general admission event. A Supporter ticket is 3,000 KZT before discount and 2,700 KZT after discount. A free Community ticket stays free. |
| `ROCK1000` | Astana Rock Night (`44444444-4444-4444-4444-444444444446`) | 1,000 KZT off the order subtotal, capped at the subtotal | 0 / 20 | Enabled for the upcoming event. Assigned seats require the website's seat-selection flow. |

All three have null `valid_from` and `valid_until` (no campaign-specific date
expiry), `is_active = true`, and no ticket-type restriction (`ticket_type_ids`
is null). Their events are public, paid sales are active and unsuspended, and the
organizer is not suspended. Registration and ticket-type sales windows are unset.

Independent event expiry still applies. In the current database, the Jazz event
has no end time and therefore expires two hours after its start: **2026-10-14
21:00 +05:00**. Tech Meetup ends **2026-11-20 21:00 +05:00**; Rock Night ends
**2026-11-28 23:30 +05:00**. The demo event seed calculates future dates relative
to the day it is loaded; the dates above are the actual stored dates, not a new
seed run.

The backend matches the trimmed, uppercase code against the selected event. It
also checks campaign activation, optional ticket types, optional start/end times
and redemption limits. Percentage discounts are rounded to two decimal places;
fixed discounts apply once to the order subtotal. Each successful order consumes
one redemption, regardless of ticket quantity. Refund/cancellation restores that
count. Inventory, sales windows and event restrictions must also pass.

The demo database and seed files were not modified. Synthetic regression codes
and generated live-test campaigns exist only in test fixtures and the isolated
`biletflow_checkout_support_20261116` database.

## Verification and manual check

From `mobile`, run:

```powershell
node --test tests/*.test.cjs
npx tsc --noEmit
npx expo lint
npx expo install --check
npx expo-doctor
```

The two live tests are opt-in. They create accounts, events and orders, so point
them only at an API using an isolated test database. For this run, the existing
test API at port 8003 was verified to use `biletflow_checkout_support_20261116`:

```powershell
$env:MOBILE_TEST_API_URL = 'http://127.0.0.1:8003'
$env:MOBILE_PURCHASE_TEST_API_URL = 'http://127.0.0.1:8003'
node --test tests/*.test.cjs
```

All 43 tests passed, including both live HTTP tests and 13 new promo regressions.
The live purchase test now verifies invalid-promo removal and correction using
real server validation before checkout. Existing tests still verify quote expiry,
stock/price changes, paid/free purchases, lost responses, saved keys, scanner
behavior and role permissions.

The Expo compatibility check required the SDK patch from 58.0.25 to 58.0.26;
`expo install` updated `mobile/package.json` and its lockfile while retaining SDK
58 and the existing navigation/native configuration.

For a device check, sign in as an attendee, open Tech Meetup and select Supporter.
Enter an intentionally invalid value and wait for validation: Buy must disable.
Clear it: after a new quote succeeds, the total must return to 3,000 KZT and Buy
must enable. Enter `MEETUP10`: the confirmed total must become 2,700 KZT. Repeat
valid/invalid/valid edits quickly; only the last value may determine the total.
Disconnect networking during a quote, reconnect and refresh; purchasing must
remain blocked until the new quote succeeds. Complete a simulated purchase and
verify its tickets in My Tickets. Physical-device layout and keyboard behavior
still require this manual check.

## Changed files

- `mobile/src/hooks/useCheckout.ts`: synchronized promo state, validation and
  quote revision/retry guards.
- `mobile/src/screens/CheckoutScreen.tsx`: hook-owned input, Remove control and
  field-level feedback.
- `mobile/tests/promo-recovery.test.cjs`: removal, correction, discounted purchase,
  repeated edits, retry, response races, stale handlers, campaign cancellation,
  preflight rejection, queued debounce and saved-attempt regressions.
- `mobile/tests/checkout.test.cjs`: expect campaign validation beside the promo
  field.
- `mobile/tests/live-purchase-support.test.cjs`: real API promo recovery before
  checkout.
- `mobile/package.json` and `mobile/package-lock.json`: compatible Expo SDK patch.
- `docs/MOBILE_PROMO_RECOVERY.md`: findings, actual promotion rules and checks.
