# Pinecone Pick Up Crew — Architecture

**Status as of 2026-04-22.** This document describes what the system *is* today, not what it is supposed to be. Every claim here is grounded in the code on `main` at HEAD `5ed94fa`. Where current behavior diverges from intent, that divergence is called out and linked to the corresponding finding in `DISCOVERY_REPORT.md`. New contributors (human or AI) should read `DISCOVERY_REPORT.md` immediately after this, not instead of it.

---

## 1. Product thesis

Pinecone Pick Up Crew is a **single-tenant, single-location booking site** for a kid-run yard-cleanup service in Bend, Oregon. Three kids — Bruce, Zoë, Chase — pick up pinecones; customers book online; an adult supervises. Payment is cash or Venmo at time of service; no online payments are taken and none are planned in the current scope.

The product is deliberately small:
- **One admin account** (the parent, Chez).
- **One physical "resource"** — the kids together, supervised by one adult at a time.
- **One service area** — Bend, OR.
- **Two service tiers** — Pick Up Only ($20 per ¼ acre) and Pick Up + Haul Away ($40 per ¼ acre).
- **Four lot-size tiers** — ¼, ½, ¾, and 1 acre+ (priced as 1, 2, 3, and 4 units).

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

**Dead dependencies still installed** (`package.json`): `resend`, `@react-email/components`, `react-email`, and `vercel` as a runtime (not dev) dependency. See `DISCOVERY_REPORT.md` §8b.

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
│   │   ├── dashboard/page.tsx        Admin dashboard (Overview + Schedule work; Bookings/Customers/Finances are placeholders)
│   │   └── customers/page.tsx        Standalone admin customers page (not linked from the dashboard)
│   ├── booking/success/page.tsx      Post-booking confirmation screen (has the price-display bug — see §10)
│   ├── review/page.tsx               Customer review form
│   └── api/
│       ├── availability/route.ts     GET — slots for a date or available dates for a month
│       ├── book/route.ts             POST — create booking (validates, writes DB, writes calendar, emails)
│       ├── review/route.ts           POST — customer review submission
│       ├── reminders/route.ts        POST — day-before and 1-hour-before reminder cron (see §7.4 re: method mismatch)
│       ├── review-request/route.ts   POST — post-service review-request email cron
│       └── admin/
│           ├── login/route.ts                         POST
│           ├── stats/route.ts                         GET  — dashboard metrics
│           ├── bookings/route.ts                      GET + PATCH
│           ├── customers/route.ts                     GET  — aggregated customer view
│           ├── customers/[email]/route.ts             GET  — single-customer detail + reviews
│           ├── availability-settings/route.ts         GET/POST/DELETE
│           ├── availability-settings/[id]/route.ts    PUT
│           ├── availability-exceptions/route.ts       GET/POST/DELETE
│           ├── availability-exceptions/[id]/route.ts  PUT
│           ├── seasonal-hours/route.ts                GET/POST/DELETE
│           ├── seasonal-hours/[id]/route.ts           PUT
│           ├── business-settings/route.ts             GET/PUT
│           └── calendar-test/route.ts                 GET — diagnostic endpoint (see §7.5)
├── components/
│   ├── Nav.tsx, Hero.tsx, HowItWorks.tsx, Pricing.tsx, Testimonials.tsx, Footer.tsx
│   ├── BookingForm.tsx               The customer booking UI (client component)
│   └── admin/AvailabilitySettings.tsx  2,101 lines — weekly/exception/seasonal/buffer admin UI
├── lib/
│   ├── supabase.ts                   Client + admin Supabase clients
│   ├── auth.ts                       Real admin JWT helpers (requireAdminAuth, etc.)
│   ├── admin-auth.ts                 Unused parallel auth helper (dead code)
│   ├── availability.ts               Thin re-exports + validation helpers + unused calculateServiceDuration
│   ├── availability-engine.ts        The real availability pipeline (see §5)
│   ├── google-calendar.ts            Booking-event creation + dead hasTimeConflict
│   ├── sendgrid.ts                   Live email provider
│   ├── resend.ts                     Dead parallel email provider (never imported)
│   ├── types.ts                      Availability & time-conversion types
│   ├── validation.ts                 Input validation + second BookingData type
│   ├── rate-limit.ts                 In-memory per-instance rate limiter
│   └── errors.ts                     Unused error-handling framework
├── database/migrations/
│   ├── 001_add_constraints_and_indexes.sql    Adds constraints to pre-existing bookings + reviews tables
│   ├── 002_availability_settings.sql           Creates availability_settings + availability_exceptions, seeds defaults
│   └── 003_business_settings.sql               Creates business_settings + seasonal_hours
├── public/images/kids-crew.jpeg      Hero photo
├── proxy.ts                          Next 16 middleware (security headers, HTTPS redirect, admin cache-control)
├── vercel.json                       Cron declarations only
├── next.config.ts                    Empty
├── tsconfig.json                     Paths alias `@/*` → `./*`
├── SECURITY_FIXES_IMPLEMENTED.md     Historical notes; refers to middleware.ts (renamed to proxy.ts)
├── SECURITY_GUIDELINES.md            Static guidance doc
├── SECURITY_README.md                Credential-hygiene doc
├── README.md                         Unmodified create-next-app boilerplate
├── AGENTS.md                         Next.js-version warning for agents
├── DISCOVERY_REPORT.md               Honest inventory of drift (this session)
├── docs/ARCHITECTURE.md              This document
└── CONSTITUTION.md                   Rules going forward
```

**Missing from source control.** There is no migration that creates the `bookings` or `reviews` tables. Migration `001` modifies them but assumes they already exist. The authoritative schema for those two tables lives only in the Supabase instance.

---

## 4. Data model

### Tables currently in the database

| Table | Purpose | Created by | Notes |
|---|---|---|---|
| `bookings` | Every booking attempt | Not in repo — lives in Supabase | Has the main customer + service fields + status + reminder flags + google_event_id. |
| `reviews` | Customer reviews | Not in repo — lives in Supabase | Has one real entry today; UI never displays it. |
| `availability_settings` | Recurring weekly hours | `002_...sql` | Seeded with default weekday 3–5 PM + weekend 9–4 PM + weekday 9 AM–3 PM "school hours" blockout. |
| `availability_exceptions` | Date-specific overrides | `002_...sql` | `override_type` ∈ {blackout, special_hours, holiday}. |
| `seasonal_hours` | Date-range recurring hours | `003_...sql` | Intended base layer for summer/winter schedules. Empty by default. |
| `business_settings` | Key/value config | `003_...sql` | Seeded with `calendar_buffer_minutes=15`, `default_service_duration_minutes=90` (unread), `timezone=America/Los_Angeles` (unread). |
| `audit_logs` | Automatic audit trail | `001_...sql` | Trigger writes on every bookings insert/update/delete. No code reads it. |

### `bookings` columns (inferred from code + migration constraints)

- `id` UUID PK
- `first_name`, `last_name`, `email`, `phone`, `address` — customer info
- `lot_size` ∈ {`¼ acre`, `½ acre`, `¾ acre`, `1 acre+`} (DB CHECK + validation allowlist)
- `service_type` ∈ {`pickup_only`, `pickup_haul`} (DB CHECK + validation allowlist)
- `price` NUMERIC > 0 (DB CHECK)
- `scheduled_date` DATE ≥ `CURRENT_DATE` (DB CHECK; DB-server timezone)
- `scheduled_time` TEXT matching `^(1[0-2]|[1-9]):[0-5][0-9]\s?(AM|PM)$` (DB trigger)
- `notes` TEXT NULL
- `reminders_opted_in` BOOLEAN (customer checkbox on booking form)
- `status` ∈ {`confirmed`, `completed`, `pending`, `cancelled`} (DB CHECK). **Only `confirmed` (by `/api/book`) and `completed` (by `/api/review-request`) are actually set by code.** `pending` and `cancelled` are permitted but unreachable.
- `created_at`, `reminder_day_before_sent`, `reminder_hour_before_sent`, `review_request_sent`, `google_event_id`

### Reviews columns (inferred)

`id`, `booking_id` (UNIQUE — one review per booking), `rating` 1–5 (DB CHECK), `comment`, `neighborhood`, `created_at`.

### Data-model pipeline paths in practice

- **Booking creation** is the only writer to `bookings.*` (except for admin PATCH on `status` and `notes`, and the reminders cron flipping `reminder_*_sent` flags, and the review-request cron flipping `status` to `completed`).
- **Customer reviews** are written by `/api/review` and read by `/api/admin/stats` (average only) and `/api/admin/customers/[email]` (list). Never surfaced to non-admin users.
- **`audit_logs`** is pure write-only. The trigger exists for defensive documentation, not for use.

### Canonical sources of truth

| Fact | Authoritative source |
|---|---|
| Base operating hours | `availability_settings` (weekly) and `seasonal_hours` (date-range). Seasonal hours, when present, replace weekly as the base. |
| Date-specific overrides | `availability_exceptions` |
| External time conflicts | Google Calendar ("personal" + "pinecone") |
| Calendar buffer minutes | `business_settings.calendar_buffer_minutes` |
| Lot-size pricing factors | Hardcoded in `app/api/book/route.ts` (`lotSizeUnits`) + base prices (`$20` / `$40`). **No database row; no shared constant.** See §10. |
| Service duration | Hardcoded 90 min in `lib/google-calendar.ts` and `lib/availability-engine.ts`. The `business_settings.default_service_duration_minutes = 90` row exists but is never read. |
| Business timezone | Hardcoded as `America/Los_Angeles` in emails and calendar events. The `business_settings.timezone` row exists but is never read. |

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
- **Layer 4 is silently a no-op.** Both Google refresh tokens return `invalid_grant` (verified via `/api/admin/calendar-test` on 2026-04-22). The inner try/catch in `getAvailabilityData` swallows the error, `googleEvents = []` propagates, and `filterGoogleCalendarConflicts` finds nothing to subtract. The customer sees the full Layer 1 schedule. See `DISCOVERY_REPORT.md` §8a #0.

### Hidden fifth layer

If Layer 1 produces no slots (no seasonal rows, no `is_available=true` weekly rows) *or* the whole pipeline throws before completion, `getAvailableSlots` returns `getFallbackAvailableSlots(date)` — a hardcoded Saturday `['9:00 AM', …, '4:00 PM']` / weekday `['3:00 PM', '4:00 PM', '5:00 PM']`. This is not part of the documented layering model. It is a fail-open safety net with severe side effects and is flagged for removal in the Constitution.

### Timezone model

Intended: all scheduling reasoning is in Pacific time (America/Los_Angeles), which matches the stated business timezone row in `business_settings`.

Current:

- Slot-to-calendar comparison hardcodes **`-07:00`** (PDT) and breaks for ~4 months per year in PST.
- `getAvailabilityData`'s Google Calendar window (`startOfDay`, `endOfDay`) is built in server-local time (UTC on Vercel), so the query range is 7–8 hours off.
- `createBookingEvent` builds event timestamps in server-local time and sends them with `timeZone: 'America/Los_Angeles'` as a secondary hint — Google respects the ISO timestamp and the event lands 7–8 hours off.
- Validation of "is this date in the past?" uses `new Date()` in server-local (UTC) time, so between ~4 PM and midnight Pacific, the Pacific-today date is treated as past.
- Reminder-cron day arithmetic uses a `Date` object whose internal UTC value is actually LA wall-clock time — a known anti-pattern that is hard to reason about.

None of these currently produce a visible customer-facing error **because Layer 4 is a no-op**. They will all reactivate the moment Google Calendar reads resume. See `DISCOVERY_REPORT.md` §8a #0 for the "symptom flip" warning.

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

  Vercel Cron  ──GET──▶  /api/reminders         (hourly; POST handler → 405; see §7.4)
  Vercel Cron  ──GET──▶  /api/review-request    (hourly; POST handler → 405; see §7.4)
```

