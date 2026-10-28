# BiletFlow: Data Models & API Reference

This document explains how BiletFlow stores information and how the different parts of our app talk to each other. It's written so that **anyone on the team can understand it, even with zero coding background.**

This version reflects what is **actually built and running** in `backend-python/` (`main.py` plus the files in `routers/`) and `docs/schema.sql`. The endpoint list in Section 3 was checked against the code by a script, and 104 automated tests cover it.

---

## Section 1: Plain-English Glossary (The "ELI5" Guide)

### 1. Database
**Analogy: A giant, organized Excel spreadsheet where the app saves info permanently.**

Every time someone creates an account, buys a ticket, or publishes an event, that information has to live *somewhere*, otherwise it would disappear the moment you closed your browser. The database is that permanent storage. Instead of one messy spreadsheet, it's actually many smaller spreadsheets (called **tables**) linked together, one for Users, one for Events, one for Tickets, and so on.

### 2. Data Model / Schema
**Analogy: The column headers in that spreadsheet, like `Name`, `Email`, `Price`.**

If the database is the spreadsheet, the **data model** (also called a **schema**) is the blueprint that says what columns each spreadsheet tab has, and what kind of information goes in each column.

### 3. API (Application Programming Interface)
**Analogy: A restaurant waiter carrying orders back and forth between the customer at the table and the kitchen.**

The website or app you see on your screen (the "customer") never touches the database (the "kitchen") directly. The API is the waiter, it carries the request and brings back the answer.

### 4. Endpoint
**Analogy: A specific item on a menu, like ordering "the list of events."**

An **endpoint** is one specific thing you can ask the waiter for. `GET /api/events` is like pointing at "Today's Events" on the menu, a specific, predictable request with a specific, predictable kind of answer.

### 5. JSON
**Analogy: A simple, standardized to-go box used to package data for delivery.**

**JSON** is plain text, organized in a simple `"label": value` pattern, used to package data traveling between the website and the server.

---

## Section 2: Database Models (The Actual 20 Tables)

Every table below exists right now in `docs/schema.sql`, already built and tested. The last four (`notifications`, `paid_sales_activations`, `platform_settings`, `event_reports`) were added on Oct 28.

### `users`
*Account details for attendees, organizers, event admins, and platform admins.*

| Field | Type | Plain-English | Required? |
|---|---|---|---|
| `id` | UUID | Unique ID, generated automatically | Yes |
| `email` | Text | Login email, must be unique | Yes |
| `password_hash` | Text | Password, stored scrambled (bcrypt), never in plain text | No |
| `full_name` | Text | Their real name | Yes |
| `role` | Text (fixed list) | `attendee`, `organizer`, `event_admin`, or `platform_admin` | Yes |
| `is_email_verified` | True/False | Have they entered the verification code (sent as a simulated email, see `notifications`) | Yes, defaults to false |
| `is_suspended` | True/False | A platform admin blocked this account; login and every token stop working | Yes, defaults to false |
| `created_at` | Date + time | When the account was created | Yes, set automatically |

### `organizer_profiles`
*Extra details only organizers have.*

| Field | Type | Plain-English | Required? |
|---|---|---|---|
| `id` | UUID | Unique ID | Yes |
| `user_id` | UUID | Which user this profile belongs to | Yes |
| `contact_phone` | Text | Phone number | No |
| `payout_account_details` | Text | Where earnings would go (sandbox only right now) | No |
| `paid_sales_verified` | True/False | Whether they've passed verification | Yes, defaults to false |

### `events`
*One event an organizer has created.*

| Field | Type | Plain-English | Required? |
|---|---|---|---|
| `id` | UUID | Unique ID | Yes |
| `organizer_id` | UUID | Who owns this event | Yes |
| `title` | Text | Event name | Yes |
| `venue_name` | Text | Where it's happening | Yes |
| `start_time` | Date + time | When it starts | Yes |
| `capacity` | Number | Max attendees | Yes, defaults to 100 |
| `status` | Text (fixed list) | `draft`, `upcoming`, `active`, `completed`, `cancelled`, or `suspended` | Yes, defaults to draft |
| `has_assigned_seating` | True/False | Seat map or general admission | Yes, defaults to false |
| `is_paid_sales_active` | True/False | Can this event charge money yet | Yes, defaults to false |
| `paid_sales_suspended` | True/False | A platform admin froze paid sales for this event | Yes, defaults to false |
| `description` | Text | What the event is about | No |
| `category` | Text | e.g. music, conference | No |
| `venue_address` | Text | Street address | No |
| `end_time` | Date + time | When it ends (calendar export falls back to 2 hours if empty) | No |
| `visibility` | Text (fixed list) | `public`, `unlisted`, or `private` | Yes, defaults to public |
| `created_at` | Date + time | When it was created | Yes, set automatically |

