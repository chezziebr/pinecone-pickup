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

#### 1. Migration 001 partially applied — RESOLVED 2026-04-27 (commit c2487b2)

→ Resolved by migration 006. See Known latent issues #5 below for the full framing (sharper than this item's original analysis: 001's named constraints never applied at all — the existing CHECKs are Supabase-UI-generated, not 001's).

#### 2. `bookings.status` enum drift between code and DB
**Source:** Query B (`bookings_status_check`) vs `lib/validation.ts:38`.

DB CHECK allows `('confirmed', 'completed', 'cancelled')`. `lib/validation.ts:38 ALLOWED_VALUES.STATUSES` allows `['confirmed', 'completed', 'pending', 'cancelled']`. Validation accepts `'pending'`; DB would reject it with a 500.

Dormant: no code path POSTs a `status` server-side, and the route writes `'confirmed'` literal at `app/api/book/route.ts:101`. The drift can't fire from the customer booking path. Could fire if any future admin-PATCH path passes `'pending'` through validation.

Resolution: drop `'pending'` from `lib/validation.ts:38`.

#### 3. Dead status values
**Source:** DISCOVERY §3 + Query B + grep of route code.

Both `'cancelled'` (DB CHECK + validation) and `'pending'` (validation only) are dead. Only `'confirmed'` (set by `/api/book`) and `'completed'` (set by the admin post-service form, cluster 2) are ever written. (Previously `'completed'` was set by the now-removed `/api/review-request` cron.)

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