There are **no inbound webhooks**. Nothing external pushes into this app. All state changes originate from the customer browser, the admin browser, or a Vercel cron tick.

There is **no real-time channel** to the kids. Their only notification surface is the pinecone Google Calendar (currently write-broken, see §5) and the admin dashboard (three of five tabs are placeholders, see §7.2).

---

## 7. Primary user workflows

### 7.1 Customer booking (happy path, today, broken)

1. Customer lands on `/`. `BookingForm` renders with an empty calendar grid.
2. Calendar grid loads: `GET /api/availability?month=YYYY-MM` → `getAvailableDates` iterates every day of the month calling `getAvailableSlots`, returns days with non-empty slot lists.
3. Customer clicks a date. `GET /api/availability?date=YYYY-MM-DD` returns slot strings like `"3:00 PM"`.
4. Customer fills form, clicks Confirm. `POST /api/book` with the form body.
5. `/api/book`:
   - Rate-limits (in-memory, per serverless instance).
   - Validates and sanitizes input (`lib/validation.ts`).
   - Re-checks business-hours, future-date, and reasonable-advance rules.
   - **Re-fetches available slots and confirms the chosen one is still there.** (TOCTOU-susceptible; no DB uniqueness.)
   - Computes price: `(service_type === 'pickup_only' ? 20 : 40) × lotSizeUnits[lot_size]`.
   - Inserts the booking row with `status='confirmed'`.
   - **Attempts to insert a Google Calendar event** on the pinecone calendar. Failure is swallowed; the booking still proceeds.
   - **Attempts to send a confirmation email** via SendGrid. Failure is swallowed; the booking still proceeds.
   - Returns `{ success: true, bookingId, price }` to the browser.
