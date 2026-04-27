-- =============================================================================
-- Migration 006 — finish what migration 001 started
-- =============================================================================
--
-- Background
-- ----------
-- Migration 001 only partially applied to production. Session 4 (queries
-- A/B/C/D, run 2026-04-25 against production) found that the following items
-- from 001 had landed:
--   - service_type CHECK on bookings
--   - status CHECK on bookings
--   - all indexes on bookings and reviews
--
-- ...and the following items had NOT landed:
--   - lot_size CHECK on bookings
--   - price > 0 CHECK on bookings
--   - scheduled_date >= CURRENT_DATE CHECK on bookings  (deliberately not
--                                                       applied here either —
--                                                       see "Deliberate
--                                                       omissions" below)
--   - unique_review_per_booking UNIQUE on reviews(booking_id)
--   - validate_booking_data() function + trigger on bookings
--   - validate_review_data()  function + trigger on reviews
--   - audit_logs table + audit_trigger() function + audit_bookings_trigger
--
-- This migration applies everything in the second list except the
-- scheduled_date check, restoring 001's intended end state.
--
-- Deliberate omissions
-- --------------------
-- 1. The CHECK constraint  CHECK (scheduled_date >= CURRENT_DATE)  is NOT
--    applied. CURRENT_DATE is evaluated at every UPDATE, which would block
--    the review-request cron's flip from 'confirmed' to 'completed' on
--    bookings whose scheduled_date is already in the past. API-layer
--    validation in lib/validation.ts enforces "future date at create time",
--    which is the actual business rule.
--
-- 2. The validate_booking_data() trigger function below is identical to
--    001's version EXCEPT that the internal "scheduled_date < CURRENT_DATE"
--    branch (001 lines 115-118) is removed. Same reason as (1) — the
--    trigger fires on UPDATE too, so the past-date check would break the
--    cron status flip just as the CHECK constraint would.
--
-- Re-run behavior
-- ---------------
-- This file is safe to re-run for everything that uses IF NOT EXISTS,
-- CREATE OR REPLACE, or DROP TRIGGER IF EXISTS + CREATE TRIGGER. The three
-- ALTER TABLE ADD CONSTRAINT statements will ERROR on re-run if the
-- constraints already exist (PostgreSQL has no IF NOT EXISTS for ADD
-- CONSTRAINT). That failure mode is intentional: it surfaces drift instead
-- of hiding it. If you need to re-apply this on a DB that has some
-- constraints already, drop those by name first and re-run.
-- =============================================================================


-- =============================================
-- CONSTRAINTS  (no IF NOT EXISTS available — re-run will error if present)
-- =============================================

ALTER TABLE bookings
  ADD CONSTRAINT check_price_positive
  CHECK (price > 0);

ALTER TABLE bookings
  ADD CONSTRAINT check_valid_lot_size
  CHECK (lot_size IN ('¼ acre', '½ acre', '¾ acre', '1 acre+'));

ALTER TABLE reviews
  ADD CONSTRAINT unique_review_per_booking
  UNIQUE (booking_id);


-- =============================================
-- VALIDATION TRIGGER FUNCTIONS
-- =============================================

-- Booking validation. Same as 001's validate_booking_data() with the
-- scheduled_date < CURRENT_DATE branch removed (see header note 2).
CREATE OR REPLACE FUNCTION validate_booking_data()
RETURNS TRIGGER AS $$
BEGIN
  -- Validate email format
  IF NEW.email !~ '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$' THEN
    RAISE EXCEPTION 'Invalid email format';
  END IF;

  -- Validate phone number (basic length check)
  IF LENGTH(NEW.phone) < 10 OR LENGTH(NEW.phone) > 20 THEN
    RAISE EXCEPTION 'Invalid phone number length';
  END IF;

  -- Validate scheduled time format (e.g. "9:30 AM", "12:00 PM")
  IF NEW.scheduled_time !~ '^(1[0-2]|[1-9]):[0-5][0-9]\s?(AM|PM)$' THEN
    RAISE EXCEPTION 'Invalid scheduled time format';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_validate_booking_data ON bookings;
CREATE TRIGGER trigger_validate_booking_data
  BEFORE INSERT OR UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION validate_booking_data();


-- Review validation. Identical to 001.
CREATE OR REPLACE FUNCTION validate_review_data()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.rating < 1 OR NEW.rating > 5 THEN
    RAISE EXCEPTION 'Rating must be between 1 and 5';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM bookings WHERE id = NEW.booking_id) THEN
    RAISE EXCEPTION 'Cannot create review for non-existent booking';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_validate_review_data ON reviews;
CREATE TRIGGER trigger_validate_review_data
  BEFORE INSERT OR UPDATE ON reviews
  FOR EACH ROW
  EXECUTE FUNCTION validate_review_data();


-- =============================================
-- AUDIT LOGGING
-- =============================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name  VARCHAR(50) NOT NULL,
  operation   VARCHAR(10) NOT NULL,
  record_id   UUID,
  old_data    JSONB,
  new_data    JSONB,
  changed_by  TEXT,
  changed_at  TIMESTAMP DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION audit_trigger()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_logs (table_name, operation, record_id, new_data, changed_by)
    VALUES (TG_TABLE_NAME, TG_OP, NEW.id, to_jsonb(NEW),
            current_setting('request.jwt.claims', true)::json->>'email');
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_logs (table_name, operation, record_id, old_data, new_data, changed_by)
    VALUES (TG_TABLE_NAME, TG_OP, NEW.id, to_jsonb(OLD), to_jsonb(NEW),
            current_setting('request.jwt.claims', true)::json->>'email');
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_logs (table_name, operation, record_id, old_data, changed_by)
    VALUES (TG_TABLE_NAME, TG_OP, OLD.id, to_jsonb(OLD),
            current_setting('request.jwt.claims', true)::json->>'email');
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_bookings_trigger ON bookings;
CREATE TRIGGER audit_bookings_trigger
  AFTER INSERT OR UPDATE OR DELETE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION audit_trigger();

CREATE INDEX IF NOT EXISTS idx_audit_logs_table_operation
  ON audit_logs (table_name, operation);

CREATE INDEX IF NOT EXISTS idx_audit_logs_changed_at
  ON audit_logs (changed_at DESC);


-- =============================================
-- DOCUMENTATION
-- =============================================

COMMENT ON TABLE audit_logs IS 'Audit trail for all data modifications';
COMMENT ON CONSTRAINT check_price_positive ON bookings IS 'Ensures price is always positive';
COMMENT ON CONSTRAINT unique_review_per_booking ON reviews IS 'Prevents multiple reviews per booking';