> Only events with status `upcoming` or `active` can be bought into. `draft`, `completed`, `cancelled` and `suspended` events cannot sell tickets.

### `ticket_types`
*One pricing tier for an event, like "General Admission" or "VIP."*

| Field | Type | Plain-English | Required? |
|---|---|---|---|
| `id` | UUID | Unique ID | Yes |
| `event_id` | UUID | Which event this belongs to | Yes |
| `name` | Text | e.g. "VIP Balcony" | Yes |
| `description` | Text | Extra details | No |
| `price` | Number (KZT) | Cost, 0 means free | Yes, defaults to 0 |
| `total_quantity` | Number | Total tickets of this type | Yes |
| `quantity_available` | Number | How many are left right now | Yes |
| `seat_category` | Text | Which seat category this maps to (`premium`, `standard`, `accessible`), only used for assigned seating | No |
| `sales_start_time` | Date + time | When it becomes purchasable | No |
| `sales_end_time` | Date + time | When it stops being purchasable | No |
| `max_per_order` | Number | Most tickets one order may contain | Yes, defaults to 10 |
| `is_hidden` | True/False | Hidden from the public ticket list | Yes, defaults to false |

### `seats`
*One physical seat, for assigned-seating events.*

| Field | Type | Plain-English | Required? |
|---|---|---|---|
| `id` | UUID | Unique ID | Yes |
| `event_id` | UUID | Which event this seat belongs to | Yes |
| `section` | Text | e.g. "A" | Yes |
| `row_label` | Text | e.g. "1" | Yes |
| `seat_number` | Text | e.g. "12" | Yes |
| `category` | Text (fixed list) | `premium`, `standard`, or `accessible` | Yes |

### `seat_holds`
*A temporary claim on a seat while someone is checking out.*

| Field | Type | Plain-English | Required? |
|---|---|---|---|
| `id` | UUID | Unique ID | Yes |
| `seat_id` | UUID | Which seat is being held | Yes |
| `held_by_user_id` | UUID | Who's holding it | No |
| `expires_at` | Date + time | When the hold releases automatically | Yes |
| `status` | Text (fixed list) | `active`, `expired`, or `converted` | Yes, defaults to active |
| `created_at` | Date + time | When the hold started | Yes |

> Only one **active** hold can ever exist per seat at a time, enforced by the database itself. This is what stops two people from buying the same seat.

### `orders`
*One checkout transaction.*

| Field | Type | Plain-English | Required? |
|---|---|---|---|
| `id` | UUID | Unique ID | Yes |
| `attendee_id` | UUID | Who placed the order | Yes |
| `event_id` | UUID | Which event it's for | Yes |
| `total_amount` | Number (KZT) | Final amount charged | Yes, defaults to 0 |
| `status` | Text (fixed list) | `pending`, `paid`, `refunded`, or `cancelled` | Yes, defaults to pending |
| `payment_reference` | Text | Sandbox payment ID | No |
| `promo_code_applied` | Text | Discount code used, if any | No |
| `created_at` | Date + time | When the order was placed | Yes |

### `tickets`
*One individual, scannable admission ticket.*

| Field | Type | Plain-English | Required? |
|---|---|---|---|
| `id` | UUID | Unique ID, tied to the QR code | Yes |
| `order_id` | UUID | Which order this came from | Yes |
| `event_id` | UUID | Which event it admits to | Yes |
| `ticket_type_id` | UUID | Which pricing tier | Yes |
| `seat_id` | UUID | Which seat, only for assigned seating | No |
| `attendee_name` | Text | Name printed on the ticket | Yes |
| `qr_code_hash` | Text | The unique code the scanner checks | Yes, must be unique |
| `status` | Text (fixed list) | `valid`, `checked_in`, `cancelled`, or `refunded` | Yes, defaults to valid |
| `created_at` | Date + time | When it was issued | Yes |

