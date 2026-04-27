# Pinecone Pick Up Crew — Discovery Report

**Date:** 2026-04-22
**Scope:** Full-codebase architectural review of the app at `~/ChezApps/pinecone-pickup` (branch `main`, HEAD `5ed94fa`).
**Purpose:** Honest inventory of what the app actually is, how it works, and where it has drifted. Framed to mirror the deep review done on the Level 3 CRM.

---

## 1. What this app is

**Product thesis.** A single-tenant booking site for a kid-run yard-cleanup service (Bruce, Zoë, Chase) in Bend, Oregon. Customers visit `pinecone-pickup.vercel.app`, pick a date and time from a calendar, fill in contact + address + lot size + service type, and submit. Payment is cash/Venmo at time of service. The business runs one admin account (the parent) and effectively one physical "resource" (the kids).

**Primary workflows.**

| Workflow | Status | Notes |
|---|---|---|
| Customer lands on marketing page | **Working** | `app/page.tsx` composes Nav, Hero, HowItWorks, Pricing, BookingForm, Testimonials, Footer. |
| Customer sees available slots for a date | **Broken in production** — Google Calendar layer is not subtracting; the app offers slots during blocked times. See §8a #0. Underlying timezone bugs also present. | `/api/availability?month=...` for dates, `/api/availability?date=...` for slots. The code *intends* to merge seasonal hours + weekly settings + date exceptions + Google Calendar, but currently the Google Calendar layer is ineffective. |
| Customer submits booking | **Working** | `/api/book` validates, re-checks availability, inserts row, creates Google Calendar event, sends confirmation email. |
| Customer gets confirmation email | **Working (SendGrid)** | `lib/sendgrid.ts` sends from `pinecone.pickup.crew@gmail.com`. Gmail-from, not a custom domain. |
| Customer gets "day before" reminder | **Conditional** — scheduler may never fire (see §8). |
| Customer gets "1-hour before" reminder | Same as above. **Not 3 minutes** — see §9. |
| Customer gets review-request email + lands on `/review` | **Built, but driven by the same cron that may not fire.** |
| Admin logs in and sees dashboard | **Partly working** | Overview tab + Schedule tab work. Bookings, Customers, Finances tabs are "coming soon!" placeholders in the dashboard — though a standalone `/admin/customers` page exists and is functional. |
| Admin sets seasonal hours / weekly blocks / date exceptions | **Working** | `components/admin/AvailabilitySettings.tsx` (2101 lines) drives all three via API. |
| Customer cancels or reschedules | **Does not exist** in code (expected — you said this). No half-built wiring. |
| Customer accepts a liability waiver | **Does not exist** (expected). |

**Infrastructure in the working tree but not in the user flow.** Several pieces exist that nothing references — see §8.

---

## 2. The stack

