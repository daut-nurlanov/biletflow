-- ============================================================
-- BiletFlow - Full Database Schema
-- ============================================================
-- This builds every core table BiletFlow needs. It's safe to run
-- even if you already created `users`, `events`, and `ticket_types`
-- earlier - every statement uses IF NOT EXISTS so nothing breaks
-- or duplicates.
--
-- A few things from the SRS's full 24-entity list are intentionally
-- simplified or merged here, since this is scoped to what the MVP
-- actually needs to demonstrate (not a full production system):
--   • Venue/Section/Row are folded into a single `seats` table,
--     since the MVP uses one predefined layout, not custom venues.
--   • Payment is folded into `orders` (payment_reference + status),
--     since the sandbox/simulated payment doesn't need its own table.
--   • Attendee is folded into `tickets.attendee_name`, matching
--     DATA_MODELS_AND_APIS.md exactly.
--   • Notification and PayoutAccount are left out - they're not
--     relational data so much as side-effects/config, and can be
--     added later without touching anything below.
-- ============================================================

-- 1. Accounts
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('attendee', 'organizer', 'event_admin', 'platform_admin')),
  is_email_verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organizer_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id),
  contact_phone TEXT,
  payout_account_details TEXT,
  paid_sales_verified BOOLEAN NOT NULL DEFAULT false
);

-- 2. Events & Tickets
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id UUID NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  venue_name TEXT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 100,
  status TEXT NOT NULL DEFAULT 'draft' CONSTRAINT events_status_check CHECK (status IN ('draft','upcoming','active','completed','cancelled','suspended')),
  has_assigned_seating BOOLEAN NOT NULL DEFAULT false,
  is_paid_sales_active BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  category TEXT,
  venue_address TEXT,
  end_time TIMESTAMPTZ,
  visibility TEXT NOT NULL DEFAULT 'public' CONSTRAINT events_visibility_check CHECK (visibility IN ('public','unlisted','private')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ticket_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id),
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_quantity INTEGER NOT NULL,
  quantity_available INTEGER NOT NULL,
  seat_category TEXT, -- only used when the event has assigned seating
  sales_start_time TIMESTAMPTZ,
  sales_end_time TIMESTAMPTZ,
  CHECK (quantity_available <= total_quantity)
);

-- 3. Seating (assigned-seating events only)
CREATE TABLE IF NOT EXISTS seats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id),
  section TEXT NOT NULL,
  row_label TEXT NOT NULL,
  seat_number TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('premium','standard','accessible')),
  UNIQUE(event_id, section, row_label, seat_number)
);

CREATE TABLE IF NOT EXISTS seat_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seat_id UUID NOT NULL REFERENCES seats(id),
  held_by_user_id UUID REFERENCES users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','converted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- This is the line that actually prevents double-selling a seat:
-- only ONE "active" hold can exist per seat at a time. Expired or
-- converted holds don't count, so the same seat can be legitimately
-- re-held later without this index getting in the way.
CREATE UNIQUE INDEX IF NOT EXISTS one_active_hold_per_seat
  ON seat_holds(seat_id) WHERE status = 'active';

-- 4. Orders & Tickets
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendee_id UUID NOT NULL REFERENCES users(id),
  event_id UUID NOT NULL REFERENCES events(id),
  total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','refunded','cancelled')),
  payment_reference TEXT,
  promo_code_applied TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id),
  event_id UUID NOT NULL REFERENCES events(id),
  ticket_type_id UUID NOT NULL REFERENCES ticket_types(id),
  seat_id UUID REFERENCES seats(id),
  attendee_name TEXT NOT NULL,
  qr_code_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid','checked_in','cancelled','refunded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id),
  amount NUMERIC(10,2) NOT NULL,
  reason TEXT,
  issued_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Door / Check-in
CREATE TABLE IF NOT EXISTS checkin_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id),
  checked_in_by UUID REFERENCES users(id),
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reversed BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS staff_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  event_id UUID NOT NULL REFERENCES events(id),
  invited_by UUID REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','active','revoked')),
  UNIQUE(user_id, event_id)
);