### `refunds`
*Record of a refund being issued.*

| Field | Type | Plain-English | Required? |
|---|---|---|---|
| `id` | UUID | Unique ID | Yes |
| `order_id` | UUID | Which order was refunded | Yes |
| `amount` | Number (KZT) | How much was refunded | Yes |
| `reason` | Text | Why | No |
| `issued_by` | UUID | Which organizer/admin issued it | No |
| `created_at` | Date + time | When | Yes |

### `checkin_records`
*One scan at the door.*

| Field | Type | Plain-English | Required? |
|---|---|---|---|
| `id` | UUID | Unique ID | Yes |
| `ticket_id` | UUID | Which ticket was scanned | Yes |
| `checked_in_by` | UUID | Which Event Admin scanned it | No |
| `checked_in_at` | Date + time | When | Yes |
| `reversed` | True/False | Whether this check-in was undone | Yes, defaults to false |

### `staff_assignments`
*Which Event Admins can work which events.*

| Field | Type | Plain-English | Required? |
|---|---|---|---|
| `id` | UUID | Unique ID | Yes |
| `user_id` | UUID | The Event Admin | Yes |
| `event_id` | UUID | Which event they're assigned to | Yes |
| `invited_by` | UUID | Which organizer invited them | No |
| `status` | Text (fixed list) | `invited`, `active`, or `revoked` | Yes, defaults to invited |

### `support_cases`
*One support conversation.*

| Field | Type | Plain-English | Required? |
|---|---|---|---|
| `id` | UUID | Unique ID | Yes |
| `opened_by` | UUID | Who opened it | Yes |
| `event_id` | UUID | Related event, if any | No |
| `order_id` | UUID | Related order, if any | No |
| `ticket_id` | UUID | Related ticket, if any | No |
| `category` | Text | e.g. "ticket_delivery", "payment" | Yes |
| `kind` | Text (fixed list) | `attendee` or `organizer` (who opened it) | Yes, defaults to attendee |
| `assigned_to` | UUID | Support handler working on it | No |
| `escalated` | True/False | Organizer escalated it to the platform team | Yes, defaults to false |
| `updated_at` | Date + time | Last change | Yes |
| `status` | Text (fixed list) | `open`, `in_progress`, `waiting_customer`, or `resolved` | Yes, defaults to open |
| `created_at` | Date + time | When it was opened | Yes |

### `support_messages`
*One message inside a support case.*

| Field | Type | Plain-English | Required? |
|---|---|---|---|
| `id` | UUID | Unique ID | Yes |
| `case_id` | UUID | Which case this belongs to | Yes |
| `sender_id` | UUID | Who sent it | Yes |
| `message` | Text | The actual message | Yes |
| `created_at` | Date + time | When it was sent | Yes |

### `promo_campaigns`
*One discount campaign.*

| Field | Type | Plain-English | Required? |
|---|---|---|---|
| `id` | UUID | Unique ID | Yes |
| `event_id` | UUID | Which event it applies to | Yes |
| `code` | Text | The actual code, e.g. "SUMMER20" | Yes, must be unique |
| `discount_type` | Text (fixed list) | `percentage` or `fixed` | Yes |
| `discount_value` | Number | The amount or percent off | Yes |
| `max_redemptions` | Number | Usage limit | Yes |
| `redemptions_count` | Number | How many times it's been used | Yes, defaults to 0 |
| `valid_from` | Date + time | Start of validity window | No |
| `valid_until` | Date + time | End of validity window | No |
| `qr_token` | Text | Secret behind the campaign QR code (starts with `cmp_`), unique | No |
| `is_active` | True/False | Organizer can switch a campaign off | Yes, defaults to true |
| `ticket_type_ids` | List of UUIDs | If set, the code only works for these ticket types | No |
| `created_by` | UUID | Which organizer created it | No |
| `created_at` | Date + time | When | Yes |

### `promo_redemptions`
*One instance of a promo code being used.*

