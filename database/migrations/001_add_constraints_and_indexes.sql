-- Database constraints and indexes for improved security and performance
-- Run this migration in Supabase SQL Editor

-- =============================================
-- CONSTRAINTS
-- =============================================

-- Bookings table constraints
ALTER TABLE bookings
ADD CONSTRAINT check_price_positive
CHECK (price > 0);

ALTER TABLE bookings
ADD CONSTRAINT check_valid_status
CHECK (status IN ('confirmed', 'completed', 'pending', 'cancelled'));

ALTER TABLE bookings
ADD CONSTRAINT check_valid_lot_size
CHECK (lot_size IN ('¼ acre', '½ acre', '¾ acre', '1 acre+'));

ALTER TABLE bookings
ADD CONSTRAINT check_valid_service_type
CHECK (service_type IN ('pickup_only', 'pickup_haul'));

ALTER TABLE bookings
ADD CONSTRAINT check_future_scheduled_date
CHECK (scheduled_date >= CURRENT_DATE);

-- Reviews table constraints
ALTER TABLE reviews
ADD CONSTRAINT check_valid_rating
CHECK (rating >= 1 AND rating <= 5);

ALTER TABLE reviews
ADD CONSTRAINT unique_review_per_booking
UNIQUE (booking_id);

-- =============================================
-- INDEXES FOR PERFORMANCE
-- =============================================

-- Bookings table indexes
CREATE INDEX IF NOT EXISTS idx_bookings_email
ON bookings (email);

CREATE INDEX IF NOT EXISTS idx_bookings_scheduled_date
ON bookings (scheduled_date);

CREATE INDEX IF NOT EXISTS idx_bookings_status
ON bookings (status);

CREATE INDEX IF NOT EXISTS idx_bookings_created_at
ON bookings (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bookings_status_date
ON bookings (status, scheduled_date);

-- Reviews table indexes
CREATE INDEX IF NOT EXISTS idx_reviews_booking_id
ON reviews (booking_id);

CREATE INDEX IF NOT EXISTS idx_reviews_rating
ON reviews (rating);

CREATE INDEX IF NOT EXISTS idx_reviews_created_at
ON reviews (created_at DESC);

-- =============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================

-- Enable RLS on both tables
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- Bookings policies
-- Note: Since this app uses service role key, these policies won't be enforced
-- but they serve as documentation and future-proofing

-- Allow service role to do everything
CREATE POLICY "Service role can manage all bookings" ON bookings
  FOR ALL USING (auth.role() = 'service_role');

-- Reviews policies
CREATE POLICY "Service role can manage all reviews" ON reviews
  FOR ALL USING (auth.role() = 'service_role');

-- If switching to anon key usage in the future:
-- CREATE POLICY "Users can read their own bookings" ON bookings
--   FOR SELECT USING (email = current_setting('request.jwt.claims')::json->>'email');

-- =============================================
-- ADDITIONAL SECURITY MEASURES
-- =============================================

-- Create a function to validate booking data before insert/update
CREATE OR REPLACE FUNCTION validate_booking_data()
RETURNS TRIGGER AS $$
BEGIN
  -- Validate email format
  IF NEW.email !~ '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$' THEN
    RAISE EXCEPTION 'Invalid email format';
  END IF;

  -- Validate phone number (basic check)
  IF LENGTH(NEW.phone) < 10 OR LENGTH(NEW.phone) > 20 THEN
    RAISE EXCEPTION 'Invalid phone number length';
  END IF;

  -- Validate scheduled time format
  IF NEW.scheduled_time !~ '^(1[0-2]|[1-9]):[0-5][0-9]\s?(AM|PM)$' THEN
    RAISE EXCEPTION 'Invalid scheduled time format';
  END IF;

  -- Ensure booking is not in the past (with some tolerance)
  IF NEW.scheduled_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Cannot schedule bookings in the past';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply the validation trigger
CREATE TRIGGER trigger_validate_booking_data
  BEFORE INSERT OR UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION validate_booking_data();

-- Create a function to validate review data
CREATE OR REPLACE FUNCTION validate_review_data()
RETURNS TRIGGER AS $$
BEGIN
  -- Ensure rating is within valid range
  IF NEW.rating < 1 OR NEW.rating > 5 THEN
    RAISE EXCEPTION 'Rating must be between 1 and 5';
  END IF;

  -- Ensure booking exists before allowing review
  IF NOT EXISTS (SELECT 1 FROM bookings WHERE id = NEW.booking_id) THEN
    RAISE EXCEPTION 'Cannot create review for non-existent booking';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply the validation trigger
CREATE TRIGGER trigger_validate_review_data
  BEFORE INSERT OR UPDATE ON reviews
  FOR EACH ROW
  EXECUTE FUNCTION validate_review_data();

-- =============================================
-- AUDIT LOGGING (Optional)
-- =============================================

-- Create audit log table for sensitive operations
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name VARCHAR(50) NOT NULL,
  operation VARCHAR(10) NOT NULL,
  record_id UUID,
  old_data JSONB,
  new_data JSONB,
  changed_by TEXT,
  changed_at TIMESTAMP DEFAULT NOW()
);

-- Create audit trigger function
CREATE OR REPLACE FUNCTION audit_trigger()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_logs (table_name, operation, record_id, new_data, changed_by)
    VALUES (TG_TABLE_NAME, TG_OP, NEW.id, to_jsonb(NEW), current_setting('request.jwt.claims', true)::json->>'email');
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_logs (table_name, operation, record_id, old_data, new_data, changed_by)
    VALUES (TG_TABLE_NAME, TG_OP, NEW.id, to_jsonb(OLD), to_jsonb(NEW), current_setting('request.jwt.claims', true)::json->>'email');
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_logs (table_name, operation, record_id, old_data, changed_by)
    VALUES (TG_TABLE_NAME, TG_OP, OLD.id, to_jsonb(OLD), current_setting('request.jwt.claims', true)::json->>'email');
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Apply audit triggers to sensitive tables
CREATE TRIGGER audit_bookings_trigger
  AFTER INSERT OR UPDATE OR DELETE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION audit_trigger();

-- Index for audit logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_operation
ON audit_logs (table_name, operation);

CREATE INDEX IF NOT EXISTS idx_audit_logs_changed_at
ON audit_logs (changed_at DESC);

-- =============================================
-- PERFORMANCE OPTIMIZATION
-- =============================================

-- Update table statistics
ANALYZE bookings;
ANALYZE reviews;

-- Add comments for documentation
COMMENT ON TABLE bookings IS 'Stores all booking requests for yard cleanup services';
COMMENT ON TABLE reviews IS 'Stores customer reviews and ratings for completed bookings';
COMMENT ON TABLE audit_logs IS 'Audit trail for all data modifications';

COMMENT ON CONSTRAINT check_price_positive ON bookings IS 'Ensures price is always positive';
COMMENT ON CONSTRAINT unique_review_per_booking ON reviews IS 'Prevents multiple reviews per booking';