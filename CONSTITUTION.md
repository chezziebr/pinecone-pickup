# Pinecone Pick Up Crew — Constitution

**Purpose.** Architectural rules this codebase follows going forward. Every rule is grounded in a concrete bug or drift pattern found during the 2026-04-22 review. Rules are phrased to be **grep-testable** or **endpoint-testable** where possible, so an AI agent (or a human) can verify compliance without code review.

**How to use this.**
- Read rules before making changes. When a rule would block a change, either the rule is wrong (update it here, with reasoning) or the change is wrong.
- When adding new rules, ground each one in a real incident or drift pattern. Speculative best practices do not belong here.
- Each rule has a **Why** (the concrete thing that went wrong) and a **How to apply** (where it bites).

**Companion documents.**
- `DISCOVERY_REPORT.md` — the forensic source material for every rule below.
- `docs/ARCHITECTURE.md` — what the system is.
- `docs/session-preamble.md` — the canonical opening-of-session brief.

---

## 1. Availability correctness

The app's core promise is "you can book a time when the crew is actually available." The whole rest of the product exists to serve that promise. Every rule in this section is about keeping the four-layer merge honest.

### 1.1 The availability pipeline must not silently swallow external-data errors.

**Grep test:** in `lib/availability-engine.ts`, `lib/google-calendar.ts`, and `lib/availability.ts`, every `catch` block must either **re-throw**, **record a degraded-state flag on the returned value**, or **return `[]`**. No `catch (e) { console.error(...) }` that lets execution continue with a silently-reduced dataset.

**Why:** on 2026-04-22 both Google refresh tokens returned `invalid_grant`. The inner catch in `getAvailabilityData` swallowed the error, `googleEvents = []` propagated, and customers were offered every seeded slot regardless of real commitments. The app had no way to tell the truth ("I couldn't check the calendar") apart from a lie ("no conflicts found"). See DISCOVERY §8a #0.

**How to apply:** when adding a new external-data fetch to the availability path, the default skeleton is `try { … } catch (e) { throw e }` or `try { … } catch (e) { return { degraded: true, reason: e.message, slots: [] } }`. `console.error` alone is forbidden.

### 1.2 The availability pipeline fails closed. No hardcoded fallback slot list.

**Grep test:** the substring `getFallbackAvailableSlots` must not exist in the codebase. The strings `'9:00 AM'`, `'3:00 PM'`, and similar slot literals must appear only in tests.

**Why:** `getFallbackAvailableSlots` in `lib/availability-engine.ts:400–410` returns hardcoded weekend/weekday slots on any DB error. A database outage turns into "everything is bookable." That is the opposite of what a booking system should do. See DISCOVERY §8a #3.

**How to apply:** if the pipeline can't confirm the answer, return `[]`. The customer sees "no slots available for this date"; they try another date or contact Bruce. This is strictly better than offering a commitment the kids can't honor.

### 1.3 Google Calendar events failing to insert must not be invisible.

**Grep test:** every `await createBookingEvent(...)` call site must check the result and either (a) record the failure on the booking row (`google_event_id IS NULL` with a reason column) or (b) surface it to an admin notification channel. Plain `try { await createBookingEvent() } catch { /* ignore */ }` is banned.

**Why:** `app/api/book/route.ts:123–136` once swallowed calendar-insert failures. Because the admin dashboard's "Bookings" tab was a placeholder, the kids' primary channel for seeing new bookings **was the pinecone Google Calendar itself**. A silent failure to write there meant the kids might not know the customer existed until the customer showed up. See DISCOVERY §8a #0 "Cascading consequence." **Resolved Session 4 (commits `f49dc8b`, `d3b356d`, `7db14e3`):** migration 004 added `calendar_sync_status` (CHECK enum) + `confirmation_email_sent_at`; `/api/book` records outcomes explicitly with structured `[booking]`-prefixed logs; `/api/admin/booking-health` surfaces the gaps. Backfilling missed events is now possible from `bookings` alone.

**How to apply:** if `createBookingEvent` throws, the booking row must end up with `google_event_id = NULL` (and `calendar_sync_status='failed'`) plus a visible signal in `booking-health`. Backfilling missed events must be possible from the DB alone.

