-- ============================================================
-- BiletFlow: extra demo data for the live presentation
-- ============================================================
-- Run this AFTER schema.sql and walkthrough_demo.sql.
-- The event in walkthrough_demo.sql is dated in the past and already
-- fully used, so you cannot buy a ticket for it in a demo. This file
-- adds events that are in the future and actually on sale:
--
--   Almaty Tech Meetup (id ...4445)  no seats, free + paid tickets
--   Astana Rock Night  (id ...4446)  assigned seating, premium + standard
--
-- Both belong to the demo organizer Aigerim (see SETUP.md for her ID).
-- Safe to run once on a fresh database. Running it twice will fail
-- on the fixed IDs, which is fine, it just means the data is already there.

INSERT INTO events (id, organizer_id, title, description, category, venue_name, venue_address,
                    start_time, end_time, capacity, status, visibility,
                    has_assigned_seating, is_paid_sales_active)
VALUES
  ('44444444-4444-4444-4444-444444444445', '11111111-1111-1111-1111-111111111111',
   'Almaty Tech Meetup', 'An evening of short talks from local developers and founders.', 'conference',
   'Almaty Digital Hub', 'Abay Ave 10, Almaty',
   '2026-11-20 18:00:00+05', '2026-11-20 21:00:00+05', 150, 'upcoming', 'public', false, true),
  ('44444444-4444-4444-4444-444444444446', '11111111-1111-1111-1111-111111111111',
   'Astana Rock Night', 'Live rock bands, standing and seated tickets.', 'music',
   'Astana Arena Club', 'Turan Ave 5, Astana',
   '2026-11-28 19:30:00+05', '2026-11-28 23:30:00+05', 60, 'upcoming', 'public', true, true);

INSERT INTO ticket_types (id, event_id, name, description, price, total_quantity, quantity_available, seat_category) VALUES
  ('66666666-6666-6666-6666-666666666671', '44444444-4444-4444-4444-444444444445', 'Community (free)', 'Free entry, limited spots', 0, 100, 100, NULL),
  ('66666666-6666-6666-6666-666666666672', '44444444-4444-4444-4444-444444444445', 'Supporter', 'Includes a t-shirt', 3000, 50, 50, NULL),
  ('66666666-6666-6666-6666-666666666681', '44444444-4444-4444-4444-444444444446', 'Front Row', 'Closest to the stage', 12000, 20, 20, 'premium'),
  ('66666666-6666-6666-6666-666666666682', '44444444-4444-4444-4444-444444444446', 'Standard Seat', 'Good view, great price', 6000, 40, 40, 'standard');

-- 2 rows of 10 premium seats in section A, 4 rows of 10 standard seats in section B
INSERT INTO seats (event_id, section, row_label, seat_number, category)
SELECT '44444444-4444-4444-4444-444444444446', 'A', r::text, n::text, 'premium'
FROM generate_series(1, 2) r, generate_series(1, 10) n;

INSERT INTO seats (event_id, section, row_label, seat_number, category)
SELECT '44444444-4444-4444-4444-444444444446', 'B', r::text, n::text, 'standard'
FROM generate_series(1, 4) r, generate_series(1, 10) n;

INSERT INTO promo_campaigns (event_id, code, discount_type, discount_value, max_redemptions) VALUES
  ('44444444-4444-4444-4444-444444444445', 'MEETUP10', 'percentage', 10, 50),
  ('44444444-4444-4444-4444-444444444446', 'ROCK1000', 'fixed', 1000, 20);

-- ------------------------------------------------------------
-- Accounts, staff and paid-sales records for the demo
-- ------------------------------------------------------------
-- A platform admin so you can try the /api/admin/* endpoints.
-- Login: admin@example.com / demo1234
INSERT INTO users (id, email, password_hash, full_name, role, is_email_verified)
VALUES ('aaaa0000-0000-0000-0000-000000000001', 'admin@example.com', '$2b$12$vx2MzL92aOHBr2wyOFW.cOF8d.pXaCv3XUrDQ/htCLP.VXFFX1BTe', 'Platform Admin', 'platform_admin', true);

-- Nurlan (door staff) works all three demo events, so the scanner app has something to show
INSERT INTO staff_assignments (user_id, event_id, invited_by, status) VALUES
  ('33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444445', '11111111-1111-1111-1111-111111111111', 'active'),
  ('33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444446', '11111111-1111-1111-1111-111111111111', 'active');

-- The three paid events were "activated" (simulated fee payment), so admins can inspect the records
INSERT INTO paid_sales_activations (event_id, activated_by, fee_amount, fee_reference) VALUES
  ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', 5000, 'SANDBOX-FEE-DEMO0001'),
  ('44444444-4444-4444-4444-444444444445', '11111111-1111-1111-1111-111111111111', 5000, 'SANDBOX-FEE-DEMO0002'),
  ('44444444-4444-4444-4444-444444444446', '11111111-1111-1111-1111-111111111111', 5000, 'SANDBOX-FEE-DEMO0003');

-- Every demo promo code gets a campaign QR token, like codes created through the API.
-- The campaign link is  <PUBLIC_BASE_URL>/events/<event id>?c=<token>
UPDATE promo_campaigns SET qr_token = 'cmp_demo_' || lower(code) WHERE qr_token IS NULL;
