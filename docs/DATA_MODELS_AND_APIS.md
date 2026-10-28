# BiletFlow: Data Models & API Reference

This document explains how BiletFlow stores information and how the different parts of our app talk to each other. It's written so that **anyone on the team can understand it, even with zero coding background.**

This version reflects what is **actually built and running** in `backend-python/main.py` and `docs/schema.sql`, not just what was originally planned. Where something is planned but not built yet, it's labeled clearly.

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

## Section 2: Database Models (The Actual 16 Tables)

Every table below exists right now in `docs/schema.sql`, already built and tested.

### `users`
*Account details for attendees, organizers, event admins, and platform admins.*

| Field | Type | Plain-English | Required? |
|---|---|---|---|
| `id` | UUID | Unique ID, generated automatically | Yes |
| `email` | Text | Login email, must be unique | Yes |
| `password_hash` | Text | Password, stored scrambled (bcrypt), never in plain text | No |
| `full_name` | Text | Their real name | Yes |
| `role` | Text (fixed list) | `attendee`, `organizer`, `event_admin`, or `platform_admin` | Yes |
| `is_email_verified` | True/False | Have they clicked the confirmation email | Yes, defaults to false |
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
| `created_at` | Date + time | When | Yes |

---

## Section 3: API Endpoints

Each endpoint below is marked **✅ Built and tested** or **🔲 Not built yet**.

### 🔐 Authentication

`[POST]` **`/api/auth/register`** ✅ Built and tested
Creates a new user. Password is hashed with bcrypt before storage, the real password is never saved.

`[POST]` **`/api/auth/login`** ✅ Built and tested
Checks email and password, returns the user's basic info if correct. *(Note: this currently returns the user's own ID as a stand-in for a real login token. A proper session/token system is a planned upgrade, not built yet.)*

`[POST]` **`/api/auth/logout`** ✅ Built and tested
Exists as a real endpoint, but since there's no real session system yet, it doesn't invalidate anything yet either.

### 🎟️ Events