### 1.4 `/api/admin/calendar-test` is the canonical calendar-health check and must remain green in production.

**Grep test:** the route `app/api/admin/calendar-test/route.ts` must exist and return `"status": "connected"` for both calendars on any given weekday. Treat this endpoint the way you'd treat a `/healthz` — it is load-bearing, not disposable.

**Why:** this endpoint is what diagnosed the 2026-04-22 outage in 30 seconds. Remove it or let it rot and the next outage takes hours to find. See DISCOVERY §8a #0 diagnostic path.

**How to apply:** before any change to OAuth, calendar IDs, token handling, or env vars, hit this endpoint and confirm both calendars are green. Treat a red result as a deployment blocker.

---

## 2. Time and timezone

Bend runs on Pacific time. The database server runs on UTC. Vercel serverless functions run on UTC. Customers think in wall-clock Pacific. Every boundary between those is a place this app has already had a bug.

### 2.1 No hardcoded UTC offsets anywhere.

**Grep test:** the strings `-07:00`, `-08:00`, `+07:00`, `+08:00` must not appear in any `.ts`/`.tsx` file under `lib/` or `app/`.

**Why:** `lib/availability-engine.ts:389` and `app/api/admin/calendar-test/route.ts:37-38` once hardcoded `-07:00` (PDT). Bend is on PST for roughly four months a year. See DISCOVERY §8a #2. This was a bug that would have silently activated every November and deactivated every March. **Resolved Session 3 (commits `0ade6e0`, `9c05f42`):** both call sites use `pacificDateAtSlot` from `lib/time.ts`, which converts via `date-fns-tz` and the IANA `America/Los_Angeles` timezone.

**How to apply:** use IANA timezone IDs (`America/Los_Angeles`) with a real timezone library (`Intl.DateTimeFormat`, `luxon`, or `date-fns-tz`), never offset strings.

### 2.2 Business-time reasoning uses a single, named helper. Never `new Date(date + 'T00:00:00').setHours(...)`.

**Grep test:** the pattern `new Date(.*T00:00:00')` must not appear outside a designated `lib/time.ts` helper. `setHours` on a date produced from a YYYY-MM-DD string is banned.