| Layer | Technology | Why it's there | Notes |
|---|---|---|---|
| Framework | **Next.js 16.2.2** (App Router, `proxy.ts` middleware) | The one file with a hint that this is not stock Next: `AGENTS.md` says "This is NOT the Next.js you know". `proxy.ts` at repo root is Next 16's replacement name for `middleware.ts`. | The `SECURITY_FIXES_IMPLEMENTED.md` doc still refers to `middleware.ts` — doc drift from the Next 15→16 rename. |
| React | 19.2.4 | Default for Next 16. | — |
| Styling | Tailwind 4 + custom `pine`/`pine-light`/`orange` palette | — | — |
| Fonts | Fraunces + DM_Sans via `next/font/google` | Marketing look | — |
| Database | **Supabase** (Postgres + service-role key) | Single table of bookings; ancillary tables for availability settings, exceptions, seasonal hours, business settings, reviews, audit_logs. | App uses service-role key from server routes. Row-Level Security policies are defined but bypassed by the service-role key. |
| Auth | **Custom JWT** signed with `JWT_SECRET`, password compared with `bcryptjs` (or plaintext during "migration"). Admin-only. Stored in `httpOnly` cookie *and* `localStorage`. | Single admin password, 8h token. | Customer booking flow is anonymous; no Supabase Auth in use. `@supabase/supabase-js` anon client is constructed in `lib/supabase.ts` but never imported anywhere. |
| Email | **SendGrid** (`@sendgrid/mail`) — actual path. `lib/sendgrid.ts` is used by `/api/book`, `/api/reminders`, `/api/review-request`. | Resend was the first attempt; SendGrid was the finished path. | **`resend` is still a dependency and `lib/resend.ts` is a parallel, unused copy of `lib/sendgrid.ts`.** Dead code, dead dependency. See §8. |
| Calendar | **Google Calendar API** via `googleapis` v171, two separate OAuth clients — one for a "personal" calendar, one for a "pinecone" calendar. Auth via refresh tokens (OOB redirect flow). | Kids' personal commitments live on the personal calendar and subtract from availability. The pinecone calendar is where booked events get written. | Refresh flow is correct (`googleapis` handles token rotation). Calendar IDs are not hardcoded — they come from env vars (`PERSONAL_CALENDAR_IDS` — plural hint of an earlier multi-calendar design — and `PINECONE_CALENDAR_ID`). |
| Scheduler | **Vercel Cron** (declared in `vercel.json`) | Two crons, both hourly: `/api/reminders` and `/api/review-request`. | Both routes export **POST** only. Vercel Cron Jobs send **GET**. **These crons likely return 405 every hour and do nothing.** See §8 (#1) for the detailed claim and how to verify. |
| Hosting | Vercel free tier | No custom domain yet, no upgraded plan. | `vercel` is oddly listed as a *runtime* dependency in `package.json` — it's the CLI and should be a devDependency at most. |
| Rate limiting | In-memory `Map` per serverless instance | Single-tenant hobby app | Effectively cosmetic on serverless — every cold start resets state. Fine for this scale but don't rely on it. |
| Security headers | `proxy.ts` (CSP, HSTS, X-Frame-Options, etc.) | Reasonable set. CSP `connect-src` allows `api.resend.com` — a ghost from the Resend era — but does *not* list SendGrid. SendGrid calls are server-side, so CSP doesn't block them; it's still drift. | — |

---

## 3. Data model

Three migrations in `database/migrations/`:

- `001_add_constraints_and_indexes.sql` — adds CHECK constraints, indexes, RLS policies, a `validate_booking_data` trigger, `validate_review_data` trigger, an `audit_logs` table, and an `audit_trigger`.
- `002_availability_settings.sql` — creates `availability_settings` and `availability_exceptions`, seeds default weekday/weekend hours.
- `003_business_settings.sql` — creates `business_settings` (key/value) and `seasonal_hours`.

**Critical gap: there is no migration that creates the `bookings` or `reviews` tables.** Migration 001 assumes they already exist and only adds constraints. The canonical source of truth for the `bookings` and `reviews` schemas lives in Supabase, not in this repo. If you ever need to recreate the DB, the migrations alone won't do it.

### Tables (inferred from code + migrations)

**`bookings`** — the core row.
Columns used by code: `id` (UUID), `first_name`, `last_name`, `email`, `phone`, `address`, `lot_size`, `service_type`, `price` (numeric), `scheduled_date` (DATE), `scheduled_time` (TEXT like "3:00 PM"), `notes`, `reminders_opted_in`, `status`, `created_at`, `reminder_day_before_sent`, `reminder_hour_before_sent`, `review_request_sent`, `google_event_id`.

CHECK constraints (from migration 001):
- `price > 0`
- `status IN ('confirmed', 'completed', 'pending', 'cancelled')`
- `lot_size IN ('¼ acre', '½ acre', '¾ acre', '1 acre+')`
- `service_type IN ('pickup_only', 'pickup_haul')`
- `scheduled_date >= CURRENT_DATE`

Trigger `validate_booking_data` also enforces: email regex, phone length 10–20, `scheduled_time` regex `^(1[0-2]|[1-9]):[0-5][0-9]\s?(AM|PM)$`.

**Drift in this table:**
- **`status` has four values, but code only ever sets two:** `confirmed` (by `/api/book`) and `completed` (by `/api/review-request` after it sends the review email). `pending` and `cancelled` are permitted by the constraint and by `lib/validation.ts` `ALLOWED_VALUES.STATUSES`, but *no code path reaches them*. The admin UI's `getStatusColor` handles `pending` and `cancelled` — defensive scar tissue for a cancel/reschedule flow that was never built.
- **`check_future_scheduled_date` uses `CURRENT_DATE`**, which is the DB server's date in its timezone (typically UTC in Supabase). Around the midnight-UTC / afternoon-Pacific boundary, a valid Pacific-today booking could fail this check.
- **No `UNIQUE(scheduled_date, scheduled_time)` constraint.** The app re-checks availability right before insert, but two simultaneous requests can both pass the check and both insert — classic TOCTOU. At kid-business scale this is a theoretical risk, not a hair-on-fire bug.

**`reviews`** — exists, but its schema isn't in the repo.
Columns used: `id` (UUID), `booking_id` (UUID), `rating` (1–5), `comment`, `neighborhood`, `created_at`.
`unique_review_per_booking` (UNIQUE booking_id) is enforced.
**Dead pipeline:** `/api/review` writes rows; `/api/admin/stats` computes an average rating; `/api/admin/customers/[email]` shows reviews. But **nothing surfaces individual reviews anywhere** — not on the marketing page, not in the admin dashboard. The Testimonials section is hardcoded ("Christine", "David", "Sarah"). **The DB currently holds one real review** (per Chez) — captured and ignored, because the UI doesn't display it anywhere.

**`availability_settings`** — weekly recurring hours (day_of_week 0–6, start_time, end_time, is_available, slot_interval_minutes). Seeded with default weekday 3–5pm and weekend 9–4 hours in migration 002. Uniqueness on `(day_of_week, start_time, end_time)`.

**`availability_exceptions`** — per-date overrides (`specific_date`, optional time range, `is_available`, `reason`, `override_type` in {blackout, special_hours, holiday}).

**`seasonal_hours`** — date-range-bounded weekly hours (name, start_date, end_date, day_of_week, start_time, end_time, is_active, priority). This is the **intended base layer** for the seasonal thesis (summer = Mon–Fri 3–8pm, winter = Mon–Fri 3–6pm).

**`business_settings`** — key/value. Currently holds `calendar_buffer_minutes=15`, `default_service_duration_minutes=90` (defined but unused; 90-min duration is hardcoded in code, see §8 #9), and `timezone=America/Los_Angeles` (defined but never read — also hardcoded in code).

**`audit_logs`** — trigger populates it on every INSERT/UPDATE/DELETE on `bookings`. **Nothing reads it.** Pure write-only overhead.

### Schema vs. code: mismatches

- `lib/validation.ts` defines `ALLOWED_VALUES.STATUSES = ['confirmed', 'completed', 'pending', 'cancelled']` — matches the DB CHECK. ✓
- `lib/validation.ts` defines `ALLOWED_VALUES.LOT_SIZES = ['¼ acre', '½ acre', '¾ acre', '1 acre+']` — matches. ✓
- `lib/validation.ts` defines `ALLOWED_VALUES.SERVICE_TYPES = ['pickup_only', 'pickup_haul']` — matches. ✓
- The DB trigger regex for `scheduled_time` is `^(1[0-2]|[1-9]):[0-5][0-9]\s?(AM|PM)$`. The validation regex in code is `^(1[0-2]|[1-9]):[0-5]\d\s?(AM|PM)$`. Equivalent. ✓
- **`BookingData` is defined in two places** — `lib/availability.ts` and `lib/validation.ts`. They have different fields (availability's has `id`/`price`/`google_event_id`; validation's does not). Drift risk if either evolves.

### Update 2026-04-27 — migration 001 history (commit c2487b2)

Sharper framing of the constraint references in §3 above. Session 4's queries (run 2026-04-25) and the migration 006 reconciliation (applied 2026-04-27) revealed that **migration 001's named constraints never applied to production at all**. The CHECK constraints that exist on `bookings` and `reviews` predating migration 006 — `bookings_service_type_check`, `bookings_status_check`, `reviews_rating_check` — were created through the Supabase UI before any migrations existed. PostgreSQL auto-named them with the `<table>_<col>_check` pattern, which is why they don't match 001's `check_*` naming.

Migration 001 likely ran but failed at the first `ALTER TABLE ADD CONSTRAINT` (probably a duplicate-by-name with a UI-created equivalent), leaving the rest of the file unrun. The exact failure mode isn't recoverable from logs.

**Migration 006** (`database/migrations/006_finish_001_constraints_and_triggers.sql`, applied 2026-04-27) brings production to 001's intended end state with one deliberate omission: the `CHECK (scheduled_date >= CURRENT_DATE)` constraint, plus the matching `IF NEW.scheduled_date < CURRENT_DATE` branch inside `validate_booking_data()`. `CURRENT_DATE` evaluates at every UPDATE; either of those would block the review-request cron's `confirmed → completed` flip on past-dated bookings. API-layer `validateFutureDate` enforces "future date at create time" — the actual business rule.

Post-006 production constraint set:
- `bookings`: `bookings_pkey`, `bookings_service_type_check` (UI), `bookings_status_check` (UI), `bookings_calendar_sync_status_check` (migration 004), `check_price_positive` (006), `check_valid_lot_size` (006).
- `reviews`: `reviews_pkey`, `reviews_booking_id_fkey`, `reviews_rating_check` (UI), `unique_review_per_booking` (006).

The hybrid naming (UI-auto-named + 006-named) is the correct state, not drift. Lines above attributing constraints "from migration 001" should be read as "constraints 001 *intended* — actual sources are now mixed."

---

## 4. Availability computation — traced end to end

This is the most load-bearing behavior in the app. The three-layer model you described (store hours → overrides → Google Calendar) is **partially there**, but with a fourth layer nobody would guess from the UI, and with multiple timezone bugs that can silently shift slots by an hour in winter or by 7–8 hours under certain calendar events.

### The code path

Customer opens `/`, the `BookingForm` component mounts and calls:

1. **`GET /api/availability?month=YYYY-MM`** — returns list of dates with any available slot.
2. After user clicks a date: **`GET /api/availability?date=YYYY-MM-DD`** — returns slot strings like `"3:00 PM"`.

Both land in `app/api/availability/route.ts`, which delegates to `lib/google-calendar.ts`. The monthly function (`getAvailableDates`) walks every day in the month and asks `getAvailableSlots` for each, then keeps those with non-empty slots. The slots function is re-exported from `lib/availability-engine.ts`, which is where the real work lives.

`lib/availability-engine.ts → getAvailableSlots(date)`:

```
getAvailabilityData(date):
  parallel {
    A. availability_settings   WHERE day_of_week = d.getDay()
    B. availability_exceptions WHERE specific_date = date
    C. seasonal_hours          WHERE day_of_week = d.getDay()
                               AND is_active AND start_date <= date <= end_date
                               ORDER BY priority DESC
  }
  parallel {
    D. Google Calendar "personal" events for the date
    E. Google Calendar "pinecone" events for the date
  }
  return { settings: A, exceptions: B, googleEvents: D+E, seasonalHours: C }

getAvailableSlots:
  if exceptions has a full-day block         → return []   (LAYER 3 hard override)
  if exceptions has any "available" exception → use ONLY exceptions, then subtract calendar
  else:
    if seasonalHours exists                   → use them as base          (LAYER 1 intended)
    else if settings.is_available exists       → use them as base          (LAYER 1 fallback)
    else                                       → return getFallbackAvailableSlots(date)  [DANGER — see §8]
    subtract settings where NOT is_available  (LAYER 2 weekly blockouts)
    subtract partial-day exception blockouts  (LAYER 2 date blockouts)
    filter out slots overlapping Google Calendar + buffer  (LAYER 4)
```

### So, are the three layers merged?

**Layer 1 (store hours): Yes** — seasonal hours *or* weekly settings form the base operating hours. Seasonal hours take precedence if any are configured. If *neither* seasonal hours nor any `is_available=true` weekly setting exists, the engine falls into `getFallbackAvailableSlots`, which returns **hardcoded** weekend slots (`9–4`) or weekday slots (`3–5`). That's a hidden fifth code path disguised as a safety net — if an admin clears all settings, the app reverts to behavior that isn't visible anywhere in the admin UI.

**Layer 2 (date overrides): Yes, with a twist** — full-day blocks, partial-day blocks, and "special hours" overrides all work. But the twist: if an admin creates an `is_available=true` exception for a date, **seasonal hours and weekly settings are ignored entirely** for that date (see `processExceptionsAvailability`). That matches "override" semantics, which is fine, but it means adding a short "special hours" exception silently replaces the entire day's availability.

**Layer 3 (Google Calendar): Yes, and there are actually *two* calendars.** Both a personal calendar (kids' commitments) and the pinecone calendar (booked events) subtract. Using the pinecone calendar as a conflict source means an existing booking blocks overlapping new bookings — defensive, even without a DB uniqueness constraint.

### But here's where availability is broken

- **Hardcoded DST offset (`-07:00`)** at `lib/availability-engine.ts:389`:
  ```js
  const slotStart = new Date(`${date}T...:00-07:00`)
  ```
  This hardcodes **PDT**. From early November through early March, Bend is on **PST (`-08:00`)**. During that window, a displayed "3:00 PM" slot is being compared against calendar events as if it were **3:00 PM PDT**, which is actually **4:00 PM PST** — i.e., the wrong hour. Google events at 4pm PST (real time of booking window) won't block the "3:00 PM" slot; events at 3pm PST will. Customers will book slots that conflict, or slots that shouldn't be shown. This is a real, seasonal bug.
- **`startOfDay` / `endOfDay` for Google Calendar queries** (`lib/availability-engine.ts:137–138`):
  ```js
  const startOfDay = new Date(date + 'T00:00:00')
  ```
  Parsed in **server local time**. Vercel serverless runs in UTC. So "start of day" = midnight UTC = 4 or 5 PM Pacific the previous calendar day. The Google Calendar query window is off by 7–8 hours. In practice, Google auto-expands with `singleEvents: true` and returns events overlapping the window, so you'll still get most of the right events — but a 10 PM Pacific event on the *previous* day will get pulled in as "today's events" and could block an afternoon slot.
- **`calendar-test` admin route uses `-07:00` too** (`app/api/admin/calendar-test/route.ts:37–38`) — same DST bug in the one place an admin would go to verify calendar wiring. So the diagnostic tool reflects the same wrong assumption as production.
- **Service duration is hardcoded to 90 minutes everywhere**. `business_settings` has a `default_service_duration_minutes = 90` row that no code reads. `lib/availability.ts` exports `calculateServiceDuration(service_type, lot_size)` that returns 60–180 minutes based on inputs — **nothing imports this function.** Fragment of a finished feature.

### What the customer actually sees

Shortest honest answer: a merged view of (seasonal hours OR weekly settings OR hardcoded fallback) minus (weekly blockouts, partial-date blockouts) or completely replaced by date-specific "available" exceptions, with Google Calendar (both calendars) subtracted — but with a ±1 hour error between roughly November and March.

---

## 5. Communication boundaries

**Client ↔ Server.** All customer interactions go through `/api/...` Next.js route handlers. No direct Supabase calls from the browser. Good.

**Server ↔ Supabase.** Every server route uses `supabaseAdmin` (service-role key). RLS policies exist (migration 001) but are bypassed by the service-role key; they're "documentation" per the migration's own comment. Acceptable for a single-tenant app, risky to forget if you ever expose any route to anon callers.

**Server ↔ Google Calendar.** `googleapis` with `google.auth.OAuth2` and two refresh tokens (`PERSONAL_GOOGLE_REFRESH_TOKEN`, `PINECONE_GOOGLE_REFRESH_TOKEN`). OAuth redirect URI is `urn:ietf:wg:oauth:2.0:oob` — the deprecated out-of-band flow. It still works for already-issued refresh tokens, but **Google has been phasing this out since 2022** and could break token issuance entirely for any future re-auth. Getting a new refresh token if either of these leaks or expires will require switching to an actual redirect flow. Not an acute risk but a latent one.

**Server ↔ SendGrid.** `sgMail.setApiKey(process.env.SENDGRID_API_KEY)` at module load. `from` is `SENDGRID_FROM_EMAIL` or falls back to the hardcoded `pinecone.pickup.crew@gmail.com`. No SPF/DKIM discussion in-repo — SendGrid does its own signing, but the Gmail `from` address has some deliverability risk.

**Server ↔ Vercel Cron.** `vercel.json` schedules `/api/reminders` and `/api/review-request` hourly. See §8 #1 for why this probably never actually runs right now.

**No webhooks inbound.** No Stripe, no Twilio, no Supabase webhooks. Nothing external can push into this app.

---

## 6. Auth model

**Customer-facing:** fully anonymous. The booking form POSTs to `/api/book` with no auth. Bookings are stored keyed by email, but anyone can submit anything. The rate limiter (5 bookings per 15 min per IP) is the only abuse control, and it's in-memory per serverless instance.

**Admin-facing:** a single password → JWT flow.
- `ADMIN_PASSWORD` env var, compared with bcrypt if it starts with `$2b$`, otherwise plaintext equality. The plaintext fallback was originally labeled "for migration period" but that migration has no end date.
- JWT is signed with `JWT_SECRET`, issuer `pinecone-pickup`, audience `admin-panel`, 8h expiry, includes an `ip` claim (informational only — it's not validated on subsequent requests).
- Returned *both* as JSON body (the client stores it in `localStorage`) *and* as an `httpOnly; sameSite=strict; secure` cookie.
- **The client code uses `localStorage` + `Authorization: Bearer` header.** The httpOnly cookie path is also accepted by `verifyAdminToken`, but the dashboard never leans on it. This means any XSS on the admin pages exfiltrates the token — and it also means the extra security of the httpOnly cookie is wasted.
- There are *two* auth helper files: `lib/auth.ts` (the real one, `requireAdminAuth`) and `lib/admin-auth.ts` (a wrapper returning `{success, error}` instead of throwing). `lib/admin-auth.ts` is **never imported by anything outside its own export** — dead code.

**Admin routes currently gated:** every `/api/admin/*` route I read calls `requireAdminAuth(request)` as its first line. `/api/admin/calendar-test`, `/api/admin/business-settings`, `/api/admin/stats`, `/api/admin/bookings`, `/api/admin/customers*`, `/api/admin/availability-*`, `/api/admin/seasonal-hours*`, `/api/admin/login` — all gated (login being the exception, for obvious reasons). No admin route is unintentionally open.

**Admin pages** (`/admin`, `/admin/dashboard`, `/admin/customers`) rely purely on client-side `localStorage` checks. Bookmarking `/admin/dashboard` directly will briefly render before the effect redirects unauthenticated users back to `/admin`. No SSR auth gate, no Next.js middleware gate in `proxy.ts`. Low risk — the page itself can't talk to the APIs without a token — but a small UX issue.

**No customer-account concept.** A customer who booked twice isn't linked; the admin customers endpoint aggregates by email address at read time. No "my bookings" page exists.

---

## 7. Deployment

- **Vercel.** `vercel.json` declares two crons; no other Vercel config. No Edge Runtime declared; all routes are Node serverless functions by default.
- **Env vars required** (discovered by grepping `process.env.*`):
  - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
  - `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL` (optional, has fallback)
  - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
  - `PERSONAL_GOOGLE_REFRESH_TOKEN`, `PERSONAL_CALENDAR_IDS` (spelled plural but used as single string)
  - `PINECONE_GOOGLE_REFRESH_TOKEN`, `PINECONE_CALENDAR_ID`
  - `ADMIN_PASSWORD`, `JWT_SECRET`, `CRON_SECRET`
  - `NEXT_PUBLIC_BASE_URL` (used in review email link — if unset, the review URL renders as `undefined/review?booking=...`)
  - `RESEND_API_KEY`, `RESEND_FROM_EMAIL` — referenced by the dead `lib/resend.ts`. Not required.
- **Critical behavior on env var absence:** both cron route files (`reminders`, `review-request`) do `if (!CRON_SECRET) throw new Error(...)` **at module load**, not at request time. On Vercel, this means the serverless function fails to import, and every cron invocation fails with a 500 before any of the handler logic runs. If `CRON_SECRET` is not set in Vercel env, both crons are dead by design.
- **`next-env.d.ts`** (generated file, referenced in `tsconfig.json`) is not present in the repo; regenerated on build. Fine.
- **OAuth tokens** live in Vercel env vars, not in the repo. Good.
- **Calendar IDs are not hardcoded** — they're in env. Good.

**Local `.DS_Store` files.** `./.DS_Store` and `./app/.DS_Store` exist on disk. Neither is tracked in git; `.gitignore` catches them (redundantly — `.DS_Store` is listed twice in the gitignore, harmless).

---

## 8. Drift, debt, and bugs — the honest inventory

Roughly bucketed from worst to most cosmetic. Anything with "**MOST IMPORTANT**" is load-bearing for core promised behavior.

### 8a. Correctness bugs

**0. [SEVERITY 1 — ROOT CAUSE CONFIRMED] Google Calendar layer is silently returning zero events; availability is not subtracting anything.**

*Evidence (Chez's manual test on 2026-04-22).* On Saturday **2026-04-25**, the booking page offers slots across the 9 AM – 3 PM window, **including 12:00 PM**, and **including** times explicitly blocked on the Google calendars:
- 10 AM – 12 PM is blocked on the personal (adult-supervisor) calendar → still offered.
- 2 PM – 3 PM is blocked on the pinecone calendar → still offered.

*Root cause, confirmed.* The admin diagnostic `/api/admin/calendar-test?date=2026-04-25` returned:
```json
{
  "envVarsPresent": { "GOOGLE_CLIENT_ID": true, "GOOGLE_CLIENT_SECRET": true,
                      "PERSONAL_GOOGLE_REFRESH_TOKEN": true, "PINECONE_GOOGLE_REFRESH_TOKEN": true,
                      "PERSONAL_CALENDAR_IDS": true,  "PINECONE_CALENDAR_ID": true },
  "personalCalendar": { "status": "error", "error": "invalid_grant",
                        "calendarId": "a3f65d035a0fe998...@group.calendar.google.com" },
  "pineconeCalendar": { "status": "error", "error": "invalid_grant",
                        "calendarId": "pinecone.pickup.crew@gmail.com" }
}
```
**Both refresh tokens are returning `invalid_grant`** when exchanged at Google's OAuth endpoint. Every env var is present; the tokens themselves are the broken piece.

*Exact execution path.* The `Promise.all([calendar.events.list(...), calendar.events.list(...)])` in `getAvailabilityData` rejects. The **inner** try/catch at `lib/availability-engine.ts:163–166` swallows the error, `googleEvents` stays at its initialized `[]`, and `getAvailabilityData` returns normally with `{settings, exceptions, googleEvents: [], seasonalHours}`. `getAvailableSlots` proceeds straight down the DB-driven happy path: seeded Saturday `availability_settings` (9:00–16:00, 60-minute interval) produce `['9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM']`. Layer 4's `filterGoogleCalendarConflicts` runs, but `[].some(...)` is always false, so every slot passes. The customer sees a day-is-open calendar regardless of real commitments. The presence of `12:00 PM` in the slot list is the exact fingerprint of this path.

*Why this is severity 1.* The personal calendar is the **adult supervisor's calendar** — its purpose is to block times when no adult is available to chaperone the kids. Allowing a customer to book during a supervisor-unavailable window is not a cosmetic scheduling bug — it's a commitment the business cannot physically keep. The pinecone calendar failing to subtract means existing bookings don't protect their own time slots. Both are worse than any missing email.

*The architectural root enabler: two fail-open catches, both live.*
- The **inner** catch in `getAvailabilityData` is what fired in this incident. It converts any Google Calendar failure into `googleEvents = []` and continues as if everything is fine. No user-visible signal, no alert, no degraded-state flag on the response. The customer gets a false-positive schedule.
- The **outer** catch in `getAvailableSlots` (lib/availability-engine.ts:253–258) is a *sibling hazard* of the same pattern — on any database error it returns `getFallbackAvailableSlots(date)`, a hardcoded Saturday 9-4 / weekday 3-5 list. That path wasn't triggered here (noon presence rules it out), but it's the exact same "swallow the error, invent plausible output" pattern that enabled this failure to reach customers.

Both catches should be considered enabling bugs. The Constitution needs to ban this pattern for any code path that feeds the public booking UI.

*Latent bugs — still in the code, currently unreachable.*
- **DST bug (§8a #2).** `filterGoogleCalendarConflicts` still runs — the hardcoded `-07:00` code path at line 389 is executed for every slot — but with `googleEvents = []` there's nothing to compare against, so the incorrect Date objects have no effect. The moment the tokens are fixed and events flow again, this bug reactivates, and from ~Nov 2026 onward slots will misalign with calendar events by 1 hour.
- **Event-creation timezone bug (§8a #8).** `createBookingEvent` runs on every booking and currently also fails with `invalid_grant` (it uses the same `PINECONE_GOOGLE_REFRESH_TOKEN`). The booking-route try/catch at `app/api/book/route.ts:123–136` swallows the failure; the booking row is still written, and `google_event_id` stays `null`. **No bookings are being written to the pinecone calendar right now.** The moment the token is fixed, the 7–8-hour offset bug activates and all newly-booked events will land on the calendar at the wrong wall-clock time.

*Cascading consequence.* Because (a) `createBookingEvent` is failing silently, (b) the admin dashboard's "Bookings" tab is a "coming soon" placeholder (§8c #2), and (c) there's no real-time notification surface, the kids' primary channel for seeing new bookings (the pinecone Google calendar) is effectively offline. Bookings made today exist in the DB but may not be visible to the kids until someone manually checks the admin Overview tab or the standalone `/admin/customers` page. **Any booking made between the last working token state and now exists only in Supabase** — the pinecone calendar is missing those entries. When tokens are fixed, those historical bookings will need manual backfill.

*Next actions, in priority order.*

1. **Regenerate both refresh tokens.** See the new §8c finding on OAuth publishing status — a Testing-mode app is the most plausible reason both tokens died simultaneously. Either move the OAuth app to "In Production" (durable fix) or accept re-auth every 7 days (short-term workaround).
2. **Re-run `/api/admin/calendar-test?date=<today>`** after regenerating. Expect `"status": "connected"` with a sensible `eventCount` on each calendar. Keep this endpoint as the canonical "is calendar wiring healthy?" check.
3. **Backfill missed bookings.** Query `bookings WHERE google_event_id IS NULL AND created_at > <last-known-good-date>`. Manually create calendar events for those that are still in the future, or confirm with the customers whether the slot is still wanted.
4. **Fix the DST bug (§8a #2) and the event-creation timezone bug (§8a #8) *before or together with* the token fix.** Otherwise the symptom flips from "no calendar subtraction" to "wrong-by-1-hour subtraction in winter" and "events landing 7–8 hours off on the kids' calendar." The user-visible effect may actually get *worse* until those are fixed.
5. **Make both catches fail-closed.** The inner catch should either (a) re-throw with a degraded-mode flag the route can surface, or (b) return `[]` slots when calendar data can't be verified. The outer catch should likewise return `[]`, not hardcoded slots. The Constitution will codify this.

---

**1. [MOST IMPORTANT] Vercel crons likely never fire the handlers.**
`vercel.json` schedules two crons but the route files export only `POST`. Vercel Cron Jobs send `GET` by default. If Vercel is hitting these routes with GET, they return 405 Method Not Allowed and nothing in those handlers ever runs. That means **the 1-hour and day-before reminder emails never send, and the review-request emails never send**, regardless of how correct the rest of the logic is. The day/hour-before booleans on bookings will remain `false` forever.
*How to verify:* open the Vercel dashboard → the project → Cron Jobs tab → check recent invocations. If they're all 405, confirmed. Fix is a 2-line change: rename `POST` to `GET` in each route (and adjust the test tooling accordingly).

**2. [MOST IMPORTANT] DST bug in slot-to-calendar conversion.**
`lib/availability-engine.ts:389` hardcodes `-07:00` (PDT). During PST (~Nov 1 – early March), every slot's Date object is wrong by 1 hour when compared against Google Calendar events. Result: during winter, the calendar subtraction layer subtracts the wrong hour — events that should block a slot won't, and events that shouldn't block a slot will. The current date is April 22, 2026 (PDT), so the bug is dormant today. It'll reappear November 2026.

**3. [MOST IMPORTANT] "Fail open" fallback in `getAvailableSlots`.**
`lib/availability-engine.ts:253–258`: any thrown error (DB down, Google down, bad row, whatever) makes the function return `getFallbackAvailableSlots(date)` — hardcoded weekend/weekday slots. Database outage ⇒ customers see a full schedule of slots that don't reflect current seasonal hours or today's blockouts, and can book slots that aren't real. The safer default is `[]` (no slots when the system can't answer confidently). This is exactly the kind of "failure mode that fakes success" the Level 3 review flagged.

**4. [MOST IMPORTANT] Timezone-ambiguous "today" in the booking form.**
`components/BookingForm.tsx:105`: `const today = new Date().toISOString().split('T')[0]` — that's today's date **in UTC**. Between ~4 PM Pacific and midnight Pacific, UTC is already on the next calendar day. A Pacific user at 6 PM sees "today" (their real today) treated as past and disabled in the calendar grid. Same class of bug repeated in `lib/availability.ts:22-24`, `lib/validation.ts:157-163`.

**5. Reminder job cross-day bug.**
`app/api/reminders/route.ts:31`: the `losAngelesTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Los_Angeles"}))` pattern creates a Date whose *internal UTC timestamp is actually the LA wall-clock time*. It's a Date that lies about its timezone. When you then compute `tomorrow.toISOString().split('T')[0]`, you're converting that lying Date back to UTC — and UTC will again shift 7–8 hours, sometimes landing on the wrong day. The day-before reminder scan may query the wrong date on certain crons (e.g., a cron firing near midnight UTC).

**6. Revenue math depends on a cron that may not be running.**
`app/api/admin/stats/route.ts:45–50` and `/api/admin/customers/[email]/route.ts:54–55` sum revenue only from rows where `status === 'completed'`. The **only** code path that sets `status='completed'` is `/api/review-request` after it successfully emails. If that cron doesn't run (see #1), every real booking stays `confirmed` forever and **total revenue stays $0**. The UI will tell the admin he earned nothing even after a summer of bookings.

**7. [MOST IMPORTANT] Pricing duplicated and diverging.**
Three places compute or display price:
- `app/api/book/route.ts:11–83` — authoritative: `basePrice × lotSizeUnits`. For 1-acre Pick-Up+Haul, this is $160.
- `app/booking/success/page.tsx:24–26` — **wrong**: `const basePrice = service === 'Pick Up Only' ? 20 : 40; const price = basePrice`. Ignores lot size. The comment on the next line literally says: `// This would be calculated based on lot size in real implementation`. A customer booking a 1-acre haul-away sees "Total Price: $40" on the success page. The confirmation email (which pulls `price` from the row) will show $160. Customers will notice.
- `components/Pricing.tsx` and `components/Hero.tsx` — marketing copy, correct framing but never reconciled with the real computed total.

**8. Google Calendar event creation is off by 7–8 hours.**
`lib/google-calendar.ts:28–29` builds the event start time by `new Date(date + 'T00:00:00').setHours(hour24, minutes, 0, 0)` — that's server-local-time (UTC) arithmetic. Then it sends `dateTime: startTime.toISOString()` (UTC) along with `timeZone: 'America/Los_Angeles'`. Google's API treats the ISO string as authoritative when the `Z` suffix is present; the `timeZone` field becomes a display label. **Every booked calendar event is created at the wrong wall-clock time in Pacific — 7 or 8 hours early.** When the kids look at their calendar, "3:00 PM" bookings show as "8:00 AM" or "7:00 AM" entries. Verify by looking at any existing booking on the pinecone calendar vs. what the customer sees on the success page.
*(If events currently look right on the calendar, either there are no real bookings yet, or the calendar is rendering in a timezone that happens to match — either way the code is not trustworthy.)*

**9. `getAvailableDates` has a dead branch in its filter.**
`lib/google-calendar.ts:74–78`:
```js
const isWeekdayAfter230 = !isWeekend && date.getHours() >= 14.5
if (isWeekend || (!isWeekend && dayOfWeek !== 0)) { ... }
```
`date = new Date(year, month-1, day)` always has hours=0, so `isWeekdayAfter230` is always false — variable computed but never used. The actual guard `if (isWeekend || (!isWeekend && dayOfWeek !== 0))` simplifies to "every day that isn't Sunday, OR Sunday" = "every day". The elaborate condition is a no-op; every day of the month is checked. Works by accident.

**10. No DB uniqueness on slot time.**
Two customers racing can both book `2026-08-15 3:00 PM`. The availability re-check in `/api/book` reduces but doesn't eliminate the window. Scale-dependent; probably fine today.

### 8b. Dead code & dead dependencies

1. **`lib/resend.ts`** — unused copy of `lib/sendgrid.ts`. No import references it anywhere.
2. **`resend` npm dependency** — not imported by any live code path.
3. **`@react-email/components`** and **`react-email`** dependencies — not imported by anything; nothing constructs React Email components, all email HTML is string-concatenated.
4. **`lib/admin-auth.ts`** — defines `verifyAdminAuth`; nothing outside the file imports it.
5. **`audit_logs` table** — written by trigger, read by nothing.
6. **`calculateServiceDuration`** in `lib/availability.ts` — exported, unused. Hardcoded 90 min lives on in `lib/google-calendar.ts` and the engine.
7. **`business_settings.default_service_duration_minutes`** and **`business_settings.timezone`** — rows exist in the seed, but no code reads either. Only `calendar_buffer_minutes` is actually consumed.
8. **`hasTimeConflict`** function in `lib/google-calendar.ts:35` — not called; the real conflict check is in `availability-engine.ts`. Leftover from the pre-engine era.
9. **`customer_name:first_name, customer_last_name:last_name, ...`** aliases in `app/api/admin/bookings/route.ts:22–28` — Supabase column aliasing that populates extra fields the formatter ignores. It falls back to `booking.first_name` etc., so the aliases are wasted.
10. **`lib/errors.ts`** — extensive error-handling library (`ApiError`, `withErrorHandling`, `createErrorResponse`, `sanitizeErrorMessage`, …). **Not imported by any route.** Every route has its own `NextResponse.json({error}, {status})` pattern. The abstraction was designed and never adopted.
11. **Dead status values** (`pending`, `cancelled`) — permitted by the DB CHECK and by the validation `ALLOWED_VALUES`, but no code path ever sets them. The admin status-color switch handles them — preemptive UI for a cancel/reschedule workflow that was never built.
12. **`vercel` runtime dependency** — the Vercel CLI is listed in `package.json` `dependencies`, not `devDependencies`. Likely `npm install --save vercel` when meaning `--save-dev`.
13. **`SECURITY_FIXES_IMPLEMENTED.md` referencing `middleware.ts`** — Next 16 renamed middleware to proxy; the doc wasn't updated.
14. **`README.md` is the generic `create-next-app` boilerplate.** Zero description of what the app is.

### 8c. Quieter drift

1. **The "personal" Google calendar is the adult-supervisor calendar, and its role is load-bearing.** The kids don't drive themselves to the job — an adult has to be available to supervise. That calendar exists precisely to keep the booking engine from offering slots during soccer practice, work travel, dentist appointments, etc. A calendar-subtraction failure (§8a #0) isn't just "slots look wrong" — it's "the business offers commitments it cannot keep." This elevates any Google Calendar regression to a severity-1 class and argues for a fail-closed posture (return `[]` rather than fallback slots) when the calendar layer can't be verified.
2. **The OAuth app's publishing status in Google Cloud Console is undocumented and probably "Testing."** Google invalidates refresh tokens every **7 days** for OAuth apps in Testing mode. Both refresh tokens returning `invalid_grant` simultaneously (§8a #0) is exactly consistent with a 7-day expiry event — a single common cause rather than two unrelated failures. Chez to verify: `console.cloud.google.com` → the project that owns `GOOGLE_CLIENT_ID` → APIs & Services → OAuth consent screen → "Publishing status." If it reads "Testing," that is the likely root cause and the app should either be moved to "In Production" (requires filling out app details, privacy policy URL, scope justifications; Google reviews sensitive scopes; not instant) or accepted as a recurring 7-day re-auth cycle. Testing mode also caps test users at 100 — not a concern today but worth knowing. **This fact should be documented in the Architecture doc and the Constitution should require that the publishing status be recorded in the repo so it isn't rediscovered painfully again.**
3. **Admin dashboard tabs "Bookings", "Customers", "Finances" are labeled "coming soon"** — the admin login page advertises "Revenue & booking stats, Customers, Schedule, Earnings" as dashboard features. Schedule works. Overview works (partially — no address/phone displayed). The other three are literal placeholders in `app/admin/dashboard/page.tsx:349–380`. The `/admin/customers` page exists as a standalone route (not linked from the dashboard) and does work. So "Customers coming soon!" inside the dashboard is untrue.
4. **Testimonials are fake** — `components/Testimonials.tsx` hardcodes three testimonials with specific names and neighborhoods. The `reviews` table is populated by real customers via `/api/review` and never displayed. If you haven't served those three named customers, they're fabricated — a trust liability. More importantly, real reviews are collected and wasted. The DB currently holds one real review, per Chez.
5. **Footer copyright is hardcoded `2026`** — will be wrong in January.
6. **OAuth redirect URI `urn:ietf:wg:oauth:2.0:oob`** is deprecated by Google. Today's refresh tokens keep working (when they aren't `invalid_grant`-expired — see §8a #0); re-auth will be painful if needed.
7. **`ADMIN_PASSWORD` plaintext fallback** has no deadline in the code or a comment. Easy to forget.
8. **Rate limiting is per serverless instance**. Cosmetic at scale; fine at kid-business scale, worth knowing.
9. **JWT stored in `localStorage` AND an `httpOnly` cookie** — the cookie is a seatbelt nobody wears; the localStorage path is the one XSS would exfiltrate.
10. **`PERSONAL_CALENDAR_IDS` (plural)** is used as a single calendar ID. The plural hints at a multi-personal-calendar design that was never finished. Either rename to `PERSONAL_CALENDAR_ID` for clarity or implement the split-on-comma it's hinting at.
11. **CSP `connect-src` allows `api.resend.com`** but not SendGrid. Server calls ignore CSP, so today this is harmless; it's pure drift left over from the Resend era.
12. **`monthlyRevenue` in `/api/admin/stats`** compares `new Date(booking.scheduled_date).getMonth()` (UTC parse) against `new Date().getMonth()` (server-local, UTC on Vercel). For bookings near the end of a month in Pacific time, this may count under the wrong month.
13. **Two `.DS_Store` in `.gitignore`** — cosmetic duplicate.
14. **No `middleware.ts` or `proxy.ts` test** — CSP and headers are never verified.
15. **`next.config.ts`** is empty. Fine, just noting there's no production-specific config (image domains, redirects).

### 8d. What the user explicitly asked about, answered

| Question | Answer |
|---|---|
| Where does the three-layer availability merge happen? | `lib/availability-engine.ts → getAvailableSlots`. All three layers are present, plus a hidden hardcoded fallback, plus the aforementioned DST/UTC bugs. |
| Which email provider is actually wired up? | **SendGrid**, via `lib/sendgrid.ts`, imported by `/api/book`, `/api/reminders`, `/api/review-request`. Resend is a phantom — dependency + library file + CSP allowance, zero imports. |
| Does the 3-minute pre-event reminder exist? | **No.** The built reminder is **1-hour before** (not 3-minute), implemented in `/api/reminders` alongside a day-before reminder. It depends on Vercel Cron, which is hourly and POST-mismatched (§8 #1). Even when it works, it's 1 hour, not 3 minutes. A 3-minute reminder would need either a much-faster cron (sub-minute, not supported on free tier) or a delayed-send queue — neither exists. |
| Does the admin revenue math match the booking-time pricing? | The calculation uses the same `price` column the booking route writes, so the *math is consistent* — but only `status='completed'` rows count, and only `/api/review-request` flips the status, and that cron may not be firing (§8 #1 and #6). So revenue will stay $0 until that chain works. |
| Are all booking fields used downstream? | Mostly. Unused/stale: `status` has four permitted values but only two are ever set; `audit_logs` rows are written, read by nobody; `reviews` rows are read only for stats averaging, never displayed. Downstream code references only fields that exist. |
| Cancel/reschedule half-built? | No. Clean absence in code. Only traces: the `cancelled` status in the DB CHECK/validation and color-map UI defense, plus the email/success-page text "Need to reschedule? Call Bruce." There's no abandoned API route, no form state, no cancel button. |
| Waiver half-built? | No. Zero references. Would slot into `components/BookingForm.tsx` between Notes and the reminders checkbox, plus a `waiver_accepted_at TIMESTAMPTZ NOT NULL` column on `bookings` (or its own audit row). |
| Admin routes unintentionally open? | Every `/api/admin/*` I inspected is behind `requireAdminAuth`. The only non-gated admin-ish surface is the `/admin` and `/admin/dashboard` pages themselves, which rely on client-side localStorage checks (brief render before redirect for an unauthenticated user). Low risk. |
| Customer flow creating orphaned records? | Google Calendar event creation is wrapped in try/catch and the booking row proceeds even if calendar insert fails; same for the confirmation email. That's a deliberate choice (don't fail a booking over a downstream hiccup), but it means you can end up with a `confirmed` booking with no calendar event and no email to the customer. No row deletion on partial failure; no retry. The `google_event_id` being `null` is the only signal, and nothing watches it. |

---

## 9. One-line takeaways

- **[SEV 1] Google Calendar integration is silently non-functional right now.** Both refresh tokens return `invalid_grant`; the inner catch swallows it; customers are being offered every seeded Saturday/weekday slot regardless of real commitments, and new bookings aren't being written to the pinecone calendar. Likeliest root cause: OAuth app stuck in Google Cloud Console "Testing" mode (7-day token expiry). See §8a #0 and §8c #2.
- **Availability is layered correctly, but timezone-rotten and fail-open.** Winter bookings will misalign with Google Calendar by an hour; calendar events are created 7–8 hours off; two silent catches (inner + outer) absorb errors into plausible-looking output.
- **Reminders, review-requests, and revenue** depend on a cron that's probably returning 405 every hour. Fix = rename `POST` to `GET` in two route files.
- **Pricing is wrong on the success page.** The rest of the system charges correctly; the "Total Price" the customer sees after booking is off for anything bigger than ¼ acre.
- **Email wiring is SendGrid; Resend is a ghost** — dependency, library, CSP allowance, all dead weight.
- **Two whole tabs of the admin dashboard are `🚧 coming soon!`** while the admin login page advertises those features.
- **The dead code/dead dependency load is substantial** — ~10 distinct pieces of abandoned infrastructure (parallel email library, parallel auth helper, error framework, audit log writer, service-duration calculator, etc.).
- **Security posture is reasonable for a single-tenant hobby app**: admin routes are gated, RLS exists (bypassed by service key but defensively in place), JWTs are short-lived, bcrypt is used. The weak points are localStorage-for-JWT and the plaintext-password fallback.
- **The testimonials are fake, and real reviews are collected and ignored.** Fixing this is almost free and would actually help the business.
- **The codebase is small enough** (one page, one admin, a handful of APIs) **that all of the above is fixable in a focused week of work**, not a rewrite.
