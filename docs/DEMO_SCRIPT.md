# BiletFlow demo script (about 10 minutes)

Accounts (all passwords `demo1234`):

| Role | Email |
|---|---|
| Organizer | aigerim@example.com |
| Attendee | dana@example.com |
| Door staff | nurlan@example.com |
| Platform admin | admin@example.com |

Demo event already in the data: **Almaty Jazz Night**, promo code **SUMMER20** (20% off).

## Before the room (do this 30 minutes early, then again 5 minutes early)

1. `git pull`, then `docker compose down -v` and `docker compose up -d --build`. Wait until http://localhost:8000/docs opens.
2. `cd web`, `npm ci` (first time only), `npm run dev`. Open http://localhost:3000 in two browser windows: one normal, one private window. This lets you stay signed in as two people at once.
3. Phone: Expo app running with `EXPO_PUBLIC_API_URL=http://<your computer's Wi-Fi IP>:8000` in `mobile/.env`. Phone and computer on the same Wi-Fi (use a phone hotspot if the room Wi-Fi blocks devices).
4. Do the whole script once. Then reset again with step 1, so the demo starts clean.
5. Record a screen video of a good run. If anything fails live, play the video.

## The story (say this while you click)

BiletFlow lets an organizer sell tickets without a ticketing company: create an event, sell tickets, scan them at the door, and watch the numbers.

### 1. Organizer sets up an event (2 min), window 1
1. Sign in as **aigerim@example.com**. You land on My events.
2. Click **New event**: title, venue, start and end time, capacity 200. Click **Create draft event**.
3. On the **Set-up** tab, click **Publish event** first, to show the rule: it refuses and says to add a ticket type.
4. **Add ticket type**: `VIP`, 15000 KZT, 50 tickets. Add `Standard`, 5000 KZT, 100 tickets.
5. Click **Publish event**. The badge turns Upcoming.
6. Paid tickets need activation. Open **Profile** (top of My events) and show it is verified. Back on Set-up, tick the terms and click **Pay activation fee and activate** (simulated, no real money).
7. **Promotions** tab: create code `DEMO20`, 20%. Show the **QR code**. Say that the QR opens the event page with the discount applied, and that the server computes the discount so a link cannot change a price.

### 2. Attendee buys a ticket (2 min), window 2 (private)
1. Open the event list, sign in as **dana@example.com**, open your new event (use code `DEMO20`) or Almaty Jazz Night (use code `SUMMER20`). A code only works on its own event.
2. Choose a ticket type and quantity, enter the code (or open the campaign link from the QR). Show the server-calculated price and the reservation countdown. Change the quantity and verify the countdown keeps its original deadline. To show expiration on a disposable event, wait for the countdown and the 30-second cooldown, then refresh availability.
3. Buy it (simulated payment). Go to **My tickets** and show the QR code and the PDF link. To demonstrate recovery, interrupt the checkout response and retry the saved purchase. Verify there is one order in the attendee history.
4. Optional, show a failed payment is handled: the order is marked failed and nobody is charged.

### 3. Door staff scans (1.5 min), phone
1. Sign in to the mobile app as **nurlan@example.com**. He only sees events he is assigned to.
2. Scan Dana's ticket: green "valid". Scan it again: it is refused as already used. Scan a promo QR: refused (promo QRs are blue and cannot be mistaken for tickets).

### 4. Organizer watches and manages (2 min), window 1
1. **Overview/Analytics**: sold, checked in, revenue, the sales chart.
2. **Attendees**: search and CSV export. **Orders**: refund an order (use one that was not checked in).
3. **Door staff**: add or remove staff. **History**: the audit timeline shows every action above.

### 5. Support (1 min)
1. As Dana (window 2): **Support**, **New request**, write a question about an order.
2. As Aigerim (window 1): **Support**, open it, reply, change status. Click **Escalate to platform**. As Dana, open the unread notification to go directly to the conversation and check that the item was marked read.

### 6. Admin (1.5 min), sign out and sign in as **admin@example.com**
1. **Overview**: platform totals, and the settings (activation fee, processing fee). Download the orders CSV.
2. **Events**: suspend an event and reinstate it. Change a payout status (the organizer is notified). Freeze paid sales on an event.
3. **Users**: suspend and unsuspend a user. **Reports and promos**, **Fees and refunds**.
4. **Support cases**: the escalated case from step 5.

## What to say when asked

- **Payments are simulated.** Real payment providers are a later step. The order, fee and refund logic is real.
- **Seat maps**: the backend supports seat holds and assigned seating. The website sells general admission in this version.
- **Offline scanning** and **email delivery** are not included. Emails are stored as notifications.
- **One mobile app** for attendees, organizers and door staff, as the instructors asked.

## If something breaks

| Problem | Fix |
|---|---|
| Web page shows "Could not reach the server" | `docker compose up -d`, then reload |
| Missing columns or a database error after `git pull` | `docker compose down -v`, then `docker compose up -d --build` (wipes demo data and reloads it) |
| Phone cannot reach the API | Same Wi-Fi, correct IP in `mobile/.env`, restart Expo |
| Camera scanning fails | Enter the demo from the web instead, or play the recorded video |
| Anything else | Play the recorded video and keep talking |