**Why:** `lib/google-calendar.ts:28-29` and `app/api/reminders/route.ts:96-97` (and previously `app/api/review-request/route.ts`, removed in cluster 2) all built Dates this way. It parses as midnight **server-local time**, not Pacific. On Vercel (UTC) that means every subsequent `.setHours(15, ...)` is constructing 3 PM UTC, not 3 PM Pacific — 7 or 8 hours off. This is the root of the event-creation-offset bug (DISCOVERY §8a #8).

**How to apply:** create `lib/time.ts` with functions like `pacificDateAtSlot(dateStr, slotStr): Date` that do the conversion correctly, and use only that. Any place that needs a Pacific wall-clock moment imports from there.

### 2.3 The business timezone is a named constant, read from `business_settings.timezone`.

**Grep test:** string literal `'America/Los_Angeles'` must appear at most once in non-test code (in the time helper that reads the DB setting with that as a fallback).

**Why:** `lib/google-calendar.ts:115,119` and `app/api/reminders/route.ts:31` hardcode `America/Los_Angeles` (the now-removed `app/api/review-request/route.ts` also did). The `business_settings` table has a `timezone` row for exactly this reason, and no code reads it. See ARCHITECTURE §4.

**How to apply:** one helper, one fallback. The DB row becomes the single source of truth; the string literal is the "we couldn't reach the DB" default.

### 2.4 "Today" in Pacific is not `new Date().toISOString().split('T')[0]`.

**Grep test:** the pattern `.toISOString().split('T')[0]` must not appear in any code path that reasons about "today" or "past."

**Why:** `components/BookingForm.tsx:105`, `lib/availability.ts:22-24`, `lib/validation.ts:157-163` once computed "today" in UTC. Between 4 PM and midnight Pacific, UTC is already on the next calendar day, so Pacific-today was marked as past and greyed out in the booking calendar. See DISCOVERY §8a #4. **Resolved Session 3 (commit `0ad9563` plus the broader migration to `lib/time.ts`):** all cited sites use `pacificToday()` and a sixth bug family (`new Date('YYYY-MM-DD').toLocaleDateString(...)`) was caught at 8 additional sites and fixed via `formatPacificDate`.

**How to apply:** use the `lib/time.ts` helper to compute `pacificToday()`. The grep test above catches every current bug site.

---

## 3. Pricing as single source of truth

Pricing is where the app most embarrassingly contradicts itself. It takes one shared constant to fix it forever.

### 3.1 All pricing is defined in `lib/pricing.ts`. Nothing else computes a dollar amount.

**Grep test:** the substrings `* 20`, `* 40`, `basePrice`, and `lotSizeUnits` must appear only inside `lib/pricing.ts` (and its tests). Marketing UI components (`components/Pricing.tsx`, `components/Hero.tsx`) must import display values from that module, not restate them.

**Why:** `app/api/book/route.ts:11-83` once held the authoritative formula. `app/booking/success/page.tsx:24-26` had a duplicate that ignored lot size and showed $40 flat for a $160 booking. `components/Pricing.tsx` and `components/Hero.tsx` restated the same values in marketing copy. See DISCOVERY §8a #7. **Resolved cluster 1 (commits `dcc7308`, `2c5773d`, `3049471`):** `lib/pricing.ts` is the single source of truth — `calculateBookingPrice(lot_size, service_type)` plus `LOT_SIZE_UNITS`, `PICKUP_BASE_PER_UNIT`, `HAUL_AWAY_FEE`. The pricing math bug (haul-away as multiplier instead of flat surcharge) was also fixed in the same cluster. `Pricing.tsx` and `Hero.tsx` now display values consistent with the constants.

**How to apply:** `lib/pricing.ts` exports `LOT_SIZE_UNITS`, `PICKUP_BASE_PER_UNIT`, `HAUL_AWAY_FEE`, and `calculateBookingPrice(lot_size, service_type): number`. Every price the user sees — booking response, success page, email, admin dashboard — passes through one of those exports.

### 3.2 The success page displays the price the server returned, not a locally-recomputed one.

**Grep test:** `app/booking/success/page.tsx` must read `price` (or equivalent) from the URL query string or a dedicated API call — never recompute from `service_type` alone.

**Why:** the success page once recomputed price as `service === 'Pick Up Only' ? 20 : 40` — lot size absent. See DISCOVERY §8a #7. Anywhere the UI guesses instead of asking, the guess diverges from the server over time. **Resolved cluster 1 (commit `2c5773d`, Path A):** `BookingForm` plumbs the API response's canonical `price` through `URLSearchParams` to `/booking/success`; the success page reads from the URL instead of recomputing.

**How to apply:** the booking API returns `{ success, bookingId, price }`. Plumb `price` through the redirect to the success page, or fetch the booking by ID. Either works; local recomputation does not.

### 3.3 Service duration (90 min) is read from one place, not hardcoded in four.

**Grep test:** the literal `90 * 60 * 1000` (and `90 minutes` phrasing outside of comments about the rule) must appear at most once in non-test code.

**Why:** 90-minute duration is hardcoded in `lib/google-calendar.ts` and `lib/availability-engine.ts` (slot end calculation); the now-removed `app/api/review-request/route.ts` also relied on it implicitly. `business_settings.default_service_duration_minutes = 90` is seeded but nothing reads it. See ARCHITECTURE §4. **Partially resolved Session 3:** `lib/time.ts` exports `loadServiceDurationMinutes()` which reads the DB row with a constant fallback, and several call sites (e.g., `/api/review-request` before its removal, the cron path) use it. **Still live work:** the hardcoded `90 * 60 * 1000` literal still appears in `lib/google-calendar.ts` and `lib/availability-engine.ts` slot-end calculations — the grep test does not yet pass clean.

**How to apply:** one export in `lib/time.ts` (or `lib/pricing.ts` — whichever is more cohesive), backed by the DB row, with a fallback. `loadServiceDurationMinutes()` is that export; remaining call sites need migration to it.

---

## 4. Failure modes: fail closed, not open

The 2026-04-22 incident was a failure mode, not a feature bug. The pattern — "external thing broke, code absorbed it, customer saw plausible-looking output" — is the single most dangerous shape in this codebase.

### 4.1 No top-level `throw new Error` at module load for missing env vars.

**Grep test:** no top-level `if (!process.env.X) throw new Error(...)` outside a function body. Env var checks happen at request time.

**Why:** `app/api/reminders/route.ts:8-10` (and the now-removed `app/api/review-request/route.ts:8-10`) threw at module load if `CRON_SECRET` was missing. On Vercel, this crashes the serverless function before any handler runs and before any useful log line. The cron invocation sees a 500, the user sees nothing, the logs are inscrutable. See DISCOVERY §7. (Both routes were fixed in commit 568cd00 to validate at request time and return 503 on missing secret; the principle still applies to any future cron route.)

**How to apply:** check inside the handler and return a 503 with a clear message. Cold-start code should never throw; it should produce serializable errors at request time.

### 4.2 External-API error propagation is explicit.

**Rule:** every external call (Google, SendGrid, Supabase) that is caught must log enough context to diagnose, and must either re-throw or mark the operation as degraded. "Degraded" must be representable in the response — an API cannot return `{ slots: [] }` in two cases ("calendar checked, nothing conflicting" vs. "calendar couldn't be checked") and expect the UI to act correctly.

**Why:** the availability engine today returns the same empty-conflict result whether Google succeeded with zero events or failed entirely. That is the shape of the bug that caused DISCOVERY §8a #0.

**How to apply:** responses that depend on external data should carry a small shape like `{ slots: string[], sources: { googleCalendar: 'ok' | 'degraded' | 'skipped' } }`. The UI decides what to show; the API doesn't lie about what it knows.

### 4.3 Bookings succeed only when all critical downstream effects succeed OR the row records which one didn't.

**Rule:** `/api/book` once swallowed calendar-insert failure and email-send failure. If those stayed swallowed, the booking row had to carry explicit columns: `google_event_id NULL` signaling calendar failure; a `confirmation_email_sent_at` column signaling email failure. An admin must be able to query "which bookings didn't notify the customer and don't have a calendar entry."

**Why:** DISCOVERY §8a #0 "Cascading consequence" — bookings were happening without calendar entries, and nobody knew which ones until manually checked. **Resolved Session 4 (commits `f49dc8b`, `d3b356d`, `7db14e3`):** migration 004 added `calendar_sync_status` (CHECK enum 'pending'|'success'|'failed') + `confirmation_email_sent_at TIMESTAMPTZ`; `/api/book` writes these on success, leaves the email column NULL on failure, sets sync status to 'failed' on calendar throw; `/api/admin/booking-health` surfaces three categories of gaps (`calendar_sync_failed`, `confirmation_email_missing`, `calendar_event_missing`). Rule satisfied.

**How to apply:** add tracking columns, have the route set them on success, leave them NULL on failure, and expose a filter in the admin UI (or at minimum a SQL query pattern in `docs/ops.md`) to find the gaps. The `/api/admin/booking-health` endpoint is that filter for the existing columns; new tracking columns added later should follow the same pattern.

---

## 5. Email and reminder honesty

Don't advertise features the infrastructure can't deliver. Every claim in user-facing copy about "we'll send you a reminder" or "confirmation email" must be backed by a path that has been tested end to end.

### 5.1 Cron route files export `GET`. Vercel Cron is GET-only.

**Grep test:** every path in `vercel.json`'s `crons[]` must correspond to a route file that exports `export async function GET(...)`. Do not export both `GET` and `POST` — pick one.

**Why:** `/api/reminders/route.ts` (and the now-removed `/api/review-request/route.ts`) used to export only `POST`. Vercel Cron sends `GET`, so every scheduled tick returned 405. Confirmed against Vercel's docs on 2026-04-22; fixed in commit d4b6740. See DISCOVERY §8a #1.

**How to apply:** rename the handler. If you want a richer API for manual triggering during development, add a separate admin-gated route that calls the same business logic.

### 5.2 UI copy about reminders and confirmations must match what the code actually does.

**Grep test:** any component string containing `reminder` or `confirmation email` must be traceable to a cron or route that has been verified as functional in production within the last month. Vaporware copy is forbidden.

**Why:** `components/BookingForm.tsx:215` says "You'll get instant confirmation and reminders." `components/BookingForm.tsx:461` says "Send me a reminder the day before and 1 hour before my pick up." `app/booking/success/page.tsx:80-82` says "You'll also get reminder emails before we arrive!" None of these reminders were being sent because of the cron-method bug. See DISCOVERY §8a #1. **Resolved 2026-04-23 (commit `d4b6740`):** the cron handlers were renamed from `POST` to `GET`; the 02:00 UTC tick following deploy returned 200 with handler bodies executing. The reminder copy in BookingForm and on the success page is no longer vaporware.

**How to apply:** before adding or keeping a reminder-related string, verify the delivery path exists end to end (cron fires → route runs → email sends). When adding new copy, add a matching entry in `docs/ops.md` describing the delivery mechanism.

---

## 6. Change management and operational truth

The repo should carry the operational facts the app depends on. Missing facts lead to rediscovery-by-outage.

### 6.1 Every table the code reads has its `CREATE TABLE` statement in `database/migrations/`.

**Grep test:** for every Supabase table name that appears in `.from('<table>')` calls, a matching `CREATE TABLE <table>` must exist in `database/migrations/*.sql`.

**Why:** `bookings` and `reviews` were referenced by constraints in migration 001 but never created. The canonical schemas lived only in the Supabase dashboard. Recreating the DB from this repo was impossible. See DISCOVERY §3. **Resolved Session 4 (commit `f49dc8b`):** migration `000_initial_tables.sql` captures both tables as `CREATE TABLE` statements pulled from Supabase. Rule satisfied.

**How to apply:** never create a table directly in the Supabase UI without also committing a matching migration. When schema evolves (cluster 1 added migration 005 + 006; cluster 2 added 007; pattern continues), each migration becomes a delta on top of 000.

### 6.2 OAuth app publishing status and calendar ID identities are documented in `docs/ops.md`.

**Rule:** `docs/ops.md` exists and records: (a) the Google Cloud Console project + OAuth client ID, (b) the current **publishing status** (Testing vs. In Production), (c) which Google account owns each calendar, (d) the last refresh-token regeneration date, (e) the next required re-auth date if the app is in Testing mode.

**Why:** both tokens died simultaneously on ~2026-04-22 almost certainly because the OAuth app is in Testing mode with 7-day token expiry. That fact isn't recorded anywhere in the repo, so diagnosing it required a session of forensic work. See DISCOVERY §8c #2.

**How to apply:** write the doc. Re-check it every time tokens are regenerated.

### 6.3 Dead code is deleted, not commented out or parked.

**Grep test:** files that are never imported must not exist. After each cleanup pass, run `grep -r "from '@/lib/<name>'" | grep -v <name>.ts` — if the file is only self-referenced, delete it.

**Why:** `lib/resend.ts`, `lib/admin-auth.ts`, `lib/errors.ts`, `hasTimeConflict` in `lib/google-calendar.ts`, `calculateServiceDuration` in `lib/availability.ts`, unused `business_settings` rows, the `audit_logs` table, and the `pending`/`cancelled` status values were all dead. The presence of dead code is itself a source of drift: it tells the next reader the system is more complex than it is, and it invites re-adoption with divergent logic. See DISCOVERY §8b. **Largely resolved across clusters 1-3:**
- Cluster 1 (commit `2ce006b`) deleted `lib/resend.ts`, `lib/admin-auth.ts`, `lib/errors.ts`, `hasTimeConflict`, `calculateServiceDuration` and uninstalled the corresponding dead deps.
- Cluster 2 (commit `ab9e395`) removed the entire `/api/review-request` workflow including `sendReviewRequest` + `validateReviewData` + `ReviewData` orphans.
- Cluster 3 (commits `7fa3b07`, `26c4e91`) removed `components/Testimonials.tsx` (fake hardcoded testimonials) and dropped `'pending'` and `'cancelled'` from validation `STATUSES`.
- `business_settings.timezone` and `default_service_duration_minutes` are now READ by `loadBusinessTimezone` / `loadServiceDurationMinutes` in `lib/time.ts` (Session 3) — no longer dead rows.
- `audit_logs` write path lives via migration 006 with no reader (acknowledged caveat in `docs/ops.md`; `audit_trigger.changed_by` is `NULL` under service-role connections).

Remaining: plural `PERSONAL_CALENDAR_IDS` env var still drift (deferred per `docs/ops.md`).

**How to apply:** when cleaning up, remove the file, the dependency, the row, and the reference in one commit. If "might need it later" is tempting, the git history is the archive.

### 6.4 Admin UI advertises only features that are built.

**Grep test:** the strings `coming soon`, `🚧`, `placeholder` must not appear in `/admin/*` pages in production code. Feature cards on the login screen (`app/admin/page.tsx:108-127`) must correspond to tabs that render a working UI.

**Why:** `/admin/dashboard` once advertised "Bookings", "Customers", "Finances" in the login screen, then showed literal "coming soon!" placeholders inside the dashboard for three of the five tabs. The standalone `/admin/customers` page worked but was unlinked. This was vaporware inside the admin surface. See DISCOVERY §8c #3. **Resolved cluster 2 (commits `cb003dc`, `d932fec`, `c8f5428`):** Bookings tab is a sortable full-list table with per-row Complete/Edit actions; Finances tab shows real revenue + tips + payment-method breakdown + 6-month buckets; Customers tab is a link card to the existing standalone page. All five tabs functional.

**How to apply:** either build the feature, delete the tab, or link to the working page. No middle state.

---

## 7. Scope discipline

This is a single-tenant hobby app with specific constraints. Don't accidentally turn it into something else.

### 7.1 No customer-account, online-payment, or SMS features without an explicit scope decision recorded in the repo.

**Why:** the product thesis is anonymous booking, cash at service, email-only notifications. Each of those is a deliberate choice given the free-tier hosting, no custom domain, and single-admin scale. Adding any of them is an architectural pivot that changes auth model, data model, and deliverability requirements simultaneously. See ARCHITECTURE §11.

**How to apply:** if a future task asks to add "customer login" or "Stripe integration", pause and ask Chez whether this is a scope expansion. Do not weave in partial support.

### 7.2 No multi-tenant patterns. Drift signals like the plural `PERSONAL_CALENDAR_IDS` must be corrected.

**Grep test:** env var names that imply a collection (`*_IDS`, `*_LIST`) must actually be parsed as collections, or be renamed to singular.

**Why:** `PERSONAL_CALENDAR_IDS` is used as a single string everywhere in the code (three call sites). If someone sets it to a comma-separated list — a reasonable reading of the plural — every Google API call 404s and the silent calendar-off behavior returns. See DISCOVERY §8c #10.

**How to apply:** rename to `PERSONAL_CALENDAR_ID` (singular) in code and Vercel env, or implement the split. No hinting at a feature that isn't there.

### 7.3 No new dependencies without a one-line justification.

**Why:** `resend`, `@react-email/components`, `react-email`, and `vercel` were all in `package.json` without being imported by live code. Each was added for a reason that didn't end up shipping. The inventory should shrink over time, not grow. See DISCOVERY §8b. **Resolved cluster 1 (commit `2ce006b`):** all four uninstalled in the dead-code cleanup pass alongside the lib files that referenced them.

**How to apply:** any PR that adds a dependency must state in its description the one-line reason and the specific code that uses it. When removing dependencies, remove them from `package.json` and `package-lock.json` in the same commit as the code that used them.

---

## Amendment log

| Date | Rule(s) affected | Change | Reason |
|---|---|---|---|
| 2026-04-22 | initial | Constitution created based on DISCOVERY_REPORT.md §8 | — |
| 2026-04-27 | §2.1, §2.2, §2.3, §3.3, §4.1, §5.1 | Removed `app/api/review-request/route.ts` from "Why" example lists; updated text to reflect single remaining cron and historical fix commits | Cluster 2 review-request workflow removal (commit `1c214db`) |
| 2026-04-28 | §1.3, §2.1, §2.4, §3.1, §3.2, §3.3, §4.3, §5.2, §6.1, §6.3, §6.4, §7.3 | Past-tensed "Why" sections + appended one-line resolution pointers (Session/cluster X, commit SHAs). §3.3 noted as partially resolved (DB-backed loader exists; hardcoded literal still in two files). Rules unchanged. | Reconcile with cluster 1/2/3 reality after 7 days of cleanup work |
