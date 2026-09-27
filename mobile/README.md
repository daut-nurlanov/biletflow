# BiletFlow mobile — Week 7

Attendee browsing and existing tickets, using the current FastAPI backend:

- **Events → Event details:** a native stack inside the Events bottom tab.
- **My Tickets:** a second bottom tab, currently using the configured demo attendee.
- Loading, empty, error/retry, and pull-to-refresh states on all applicable screens.

This keeps the existing Expo SDK, entry point, app configuration, and assets. React
Navigation is used as requested for this milestone, overriding the generic Expo
Router guidance in `AGENTS.md`.

## Run on an iPhone (existing local setup)

The database/schema/demo data and Python dependencies are already set up. Do not
recreate the container or reload SQL for this milestone.

1. Open Docker Desktop. From the repository root, check `docker ps`. If the existing
   container is stopped, run `docker start biletflow-db`.
2. Keep your existing FastAPI process if it already listens on your network. Otherwise
   open a terminal at the repository root and run:

   ```powershell
   cd backend-python
   python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```

3. In a separate terminal, run `ipconfig` and find the laptop's Wi-Fi IPv4 address.
   Keep the iPhone on the same Wi-Fi. From the repository root:

   ```powershell
   cd mobile
   npm ci
   # Only if .env does not already exist:
   Copy-Item .env.example .env
   ```

   Set `EXPO_PUBLIC_API_URL=http://YOUR_LOCAL_IP:8000` in `mobile/.env`, replacing
   `YOUR_LOCAL_IP` with that Wi-Fi address. Use the server origin, without `/api`.
   A local ignored `.env` can preserve the previous prototype's working address;
   update it when networks change. Do not use `localhost` on a physical phone.

   Leave `EXPO_PUBLIC_DEV_ATTENDEE_ID` blank to use Dana's existing demo record.
   The default UUID is defined only in `src/config/environment.ts`. You can override
   it with another existing test attendee ID in `.env`.

4. On the iPhone, open `http://YOUR_LOCAL_IP:8000/api/events` in Safari. Confirm the
   API responds before testing Expo. If it does not, check FastAPI's bind address,
   the Wi-Fi connection, and local firewall access to port 8000.
5. In the `mobile` terminal, run `npx expo start --lan`. Scan the terminal QR with
   the iPhone camera and open the app in Expo Go. Allow local-network access when
   prompted. The scanner feature is not part of the BiletFlow app yet; this QR
   simply opens the development app.
6. After changing `.env`, fully reload the app. If old values persist, restart Metro
   with `npx expo start --clear --lan`. `EXPO_PUBLIC_*` values are bundled client
   configuration, so never put passwords or tokens there.

## iPhone acceptance checks

1. Launch into **Events**. Confirm Almaty Jazz Night, Kazakhstan Concert Hall,
   a readable date/time, and Upcoming. Dates use the device's locale and time zone.
2. Tap the card. Confirm **Event details** shows capacity 300, Assigned seating,
   General Admission (4,500 KZT; initially 260 of 260 remaining), and VIP Balcony
   (9,000 KZT; initially 39 of 40 remaining). Current database values may differ
   after other team members test purchases. There is no purchase action.
3. Use the back button or swipe back, then open **My Tickets**. Dana Serik's seeded
   ticket should show Almaty Jazz Night and **Checked in**: the walkthrough already
   checks it in. No database IDs or QR hash should appear.
4. Pull down on each screen to refresh. Switch tabs, return to details, and confirm
   they fetch current data. Check scrolling, the iPhone notch/home indicator,
   large text settings, and VoiceOver labels.
5. Stop the FastAPI process temporarily (Ctrl+C in its terminal), then refresh each
   screen. Expect an error and **Try again**, with a timeout within about 15 seconds
   for a server that does not respond. Restart FastAPI with the same command and
   tap **Try again**; data should return. Keep Docker running throughout.
6. For the empty-ticket case, temporarily set
   `EXPO_PUBLIC_DEV_ATTENDEE_ID=00000000-0000-0000-0000-000000000000` in `.env` and fully
   reload. This unused test ID returns `[]` from the current API without database
   changes. My Tickets should say **You don't have any tickets yet.** Remove the
   override and reload to restore Dana.
7. Temporarily enter a malformed `EXPO_PUBLIC_API_URL`, reload, and confirm a
   configuration error instead of a crash. Restore the working value afterward.

A missing event's 404, empty event lists, events with no ticket types, free/sold-out
ticket types, and stale-request cancellation were checked in a local headless
harness. These cases do not require changing shared demo data to run normal demos.

## Code map

