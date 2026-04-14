-- Business Settings Table
-- Key-value store for application-wide settings like buffer times, seasonal hours, etc.

CREATE TABLE IF NOT EXISTS business_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(100) NOT NULL UNIQUE,
  value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_business_settings_key ON business_settings(key);

-- Update trigger
CREATE OR REPLACE FUNCTION update_business_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_business_settings_updated_at
  BEFORE UPDATE ON business_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_business_settings_updated_at();

-- Insert default settings
INSERT INTO business_settings (key, value, description) VALUES
  ('calendar_buffer_minutes', '15', 'Buffer time (in minutes) added before and after Google Calendar events'),
  ('default_service_duration_minutes', '90', 'Default duration of a booking in minutes'),
  ('timezone', 'America/Los_Angeles', 'Business timezone for scheduling');

-- Seasonal Hours Table
-- Define operating hours that apply within specific date ranges
CREATE TABLE IF NOT EXISTS seasonal_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT valid_date_range CHECK (start_date <= end_date),
  CONSTRAINT valid_time_range CHECK (start_time < end_time)
);

CREATE INDEX idx_seasonal_hours_dates ON seasonal_hours(start_date, end_date);
CREATE INDEX idx_seasonal_hours_day ON seasonal_hours(day_of_week);

-- Update trigger for seasonal_hours
CREATE OR REPLACE FUNCTION update_seasonal_hours_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_seasonal_hours_updated_at
  BEFORE UPDATE ON seasonal_hours
  FOR EACH ROW
  EXECUTE FUNCTION update_seasonal_hours_updated_at();

COMMENT ON TABLE business_settings IS 'Application-wide settings stored as key-value pairs';
COMMENT ON TABLE seasonal_hours IS 'Operating hours that apply within specific date ranges, overriding default weekly schedule';