| Field | Type | Plain-English | Required? |
|---|---|---|---|
| `id` | UUID | Unique ID | Yes |
| `campaign_id` | UUID | Which campaign was used | Yes |
| `order_id` | UUID | Which order it was applied to | Yes |
| `discount_amount` | Number | How much was taken off | Yes |
| `created_at` | Date + time | When | Yes |

### `audit_log`
*A record of important actions across the platform.*

| Field | Type | Plain-English | Required? |
|---|---|---|---|
| `id` | UUID | Unique ID | Yes |
| `actor_id` | UUID | Who did it | No |
| `event_id` | UUID | Related event, if any | No |
| `action` | Text | e.g. "event_published", "check_in" | Yes |
| `details` | Text | Extra context | No |
| `entity_type` | Text | What was touched, e.g. `order`, `ticket`, `event` | No |
| `entity_id` | Text | Id of that thing | No |
| `created_at` | Date + time | When | Yes |

---

### `notifications` (new)
*Simulated emails. Nothing is sent over the internet: the message is saved here and printed in the server log.*

| Field | Type | Plain-English | Required? |
|---|---|---|---|
| `id` | UUID | Unique ID | Yes |
| `user_id` | UUID | Who it is for | Yes |
| `kind` | Text | e.g. `verify_email`, `reset_password`, `order_confirmed`, `event_suspended` | Yes |
| `subject` / `body` | Text | The message | Yes |
| `is_read` | True/False | Read yet | Yes, defaults to false |
| `created_at` | Date + time | When | Yes |

### `paid_sales_activations` (new)
*One record per event that turned on paid sales, with the simulated activation fee.*

| Field | Type | Plain-English | Required? |
|---|---|---|---|
| `id` | UUID | Unique ID | Yes |
| `event_id` | UUID | Which event | Yes |
| `activated_by` | UUID | Which organizer | Yes |
| `fee_amount` | Number (KZT) | Fee charged (taken from `platform_settings`) | Yes |
| `fee_reference` | Text | Fake payment reference, starts with `SANDBOX-FEE-` | Yes |
| `terms_accepted_at` | Date + time | When they accepted the terms | Yes |

### `platform_settings` (new)
*Small key/value table a platform admin can change.*

| Key | Default | Meaning |
|---|---|---|
| `activation_fee` | 5000 | Fee (KZT) to activate paid sales for one event |
| `processing_fee_rate` | 0.03 | Simulated processing fee used in organizer analytics |

### `event_reports` (new)
*A user reporting an event to the platform team.*

| Field | Type | Plain-English | Required? |
|---|---|---|---|
| `id` | UUID | Unique ID | Yes |
| `event_id` | UUID | Reported event | Yes |
| `reported_by` | UUID | Who reported it (empty if not signed in) | No |
| `reason` | Text | Why | Yes |
| `status` | Text (fixed list) | `open`, `dismissed`, or `actioned` | Yes, defaults to open |
| `created_at` | Date + time | When | Yes |

---


## Section 3: API Endpoints

All 86 endpoints below are **built and covered by automated tests**. Live, clickable documentation is always at http://localhost:8000/docs (it lists every field).

### How signing in works

1. `POST /api/auth/register` or `POST /api/auth/login` returns a `token`.
2. Send it on every later request as a header: `Authorization: Bearer <token>`.
3. Tokens last 7 days. A suspended account's token stops working immediately.

The **Who** column uses these words:

| Who | Meaning |
|---|---|
| Public | No token needed |
| Token | Any signed-in user |
| Organizer | Role `organizer`. For anything about one event, it must be *that event's* organizer |
| Staff | Role `event_admin` (door staff). Scanning works only for events they are assigned to; organizers and platform admins can also scan their own events |
| Admin | Role `platform_admin` |
| Buyer | Token **or** the old `attendee_id` field (see the note under Checkout) |

### 🔐 Authentication