| File | Purpose |
| --- | --- |
| `App.tsx` | Safe-area provider, status bar, navigator |
| `.env.example` | Portable API origin and optional test-attendee configuration |
| `package.json`, `package-lock.json` | Navigation dependencies and development checks |
| `eslint.config.js` | Expo ESLint configuration |
| `src/config/environment.ts` | Single configuration location and demo attendee default |
| `src/api/client.ts` | Typed GET helper, FastAPI errors, timeout and cancellation |
| `src/api/events.ts` | Event list and detail requests |
| `src/api/tickets.ts` | Attendee ticket request |
| `src/types/event.ts` | Event status, event, and detail models |
| `src/types/ticket.ts` | Ticket status, joined ticket, and ticket-type models |
| `src/navigation/types.ts` | Typed tab and stack parameters |
| `src/navigation/RootNavigator.tsx` | Events native stack and two bottom tabs |
| `src/hooks/useApiResource.ts` | Shared loading/error/refresh lifecycle; aborts on blur |
| `src/screens/EventsScreen.tsx` | Live event list and navigation by event ID |
| `src/screens/EventDetailsScreen.tsx` | Fresh event details and real ticket inventory |
| `src/screens/MyTicketsScreen.tsx` | Existing tickets for the configured attendee |
| `src/components/AppButton.tsx` | Accessible button with disabled/loading support |
| `src/components/EventCard.tsx` | Event presentation and press callback |
| `src/components/TicketCard.tsx` | Ticket presentation without IDs or QR hashes |
| `src/components/StatusBadge.tsx` | Human-readable event/ticket status labels |
| `src/components/LoadingState.tsx` | Shared loading feedback |
| `src/components/ErrorState.tsx` | Error message and retry action |
| `src/components/EmptyState.tsx` | Shared empty-list feedback |
| `src/components/Screen.tsx` | Horizontal safe areas; navigation owns top/bottom insets |
| `src/theme.ts` | Small shared palette, spacing, typography, and layout styles |
| `src/utils/formatting.ts` | Device-local date/time and KZT/free price formatting |
| `README.md` | Architecture, running, validation, and milestone boundaries |

Cards receive props and never fetch. Screens use API modules through
`useApiResource`; memoize loaders that capture route parameters with `useCallback`.
The hook refreshes when a screen gains focus, aborts when it loses focus, and ignores
late results from cancelled requests. It does not cache or persist tickets.

## API contract and integration notes

Only these endpoints are called:

- `GET /api/events` — preserves server ordering and all returned statuses.
- `GET /api/events/{eventId}` — includes real `ticket_types`; only the ID is passed
  through navigation.
- `GET /api/tickets/my-tickets?attendee_id={configuredAttendeeId}` — includes
  `event_title` and `start_time` from the server joins.

Verified live: ticket-type `price` is a JSON **number**, while `description`,
`seat_category`, and sales timestamps are nullable in the schema. The formatter
also tolerates numeric strings without treating an empty string as a free ticket.
No mismatch was found for the three consumed endpoints. `Ticket` models the joined
My Tickets response, not the different single-ticket detail response.

`docs/TASKS.md` still mentions the old Express implementation. Also, the reference
docs mark event update/activation, ticket PDF, calendar export, and manual attendee
search as built, but this checkout's `backend-python/main.py` does not define those
routes. This milestone does not call them or modify the backend to add them.

The event API currently returns drafts and other non-public statuses. A TODO in
`src/api/events.ts` leaves publication/visibility decisions to the backend team;
the mobile client does not add an undocumented filter.

## Validation

From `mobile`:

```powershell
npx tsc --noEmit
npx expo lint
npx expo install --check
npx expo start --lan
```

Implementation validation included a successful iOS Metro bundle and 20 headless
JavaScript/API checks against the running PostgreSQL-backed FastAPI API and
simulated error responses: real screen content, event-ID navigation callback,
404, empty states, retry, refresh, price/date formatting, status labels, button
accessibility state, cancellation, and the 15-second timeout.

The temporary headless harness used mocked native views and navigation focus;
it does **not** prove native tab transitions, swipe gestures, Safe Area layout,
VoiceOver behavior, or physical iPhone rendering. Run the acceptance checks above
in Expo Go before marking the physical-device checks complete.

## Deferred work

- Real authentication/session integration; the configured attendee is development
  scaffolding, not an authenticated identity.
- Attendee checkout/payments (Week 8), assigned-seat selection, and promo codes.
- QR generation/display/scanning and Event Admin check-in (scanner milestone Week 9).
- Organizer mobile screens owned by Mobile #2; the broader mobile scope remains.
- Support/refunds until their backend endpoints are available; Platform Admin flows.
- Final designer-provided screens and full localization.

Runtime additions are only React Navigation native/native-stack/bottom-tabs,
`react-native-screens`, and `react-native-safe-area-context`. ESLint and
`eslint-config-expo` are development dependencies. No backend, schema, Expo SDK,
app configuration, or native-project changes are needed for this milestone.
