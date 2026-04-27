-- Liability waiver acceptance on bookings (cluster-1 day-3 work, 2026-04-27)
-- Run this migration in Supabase SQL Editor.
--
-- Adds waiver_accepted_at to record when each customer accepted the
-- liability waiver. The waiver text itself lives in lib/constants.ts
-- (version-controlled, no DB round-trip needed). Server-side validation
-- in /api/book rejects requests without this timestamp; the booking form
-- requires the customer to check a checkbox before submission. NOT NULL
-- enforces "no booking without acceptance" at the storage layer too.
--
-- Backfill rationale: existing rows are the two test bookings created
-- before the waiver feature shipped. Backfilling waiver_accepted_at to
-- created_at is a deemed-accepted-at-create-time fiction — defensible
-- because they're test data, and the alternative (leaving NULL while
-- making the column NOT NULL) is impossible. If real customer rows ever
-- need the same backfill treatment, treat that as a deliberate
-- legal/compliance decision rather than a data hygiene one.

-- =============================================
-- COLUMN (nullable initially, to allow backfill)
-- =============================================

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS waiver_accepted_at TIMESTAMPTZ;

-- =============================================
-- BACKFILL (existing rows)
-- =============================================

-- The WHERE guard makes this safe to re-run.
UPDATE bookings
  SET waiver_accepted_at = created_at
  WHERE waiver_accepted_at IS NULL;

-- =============================================
-- ENFORCE NOT NULL going forward
-- =============================================

-- Idempotent: PostgreSQL allows SET NOT NULL on an already-NOT-NULL column.
ALTER TABLE bookings
  ALTER COLUMN waiver_accepted_at SET NOT NULL;

-- =============================================
-- DOCUMENTATION
-- =============================================

COMMENT ON COLUMN bookings.waiver_accepted_at IS
  'Timestamp the customer accepted the liability waiver (lib/constants.ts WAIVER_TEXT). Required at booking time.';