| Method and path | Who | What it does |
|---|---|---|
| `POST /api/auth/register` | Public | Body: `email`, `password` (8+ characters), `full_name`, optional `role` (`attendee` or `organizer` only). Sends a simulated verification email. Returns the user plus `token`. |
| `POST /api/auth/login` | Public | Body: `email`, `password`. Returns the user plus `token`. Suspended accounts get 403. |
| `POST /api/auth/logout` | Public | Tokens are stateless, so the app just forgets the token. |
| `GET /api/auth/me` | Token | The signed-in user. |
| `POST /api/auth/verify-email` | Public | Body: `token` (the code from the simulated email, found in `GET /api/notifications`). |
| `POST /api/auth/resend-verification` | Token | Sends a fresh code. |
| `POST /api/auth/forgot-password` | Public | Body: `email`. Always answers the same way, so it cannot be used to find out who has an account. The reset code is delivered as a simulated email. |
| `POST /api/auth/reset-password` | Public | Body: `token`, `new_password`. |
| `GET /api/notifications` | Token | Your simulated emails. Optional `?unread_only=true`. |
| `POST /api/notifications/read-all` | Token | Mark all as read. |

### 🎟️ Events

| Method and path | Who | What it does |
|---|---|---|
| `GET /api/events` | Public | Optional `?public=true` (only upcoming/active public events, use this for the app home screen) or `?organizer_id=`. |
| `GET /api/events/{id}` | Public | One event. Drafts and suspended events are visible only to their organizer and platform admins; `private` events only to those too; `unlisted` ones to anyone with the link. |
| `POST /api/events` | Organizer | Create a draft. Required: `title`, `venue_name`, `start_time`. The organizer is the signed-in user. |
| `PUT /api/events/{id}` | Organizer | Edit details. Cannot change `status`; use publish, unpublish and cancel below. |
| `POST /api/events/{id}/publish` | Organizer | Draft to upcoming. Needs at least one ticket type, and the organizer must have verified their email (403 otherwise). |
| `POST /api/events/{id}/unpublish` | Organizer | Back to draft. Refused with 409 once any ticket has been sold; cancel instead. |
| `POST /api/events/{id}/cancel` | Organizer | Cancels the event. Ticket holders get a simulated email and their tickets stop scanning. Refunds are a separate step (`POST /api/orders/{id}/refund`). |
| `POST /api/events/{id}/duplicate` | Organizer | Copies settings and ticket types into a new draft. No orders or tickets are copied. |
| `POST /api/events/{id}/report` | Public | Body: `reason`. Reports the event to the platform team. |
| `POST /api/events/{id}/ticket-types` | Organizer | Body: `name`, `total_quantity`, optional `price` (0 = free), `max_per_order`, `is_hidden`, `seat_category`, `sales_start_time`, `sales_end_time`. |
| `GET /api/events/{id}/ticket-types` | Public | Hidden types are shown only to the organizer. |
| `PUT /api/ticket-types/{id}` | Organizer | Edit a ticket type. |
| `GET /api/events/{id}/export.ics` | Public | Calendar file (name, time, venue, description, link; marks cancelled events). |
| `GET /api/events/{id}/calendar-links` | Public | A ready-made Google Calendar link plus the path of the .ics file. |

### 💺 Seats & Checkout

| Method and path | Who | What it does |
|---|---|---|
| `POST /api/events/{id}/seats` | Organizer | Generate a block of seats. Body: `section`, `category`, `rows`, `seats_per_row`. |
| `GET /api/events/{id}/seats` | Public | Every seat with its section, row, number and category, plus `hold_status` (an active hold, if any) and `ticket_status` (`valid` or `checked_in` if sold). Both empty means the seat is free. |
| `POST /api/seats/hold` | Buyer | Body: `seat_id`. Holds a seat for 5 minutes. Someone else's active hold gives 409. |
| `POST /api/orders/quote` | Public | Body: `event_id`, `ticket_type_id`, optional `quantity`, `promo_code`. Returns subtotal, discount and total without buying anything. |
| `POST /api/orders/checkout` | Buyer | Body: `event_id`, `ticket_type_id`, `attendee_name`, optional `quantity`, `seat_id`, `promo_code`. Simulated payment. Returns `{order, ticket, tickets}`. |

Checkout enforces: event is upcoming or active, paid sales are active (and not frozen by an admin) for priced tickets, sale window is open, quantity is within `max_per_order` and what is left, seat category matches the ticket type, the seat is not sold or held by someone else, and the promo code is valid, not used up, and allowed for that ticket type. Everything happens in one database transaction with row locks, so two people cannot get the same seat or the last ticket.

