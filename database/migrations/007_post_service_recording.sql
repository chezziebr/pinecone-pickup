-- Post-service recording columns (cluster 2, 2026-04-27)
-- Run this migration in Supabase SQL Editor.
--
-- Adds the six columns the admin populates after a service is performed.
-- The booking transitions from status='confirmed' to status='completed'
-- via /admin/bookings/[id]/complete (cluster 2), which writes these
-- columns and sets completed_at = NOW(). Replaces the synthetic
-- status='completed' that the now-removed /api/review-request cron
-- used to set.
--
-- All columns NULL initially; NULL means "service not yet recorded."
-- A booking with status='confirmed' (the default after /api/book)
-- will have all six NULL until the admin marks it complete.
--
-- Constraints:
--   - payment_method: nullable, CHECK enforces enum membership when set.
--     The "OR IS NULL" is explicit (CHECK already accepts NULL since
--     constraints fail only on FALSE, not UNKNOWN) — kept for clarity.
--   - tip_amount: nullable INTEGER with CHECK forbidding negative
--     values. Tips are dollars received, not refunds. 0 is a valid
--     explicit no-tip; NULL means "not yet recorded."
--
-- Index on completed_at supports sort-by-completion-time queries on
-- the admin Bookings list and revenue-by-month groupings on the
-- Finances tab.
--
-- All ALTER TABLE statements use ADD COLUMN IF NOT EXISTS so re-running
-- this file on a DB where the columns already exist is a no-op for each
-- column. The named CHECK constraints are created alongside ADD COLUMN,
-- so re-runs do not error on duplicate constraint names.

-- =============================================
-- COLUMNS
-- =============================================

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS actual_lot_size TEXT;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS payment_received BOOLEAN;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS payment_method TEXT
    CONSTRAINT check_valid_payment_method
    CHECK (payment_method IN ('cash', 'venmo', 'check', 'other') OR payment_method IS NULL);

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS tip_amount INTEGER
    CONSTRAINT check_tip_amount_nonnegative
    CHECK (tip_amount IS NULL OR tip_amount >= 0);

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS completion_notes TEXT;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- =============================================
-- INDEX
-- =============================================

CREATE INDEX IF NOT EXISTS idx_bookings_completed_at
  ON bookings (completed_at);

-- =============================================
-- DOCUMENTATION
-- =============================================

COMMENT ON COLUMN bookings.actual_lot_size IS
  'Admin-recorded actual lot size at service time; may differ from booked lot_size. NULL until service is recorded.';
COMMENT ON COLUMN bookings.payment_received IS
  'Whether payment was received at service time. NULL until recorded.';
COMMENT ON COLUMN bookings.payment_method IS
  'cash|venmo|check|other; NULL if not recorded or no payment.';
COMMENT ON COLUMN bookings.tip_amount IS
  'Tip received in whole dollars; NULL if not recorded, 0 for explicit no-tip.';
COMMENT ON COLUMN bookings.completion_notes IS
  'Free-form admin notes captured at service-completion time.';
COMMENT ON COLUMN bookings.completed_at IS
  'Timestamp of service completion (set by /admin/bookings/[id]/complete). NULL until completed.';
