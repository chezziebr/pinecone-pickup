-- Booking downstream-effect tracking (CONSTITUTION §4.3)
-- Run this migration in Supabase SQL Editor.
--
-- Adds explicit signals for whether a booking's downstream effects (Google
-- Calendar event creation, confirmation email) succeeded. Without these,
-- /api/book's silent catches let bookings exist in the DB with no calendar
-- event and no confirmation email, with no way to query "which ones failed."

-- =============================================
-- COLUMNS
-- =============================================

-- 'pending' is the initial state set by the booking insert.
-- The route then transitions to 'success' (calendar event created) or
-- 'failed' (createBookingEvent threw). A row stuck on 'pending' implies
-- the route crashed between insert and update — also a failure signal.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS calendar_sync_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (calendar_sync_status IN ('pending', 'success', 'failed'));

-- NULL means the SendGrid send was not (yet) confirmed for this booking.
-- The booking route sets this to NOW() after a successful sendConfirmationEmail.
-- The admin booking-health endpoint excludes rows < 5 minutes old (still in
-- the request lifecycle).
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS confirmation_email_sent_at TIMESTAMPTZ;

-- =============================================
-- BACKFILL (existing rows)
-- =============================================

-- calendar_sync_status: derive from google_event_id, which is the existing
-- (pre-instrumentation) signal. As of 2026-04-25 query: 2 rows have
-- google_event_id NOT NULL (→ 'success'); 0 rows have it NULL (→ 'failed').
UPDATE bookings SET calendar_sync_status = 'success' WHERE google_event_id IS NOT NULL;
UPDATE bookings SET calendar_sync_status = 'failed'  WHERE google_event_id IS NULL;

-- confirmation_email_sent_at: intentionally left NULL for pre-existing rows.
-- We have no proof those emails sent; honest signal is NULL. The admin
-- booking-health endpoint will surface these as "missing email confirmation"
-- until they're manually resolved. To suppress the historical false-positive
-- (only if you've manually verified the emails arrived), run:
--   UPDATE bookings SET confirmation_email_sent_at = created_at
--   WHERE confirmation_email_sent_at IS NULL AND created_at < '2026-04-25T00:00:00Z';

-- =============================================
-- INDEX
-- =============================================

CREATE INDEX IF NOT EXISTS idx_bookings_calendar_sync_status
  ON bookings (calendar_sync_status);

-- =============================================
-- DOCUMENTATION
-- =============================================

COMMENT ON COLUMN bookings.calendar_sync_status IS
  'pending|success|failed — set by /api/book. CONSTITUTION §4.3.';
COMMENT ON COLUMN bookings.confirmation_email_sent_at IS
  'Timestamp of successful SendGrid send; NULL means not (yet) sent. CONSTITUTION §4.3.';

ANALYZE bookings;
