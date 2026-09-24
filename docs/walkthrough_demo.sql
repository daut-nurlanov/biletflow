-- ============================================================
-- BiletFlow — Full End-to-End Walkthrough
-- ============================================================
-- This tells one complete story, start to finish, touching every
-- table in schema.sql. Run this AFTER schema.sql. Each step is
-- commented so you can read it like a narrative, not just SQL.
-- ============================================================

-- STEP 1: An organizer signs up and completes her profile
INSERT INTO users (id, email, password_hash, full_name, role, is_email_verified)
VALUES ('11111111-1111-1111-1111-111111111111', 'aigerim@example.com', 'fakehash', 'Aigerim Kassymova', 'organizer', true);

INSERT INTO organizer_profiles (user_id, contact_phone, payout_account_details, paid_sales_verified)
VALUES ('11111111-1111-1111-1111-111111111111', '+7 701 000 0000', 'Kaspi Bank •••• 4821', true);

-- STEP 2: An attendee signs up
INSERT INTO users (id, email, password_hash, full_name, role, is_email_verified)
VALUES ('22222222-2222-2222-2222-222222222222', 'dana@example.com', 'fakehash', 'Dana Serik', 'attendee', true);

-- STEP 3: An Event Admin (door staff) account exists too
INSERT INTO users (id, email, password_hash, full_name, role, is_email_verified)
VALUES ('33333333-3333-3333-3333-333333333333', 'nurlan@example.com', 'fakehash', 'Nurlan T.', 'event_admin', true);

-- STEP 4: The organizer creates and publishes an event with assigned seating
INSERT INTO events (id, organizer_id, title, venue_name, start_time, capacity, status, has_assigned_seating, is_paid_sales_active)
VALUES ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111',
        'Almaty Jazz Night', 'Kazakhstan Concert Hall', '2026-10-14 19:00:00+05', 300, 'upcoming', true, true);

-- STEP 5: The venue's seats get created for this event (just a handful for the demo)
INSERT INTO seats (id, event_id, section, row_label, seat_number, category) VALUES
  ('55555555-5555-5555-5555-555555555551', '44444444-4444-4444-4444-444444444444', 'A', '1', '1', 'premium'),
  ('55555555-5555-5555-5555-555555555552', '44444444-4444-4444-4444-444444444444', 'A', '1', '2', 'premium'),
  ('55555555-5555-5555-5555-555555555553', '44444444-4444-4444-4444-444444444444', 'B', '5', '10', 'standard');

-- STEP 6: Ticket types are created and mapped to those seat categories
INSERT INTO ticket_types (id, event_id, name, price, total_quantity, quantity_available, seat_category) VALUES
  ('66666666-6666-6666-6666-666666666661', '44444444-4444-4444-4444-444444444444', 'VIP Balcony', 9000.00, 40, 40, 'premium'),
  ('66666666-6666-6666-6666-666666666662', '44444444-4444-4444-4444-444444444444', 'General Admission', 4500.00, 260, 260, 'standard');

-- STEP 7: A promo campaign is created for this event
INSERT INTO promo_campaigns (id, event_id, code, discount_type, discount_value, max_redemptions)
VALUES ('77777777-7777-7777-7777-777777777777', '44444444-4444-4444-4444-444444444444', 'SUMMER20', 'percentage', 20, 200);

-- STEP 8: Dana selects seat A1-2 — this creates a temporary hold (5 minute window)
INSERT INTO seat_holds (id, seat_id, held_by_user_id, expires_at, status)
VALUES ('88888888-8888-8888-8888-888888888888', '55555555-5555-5555-5555-555555555552',
        '22222222-2222-2222-2222-222222222222', now() + interval '5 minutes', 'active');

-- STEP 9: Dana completes checkout before the hold expires.
--   9a. The order is created (with the promo code applied)
INSERT INTO orders (id, attendee_id, event_id, total_amount, status, payment_reference, promo_code_applied)
VALUES ('99999999-9999-9999-9999-999999999999', '22222222-2222-2222-2222-222222222222',
        '44444444-4444-4444-4444-444444444444', 7200.00, 'paid', 'SANDBOX-PAY-001', 'SUMMER20');

--   9b. The promo redemption is recorded, and the campaign's counter increments
INSERT INTO promo_redemptions (campaign_id, order_id, discount_amount)
VALUES ('77777777-7777-7777-7777-777777777777', '99999999-9999-9999-9999-999999999999', 1800.00);

UPDATE promo_campaigns SET redemptions_count = redemptions_count + 1
WHERE id = '77777777-7777-7777-7777-777777777777';

--   9c. The seat hold converts into a real ticket
INSERT INTO tickets (id, order_id, event_id, ticket_type_id, seat_id, attendee_name, qr_code_hash, status)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '99999999-9999-9999-9999-999999999999',
        '44444444-4444-4444-4444-444444444444', '66666666-6666-6666-6666-666666666661',
        '55555555-5555-5555-5555-555555555552', 'Dana Serik', 'QR-HASH-DANA-001', 'valid');

UPDATE seat_holds SET status = 'converted' WHERE id = '88888888-8888-8888-8888-888888888888';

--   9d. The ticket type's remaining inventory goes down by one
UPDATE ticket_types SET quantity_available = quantity_available - 1
WHERE id = '66666666-6666-6666-6666-666666666661';

-- STEP 10: The organizer invites Nurlan as door staff for this event
INSERT INTO staff_assignments (user_id, event_id, invited_by, status)
VALUES ('33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444',
        '11111111-1111-1111-1111-111111111111', 'active');

-- STEP 11: Night of the event — Nurlan scans Dana's ticket at the door
INSERT INTO checkin_records (ticket_id, checked_in_by)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333');

UPDATE tickets SET status = 'checked_in' WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

-- STEP 12: Dana has a question afterward and opens a support case
INSERT INTO support_cases (id, opened_by, event_id, order_id, ticket_id, category, status)
VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222',
        '44444444-4444-4444-4444-444444444444', '99999999-9999-9999-9999-999999999999',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ticket_delivery', 'open');

INSERT INTO support_messages (case_id, sender_id, message)
VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222',
        'Hi, I never got the PDF copy of my ticket by email — can you resend it?');

-- STEP 13: Every important action along the way gets logged
INSERT INTO audit_log (actor_id, event_id, action, details) VALUES
  ('11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444', 'event_published', 'Almaty Jazz Night set to upcoming'),
  ('22222222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444444', 'ticket_purchased', 'Order 99999999... paid, 1 ticket issued'),
  ('33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444', 'check_in', 'Ticket aaaaaaaa... checked in at the door');

-- ============================================================
-- STEP 14: See the whole story in one query — everything
-- connected, exactly the way the app would show it to Dana.
-- ============================================================
SELECT
  u.full_name       AS attendee,
  e.title           AS event,
  tt.name           AS ticket_type,
  s.section || '-' || s.row_label || s.seat_number AS seat,
  o.total_amount    AS paid,
  o.promo_code_applied AS promo_used,
  t.status          AS ticket_status,
  ci.checked_in_at  AS checked_in_at
FROM tickets t
JOIN orders o        ON t.order_id = o.id
JOIN users u          ON o.attendee_id = u.id
JOIN events e         ON t.event_id = e.id
JOIN ticket_types tt  ON t.ticket_type_id = tt.id
LEFT JOIN seats s     ON t.seat_id = s.id
LEFT JOIN checkin_records ci ON ci.ticket_id = t.id;