> **Weak spot, on purpose:** `checkout`, `seats/hold` and `tickets/my-tickets` still accept the old `attendee_id` instead of a token, so the existing mobile app keeps working. If a token is sent, the token wins and a different `attendee_id` is rejected. Before a real launch, make the token compulsory.

### 📥 Tickets, Orders & Refunds

| Method and path | Who | What it does |
|---|---|---|
| `GET /api/tickets/my-tickets` | Buyer | All your tickets with event and seat info. |
| `GET /api/tickets/{id}` | Public* | One ticket, including `qr_code_hash`. |
| `GET /api/tickets/{id}/qr.png` | Public* | The QR code as a PNG image. |
| `GET /api/tickets/{id}/pdf` | Public* | Printable PDF ticket with the QR code. Kazakh and Russian text work. |
| `GET /api/orders/my-orders` | Token | Your orders. |
| `GET /api/orders/{id}` | Token | One order with its tickets (buyer, event organizer or admin). |
| `POST /api/orders/{id}/refund` | Token | Organizer of the event only. Full refund of a paid order: tickets are cancelled, seats and ticket stock are released, a refund record is written, buyer gets a simulated email. Refused if any ticket was already scanned. |
| `POST /api/orders/{id}/cancel` | Token | Buyer cancels a **free** registration. Paid orders must go through a refund. |

\* *Public because ticket ids are random and unguessable; anyone holding the link can open the ticket, like a ticket link in an email. Another deliberate simplification.*

### 📱 Door Scanner (Staff)

| Method and path | Who | What it does |
|---|---|---|
| `GET /api/staff/events` | Staff | Events you can scan for. |
| `POST /api/checkin/verify-qr` | Staff | Body: `qr_code_hash`. Result is one of `valid`, `already_checked_in`, `cancelled`, `refunded`, `event_cancelled`, `event_suspended`. A wrong code gives 404 "Not a valid ticket". A **promo campaign QR** is rejected with 400 and never admits anyone. Staff of a different event get 403. |
| `POST /api/checkin/undo` | Staff | Body: `ticket_id`. Reverses a scan by mistake. |
| `GET /api/events/{id}/checkin-stats` | Staff | `registered`, `checked_in`, `not_arrived`, `percent_checked_in`. |
| `POST /api/checkin/manual-search` | Staff | Body: `event_id`, `name`. Finds tickets by attendee name or email when a QR will not scan. |

### 👥 Staff Management

| Method and path | Who | What it does |
|---|---|---|
| `POST /api/events/{id}/staff` | Organizer | Body: `email` (optional `full_name`, `password`). Creates an `event_admin` account if needed and assigns it to the event. |
| `GET /api/events/{id}/staff` | Organizer | Who is assigned. |
| `DELETE /api/events/{id}/staff/{staff_id}` | Organizer | Revokes the assignment. |

### 🏷️ Promo Codes & Campaign QR

| Method and path | Who | What it does |
|---|---|---|
| `POST /api/events/{id}/promo-campaigns` | Organizer | Body: `discount_type` (`percentage` or `fixed`), `discount_value`, `max_redemptions`, optional `code` (made automatically if empty), `valid_from`, `valid_until`, `ticket_type_ids`. Returns the campaign with a `campaign_link`. |
| `GET /api/events/{id}/promo-campaigns` | Organizer | List. |
| `POST /api/promo-campaigns/{id}/enable` / `disable` | Organizer | Switch a campaign on or off. |
| `GET /api/promo-campaigns/{id}/qr.png` | Organizer | The campaign QR (blue, so staff can tell it from a ticket). It opens the event page with the code filled in. |
| `GET /api/promo-campaigns/{id}/report` | Organizer | Redemptions, tickets sold and revenue for this campaign. |
| `GET /api/campaigns/resolve?token=` | Public | Turns a scanned campaign QR into the event and code, so the app can pre-fill checkout. |

### 📊 Organizer Dashboard

