# Pinecone Pick Up Crew — Operations

**Status as of 2026-04-26.** Operational facts the app depends on that aren't derivable from code. Required by Constitution §6.2. Update any time OAuth config, calendar identities, tokens, or schema state changes.

---

## Google Cloud project

| Field | Value |
|---|---|
| Project name | Pinecone Pick Up |
| Project ID | `pinecone-pick-up` |
| Project number | `632985240540` |
| Owner account | `chezziebr@gmail.com` (Chez's personal Google) |

## OAuth 2.0 Client

| Field | Value |
|---|---|
| Client name | Pinecone Pick Up Web |
| Application type | Web application |
| Client ID | `632985240540-7lnqhj50ctgjjds19v3n2s968vtp9d0r.apps.googleusercontent.com` |
| Client secret | stored in Vercel as `GOOGLE_CLIENT_SECRET` (Production) |
| Created | 2026-04-07 |
| **Publishing status** | **In Production** (flipped 2026-04-22) |
| Authorized redirect URIs | `https://developers.google.com/oauthplayground` (pre-existing; emergency re-auth fallback)<br>`http://127.0.0.1:53682/` (added 2026-04-23; used by `scripts/get-refresh-token.mjs`) |

**Publishing-status significance.** In Testing mode, Google invalidates refresh tokens every 7 days — including those issued to listed test users. Moving to In Production removes that expiry. Verification is a separate process (not completed, not required for this app's user count) and is triggered only by sensitive/restricted scopes. Per the Audience page on 2026-04-22, our Calendar scopes are classified non-sensitive, so verification is not required.

**Correction to DISCOVERY_REPORT.md.** DISCOVERY §2 (Stack table, Calendar row) and §5 (Communication boundaries) infer the redirect URI is `urn:ietf:wg:oauth:2.0:oob` (deprecated OOB flow). The actual pre-existing URI is `https://developers.google.com/oauthplayground` — the original tokens were minted via the OAuth 2.0 Playground. Update DISCOVERY_REPORT.md in a dedicated cleanup session.

## Calendar identities

| Env var | Calendar ID | Owning Google account | Scope granted |
|---|---|---|---|
| `PERSONAL_CALENDAR_IDS` | `chezziebr@gmail.com` | `chezziebr@gmail.com` (Chez's personal) | `https://www.googleapis.com/auth/calendar.readonly` |
| `PINECONE_CALENDAR_ID` | `pinecone.pickup.crew@gmail.com` | `pinecone.pickup.crew@gmail.com` (service account) | `https://www.googleapis.com/auth/calendar.events` |

**Model change on 2026-04-23.** `PERSONAL_CALENDAR_IDS` previously held a dedicated secondary calendar (a "Pinecone Blockout Calendar" of the form `a3f65d...@group.calendar.google.com`) that required mirroring blockouts onto a parallel calendar. That calendar has been deleted in Google Calendar; `PERSONAL_CALENDAR_IDS` now points at Chez's primary calendar directly, so any event on the personal calendar subtracts from availability automatically.

**Scope asymmetry rationale.** Personal is `calendar.readonly` because the integration only reads (to subtract conflicts). Pinecone is `calendar.events` because the integration reads *and* writes booking events.

## Environment variables (calendar-specific)

Stored in Vercel, Production environment. The full env-var list (boot-critical, email, misc) lives in `docs/session-preamble.md` §4.

| Name | Value | Notes |
|---|---|---|
| `GOOGLE_CLIENT_ID` | `632985240540-7lnqhj50ctgjjds19v3n2s968vtp9d0r.apps.googleusercontent.com` | shared across both calendars |
| `GOOGLE_CLIENT_SECRET` | (set in Vercel) | shared across both calendars |
| `PERSONAL_GOOGLE_REFRESH_TOKEN` | (regenerated 2026-04-23) | scope: `calendar.readonly`; account: `chezziebr@gmail.com` |
| `PERSONAL_CALENDAR_IDS` | `chezziebr@gmail.com` | plural name, singular usage — Constitution §7.2 cleanup deferred |
| `PINECONE_GOOGLE_REFRESH_TOKEN` | (regenerated 2026-04-23) | scope: `calendar.events`; account: `pinecone.pickup.crew@gmail.com` |
| `PINECONE_CALENDAR_ID` | `pinecone.pickup.crew@gmail.com` | |

## Token regeneration

### Last regeneration

- **Date:** 2026-04-23
- **Method:** `scripts/get-refresh-token.mjs` (loopback authorization-code flow on `http://127.0.0.1:53682/`)
- **Reason:** Both tokens returning `invalid_grant` in production (sev-1 of 2026-04-22). Root cause: OAuth app had been in Testing mode with 7-day token expiry.

### Next required re-auth

**None scheduled.** The app is In Production; refresh tokens do not have a fixed expiry. Google invalidates refresh tokens on these (non-clock) triggers:

- Token unused for 6 months.
- User explicitly revokes app access at https://myaccount.google.com/permissions.
- User changes password on the Google account.
- Client secret rotated.
- Scope change: tokens are scope-locked at issuance.
- Unknown Google policy changes. Google periodically tightens OAuth rules and has, in past years, retroactively invalidated tokens. Not predictable, but real. Treat "None scheduled" as "no clock-driven expiry" rather than "will work forever."

### Procedure (when it's needed)

Prereqs: `http://127.0.0.1:53682/` must remain registered on the OAuth Client. OAuth app must remain In Production.

```bash
cd "<repo root>"
vercel env pull .env.local --environment=production --yes

# Personal (calendar.readonly), sign in as chezziebr@gmail.com:
( set -a && source .env.local && set +a && \
  node scripts/get-refresh-token.mjs \
  --scope=https://www.googleapis.com/auth/calendar.readonly )

# Pinecone (calendar.events), sign in as pinecone.pickup.crew@gmail.com:
( set -a && source .env.local && set +a && \
  node scripts/get-refresh-token.mjs \
  --scope=https://www.googleapis.com/auth/calendar.events )

rm .env.local
```

Paste both tokens into Vercel Production → redeploy → verify via `/api/admin/calendar-test`.

The script sets `prompt: 'consent select_account'` so the account chooser appears each run — no way to silently authorize the wrong account.

## Verification

Two diagnostic endpoints form the canonical health-check surface for the app. Hit both when troubleshooting; treat any red result on either as a deployment blocker.

### `GET /api/admin/calendar-test?date=YYYY-MM-DD`

Canonical "is the calendar wiring healthy?" check per CONSTITUTION §1.4. Surfaces token validity, calendar IDs, and per-calendar event counts.

Green bar:
- Both `personalCalendar.status` and `pineconeCalendar.status` = `"connected"`.
- No `error` field on either.
- `personalCalendar.calendarId` matches `PERSONAL_CALENDAR_IDS`.
- `pineconeCalendar.calendarId` matches `PINECONE_CALENDAR_ID`.
- `personalCalendar.events` contains the events actually on that calendar.

### `GET /api/admin/booking-health`

Canonical "did anything we wrote fall through the cracks?" check per CONSTITUTION §4.3. Surfaces three categories of integrity gaps from the tracking columns added by migration 004:

- `calendar_sync_failed.count`: bookings where `createBookingEvent` threw. Terminal state, no age filter.
- `confirmation_email_missing.count`: bookings where SendGrid never confirmed. Excludes rows < 5 minutes old (still in the post-insert lifecycle window).
- `calendar_event_missing.count`: future bookings (`scheduled_date >= pacific_today`) with no `google_event_id`. Excludes rows < 5 minutes old to cover transient `'pending'` state.

Each category returns `count` (exact, regardless of `LIMIT_PER_CATEGORY=100`) and `bookings` (first N rows; 10 fields per row, no PII beyond email).

Green bar: all three counts at zero, modulo any historical false-positives the deferred-decisions section explicitly accepts (currently 2 in `confirmation_email_missing` from pre-migration-004 rows).

### Diagnostic split

calendar-test answers "is the wiring healthy?". booking-health answers "did anything we wrote fall through the cracks?". The two together would have prevented Session 1's forensic root-cause work on the original 2026-04-22 sev-1 — calendar-test would have shown the broken tokens immediately, booking-health would have shown which bookings lost their pinecone-calendar entries during the outage.

## Database schema state

**Snapshot date: 2026-04-26 (post-migration-004).**

### Migrations applied in production

- **000** (commit `f49dc8b`) — captures `bookings` and `reviews` as `CREATE TABLE` statements per CONSTITUTION §6.1. Both tables were originally created via the Supabase UI; migrations 001-004 modify them but assume they exist. 000 is the canonical schema for new deployments going forward.
- **001** — partially applied. Three CHECK constraints (`bookings_service_type_check`, `bookings_status_check`, plus the `reviews_rating_check`) and the indexes appear to have run; the rest (lot_size CHECK, price > 0 CHECK, scheduled_date >= CURRENT_DATE CHECK, `unique_review_per_booking`, all triggers, and the `audit_logs` table) did not. See deferred-decisions below.
- **002, 003** — fully applied (different tables: availability_*, business_*, seasonal_hours).
- **004** (commit `f49dc8b`) — added two columns to `bookings` per CONSTITUTION §4.3:
  - `calendar_sync_status TEXT NOT NULL DEFAULT 'pending'` with CHECK on `('pending', 'success', 'failed')`. Backfilled to `'success'` for pre-existing rows with `google_event_id IS NOT NULL`.
  - `confirmation_email_sent_at TIMESTAMPTZ`. Existing rows left NULL (see false-positive item in deferred-decisions).
  - Plus index `idx_bookings_calendar_sync_status`.

### Routes that populate the new columns

- **`/api/book`** (commit `d3b356d`) — replaces the previous silent catches on calendar-event creation and confirmation-email send with explicit row updates and structured logging. Customer response shape (`{ success, bookingId, price }`) is unchanged regardless of downstream outcome. New failure logs use the `[booking]` prefix with operation name (`calendar_event_creation`, `calendar_status_update`, `confirmation_email`, `email_status_update`) for greppability in Vercel logs.

### Routes that read the new columns

- **`/api/admin/booking-health`** (commit `7db14e3`) — see Verification above.

### Rebuild caveat

Running migration 000 followed by 001-004 on a fresh DB will conflict — 000 already includes 001's three applied CHECK constraints and 004's two ADD COLUMN statements. Cleanup is deferred (see deferred-decisions). For now, treat 000 as the canonical schema for new deployments and 001-004 as historical artifacts that were applied incrementally to the existing production DB.

## Deferred decisions

### Multi-calendar personal availability
Chez has other calendars that may represent time when supervisor coverage is unavailable: **Family**, **Brungraber Childcare**, **SummitWest** (work). These are not currently read by the app. To aggregate:
- Option A: implement comma-split on `PERSONAL_CALENDAR_IDS` (matches its plural name; resolves Constitution §7.2 drift).
- Option B: add a new env var (e.g. `PERSONAL_CALENDAR_IDS_EXTRA`) and iterate.

Revisit when a real availability miss occurs.

### OAuth Playground redirect URI
`https://developers.google.com/oauthplayground` remains registered on the OAuth Client as a fallback for browser-only re-auth if the local script is unavailable. Can be removed once the script is trusted long-term.

### Schema-drift items surfaced by Query A/B/C/D analysis on 2026-04-25

The four queries (A: columns; B: constraints; C: triggers; D: trigger functions) run against production on 2026-04-25 surfaced eight items that diverge from what `DISCOVERY_REPORT.md §3` and migration 001 claimed exists. None block Session 4's deliverables, but each is a real divergence that should eventually be reconciled.

#### 1. Migration 001 partially applied
**Source:** Query B (only 4 of 001's intended constraints exist) + Queries C/D (no triggers, no functions).

Per Query B, only `bookings_service_type_check`, `bookings_status_check`, `reviews_rating_check`, and the indexes from 001 are present. Missing in production:
- `bookings.lot_size` CHECK
- `bookings.price > 0` CHECK
- `bookings.scheduled_date >= CURRENT_DATE` CHECK
- `reviews.unique_review_per_booking` UNIQUE
- All triggers: `validate_booking_data`, `validate_review_data`, `audit_trigger`
- The `audit_logs` table itself

Likely cause: someone ran selected lines from migration 001 manually rather than executing the whole file.

Resolution options:
- Option A: re-run the missing parts and absorb any CHECK violations on existing rows (currently unlikely — only 2 rows, both well-formed).
- Option B: delete migration 001 from the repo and treat the API layer as canonical.
- Option C: split 001 into "applied" and "unapplied" parts and reconcile each.

#### 2. `bookings.status` enum drift between code and DB
**Source:** Query B (`bookings_status_check`) vs `lib/validation.ts:38`.

DB CHECK allows `('confirmed', 'completed', 'cancelled')`. `lib/validation.ts:38 ALLOWED_VALUES.STATUSES` allows `['confirmed', 'completed', 'pending', 'cancelled']`. Validation accepts `'pending'`; DB would reject it with a 500.

Dormant: no code path POSTs a `status` server-side, and the route writes `'confirmed'` literal at `app/api/book/route.ts:101`. The drift can't fire from the customer booking path. Could fire if any future admin-PATCH path passes `'pending'` through validation.

Resolution: drop `'pending'` from `lib/validation.ts:38`.

#### 3. Dead status values
**Source:** DISCOVERY §3 + Query B + grep of route code.

Both `'cancelled'` (DB CHECK + validation) and `'pending'` (validation only) are dead. Only `'confirmed'` (set by `/api/book`) and `'completed'` (set by `/api/review-request`) are ever written.

Resolution: drop `'cancelled'` from both DB CHECK and validation; drop `'pending'` from validation. CONSTITUTION §6.3 forbids parking dead values.

#### 4. Missing `UNIQUE` on `reviews.booking_id`
**Source:** Query B (no `unique_review_per_booking` constraint) vs DISCOVERY §3 claim.

Multiple reviews per booking are technically possible. `/api/review` does not application-level guard against this (relied on the missing DB constraint).

Resolution: add the UNIQUE constraint and add a 409-on-conflict guard in `/api/review` for the race window.

#### 5. Missing CHECK constraints on `bookings`
**Source:** Query B (no `bookings_lot_size_check`, no `bookings_price_check`, no `bookings_scheduled_date_check`).

API layer enforces all three (`lib/validation.ts` for lot_size and price; `validateFutureDate` for scheduled_date in `/api/book`); DB does not.

Resolution: tied to item #1 — applying 001's CHECK section creates them.

#### 6. No triggers on `bookings` or `reviews`
**Source:** Queries C and D (both returned "Success. No rows returned" for the `bookings`/`reviews` tables and the relevant function names).

`validate_booking_data`, `validate_review_data`, `audit_trigger` functions don't exist in the database. No triggers fire on either table. The `audit_logs` table referenced by `audit_trigger` also doesn't exist.

Resolution: tied to item #1 — applying 001's trigger section creates them. The `audit_logs` table has no reader (DISCOVERY §6.3 dead-code list); skipping it is defensible.

#### 7. DISCOVERY §3 corrections
**Source:** Query A column types vs DISCOVERY §3 inferred types.

- `bookings.price` is `INTEGER` (not `NUMERIC` as DISCOVERY §3 stated).
- DISCOVERY §3's CHECK / trigger / `unique_review_per_booking` claims are mostly absent in production (covered by items 1, 4, 5, 6).

Resolution: update DISCOVERY_REPORT.md in a dedicated cleanup session.

#### 8. RLS disabled on `bookings` and `reviews`
**Source:** production `pg_class.relrowsecurity = false` on both tables, confirmed during migration 000 application.

Migration 001's RLS policies presumably never applied (since 001 was partial). The app uses the service-role key on every server route and bypasses RLS regardless.

Resolution options:
- Option A: enable RLS with policies that mirror app behavior. Defense in depth if `NEXT_PUBLIC_SUPABASE_ANON_KEY` is ever introduced to a client path.
- Option B: leave RLS off and add an explicit comment in `lib/supabase.ts` documenting that public/anon access is never expected and the service-role key is the only intended path.

### Historical `confirmation_email_sent_at` NULLs

The two pre-migration-004 bookings (`fff5c928…` and `ea988376…`) have `confirmation_email_sent_at = NULL` because the column didn't exist when they were written. `/api/admin/booking-health` lists them under `confirmation_email_missing` as a permanent false-positive (count of 2 today).

Resolution options:
- Option A: accept as historical noise. Admin learns to mentally subtract 2 from the `confirmation_email_missing` count until those bookings age out of typical review windows.
- Option B: manually backdate via the commented-out one-liner in migration 004:
  ```sql
  UPDATE bookings SET confirmation_email_sent_at = created_at
  WHERE confirmation_email_sent_at IS NULL AND created_at < '2026-04-25T00:00:00Z';
  ```
  Only do this if you've manually verified those emails actually arrived. Unverified backdating fabricates a positive signal that the booking-health endpoint is supposed to surface honestly.

## Known latent issues (not fixed this session)

Deferred per session scope. Listed here so they don't drift further.

1. **`lib/availability-engine.ts:389` hardcoded `-07:00` — RESOLVED 2026-04-24 (commit 0ade6e0).** Slot-to-calendar comparison previously parsed slot times with a hardcoded PDT offset; would have started mis-subtracting by an hour every November when Bend moves to PST. Replaced with `pacificDateAtSlot` from `lib/time.ts`. Verified in production: a 2026-04-26 12pm Pacific test booking caused that slot to disappear from the public booking page after creation, confirming Layer-4 calendar-event subtraction works correctly. Same fix applied to `/api/admin/calendar-test` (commit 9c05f42, CONSTITUTION §1.4 — the diagnostic must not share the bug it diagnoses). Constitution §2.1 satisfied.

2. **`lib/google-calendar.ts:28-29` constructed event times in server-local (UTC) time — RESOLVED 2026-04-24 (commit 0ade6e0).** `parseTimeToDate` deleted; `createBookingEvent` now uses `pacificDateAtSlot` plus `await loadBusinessTimezone()` to anchor at the correct Pacific wall-clock moment. Verified in production: test booking on 2026-04-26 at 12:00 PM Pacific landed on the pinecone Google Calendar at the correct 12:00 PM PDT (previously would have been 5:00 AM due to the 7-hour offset). Constitution §2.2 satisfied.

3. **Vercel cron GET/POST mismatch — RESOLVED 2026-04-23 (commit d4b6740).** `/api/reminders` and `/api/review-request` previously exported only `POST`; Vercel Cron sends `GET`, so every scheduled tick returned 405. Both handlers renamed to `export async function GET`. Verified at the first 02:00 UTC tick after deploy (2026-04-24 02:00 UTC / 2026-04-23 19:00 PDT): both routes returned 200, Bearer-token auth passing, handler bodies executing. Constitution §5.1 satisfied.

   **Behavioral verification deferred.** The reminder flag flips (`reminder_day_before_sent`, `reminder_hour_before_sent`) and the `status` → `completed` transition will confirm on the first real in-window booking. Deliberately not creating a test booking yet: until Session 3 (timezone bugs — Constitution §2, latent issues #1 and #2 above) lands, any booking's calendar event would be written to the pinecone calendar at the wrong wall-clock time (7–8 hours off), which would mislead the kids. First behavioral verification should ride on a real booking after the timezone fix.

4. **Booking downstream effects swallowed silently — RESOLVED 2026-04-25 (commits f49dc8b, d3b356d, 7db14e3).** `/api/book` previously caught both calendar-event-creation and confirmation-email failures and continued the booking with no signal that the downstream work failed. A booking row could exist with no calendar entry and no confirmation email, and nobody would notice until the customer showed up. Migration 004 added `calendar_sync_status` and `confirmation_email_sent_at` columns; `/api/book` now records the outcome of each downstream effect on the row and emits `[booking]`-prefixed structured logs on failure; `/api/admin/booking-health` surfaces the three integrity-gap categories (`calendar_sync_failed`, `confirmation_email_missing`, `calendar_event_missing`). Production verification on 2026-04-26: endpoint returned 0/2/0 — the 2 in `confirmation_email_missing` are the historical pre-instrumentation rows (deferred-decisions item, accept-or-backdate). CONSTITUTION §4.3 satisfied. Migration 000 captured the full post-004 schema in source control per CONSTITUTION §6.1; eight schema-drift items surfaced by the column/constraint/trigger queries are documented in the deferred-decisions section above.

## Session-preamble cross-reference

When starting a calendar-integration session, pair this doc with:
- `docs/session-preamble.md` — canonical session brief.
- `CONSTITUTION.md` §1 (availability correctness), §6.2 (this doc's own rule).
- `docs/ARCHITECTURE.md` §4 (data model), §5 (availability pipeline).

## Changelog

| Date | Change |
|---|---|
| 2026-04-23 | Initial doc. OAuth app moved to In Production (2026-04-22). Redirect URI `http://127.0.0.1:53682/` added for loopback flow. Both refresh tokens regenerated. `PERSONAL_CALENDAR_IDS` changed from dedicated blockout calendar (now deleted) to `chezziebr@gmail.com`. |
| 2026-04-23 | Cron GET/POST mismatch fixed (commit d4b6740). `/api/reminders` and `/api/review-request` renamed from `POST` to `GET` handlers; both verified 200 at the 02:00 UTC tick following deploy. Latent issue #3 resolved; behavioral verification (reminder flags flipping on real bookings) deferred until after Session 3 timezone fix. |
| 2026-04-24 | Session 3 timezone fixes shipped (commits 5172dcd, 0ade6e0, 9c05f42, 0ad9563). Latent issues #1 and #2 resolved. Created `lib/time.ts` with Pacific-timezone helpers (`pacificToday`, `pacificDateAtSlot`, `pacificDayBounds`, `pacificAddDays`, `formatPacificDate`, plus DB-backed `loadBusinessTimezone` / `loadServiceDurationMinutes` with in-process memoization); migrated every call site away from hardcoded offsets, server-local Date math, `toLocaleString` round-trips, and `.toISOString().split('T')[0]` patterns. Same fix applied to `/api/admin/calendar-test` per CONSTITUTION §1.4. Production verification (test booking 2026-04-26 12pm Pacific) discovered an additional bug family — `new Date('YYYY-MM-DD').toLocaleDateString(...)` displaying the previous day in Pacific browsers — at 8 sites (success page, admin dashboard, customers page, AvailabilitySettings, two SendGrid templates, two dead Resend templates, stats route). Added `formatPacificDate` helper; migrated all 8 sites in commit 0ad9563. CONSTITUTION §2 grep-test suite expanded with a sixth rule (`new Date(...).toLocale*`); all six rules pass clean across non-test code. End-to-end booking flow now consistent: success page, dashboard, confirmation email, and pinecone Google Calendar event all show the same Pacific wall-clock time. |
| 2026-04-25 | Session 4 — downstream-effect tracking + initial schema capture (commits f49dc8b, d3b356d, 7db14e3). Latent issue #4 resolved. Migration 004 adds `calendar_sync_status` and `confirmation_email_sent_at` columns to `bookings` per CONSTITUTION §4.3. Migration 000 snapshots the post-004 `bookings` + `reviews` schema as canonical CREATE TABLE statements per CONSTITUTION §6.1. `/api/book` (commit d3b356d) replaces silent catches on calendar/email failures with explicit row updates and structured `[booking]`-prefixed logging (operation names: `calendar_event_creation`, `calendar_status_update`, `confirmation_email`, `email_status_update`). `/api/admin/booking-health` (commit 7db14e3) surfaces the three failure categories (`calendar_sync_failed`, `confirmation_email_missing`, `calendar_event_missing`) with 5-minute lifecycle exclusions on the latter two. Production verification on 2026-04-26: endpoint returned 0/2/0 — the 2 in `confirmation_email_missing` are the historical pre-instrumentation rows (deferred-decisions item). Query A/B/C/D analysis of the production schema surfaced 8 drift items vs DISCOVERY §3 and migration 001 claims (partial-001 application, status enum drift, dead status values, missing UNIQUE on reviews.booking_id, missing CHECKs on lot_size/price/scheduled_date, no triggers, DISCOVERY §3 type errors, RLS off); all captured in the expanded Deferred decisions section. Verification section restructured to cover both diagnostic endpoints together; new "Database schema state" section added documenting which migrations are applied and the rebuild caveat. |