`[GET]` **`/api/events`** ✅ Built and tested
Lists all events. Optional filters: `?organizer_id=` (one organizer's events, any status) and `?public=true` (only `upcoming`/`active` events with `public` visibility, which is what the attendee web and mobile apps should use).

`[GET]` **`/api/events/:id`** ✅ Built and tested
Fetches one event's full detail, including its ticket types.

`[POST]` **`/api/events`** ✅ Built and tested
Creates a new event. Accepts `description`, `category`, `venue_address`, `end_time`, `visibility` and `has_assigned_seating` as well as the basics. New events start as `draft`; use `PUT` with `{"status": "upcoming"}` to publish.

`[PUT]` **`/api/events/:id`** ✅ Built and tested
Updates any subset of: `title`, `venue_name`, `start_time`, `capacity`, `status`, `description`, `category`, `venue_address`, `end_time`, `visibility`. Returns 400 for an empty body or an invalid value.

`[POST]` **`/api/events/:id/ticket-types`** ✅ Built and tested
Creates a ticket type for an event. Body: `name`, `price`, `total_quantity`, and optionally `description`, `seat_category`, `sales_start_time`, `sales_end_time`. `quantity_available` starts equal to `total_quantity`.

`[GET]` **`/api/events/:id/ticket-types`** ✅ Built and tested
Lists an event's ticket types, most expensive first.

`[POST]` **`/api/events/:id/seats`** ✅ Built and tested
Creates a block of seats in one call. Body: `section`, `category`, `rows`, `seats_per_row`, optional `first_row_label` (default 1). Example: section A, premium, 2 rows of 10 seats creates 20 seats. Also turns on `has_assigned_seating` for the event. Returns 409 if any of those seats already exist.

`[POST]` **`/api/events/:id/activate-paid`** ✅ Built and tested
Flips `is_paid_sales_active` to true. Currently a simplified sandbox version, no real payment/identity verification yet, matching the SRS's "clearly labelled simulation" requirement for the academic MVP.

### 💺 Seats & Checkout

`[GET]` **`/api/events/:id/seats`** ✅ Built and tested
Returns every seat for an event, including whether it's currently held or already sold.

`[POST]` **`/api/seats/hold`** ✅ Built and tested
Temporarily reserves a seat for 5 minutes. Database-enforced, only one active hold per seat. Holds that pass their 5 minutes are released automatically the next time anyone asks for seats, holds or checkout, so an abandoned seat never stays locked. Asking again for a seat you already hold just returns your existing hold. Returns 404 for an unknown seat, 409 if someone else holds or owns it.

`[POST]` **`/api/orders/checkout`** ✅ Built and tested
The big one. Everything below happens as one atomic transaction, so a failure part-way leaves no half-finished order.

Body: `attendee_id`, `event_id`, `ticket_type_id`, `attendee_name`, and optionally `seat_id`, `quantity` (1 to 10, default 1) and `promo_code`. The response contains `order`, `tickets` (all of them) and `ticket` (the first one, kept for older clients).

Rules it enforces (each returns the status shown):
- ticket type must belong to the event (400), attendee must exist (404)
- event must be `upcoming` or `active` (409)
- paid tickets need the event's paid sales switched on (403); free tickets do not
- the ticket type's sale window must be open (409)
- enough tickets left (409, "Sold out" or "Only N left")
- with a `seat_id`: seat must exist for this event (404), match the ticket type's `seat_category` if it has one (409), not already be sold (409), and not be held by someone else (409). If the buyer holds it, the hold becomes a ticket. Seats are one ticket per order (400 otherwise)
- with a `promo_code`: must exist for this event (404), be inside its valid dates (409), and have redemptions left (409). Percentage and fixed discounts are supported; the total never goes below 0. Two people racing for the last redemption cannot both win.

### 📥 Tickets & Downloads

`[GET]` **`/api/tickets/my-tickets`** ✅ Built and tested
Every ticket belonging to a given attendee.

`[GET]` **`/api/tickets/:id`** ✅ Built and tested
One ticket's full detail.

`[GET]` **`/api/tickets/:id/pdf`** ✅ Built and tested
Generates and returns an actual downloadable PDF.

`[GET]` **`/api/events/:id/export.ics`** ✅ Built and tested
Generates a real calendar file for the event.

### 📱 Mobile Scanner App

`[POST]` **`/api/checkin/verify-qr`** ✅ Built and tested
Checks a scanned QR code's status and marks it checked in if valid. Correctly detects already-used, cancelled, and refunded tickets.

`[POST]` **`/api/checkin/manual-search`** ✅ Built and tested
Searches for an attendee by name within one event, for when a QR code won't scan.

### 💸 Refunds

`[POST]` **`/api/orders/:id/refund`** 🔲 Not built yet
Table (`refunds`) exists. No endpoint yet.

### 💬 Support

`[POST]` **`/api/support/cases`** 🔲 Not built yet
`[GET]` **`/api/support/cases`** 🔲 Not built yet
`[POST]` **`/api/support/cases/:id/messages`** 🔲 Not built yet
Tables (`support_cases`, `support_messages`) exist. No endpoints yet.

### 🏷️ Promo Codes

`[POST]` **`/api/promo/campaigns`** 🔲 Not built yet
Organizers cannot create promo codes through the API yet (the demo codes are loaded from `docs/demo_events.sql`).
Applying a code at checkout **is** built and tested, see the checkout endpoint above.

### 👥 Staff

`[POST]` **`/api/staff/invite`** 🔲 Not built yet
`[GET]` **`/api/events/:id/staff`** 🔲 Not built yet
Table (`staff_assignments`) exists. No endpoints yet.

### 🛠️ Admin Portal

Nothing built yet. Search, moderation, activation review, disputes, escalations, settings, and reports are all still open, per `docs/SETUP.md`.

---

### A quick reminder as you build

Every one of these endpoints is a **conversation with the database**, never a direct edit. The website, the organizer dashboard, and the mobile scanner app all use these *same* endpoints to read and write the *same* data, that's what keeps every screen showing the truth at the same time.
