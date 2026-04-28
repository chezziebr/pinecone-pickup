# Pinecone Pick Up Crew — Architecture

**Status as of 2026-04-28.** This document describes what the system *is* today, not what it is supposed to be. Every claim here is grounded in the code on `main` at HEAD `26c4e91` (post-cluster-3). Where current behavior diverges from intent, that divergence is called out and linked to the corresponding finding in `DISCOVERY_REPORT.md`. New contributors (human or AI) should read `DISCOVERY_REPORT.md` immediately after this, not instead of it.

---

## 1. Product thesis

Pinecone Pick Up Crew is a **single-tenant, single-location booking site** for a kid-run yard-cleanup service in Bend, Oregon. Three kids — Bruce, Zoë, Chase — pick up pinecones; customers book online; an adult supervises. Payment is cash or Venmo at time of service; no online payments are taken and none are planned in the current scope.

The product is deliberately small:
- **One admin account** (the parent, Chez).
- **One physical "resource"** — the kids together, supervised by one adult at a time.
- **One service area** — Bend, OR.
- **Two service tiers** — Pick Up Only ($20 per ¼ acre) and Pick Up + Haul Away (Pick Up base + $20 flat haul-away surcharge).
- **Four lot-size tiers** — ¼, ½, ¾, and 1 acre+ (priced as 1, 2, 3 units; 1 acre+ defaults to 3 units with a manual-review workflow deferred). Centralized in `lib/pricing.ts` (cluster 1).

The app is hosted on Vercel's free tier with no custom domain. All external dependencies — Supabase, SendGrid, Google Calendar — are chosen to fit within free tiers and to avoid needing a domain Chez owns.

**Who the user is, and why it matters.** Chez is not a full-time engineer. The app is maintained via AI-assisted "vibe coding" sessions. Architectural rules therefore need to be grep-testable or otherwise easy to enforce without code review discipline. That constraint shapes the Constitution (see `CONSTITUTION.md`) more than any technology choice.

---

## 2. Stack