-- 6. Support
CREATE TABLE IF NOT EXISTS support_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opened_by UUID NOT NULL REFERENCES users(id),
  event_id UUID REFERENCES events(id),
  order_id UUID REFERENCES orders(id),
  ticket_id UUID REFERENCES tickets(id),
  category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','waiting_customer','resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES support_cases(id),
  sender_id UUID NOT NULL REFERENCES users(id),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Promotions
CREATE TABLE IF NOT EXISTS promo_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id),
  code TEXT NOT NULL UNIQUE,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage','fixed')),
  discount_value NUMERIC(10,2) NOT NULL,
  max_redemptions INTEGER NOT NULL,
  redemptions_count INTEGER NOT NULL DEFAULT 0,
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS promo_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES promo_campaigns(id),
  order_id UUID NOT NULL REFERENCES orders(id),
  discount_amount NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. Accountability
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES users(id),
  event_id UUID REFERENCES events(id),
  action TEXT NOT NULL,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- ADDITIONS BLOCK (also upgrades databases created before Oct 28)
-- ============================================================
-- Everything below is written so it works on a brand new database AND on
-- an older one. CREATE TABLE IF NOT EXISTS skips tables that already exist,
-- so columns added later live here as ALTER TABLE ... ADD COLUMN IF NOT
-- EXISTS (does nothing if the column is already there). You never need to
-- wipe your database. Safe to run any number of times.
ALTER TABLE events ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS venue_address TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS end_time TIMESTAMPTZ;
ALTER TABLE events ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public';

ALTER TABLE events DROP CONSTRAINT IF EXISTS events_status_check;
ALTER TABLE events ADD CONSTRAINT events_status_check
  CHECK (status IN ('draft','upcoming','active','completed','cancelled','suspended'));

ALTER TABLE events DROP CONSTRAINT IF EXISTS events_visibility_check;
ALTER TABLE events ADD CONSTRAINT events_visibility_check
  CHECK (visibility IN ('public','unlisted','private'));

-- users can be suspended by a platform admin
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT false;

-- a platform admin can switch off paid sales for one event
ALTER TABLE events ADD COLUMN IF NOT EXISTS paid_sales_suspended BOOLEAN NOT NULL DEFAULT false;

-- organizers can hide a ticket type without deleting it, and cap tickets per order
ALTER TABLE ticket_types ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE ticket_types ADD COLUMN IF NOT EXISTS max_per_order INTEGER NOT NULL DEFAULT 10;

-- promo campaigns: a secret token for the campaign QR link, an on/off switch,
-- an optional list of ticket types the code applies to
ALTER TABLE promo_campaigns ADD COLUMN IF NOT EXISTS qr_token TEXT UNIQUE;
ALTER TABLE promo_campaigns ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE promo_campaigns ADD COLUMN IF NOT EXISTS ticket_type_ids UUID[];
ALTER TABLE promo_campaigns ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);
ALTER TABLE promo_campaigns ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- audit log: which kind of thing the action touched, and its id
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS entity_type TEXT;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS entity_id TEXT;

-- support cases: attendee-to-organizer or organizer-to-platform, who handles it, escalation
ALTER TABLE support_cases ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'attendee';
ALTER TABLE support_cases ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES users(id);
ALTER TABLE support_cases ADD COLUMN IF NOT EXISTS escalated BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE support_cases ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE support_cases DROP CONSTRAINT IF EXISTS support_cases_kind_check;
ALTER TABLE support_cases ADD CONSTRAINT support_cases_kind_check CHECK (kind IN ('attendee','organizer'));

-- in-app notifications (our stand-in for emails)
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- one row per paid-sales activation (the simulated fee payment + terms acceptance)
CREATE TABLE IF NOT EXISTS paid_sales_activations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id),
  activated_by UUID NOT NULL REFERENCES users(id),
  fee_amount NUMERIC(10,2) NOT NULL,
  fee_reference TEXT NOT NULL,
  terms_accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- admin-editable platform settings (activation fee, processing fee rate, ...)
CREATE TABLE IF NOT EXISTS platform_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO platform_settings (key, value) VALUES
  ('activation_fee', '5000'),
  ('processing_fee_rate', '0.03')
ON CONFLICT (key) DO NOTHING;

-- "report this event" submissions that platform admins review
CREATE TABLE IF NOT EXISTS event_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id),
  reported_by UUID REFERENCES users(id),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','dismissed','actioned')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
