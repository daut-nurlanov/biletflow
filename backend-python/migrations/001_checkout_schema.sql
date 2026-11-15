-- Bring the pre-November-11 persistent database up to the current schema.
-- Copied from the reviewed, idempotent additions blocks in docs/schema.sql.
ALTER TABLE events ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS refund_policy TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS registration_opens_at TIMESTAMPTZ;
ALTER TABLE events ADD COLUMN IF NOT EXISTS registration_closes_at TIMESTAMPTZ;
ALTER TABLE events ADD COLUMN IF NOT EXISTS payout_status TEXT NOT NULL DEFAULT 'not_started';
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_payout_status_check;
ALTER TABLE events ADD CONSTRAINT events_payout_status_check
  CHECK (payout_status IN ('not_started','pending','processing','paid','failed'));

-- a failed simulated payment is stored as an order with status 'failed' and no tickets
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending','paid','refunded','cancelled','failed'));

-- the processing fee (simulated payment-provider cut) is stored per order, so a
-- later change of the platform rate does not rewrite old numbers. Orders that
-- existed before this column get 3 percent once, when the column is created.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = current_schema() AND table_name = 'orders' AND column_name = 'processing_fee') THEN
    ALTER TABLE orders ADD COLUMN processing_fee NUMERIC(10,2) NOT NULL DEFAULT 0;
    UPDATE orders SET processing_fee = round(total_amount * 0.03, 2) WHERE status IN ('paid','refunded');
  END IF;
END $$;


-- ============================================================
-- ADDITIONS BLOCK 3 (Nov 11): safety nets the database itself enforces
-- ============================================================
-- what an event was before an admin suspended it, so "reinstate" restores it exactly
ALTER TABLE events ADD COLUMN IF NOT EXISTS suspended_from TEXT;

-- a seat can only ever belong to ONE live ticket, even if two checkouts somehow raced past the code
CREATE UNIQUE INDEX IF NOT EXISTS one_live_ticket_per_seat
  ON tickets (seat_id) WHERE seat_id IS NOT NULL AND status IN ('valid','checked_in');

-- sanity limits on numbers (added once; the DO block skips them if they already exist)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'events'::regclass AND conname = 'events_capacity_positive') THEN
    ALTER TABLE events ADD CONSTRAINT events_capacity_positive CHECK (capacity > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ticket_types'::regclass AND conname = 'ticket_types_numbers_sane') THEN
    ALTER TABLE ticket_types ADD CONSTRAINT ticket_types_numbers_sane
      CHECK (price >= 0 AND total_quantity > 0 AND quantity_available >= 0 AND max_per_order > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'orders'::regclass AND conname = 'orders_total_not_negative') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_total_not_negative CHECK (total_amount >= 0 AND processing_fee >= 0);
  END IF;
END $$;

-- a repeated checkout request with the same Idempotency-Key (a double tap on "Pay") returns the first order
ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS orders_idempotency_key_once
  ON orders (attendee_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