6. Browser navigates to `/booking/success?...` with query-string details. The success page **recomputes price locally and wrongly** as `$20` or `$40` flat (ignores lot size). The confirmation email, if it arrived, shows the correct `price` from the DB.

**Current real-world behavior.**
- Step 3 offers slots that should be blocked (calendar layer is a no-op).
- Step 5's Google event insertion is currently failing silently on every booking.
- Step 5's email delivery depends on SendGrid — that path is believed to be working; not independently verified this session.
- Step 6 shows the wrong dollar amount for any lot size bigger than ¼ acre.

### 7.2 Admin management

1. Chez navigates to `/admin`, enters `ADMIN_PASSWORD`.
2. `/api/admin/login` validates (bcrypt or plaintext fallback), issues an 8-hour JWT, returns it both as an httpOnly cookie and as JSON in the body.
3. Browser stores the JWT in `localStorage` and navigates to `/admin/dashboard`.
4. Dashboard loads stats and recent bookings via `/api/admin/stats` and `/api/admin/bookings?limit=5`, authenticated with `Authorization: Bearer <token>`.
5. Five tabs are rendered:
   - **Overview** — works. Shows revenue cards, recent bookings table (no address/phone column).
   - **Bookings** — "coming soon!" placeholder.
   - **Customers** — "coming soon!" placeholder. (A working `/admin/customers` page exists as a standalone route, but the dashboard doesn't link to it.)
   - **Finances** — "coming soon!" placeholder.
   - **Schedule** — works. Renders `AvailabilitySettings` which manages weekly settings, exceptions, seasonal hours, and the `calendar_buffer_minutes` value.

**Current real-world behavior.** The admin login-screen copy ("📊 Analytics — Revenue & booking stats, 👥 Customers, 📅 Schedule, 💰 Earnings") advertises features that are not implemented. Revenue cards show "$0" in practice because revenue counts only `status='completed'` rows and the cron that flips status is non-functional (see §7.4).

### 7.3 Customer review

1. After a booking is complete, `/api/review-request` is supposed to email the customer a link to `/review?booking=<id>`.
2. Customer opens that link, rates 1–5, optionally adds comment + neighborhood, submits.
3. `POST /api/review` writes a row in `reviews`, enforces uniqueness via `unique_review_per_booking`.

Real-world: step 1 depends on the cron (see §7.4). The one real review currently in the DB was presumably collected either before the current token outage or via a manually-sent link.

### 7.4 Scheduled jobs

`vercel.json` declares two hourly crons:
- `/api/reminders` — sends day-before and 1-hour-before reminders, flips `reminder_day_before_sent` / `reminder_hour_before_sent`.
- `/api/review-request` — two hours after service end, sends review email and flips `status='completed'`.

**Both route files export only `POST`.** Vercel Cron sends `GET` (confirmed against current Vercel docs). Every scheduled tick returns `405 Method Not Allowed`. No reminder email is being sent. No booking is being marked `completed`. Revenue in the admin dashboard stays at $0. See `DISCOVERY_REPORT.md` §8a #1.

Both route files also do `if (!CRON_SECRET) throw new Error(...)` at module load, so a missing secret crashes the function at cold start before any handler logic runs.

### 7.5 Diagnostic endpoint

`/api/admin/calendar-test?date=YYYY-MM-DD` (admin-gated). Returns:
- Presence of each Google-related env var.
- For each calendar: `status` ∈ {`connected`, `error`, `not_tested`}, error message if any, and the event list for the given date.

**This endpoint is the canonical "is the calendar wiring healthy?" check** and should remain so. It is how the current sev-1 was diagnosed.

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
- `CRON_SECRET` — **both cron routes throw at module load if missing**, which crashes the serverless function cold start.

**Required for calendar integration:**
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `PERSONAL_GOOGLE_REFRESH_TOKEN`, `PERSONAL_CALENDAR_IDS` *(name plural, used singular — see `DISCOVERY_REPORT.md` §8c #10)*
- `PINECONE_GOOGLE_REFRESH_TOKEN`, `PINECONE_CALENDAR_ID`

**Required for email:**
- `SENDGRID_API_KEY` — required.
- `SENDGRID_FROM_EMAIL` — optional; defaults to `pinecone.pickup.crew@gmail.com`.

**Miscellaneous:**
- `NEXT_PUBLIC_BASE_URL` — only used to build the review-email link. If unset, emails render as `undefined/review?booking=...`.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — constructed into `supabaseClient` in `lib/supabase.ts` but that client is never imported. Effectively unused.
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL` — referenced only by the dead `lib/resend.ts`. Safe to remove from Vercel.
- `NODE_ENV` — read for prod/dev branching in `proxy.ts` and `lib/errors.ts`.

### OAuth app (Google Cloud Console)

- **Current publishing status is undocumented in this repo.** If the app is in "Testing" mode, Google invalidates refresh tokens every 7 days, which is the leading hypothesis for the current `invalid_grant` failures. See `DISCOVERY_REPORT.md` §8c #2.
- Redirect URI is `urn:ietf:wg:oauth:2.0:oob` — Google's deprecated OOB flow. Existing tokens keep working; new token issuance will eventually require migrating to a standard redirect URI.

### Scheduling

- Vercel Cron declarations live in `vercel.json`. Both crons are hourly (`0 * * * *`). Timezone of cron evaluation is UTC.
- Vercel Cron is GET-only (no configurable method). Routes must export `GET`.
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
- No automated tests. No CI beyond Vercel's build.

---

## 10. Known architectural debt

The complete inventory is in `DISCOVERY_REPORT.md` §8. This section captures only the debt that **shapes how the system should be reasoned about** — not a duplicate list.

1. **Google Calendar integration is currently non-functional in production** (`invalid_grant` on both refresh tokens). Must be re-established before the booking product can be trusted. See `DISCOVERY_REPORT.md` §8a #0.
2. **Two silent catches in the availability pipeline absorb errors into plausible-looking output.** Both must become fail-closed. This is the architectural single biggest lesson of the current session.
3. **Pricing has no single source of truth.** The booking route's `lotSizeUnits × basePrice` formula is authoritative; the success page and the marketing copy restate it independently. Ripe for a shared constant or database row.
4. **Timezone handling is inconsistent.** Mixture of server-local, hardcoded-offset (`-07:00`), Pacific-wall-clock-via-`toLocaleString`, and DB `CURRENT_DATE`. No single helper. Every date/time boundary is a potential bug.
5. **The cron routes don't actually run** because the route method does not match Vercel's GET-only invocation. Reminder and review-request pipelines are therefore dormant. Revenue metrics are $0 as a downstream effect.
6. **Significant dead code and dead dependencies** — parallel email library, parallel auth helper, unused error framework, audit-log writer with no reader, unread `business_settings` rows, and a plural env var name that was never split. Cleanup is straightforward but must be bounded to avoid churn.
7. **The admin dashboard overstates what it offers** — three of five tabs are placeholders while the login screen advertises them. Either build them or remove the claims.
8. **`bookings` and `reviews` table schemas are not in the repo.** The canonical schema lives only in Supabase.

---

## 11. Scoping notes

What is deliberately **out of scope** in the current product, and should stay out unless Chez explicitly expands it:

- **No online payments.** Cash or Venmo at time of service. No Stripe integration, no payment intent, no invoicing.
- **No customer accounts.** Bookings are aggregated by email at read time only.
- **No customer-facing cancel or reschedule flow.** Confirmation emails and the success page direct customers to call/text or email Bruce. The `cancelled` and `pending` status values exist in the DB CHECK but no code sets them; this is defensive DB design, not a half-built feature.
- **No liability waiver yet.** This is a known gap (customers let the kids onto their property). See `DISCOVERY_REPORT.md` §8c (scoped as a planned feature; slotting into `BookingForm` between Notes and reminders-checkbox + a `waiver_accepted_at` column on `bookings`).
- **No multi-tenant support.** The app assumes one business, one admin, one pair of calendars. Renaming env vars or paths to suggest multi-tenancy (e.g., `PERSONAL_CALENDAR_IDS`) is drift, not architecture.
- **No SMS.** All notifications are email.
- **No marketing automation.** No tracking pixels, no CRM integration, no drip campaigns.
- **No custom domain.** `pinecone-pickup.vercel.app` only. This constrains email deliverability (SendGrid with a gmail.com `from` address) and forecloses Resend (which requires a verifiable domain).

What is **in scope but unbuilt**:

- The Testimonials section on the home page is hardcoded. Real customer reviews are being collected and ignored. Displaying the real ones (with consent) is cheap and valuable.
- A short "waiver accepted" checkbox on the booking form, backed by a `waiver_accepted_at` column, is a near-zero-risk addition that Chez has flagged as desired.
- The three "coming soon" dashboard tabs either need to be built (Bookings, Customers, Finances surface work) or removed from the UI so the admin landing page doesn't advertise vaporware.
