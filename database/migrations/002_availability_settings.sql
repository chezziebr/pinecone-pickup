-- Availability Settings Tables
-- This migration creates tables for managing recurring availability schedules and exceptions

-- Main availability settings table for recurring weekly schedule
CREATE TABLE availability_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0 = Sunday, 6 = Saturday
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_available BOOLEAN NOT NULL DEFAULT true,
  slot_interval_minutes INTEGER NOT NULL DEFAULT 60,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(day_of_week, start_time, end_time)
);

-- Date-specific overrides for holidays, special events, etc.
CREATE TABLE availability_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  specific_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  is_available BOOLEAN NOT NULL,
  reason TEXT,
  override_type VARCHAR(20) NOT NULL CHECK (override_type IN ('blackout', 'special_hours', 'holiday')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for performance
CREATE INDEX idx_availability_settings_day ON availability_settings(day_of_week);
CREATE INDEX idx_availability_exceptions_date ON availability_exceptions(specific_date);

-- Update trigger for availability_settings
CREATE OR REPLACE FUNCTION update_availability_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_availability_settings_updated_at
  BEFORE UPDATE ON availability_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_availability_settings_updated_at();

-- Update trigger for availability_exceptions
CREATE OR REPLACE FUNCTION update_availability_exceptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_availability_exceptions_updated_at
  BEFORE UPDATE ON availability_exceptions
  FOR EACH ROW
  EXECUTE FUNCTION update_availability_exceptions_updated_at();

-- Insert default business hours (matching current hardcoded logic)
INSERT INTO availability_settings (day_of_week, start_time, end_time, is_available, description) VALUES
  -- Monday - Friday: 3 PM - 5 PM (weekday school hours blocked)
  (1, '15:00:00', '17:00:00', true, 'Weekday availability - after school'),
  (2, '15:00:00', '17:00:00', true, 'Weekday availability - after school'),
  (3, '15:00:00', '17:00:00', true, 'Weekday availability - after school'),
  (4, '15:00:00', '17:00:00', true, 'Weekday availability - after school'),
  (5, '15:00:00', '17:00:00', true, 'Weekday availability - after school'),
  -- Saturday: 9 AM - 4 PM
  (6, '09:00:00', '16:00:00', true, 'Weekend availability'),
  -- Sunday: 9 AM - 4 PM
  (0, '09:00:00', '16:00:00', true, 'Weekend availability'),
  -- Monday - Friday: 9 AM - 3 PM (school hours - blocked)
  (1, '09:00:00', '15:00:00', false, 'School hours - kids not available'),
  (2, '09:00:00', '15:00:00', false, 'School hours - kids not available'),
  (3, '09:00:00', '15:00:00', false, 'School hours - kids not available'),
  (4, '09:00:00', '15:00:00', false, 'School hours - kids not available'),
  (5, '09:00:00', '15:00:00', false, 'School hours - kids not available');

COMMENT ON TABLE availability_settings IS 'Recurring weekly availability schedule with configurable time blocks';
COMMENT ON TABLE availability_exceptions IS 'Date-specific overrides for holidays, special events, or one-time schedule changes';