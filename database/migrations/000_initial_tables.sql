-- Snapshot of bookings + reviews schema as of 2026-04-25 (post-migration-004).
-- Run this migration in Supabase SQL Editor.
--
-- WHY THIS EXISTS (CONSTITUTION §6.1)
-- Both `bookings` and `reviews` were originally created via the Supabase UI.
-- Migrations 001-004 modify them but assume they already exist. Without this
-- file, the DB cannot be recreated from source control. Numbered 000 so it
-- runs first if a fresh rebuild ever happens.
--
-- WHAT THIS CAPTURES
-- Exactly the columns, types, defaults, NOT NULLs, and constraints currently
-- in production — nothing more. Indexes and triggers are NOT included here:
-- indexes belong to migration 001 (performance, not schema integrity);
-- triggers were claimed by migration 001 but Query C/D on 2026-04-25 showed
-- none of them actually exist in production (see drift list below).
--
-- WHAT MIGRATIONS 001-004 ACTUALLY DID (per Query A/B/C/D on 2026-04-25)
-- - 001: PARTIALLY applied. Three CHECK constraints and the indexes appear
--   to have run; the rest (lot_size CHECK, price > 0 CHECK, scheduled_date
--   future-date CHECK, reviews unique_review_per_booking, all triggers, and
--   the audit_logs table) did not. Likely cause: someone ran selected lines
--   manually instead of executing the whole file.
-- - 002, 003: untouched here (different tables: availability_*, business_*,
--   seasonal_hours).
-- - 004: applied in full (the two new bookings columns are reflected below).
--
-- DRIFT SURFACED BY THE QUERIES (deferred — see docs/ops.md)
-- 1. Migration 001 partially applied. Resolution options: (a) re-run the
--    missing parts and absorb any CHECK violations on existing rows, (b)
--    delete migration 001 and treat the API layer as canonical, (c) split
--    001 into "applied" and "unapplied" parts.
-- 2. bookings.status CHECK allows ('confirmed','completed','cancelled') —
--    excludes 'pending' which lib/validation.ts:38 still permits. Dormant
--    (no code path POSTs status), but real drift.
-- 3. Both 'cancelled' (DB + validation) and 'pending' (validation only) are
--    dead values — no code writes them.
-- 4. reviews.booking_id has no UNIQUE constraint despite DISCOVERY §3 claim.
--    Multiple reviews per booking are technically possible.
-- 5. No CHECK on bookings.lot_size, bookings.price > 0, or
--    bookings.scheduled_date >= CURRENT_DATE. API layer enforces; DB doesn't.
-- 6. No triggers exist on bookings or reviews. validate_booking_data,
--    validate_review_data, audit_trigger, audit_logs table — all missing.
-- 7. DISCOVERY §3 corrections: price is INTEGER (not NUMERIC); CHECKs and
--    triggers it claimed are mostly absent.
--
-- REBUILD CAVEAT
-- Running this file on a fresh DB followed by 001-004 will conflict (001's
-- partial duplicates here, 004's two ADD COLUMN statements duplicate here).
-- That cleanup is a separate task. For now, treat this file as the canonical
-- schema for new deployments and 001-004 as historical artifacts.

-- =============================================
-- bookings
-- =============================================
CREATE TABLE IF NOT EXISTS bookings (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  lot_size TEXT NOT NULL,
  service_type TEXT NOT NULL,
  price INTEGER NOT NULL,
  scheduled_date DATE NOT NULL,
  scheduled_time TEXT NOT NULL,
  notes TEXT,
  reminders_opted_in BOOLEAN DEFAULT true,
  status TEXT NOT NULL DEFAULT 'confirmed',
  google_event_id TEXT,
  reminder_day_before_sent BOOLEAN DEFAULT false,
  reminder_hour_before_sent BOOLEAN DEFAULT false,
  review_request_sent BOOLEAN DEFAULT false,
  calendar_sync_status TEXT NOT NULL DEFAULT 'pending',
  confirmation_email_sent_at TIMESTAMPTZ,

  CONSTRAINT bookings_pkey PRIMARY KEY (id),
  CONSTRAINT bookings_service_type_check
    CHECK (service_type IN ('pickup_only', 'pickup_haul')),
  CONSTRAINT bookings_status_check
    CHECK (status IN ('confirmed', 'completed', 'cancelled')),
  CONSTRAINT bookings_calendar_sync_status_check
    CHECK (calendar_sync_status IN ('pending', 'success', 'failed'))
);

COMMENT ON COLUMN bookings.calendar_sync_status IS
  'pending|success|failed — set by /api/book. CONSTITUTION §4.3.';
COMMENT ON COLUMN bookings.confirmation_email_sent_at IS
  'Timestamp of successful SendGrid send; NULL means not (yet) sent. CONSTITUTION §4.3.';

-- =============================================
-- reviews
-- =============================================
CREATE TABLE IF NOT EXISTS reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  booking_id UUID,
  rating INTEGER,
  comment TEXT,
  reviewer_name TEXT,
  neighborhood TEXT,

  CONSTRAINT reviews_pkey PRIMARY KEY (id),
  CONSTRAINT reviews_rating_check CHECK (rating >= 1 AND rating <= 5),
  CONSTRAINT reviews_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES bookings(id)
);