| Layer | Technology | Version | Notes |
|---|---|---|---|
| Framework | Next.js (App Router) | 16.2.2 | Uses `proxy.ts` (Next 16's renamed middleware). `AGENTS.md` flags this as "not the Next.js you know" for AI assistants. |
| UI | React | 19.2.4 | All components in `components/`, all pages in `app/`. |
| Styling | Tailwind CSS | 4 | Custom palette centered on `pine`, `pine-light`, `orange`, `cream`. |
| Fonts | Fraunces + DM_Sans | — | Loaded via `next/font/google`. |
| Database | Supabase (Postgres) | — | Service-role key on every server route; RLS policies are defined but bypassed. |
| Auth | Custom JWT (`jsonwebtoken`) + bcrypt | — | Admin only. Customer booking is anonymous. |
| Email | SendGrid (`@sendgrid/mail`) | 8.x | Sends from `pinecone.pickup.crew@gmail.com`. No custom domain. |
| Calendar | Google Calendar API (`googleapis`) | 171.x | Two separate OAuth2 clients via refresh tokens, OOB redirect URI. |
| Scheduler | Vercel Cron | — | Two hourly crons declared in `vercel.json`. |
| Hosting | Vercel free tier | — | No Edge Runtime; all routes are Node serverless functions. |

**Dead dependencies cleanup** — RESOLVED cluster 1 (commit `2ce006b`). `resend`, `@react-email/components`, `react-email`, and `vercel` (the latter as a misplaced runtime dep) were uninstalled along with the lib files that referenced them. `package.json` is now free of unused runtime dependencies.

---

## 3. Repository layout

```
pinecone-pickup/
├── app/                              Next.js App Router
│   ├── layout.tsx                    Root layout, fonts, metadata
│   ├── page.tsx                      Marketing home page (composes components)
│   ├── globals.css
│   ├── admin/
│   │   ├── page.tsx                  Admin login screen
│   │   ├── dashboard/page.tsx        Admin dashboard — Overview, Bookings, Customers (link), Finances, Schedule (all five tabs functional as of cluster 2)
│   │   ├── bookings/[id]/complete/page.tsx  Post-service form (cluster 2) — admin marks a booking complete with actual lot size, payment outcome, tip, notes
│   │   └── customers/page.tsx        Standalone admin customers page (linked from dashboard's Customers tab as of cluster 2)
│   ├── booking/success/page.tsx      Post-booking confirmation screen (reads price from URL — cluster 1 Path A; no longer recomputes locally)
│   └── api/
│       ├── availability/route.ts     GET — slots for a date or available dates for a month
│       ├── book/route.ts             POST — create booking (validates, writes DB, writes calendar, emails). Records calendar_sync_status + confirmation_email_sent_at + waiver_accepted_at.
│       ├── reminders/route.ts        GET — day-before and 1-hour-before reminder cron
│       └── admin/
│           ├── login/route.ts                              POST
│           ├── stats/route.ts                              GET  — dashboard metrics (revenue uses completed_at + payment_received + tip_amount + Pacific time as of cluster 2)
│           ├── bookings/route.ts                           GET + PATCH (returns post-service columns as of cluster 2)
│           ├── bookings/[id]/route.ts                      GET  — single booking (cluster 2; used by post-service form)
│           ├── bookings/[id]/complete/route.ts             POST — admin marks complete; flips status='completed', writes 6 post-service columns (cluster 2)
│           ├── booking-health/route.ts                     GET  — surfaces calendar_sync / confirmation-email gaps (Session 4)
│           ├── customers/route.ts                          GET  — aggregated customer view
│           ├── customers/[email]/route.ts                  GET  — single-customer detail + reviews (read path retained; reviews table empty post-cluster-3)
│           ├── availability-settings/route.ts              GET/POST/DELETE
│           ├── availability-settings/[id]/route.ts         PUT
│           ├── availability-exceptions/route.ts            GET/POST/DELETE
│           ├── availability-exceptions/[id]/route.ts       PUT
│           ├── seasonal-hours/route.ts                     GET/POST/DELETE
│           ├── seasonal-hours/[id]/route.ts                PUT
│           ├── business-settings/route.ts                  GET/PUT
│           └── calendar-test/route.ts                      GET — diagnostic endpoint (see §7.4)
├── components/
│   ├── Nav.tsx, Hero.tsx, HowItWorks.tsx, Pricing.tsx, Footer.tsx
│   ├── BookingForm.tsx               The customer booking UI (client component); waiver checkbox added cluster 1; live-total Pricing display added cluster 1
│   └── admin/AvailabilitySettings.tsx  2,101 lines — weekly/exception/seasonal/buffer admin UI
├── lib/
│   ├── supabase.ts                   Client + admin Supabase clients
│   ├── auth.ts                       Real admin JWT helpers (requireAdminAuth, etc.)
│   ├── availability.ts               Thin re-exports + validation helpers (calculateServiceDuration removed cluster 1)
│   ├── availability-engine.ts        The real availability pipeline (see §5)
│   ├── google-calendar.ts            Booking-event creation (hasTimeConflict removed cluster 1)
│   ├── sendgrid.ts                   Live email provider (sendReviewRequest + template removed cluster 2)
│   ├── time.ts                       Pacific-timezone helpers (Session 3) — `pacificToday`, `pacificDateAtSlot`, `pacificDayBounds`, `pacificAddDays`, `formatPacificDate`, `pacificMonthOf` (cluster 2), `loadBusinessTimezone`, `loadServiceDurationMinutes`. The single home for wall-clock ↔ UTC conversion (CONSTITUTION §2.2).
│   ├── time.test.ts                  Vitest suite for lib/time.ts (18 tests; the only test file in the repo)
│   ├── pricing.ts                    Single source of pricing truth (cluster 1) — `calculateBookingPrice` + `LOT_SIZE_UNITS` + `PICKUP_BASE_PER_UNIT` + `HAUL_AWAY_FEE`
│   ├── constants.ts                  `WAIVER_TEXT` (cluster 1) — version-controlled liability waiver copy
│   ├── format.ts                     `formatServiceType` (cluster 2) — display helpers for non-time values
│   ├── types.ts                      Availability & time-conversion types
│   ├── validation.ts                 Input validation + second `BookingData` type (drift point — see §4); `validatePostServiceData` added cluster 2; `validateReviewData` removed cluster 2
│   └── rate-limit.ts                 In-memory per-instance rate limiter
├── database/migrations/
│   ├── 000_initial_tables.sql                       bookings + reviews `CREATE TABLE` capture (Session 4 — CONSTITUTION §6.1)
│   ├── 001_add_constraints_and_indexes.sql          Historical artifact — none of 001's named constraints applied at the time it was attempted; reconciled by 006
│   ├── 002_availability_settings.sql                Creates availability_settings + availability_exceptions, seeds defaults
│   ├── 003_business_settings.sql                    Creates business_settings + seasonal_hours
│   ├── 004_booking_downstream_status.sql            Adds calendar_sync_status + confirmation_email_sent_at on bookings (Session 4 — CONSTITUTION §4.3)
│   ├── 005_add_waiver_acceptance.sql                Adds waiver_accepted_at NOT NULL on bookings (cluster 1)
│   ├── 006_finish_001_constraints_and_triggers.sql  Applies 001's missing pieces minus the deliberate scheduled_date omission (cluster 1) — adds CHECKs, validation triggers, audit_logs + audit_trigger
│   └── 007_post_service_recording.sql               Six post-service columns + completed_at index (cluster 2)
├── public/images/kids-crew.jpeg      Hero photo
├── proxy.ts                          Next 16 middleware (security headers, HTTPS redirect, admin cache-control)
├── vercel.json                       Cron declarations only — single cron `/api/reminders` after cluster 2 review-request removal
├── next.config.ts                    Empty
├── tsconfig.json                     Paths alias `@/*` → `./*`
├── SECURITY_FIXES_IMPLEMENTED.md     Historical notes; refers to middleware.ts (renamed to proxy.ts)
├── SECURITY_GUIDELINES.md            Static guidance doc
├── SECURITY_README.md                Credential-hygiene doc
├── README.md                         Unmodified create-next-app boilerplate
├── AGENTS.md                         Next.js-version warning for agents
├── DISCOVERY_REPORT.md               Honest inventory of drift (2026-04-22) + appended corrections
├── docs/ARCHITECTURE.md              This document
├── docs/ops.md                       Operational facts (CONSTITUTION §6.2) — OAuth identities, env vars, schema state, deferred decisions, changelog
├── docs/session-preamble.md          Canonical session brief
└── CONSTITUTION.md                   Rules going forward
```

**Schema sourcing.** Migration `000_initial_tables.sql` (Session 4, commit `f49dc8b`) captures the authoritative `bookings` + `reviews` schema as `CREATE TABLE` statements. Both tables were originally created via the Supabase UI; migrations 001-007 have evolved them since. CONSTITUTION §6.1 satisfied. Rebuild caveat documented in `docs/ops.md`.

---

## 4. Data model

### Tables currently in the database

| Table | Purpose | Created by | Notes |
|---|---|---|---|
| `bookings` | Every booking attempt | `000_...sql` (Session 4 capture) | Customer + service fields + status + reminder flags + google_event_id + cluster-1/2 additions (waiver_accepted_at, calendar_sync_status, confirmation_email_sent_at, six post-service columns). 0 rows as of 2026-04-28. |
| `reviews` | Customer reviews | `000_...sql` (Session 4 capture) | 0 rows as of 2026-04-28. Write paths removed cluster 2; admin reads retained. |
| `availability_settings` | Recurring weekly hours | `002_...sql` | Seeded with default weekday 3–5 PM + weekend 9–4 PM + weekday 9 AM–3 PM "school hours" blockout. |
| `availability_exceptions` | Date-specific overrides | `002_...sql` | `override_type` ∈ {blackout, special_hours, holiday}. |
| `seasonal_hours` | Date-range recurring hours | `003_...sql` | Intended base layer for summer/winter schedules. Empty by default. |
| `business_settings` | Key/value config | `003_...sql` | Seeded with `calendar_buffer_minutes=15`, `default_service_duration_minutes=90` (read by `loadServiceDurationMinutes` in lib/time.ts since Session 3), `timezone=America/Los_Angeles` (read by `loadBusinessTimezone` since Session 3). |
| `audit_logs` | Automatic audit trail | `006_...sql` (cluster 1; finishes 001's intent) | Trigger writes on every bookings insert/update/delete. No code reads it; `audit_trigger.changed_by` is `NULL` under service-role connections. |

### `bookings` columns (canonical source: migration `000_initial_tables.sql` + 004/005/007)

- `id` UUID PK
- `first_name`, `last_name`, `email`, `phone`, `address` — customer info
- `lot_size` ∈ {`¼ acre`, `½ acre`, `¾ acre`, `1 acre+`} (DB CHECK via 006 + validation allowlist)
- `service_type` ∈ {`pickup_only`, `pickup_haul`} (DB CHECK + validation allowlist)
- `price` INTEGER (DB CHECK > 0 via 006). Note: type is INTEGER, not NUMERIC; DISCOVERY §3 originally inferred NUMERIC, corrected by Session 4 query A.
- `scheduled_date` DATE — *no* DB CHECK on `scheduled_date >= CURRENT_DATE`; deliberately omitted in migration 006 because it would block UPDATEs on past-dated bookings (e.g., the admin post-service form's `confirmed → completed` flip). API-layer `validateFutureDate` enforces "future date at create time" instead.
- `scheduled_time` TEXT matching `^(1[0-2]|[1-9]):[0-5][0-9]\s?(AM|PM)$` (DB trigger via 006)
- `notes` TEXT NULL
- `reminders_opted_in` BOOLEAN (customer checkbox on booking form)
- `status` TEXT (DB CHECK allows `('confirmed','completed','cancelled')`; validation allows only `('confirmed','completed')` after cluster 3's dead-value cleanup). Only `'confirmed'` (by `/api/book`) and `'completed'` (by the admin post-service form, cluster 2) are written by code today. `'cancelled'` retained in DB CHECK as a permissive superset for the future.
- `created_at`, `reminder_day_before_sent`, `reminder_hour_before_sent`, `review_request_sent` (column retained but no longer written — review-request workflow removed cluster 2), `google_event_id`
- **Migration 004 additions** (Session 4): `calendar_sync_status` TEXT NOT NULL DEFAULT 'pending' (CHECK enum 'pending'|'success'|'failed'), `confirmation_email_sent_at` TIMESTAMPTZ NULL.
- **Migration 005 addition** (cluster 1): `waiver_accepted_at` TIMESTAMPTZ NOT NULL — required at create time via `/api/book` validation; UI checkbox enforces.
- **Migration 007 additions** (cluster 2): `actual_lot_size` TEXT, `payment_received` BOOLEAN, `payment_method` TEXT (CHECK enum 'cash'|'venmo'|'check'|'other'), `tip_amount` INTEGER (CHECK ≥ 0), `completion_notes` TEXT, `completed_at` TIMESTAMPTZ. All NULL initially; populated together by `/api/admin/bookings/[id]/complete`.

### Reviews columns (inferred)

`id`, `booking_id` (UNIQUE — one review per booking), `rating` 1–5 (DB CHECK), `comment`, `neighborhood`, `created_at`.

### Data-model pipeline paths in practice

- **Booking creation** is the only writer to `bookings.*` for new rows; subsequent writes are admin PATCH (status, notes), the reminders cron flipping `reminder_*_sent` flags, and the admin post-service form flipping `status` to `completed` along with the post-service columns (cluster 2).
- **Customer reviews:** the write path (`/api/review`, `app/review/page.tsx`) was removed in cluster 2; the `reviews` table is retained, and admin reads (`/api/admin/stats` average, `/api/admin/customers/[email]` list) still query it.
- **`audit_logs`** is pure write-only. The trigger exists for defensive documentation, not for use.

### Canonical sources of truth

| Fact | Authoritative source |
|---|---|
| Base operating hours | `availability_settings` (weekly) and `seasonal_hours` (date-range). Seasonal hours, when present, replace weekly as the base. |
| Date-specific overrides | `availability_exceptions` |
| External time conflicts | Google Calendar ("personal" + "pinecone") |
| Calendar buffer minutes | `business_settings.calendar_buffer_minutes` |
| Lot-size pricing factors | `lib/pricing.ts` (cluster 1) — `LOT_SIZE_UNITS`, `PICKUP_BASE_PER_UNIT`, `HAUL_AWAY_FEE`, `calculateBookingPrice(lot_size, service_type)`. Single source of truth; `/api/book`, BookingForm live total, success page (via API response), and Pricing.tsx marketing copy all flow from this. |
| Service duration | `loadServiceDurationMinutes()` in `lib/time.ts` reads `business_settings.default_service_duration_minutes` (Session 3); falls back to constant 90. Hardcoded `90 * 60 * 1000` literals still exist in `lib/google-calendar.ts` and `lib/availability-engine.ts` — partial resolution; CONSTITUTION §3.3 still live work. |
| Business timezone | `loadBusinessTimezone()` in `lib/time.ts` reads `business_settings.timezone` (Session 3); falls back to constant `'America/Los_Angeles'` (the only allowed appearance of that literal in non-test code per CONSTITUTION §2.3). |

---

## 5. Availability computation pipeline

This is the load-bearing behavior of the app. The full trace lives in `DISCOVERY_REPORT.md` §4 and §8a #0. This section describes the intent and current reality.

### Intended layering (from the inline comment in `lib/availability-engine.ts`)

```
LAYER 1 (base):      seasonal_hours (if any) OR availability_settings.is_available
                     → hourly slots within each range
LAYER 2 (subtract):  availability_settings.is_available = false  (weekly blockouts)
                     + availability_exceptions partial-day blocks
LAYER 3 (override):  availability_exceptions
                       — full-day block → []
                       — any "available" exception → use ONLY exceptions as base
LAYER 4 (subtract):  Google Calendar events (personal + pinecone) with configurable buffer
```

### Actual runtime path in production right now

- **Layer 1** is running correctly. If `seasonal_hours` is empty, the seeded weekly `availability_settings` drive the base.
- **Layer 2** is running correctly.
- **Layer 3** is running correctly but is rarely exercised — no admin has typically set up "available" exceptions.
- **Layer 4 — token health restored.** Both Google refresh tokens were regenerated 2026-04-23 via the loopback flow after the OAuth app was moved to "In Production" (per `docs/ops.md`). `/api/admin/calendar-test` returns `connected` for both calendars. The original 2026-04-22 sev-1 (DISCOVERY §8a #0) is resolved on the operational side. The *architectural* concern — that the inner try/catch in `getAvailabilityData` swallows errors silently — has not been addressed; CONSTITUTION §1.1 / §4.2 still live work.

### Hidden fifth layer

If Layer 1 produces no slots (no seasonal rows, no `is_available=true` weekly rows) *or* the whole pipeline throws before completion, `getAvailableSlots` returns `getFallbackAvailableSlots(date)` — a hardcoded Saturday `['9:00 AM', …, '4:00 PM']` / weekday `['3:00 PM', '4:00 PM', '5:00 PM']`. This is not part of the documented layering model. It is a fail-open safety net with severe side effects and is flagged for removal in the Constitution.

### Timezone model

All scheduling reasoning is in Pacific time (`America/Los_Angeles`), matching the `business_settings.timezone` row that is now read by `loadBusinessTimezone()` in `lib/time.ts`.

**Session 3 (2026-04-24, commits 5172dcd / 0ade6e0 / 9c05f42 / 0ad9563) resolved the timezone bug family:**

- ~~Slot-to-calendar comparison hardcoded `-07:00` (PDT) and broke ~4 months per year in PST.~~ **Resolved** — `pacificDateAtSlot` from `lib/time.ts` does the conversion correctly via `date-fns-tz`.
- ~~`getAvailabilityData`'s Google Calendar window (`startOfDay`, `endOfDay`) was built in server-local time (UTC on Vercel).~~ **Resolved** — `pacificDayBounds` provides UTC bounds for a Pacific calendar day.
- ~~`createBookingEvent` built event timestamps in server-local time.~~ **Resolved** — uses `pacificDateAtSlot` plus the DB-backed timezone now.
- ~~Validation of "is this date in the past?" used `new Date()` in server-local (UTC) time, treating Pacific-today as past between ~4 PM and midnight.~~ **Resolved** — uses `pacificToday()` in `lib/validation.ts` and elsewhere.
- ~~Reminder-cron day arithmetic used a `Date` whose internal UTC value was actually LA wall-clock time.~~ **Resolved** — uses `pacificAddDays(dateStr, n)` for DST-safe day math.
- A sixth bug family discovered during Session 3 verification — `new Date('YYYY-MM-DD').toLocaleDateString(...)` displaying the previous day for Pacific browsers — was fixed at 8 sites by introducing `formatPacificDate` (commit 0ad9563).

CONSTITUTION §2 grep-test suite (six rules) passes clean across non-test code.

---

## 6. Communication boundaries

```
  Customer browser
      │
      │  HTTPS (Tailwind-built pages + fetch("/api/...") JSON calls)
      ▼
  Next.js server on Vercel
      │
      ├─▶ Supabase Postgres (service-role key)  ←─ sole data store
      │       bookings, reviews, availability_settings, availability_exceptions,
      │       seasonal_hours, business_settings, audit_logs
      │
      ├─▶ Google Calendar v3 API  (two OAuth2 clients via refresh tokens)
      │       personal calendar   (read — supervisor availability)
      │       pinecone calendar   (read + write — committed bookings)
      │
      └─▶ SendGrid API  (transactional email)
              from: pinecone.pickup.crew@gmail.com

  Vercel Cron  ──GET──▶  /api/reminders         (hourly)
```

There are **no inbound webhooks**. Nothing external pushes into this app. All state changes originate from the customer browser, the admin browser, or a Vercel cron tick.

There is **no real-time channel** to the kids. Their only notification surface is the pinecone Google Calendar (writes restored after token regeneration on 2026-04-23) and the admin dashboard (all five tabs functional as of cluster 2; see §7.2).

---

## 7. Primary user workflows

### 7.1 Customer booking (happy path, today, broken)

1. Customer lands on `/`. `BookingForm` renders with an empty calendar grid.
2. Calendar grid loads: `GET /api/availability?month=YYYY-MM` → `getAvailableDates` iterates every day of the month calling `getAvailableSlots`, returns days with non-empty slot lists.
3. Customer clicks a date. `GET /api/availability?date=YYYY-MM-DD` returns slot strings like `"3:00 PM"`.
4. Customer fills form, clicks Confirm. `POST /api/book` with the form body.
5. `/api/book`:
   - Rate-limits (in-memory, per serverless instance).
   - Validates and sanitizes input (`lib/validation.ts`) — including `waiver_accepted_at` required since cluster 1.
   - Re-checks business-hours, future-date, and reasonable-advance rules.
   - **Re-fetches available slots and confirms the chosen one is still there.** (TOCTOU-susceptible; no DB uniqueness.)
   - Computes price via `calculateBookingPrice(lot_size, service_type)` from `lib/pricing.ts` (cluster 1).
   - Inserts the booking row with `status='confirmed'`, `calendar_sync_status='pending'`, `waiver_accepted_at` from request body.
   - **Inserts a Google Calendar event** on the pinecone calendar. Outcome is recorded explicitly: success → `calendar_sync_status='success'` + `google_event_id` set; failure → `calendar_sync_status='failed'` + structured `[booking]`-prefixed log line. (Session 4, commit `d3b356d`.)
   - **Sends a confirmation email** via SendGrid. Outcome recorded: success → `confirmation_email_sent_at = NOW()`; failure → structured log line. (Session 4.)
   - Returns `{ success: true, bookingId, price }` to the browser.
6. Browser navigates to `/booking/success?...` with query-string details — including `price` from the API response. The success page **reads `price` from the URL** (Path A, cluster 1) instead of recomputing locally. Confirmation email shows the same canonical price.

**Current real-world behavior** (post-clusters 1/2/3):
- Step 3 calendar layer functional — tokens regenerated 2026-04-23.
- Step 5 calendar/email outcomes are tracked, surfaced via `/api/admin/booking-health`.
- Step 6 displays the canonical server-computed price.

### 7.2 Admin management

1. Chez navigates to `/admin`, enters `ADMIN_PASSWORD`.
2. `/api/admin/login` validates (bcrypt or plaintext fallback), issues an 8-hour JWT, returns it both as an httpOnly cookie and as JSON in the body.
3. Browser stores the JWT in `localStorage` and navigates to `/admin/dashboard`.
4. Dashboard loads stats and recent bookings via `/api/admin/stats` and `/api/admin/bookings?limit=5`, authenticated with `Authorization: Bearer <token>`.
5. Five tabs are rendered (all functional as of cluster 2):
   - **Overview** — revenue cards, recent bookings table (Recent Bookings now displays formatted service types via `formatServiceType` from `lib/format.ts`).
   - **Bookings** — full sortable list (scheduled_date ASC) with per-row "Complete" link (status=confirmed) or "Edit" link (status=completed) routing to the post-service form.
   - **Customers** — link card to the standalone `/admin/customers` page (cluster 2; the dashboard previously didn't link to it).
   - **Finances** — Total Revenue, Total Tips, payment-method breakdown, revenue-by-month for last 6 Pacific calendar months. Client-side aggregation from the bookings list.
   - **Schedule** — renders `AvailabilitySettings` which manages weekly settings, exceptions, seasonal hours, and the `calendar_buffer_minutes` value.

**Tab parameter handling** (cluster 2): `activeTab` is lazy-initialized from `?tab=` on the URL (validated against the known tab whitelist), so `/admin/dashboard?tab=bookings` (used by the post-service form's redirect target) lands on the right tab.

**Post-service form workflow** (cluster 2): admin clicks "Complete" on a confirmed booking → `/admin/bookings/[id]/complete` page loads booking details via `GET /api/admin/bookings/[id]` → admin records actual_lot_size, payment_received, payment_method, tip_amount, completion_notes → `POST /api/admin/bookings/[id]/complete` writes the six post-service columns + `completed_at = COALESCE(existing, NOW())` (preserves original completion timestamp on edits) + flips `status='completed'` → redirect back to `/admin/dashboard?tab=bookings`. Edit mode (when status=completed) pre-fills the form. Cross-field validation: `payment_method` required iff `payment_received=true`; `tip_amount` must be 0/empty if not paid.

**Revenue computation** (`/api/admin/stats`, corrected in cluster 2): `totalRevenue` = SUM(price + tip_amount) WHERE status='completed' AND payment_received=true. `monthlyRevenue` = same filter, additionally bucketed by Pacific calendar month using `pacificMonthOf(completed_at)`.

### 7.3 Scheduled jobs

`vercel.json` declares one hourly cron:
- `/api/reminders` — sends day-before and 1-hour-before reminders, flips `reminder_day_before_sent` / `reminder_hour_before_sent`.

The route exports `GET` (matching Vercel Cron's invocation) and validates `CRON_SECRET` at request time (returns 503 if unset rather than throwing at module load). Both fixes landed earlier (commits d4b6740 and 568cd00). The previously-documented `/api/review-request` cron was removed in cluster 2.

### 7.4 Diagnostic endpoints

Two admin-gated diagnostic surfaces, both load-bearing:

**`/api/admin/calendar-test?date=YYYY-MM-DD`** — calendar wiring health (CONSTITUTION §1.4). Returns presence of each Google-related env var, and for each calendar: `status` ∈ {`connected`, `error`, `not_tested`}, error message if any, event list for the given date. This is how the 2026-04-22 sev-1 was diagnosed.

**`/api/admin/booking-health`** (Session 4, commit `7db14e3`; CONSTITUTION §4.3) — surfaces booking integrity gaps in three categories: `calendar_sync_failed.count` (createBookingEvent threw), `confirmation_email_missing.count` (SendGrid never confirmed; excludes rows < 5 minutes old), `calendar_event_missing.count` (future bookings with no google_event_id; excludes rows < 5 minutes old). Each category returns count + first 10 rows. Green bar = all three at zero modulo accepted historical false-positives.

Together they answer two distinct questions: calendar-test = "is the wiring healthy?", booking-health = "did anything we wrote fall through the cracks?". `docs/ops.md` carries the canonical green-bar definitions.

---

## 8. Auth model

### Customer

- Fully anonymous. `/api/book` takes a POST body and trusts it modulo validation.
- Identified in the DB by email address. Two bookings from the same email address are not explicitly linked; `/api/admin/customers` aggregates by email at read time.
- There is no "my bookings" page, no magic link, no password, no Supabase Auth. The decision is deliberate and matches the product's scale.

### Admin

- One password, one JWT.
- `ADMIN_PASSWORD` env var. If it starts with `$2b$`, bcrypt is used. Otherwise plaintext equality (documented as "for migration period", no deadline).
- `JWT_SECRET` signs a payload `{ admin: true, timestamp, ip }` with issuer `pinecone-pickup`, audience `admin-panel`, `expiresIn: 8h`.
- Token is returned in two places: JSON body (for `localStorage` use) and `httpOnly; sameSite=strict; secure` cookie (unused by the client).
- `verifyAdminToken` accepts either the cookie or an `Authorization: Bearer` header. All admin pages currently use the Bearer path with `localStorage`.
- **Every `/api/admin/*` route gates on `requireAdminAuth`.** No unintentionally open admin routes.
- Admin pages (`/admin`, `/admin/dashboard`, `/admin/customers`) gate on client-side `localStorage` checks and redirect on missing token — not on server-side middleware. An unauthenticated visitor will see a flash of content before the redirect, which is cosmetic because those pages can't talk to APIs without a token.

### Known weak points

- `localStorage` storage is the path XSS would exfiltrate; the httpOnly cookie is "unused seatbelt".
- Plaintext-password fallback has no removal deadline.
- Rate limiting on the login endpoint is per serverless instance — cosmetic.
- JWT includes an `ip` claim that is not validated on subsequent requests.

Adequate for single-admin hobby scale; these are documented as debt rather than fixes.

---

## 9. Deployment and operations

### Environment variables (production)

The exhaustive list of env vars the running code actually reads (grepped from source):

**Required to boot / critical paths:**
- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — every server route dies without these.
- `ADMIN_PASSWORD`, `JWT_SECRET` — admin login dies without these.
- `CRON_SECRET` — `/api/reminders` validates this at request time and returns 503 if missing (cluster 1, commit `568cd00`; CONSTITUTION §4.1). Previously threw at module load on both cron routes; the second cron (`/api/review-request`) was removed entirely in cluster 2.

**Required for calendar integration:**
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `PERSONAL_GOOGLE_REFRESH_TOKEN`, `PERSONAL_CALENDAR_IDS` *(name plural, used singular — see `DISCOVERY_REPORT.md` §8c #10)*
- `PINECONE_GOOGLE_REFRESH_TOKEN`, `PINECONE_CALENDAR_ID`

**Required for email:**
- `SENDGRID_API_KEY` — required.
- `SENDGRID_FROM_EMAIL` — optional; defaults to `pinecone.pickup.crew@gmail.com`.

**Miscellaneous:**
- `NEXT_PUBLIC_BASE_URL` — historically used to build the review-email link; the only consumer (`sendReviewRequest`) was removed in cluster 2. Effectively unused now; safe to remove from Vercel.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — constructed into `supabaseClient` in `lib/supabase.ts` but that client is never imported. Effectively unused.
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL` — referenced only by the dead `lib/resend.ts`. Safe to remove from Vercel.
- `NODE_ENV` — read for prod/dev branching in `proxy.ts` and `lib/errors.ts`.

### OAuth app (Google Cloud Console)

- **Publishing status: In Production** since 2026-04-22 (full record in `docs/ops.md`). Refresh tokens no longer have a 7-day expiry; the 2026-04-22 sev-1 (DISCOVERY §8c #2) is resolved.
- Redirect URIs: (a) `https://developers.google.com/oauthplayground` — the original OOB-era URI, retained as an emergency browser-only re-auth fallback; (b) `http://127.0.0.1:53682/` — added 2026-04-23 for the loopback flow used by `scripts/get-refresh-token.mjs`. Both refresh tokens were regenerated on 2026-04-23 via the loopback flow.

### Scheduling

- Vercel Cron declarations live in `vercel.json`. Single cron `/api/reminders` runs hourly (`0 * * * *`); the previously-documented `/api/review-request` cron was removed in cluster 2. Timezone of cron evaluation is UTC.
- Vercel Cron is GET-only (no configurable method). Routes must export `GET` (CONSTITUTION §5.1; fixed in commit `d4b6740`).
- No other scheduled infrastructure exists. Sub-minute or minute-level scheduling is not available on Vercel's free tier.

### Security headers

`proxy.ts` applies on every non-static route: CSP, HSTS (prod only), X-Frame-Options `DENY`, X-Content-Type-Options, X-XSS-Protection, Referrer-Policy, Permissions-Policy (camera/mic/geo denied), and admin-route cache-control. The CSP `connect-src` allows `api.resend.com` (ghost from the Resend era) and does not include SendGrid's domain. Server-side SendGrid calls aren't affected; this is drift, not a bug.

### Observability

- `console.log` / `console.error` only. Logs live in Vercel's function logs dashboard.
- No Sentry, DataDog, or external error tracker.
- No structured health check endpoint other than the informal `/api/admin/calendar-test` (admin-gated).

### Deployment model

- `main` branch auto-deploys to production via Vercel's GitHub integration.
- No staging environment.
- One automated test file: `lib/time.test.ts` (vitest, 18 tests covering Pacific-timezone helpers; added Session 3). No CI beyond Vercel's build — tests are run locally via `npm test` as a verification gate before commits.

---

## 10. Known architectural debt

The complete inventory is in `DISCOVERY_REPORT.md` §8. This section captures only the debt that **shapes how the system should be reasoned about** — not a duplicate list.

1. ~~**Google Calendar integration is currently non-functional in production** (`invalid_grant` on both refresh tokens).~~ **RESOLVED 2026-04-23.** OAuth app moved to In Production; both refresh tokens regenerated via the loopback flow. `/api/admin/calendar-test` returns `connected` for both calendars. See `docs/ops.md` for the full timeline.
2. **Two silent catches in the availability pipeline absorb errors into plausible-looking output.** Both must become fail-closed. This is the architectural single biggest lesson of the original session and remains live work — CONSTITUTION §1.1 / §4.2 codify the rule but the implementation in `lib/availability-engine.ts` `getAvailabilityData` still has the silent `catch`.
3. ~~**Pricing has no single source of truth.**~~ **RESOLVED cluster 1 (commits `dcc7308`, `2c5773d`, `3049471`).** `lib/pricing.ts` is the single source — `calculateBookingPrice` + constants. `/api/book`, BookingForm live total, success page (via API response, Path A), and `Pricing.tsx` marketing copy all flow from it. Pricing math bug (haul-away as multiplier instead of flat surcharge) also fixed in the same cluster.
4. ~~**Timezone handling is inconsistent.**~~ **RESOLVED Session 3 (2026-04-24, commits 5172dcd, 0ade6e0, 9c05f42, 0ad9563).** `lib/time.ts` is the single helper home; six grep-test rules in CONSTITUTION §2 pass clean across non-test code. See §5 above for the full list of bug families resolved.
5. **(Historical, resolved.)** The cron routes once exported `POST` while Vercel Cron sends `GET`, so every tick returned 405 — fixed in commit d4b6740 (cluster 1 era). The review-request cron has since been removed entirely (cluster 2); only `/api/reminders` remains. Revenue metrics now depend on the admin post-service form flipping `status` to `completed`, not on a cron.
6. ~~**Significant dead code and dead dependencies**~~ **RESOLVED cluster 1 (commit `2ce006b`)** + ongoing. Cluster 1 deleted `lib/resend.ts`, `lib/admin-auth.ts`, `lib/errors.ts`, `hasTimeConflict`, `calculateServiceDuration` and uninstalled `resend`, `@react-email/components`, `react-email`, `vercel`. Cluster 2 removed `sendReviewRequest` + `validateReviewData` + `ReviewData`. Cluster 3 dropped `'pending'` and `'cancelled'` from validation STATUSES. Remaining: `business_settings.timezone` and `default_service_duration_minutes` rows now ARE read (Session 3); `audit_logs` write path lives via migration 006 with no reader (acknowledged caveat). Plural `PERSONAL_CALENDAR_IDS` env var still drift (deferred per ops.md).
7. ~~**The admin dashboard overstates what it offers** — three of five tabs are placeholders while the login screen advertises them.~~ **RESOLVED cluster 2 (commits `cb003dc`, `d932fec`, `c8f5428`).** All five tabs functional.
8. ~~**`bookings` and `reviews` table schemas are not in the repo.**~~ **RESOLVED Session 4 (commit `f49dc8b`)** — migration `000_initial_tables.sql` captures both. CONSTITUTION §6.1 satisfied.

---

## 11. Scoping notes

What is deliberately **out of scope** in the current product, and should stay out unless Chez explicitly expands it:

- **No online payments.** Cash or Venmo at time of service. No Stripe integration, no payment intent, no invoicing.
- **No customer accounts.** Bookings are aggregated by email at read time only.
- **No customer-facing cancel or reschedule flow.** Confirmation emails and the success page direct customers to call/text or email Bruce. The DB CHECK on `bookings.status` retains `'cancelled'` as a permissive superset for the future; validation no longer accepts `'pending'` or `'cancelled'` after cluster 3's dead-value cleanup. See `docs/ops.md` "Cancellation flow" deferred-decisions item — deferred indefinitely at current scale.
- ~~**No liability waiver yet.**~~ **BUILT cluster 1 (commits `faeb449`, `0a3f2b3`).** Migration 005 added `waiver_accepted_at TIMESTAMPTZ NOT NULL` to `bookings`; `lib/constants.ts` exports `WAIVER_TEXT`; BookingForm renders the text inline above a required checkbox; submit button disabled until checked; `/api/book` rejects requests without `waiver_accepted_at` via `validateBookingData`.
- **No multi-tenant support.** The app assumes one business, one admin, one pair of calendars. Renaming env vars or paths to suggest multi-tenancy (e.g., `PERSONAL_CALENDAR_IDS`) is drift, not architecture.
- **No SMS.** All notifications are email.
- **No marketing automation.** No tracking pixels, no CRM integration, no drip campaigns.
- **No custom domain.** `pinecone-pickup.vercel.app` only. This constrains email deliverability (SendGrid with a gmail.com `from` address) and forecloses Resend (which requires a verifiable domain).

What is **in scope but unbuilt**:

- ~~The Testimonials section on the home page is hardcoded.~~ **RESOLVED 2026-04-27 (cluster 3, commit `7fa3b07`).** Section deleted entirely; reviews table is empty and frozen (the customer-facing write path was removed in cluster 2). Re-introduce only when a curated source of real testimonials exists.
- ~~A short "waiver accepted" checkbox on the booking form, backed by a `waiver_accepted_at` column, is a near-zero-risk addition that Chez has flagged as desired.~~ **RESOLVED cluster 1 (commits `faeb449`, `0a3f2b3`).** See §11 above.
- ~~The three "coming soon" dashboard tabs either need to be built (Bookings, Customers, Finances surface work) or removed from the UI so the admin landing page doesn't advertise vaporware.~~ **RESOLVED cluster 2 (commits `cb003dc`, `d932fec`, `c8f5428`).** All three tabs built; Customers tab links to the standalone `/admin/customers` page rather than duplicating it.