5. **Migration 001 partial application — RESOLVED 2026-04-27 (commit c2487b2).** Session 4's queries (run 2026-04-25) revealed that *none* of migration 001's named constraints applied to production. The CHECK constraints predating migration 006 — `bookings_service_type_check`, `bookings_status_check`, `reviews_rating_check` — were created via the Supabase UI before any migrations existed; PostgreSQL auto-named them with the `<table>_<col>_check` pattern, which is why they don't match 001's `check_*` naming. Migration 001 likely failed at the first `ALTER TABLE ADD CONSTRAINT` (probably duplicate-by-name with a UI-created equivalent) and left the rest unrun.

   Migration 006 (`database/migrations/006_finish_001_constraints_and_triggers.sql`) brings production to 001's intended end state with one deliberate omission: `CHECK (scheduled_date >= CURRENT_DATE)`, plus the matching `IF NEW.scheduled_date < CURRENT_DATE` branch inside `validate_booking_data()`. `CURRENT_DATE` evaluates at every UPDATE; either of those would block any UPDATE on past-dated bookings (originally the review-request cron's `confirmed → completed` flip; now the admin post-service form's same flip in cluster 2). API-layer `validateFutureDate` enforces "future date at create time" — the actual business rule.

   Post-006 production constraint mix:
   - `bookings`: `bookings_pkey`, `bookings_service_type_check` (UI), `bookings_status_check` (UI), `bookings_calendar_sync_status_check` (migration 004), `check_price_positive` (006), `check_valid_lot_size` (006).
   - `reviews`: `reviews_pkey`, `reviews_booking_id_fkey`, `reviews_rating_check` (UI), `unique_review_per_booking` (006).

   Verified via post-application queries against `pg_constraint` and `information_schema.triggers` on 2026-04-27 (10 rows / 7 rows / `audit_logs` exists).

   **Audit-trail caveat.** `audit_trigger()` writes `changed_by` from `current_setting('request.jwt.claims', true)::json->>'email'`. The app uses the service-role key on every server route — service-role connections don't carry JWT claims, so `changed_by` will be `NULL` on every audit row. Not a bug for current usage (`audit_logs` is write-only and unread anywhere in the codebase, per DISCOVERY §3 and §6.3), but a future reader who decides to actually consume the audit trail will need to either (a) start passing app-side identity through `set_config('request.jwt.claims', ...)` before each statement, or (b) replace the trigger's identity source. If a reader is ever built, design the identity capture alongside.

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
| 2026-04-27 | Cluster 1 close-out — migration 001 reconciliation, liability waiver feature, pricing math correction (commits c2487b2, 9a5978c, 987cb0e, faeb449, 0a3f2b3, dcc7308, 2c5773d, 3049471). Three threads in one day. **Part 1 — migration 001 reconciliation** (c2487b2, 9a5978c, 987cb0e): migration 006 applies the parts of 001 that never landed — `check_price_positive` and `check_valid_lot_size` on `bookings`, `unique_review_per_booking` on `reviews`, the `validate_booking_data` and `validate_review_data` trigger functions and triggers, `audit_logs` table, `audit_trigger` function, `audit_bookings_trigger`. Deliberately omitted: `CHECK (scheduled_date >= CURRENT_DATE)` on `bookings` and the matching past-date branch inside `validate_booking_data()` — both would block the review-request cron's `confirmed → completed` UPDATE on past-dated bookings; API-layer `validateFutureDate` enforces the actual business rule. Session 4's "migration 001 partially applied" deferred-decisions item moved to resolved (Known latent issues #5) with a sharper framing: 001's named constraints never applied at all — the pre-006 UI-named CHECKs were Supabase-UI-generated before any migrations existed, and 001 likely failed at first `ALTER TABLE ADD CONSTRAINT`. Audit-trail caveat documented: `audit_trigger.changed_by` is `NULL` on every row under service-role connections (no JWT claims) — acceptable while `audit_logs` remains unread, matters if a reader is ever built. DISCOVERY §3 correction appended documenting the sharper history. **Part 2 — liability waiver feature** (faeb449, 0a3f2b3): migration 005 adds `waiver_accepted_at TIMESTAMPTZ NOT NULL` to `bookings`; existing two test rows backfilled to their `created_at` values (deemed-accepted-at-create-time fiction, defensible for test data, not for real customers). Booking flow now requires customer to tick a checkbox before submit; submit button disabled until checked; `/api/book` rejects requests without `waiver_accepted_at` via `validateBookingData`. Waiver text in `lib/constants.ts` as exported `WAIVER_TEXT` — single source of truth, version-controlled, not in `business_settings` (legal language is the wrong fit for a runtime DB lookup). Two-layer enforcement: UI affordance + server validation. **Operational lesson:** the migration was applied to production *before* the code that populates the new column was deployed, which briefly broke `/api/book` (NOT NULL violations on every insert) for ~2 minutes between Supabase apply and Vercel deploy. For schema-tightening migrations that depend on app-side population, future ordering should be: ship code that writes the column → deploy → apply NOT NULL. Or split the migration into two: nullable add now, NOT NULL later after code is live. **Part 3 — pricing math correction** (dcc7308, 2c5773d, 3049471; unplanned for this cluster, surfaced during waiver verification): haul-away service was multiplying by lot units instead of being a flat $20 surcharge — ¾ acre + Pick Up + Haul Away charged **$120** instead of **$80**; success page showed yet a different wrong number ($40) due to its own placeholder math (a TODO comment from the original implementation). Two independent broken formulas reconciled onto a single source of truth in `lib/pricing.ts` (`calculateBookingPrice(lot_size, service_type)` plus `PICKUP_BASE_PER_UNIT`, `HAUL_AWAY_FEE`, `LOT_SIZE_UNITS` constants). `/api/book` imports the pure function. `BookingForm` plumbs the API response's canonical `price` through `URLSearchParams` to the success page (Path A); success page reads from URL instead of recalculating. Form gains a live "Total: $X" line that updates as `lot_size` and `service_type` change — customer sees the real number before submit. `Pricing.tsx` haul-away card now shows "$20/¼ acre + $20 FLAT FEE*" with footnote "*regardless of property size"; "(N units)" arithmetic removed from customer copy. Service Type dropdown labels stripped of parenthetical pricing entirely (3049471) after testing surfaced the per-¼-acre haul-away framing as misleading. 1+ acre defaults to 3 units ($60 base / $80 with haul) per spec; manual-review workflow for unusually large lots remains deferred. **Test data hygiene:** two test bookings created and deleted during cluster-1 verification (one for waiver flow, one for pricing flow); production `bookings` back to 2 historical rows (`fff5c928`, `ea988376`). Historical rows intentionally not re-priced — their stored prices are frozen historical state, accurate to when they were created. **Cluster 1 closed.** |