| Method and path | Who | What it does |
|---|---|---|
| `GET /api/organizer/profile` | Organizer | Phone, payout account, verified flag. |
| `PUT /api/organizer/profile` | Organizer | Body: `contact_phone`, `payout_account_details`. |
| `POST /api/organizer/profile/verify` | Organizer | Simulated identity verification. Needs phone and payout account first. |
| `GET /api/events/{id}/activation-checklist` | Organizer | Five items (paid ticket type, identity verified, payout account, fee paid, terms accepted) with done/not done, the fee, and whether an admin froze paid sales. |
| `POST /api/events/{id}/activate-paid` | Organizer | Body: `{"accept_terms": true}`. Needs a paid ticket type and a verified profile. Records the simulated fee. |
| `GET /api/organizer/events` | Organizer | Your events with a `phase`: `draft`, `upcoming`, `active`, `completed`, `cancelled`. Filter with `?phase=`. Completed events stay available with all their records. |
| `GET /api/events/{id}/attendees` | Organizer | Attendee list. Filters: `?q=` (name/email), `?status=`, `?ticket_type_id=`. |
| `GET /api/events/{id}/orders` | Organizer | Orders. Filter `?status=`. |
| `GET /api/events/{id}/analytics` | Organizer | Capacity (total, sold, remaining), ticket counts (sold, reserved, available, refunded, checked in), money (gross, discounts, refunds, net, simulated processing fee, estimated payout), per ticket type, sales over time, campaign performance, attendance. Filters: `date_from`, `date_to`, `ticket_type_id`. |
| `GET /api/events/{id}/timeline` | Organizer | History of important actions: who, what, when. Newest first. Filters: `date_from`, `date_to`, `action`. Read only; nothing in the API can edit or delete it. |

### 💬 Support

| Method and path | Who | What it does |
|---|---|---|
| `POST /api/support/cases` | Attendee or organizer | Body: `category`, `message`, and one of `event_id` / `order_id` / `ticket_id`. Attendee cases go to the event's organizer; organizer cases go to the platform team. |
| `GET /api/support/cases` | Token | Cases you can see. Filters `?status=`, `?escalated=`. |
| `GET /api/support/cases/{id}` | Token | One case with its messages and your `access_level` (`owner`, `handler` or `admin`). |
| `POST /api/support/cases/{id}/messages` | Token | Reply. The other side gets a simulated email. |
| `PUT /api/support/cases/{id}` | Token | Body: `status` and/or `assigned_to`. Only the support side (handler or admin), not the person who opened it. |
| `POST /api/support/cases/{id}/escalate` | Organizer | Pass an attendee case up to the platform team. |

### 🛠️ Admin Portal (platform admin only)

| Method and path | What it does |
|---|---|
| `GET /api/admin/users` | Search users. `?q=` (name/email), `?role=`. |
| `POST /api/admin/users/{id}/suspend` / `unsuspend` | Block or restore an account (not your own). |
| `GET /api/admin/events` | Search events. `?q=` (title, organizer name or email), `?status=`. |
| `POST /api/admin/events/{id}/suspend` / `reinstate` | Remove an event from public view and stop all sales, or bring it back. The organizer gets a simulated email. |
| `POST /api/admin/events/{id}/suspend-paid-sales` / `restore-paid-sales` | Freeze or unfreeze only paid ticket sales. Free tickets keep working. |
| `GET /api/admin/orders` | Search orders by id, buyer email, or payment reference. `?q=`, `?status=`. |
| `GET /api/admin/activations` | Paid-sales activations with fee records. |
| `GET /api/admin/refunds` | Refund records. |
| `GET /api/admin/event-reports` | Reports from users. `?status=` (default `open`). |
| `PUT /api/admin/event-reports/{id}` | Body: `status` (`dismissed` or `actioned`). |
| `GET /api/admin/promo-activity` | All promo campaigns with redemption counts and organizer. |
| `GET /api/admin/settings` / `PUT /api/admin/settings` | Read or change `activation_fee` and `processing_fee_rate`. The checklist and analytics use the new values straight away. |
| `GET /api/admin/reports/summary` | Platform totals. |
| `GET /api/admin/reports/orders.csv` | All orders as a CSV download. |

### A quick reminder as you build

- Errors always come back as JSON with a `detail` message. 401 = not signed in, 403 = signed in but not allowed, 404 = not found (also used when you are not allowed to even know it exists), 409 = the request is fine but the current state does not allow it (sold out, already used, and so on), 400 = bad input.
- Money is in KZT and travels as a number or a string like `"5000.00"`. Convert before doing math in the app.
- Times are stored with a time zone. Display them in Asia/Almaty.
