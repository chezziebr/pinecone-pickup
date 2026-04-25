# Pinecone Pick Up Crew — Operations

**Status as of 2026-04-23.** Operational facts the app depends on that aren't derivable from code. Required by Constitution §6.2. Update any time OAuth config, calendar identities, or tokens change.

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

`GET /api/admin/calendar-test?date=YYYY-MM-DD` (admin-gated). Canonical health check per Constitution §1.4 — must stay green in production.

Green bar:
- Both `personalCalendar.status` and `pineconeCalendar.status` = `"connected"`.
- No `error` field on either.
- `personalCalendar.calendarId` matches `PERSONAL_CALENDAR_IDS`.
- `pineconeCalendar.calendarId` matches `PINECONE_CALENDAR_ID`.
- `personalCalendar.events` contains the events actually on that calendar.

Treat any red result as a deployment blocker.

## Deferred decisions

### Multi-calendar personal availability
Chez has other calendars that may represent time when supervisor coverage is unavailable: **Family**, **Brungraber Childcare**, **SummitWest** (work). These are not currently read by the app. To aggregate:
- Option A: implement comma-split on `PERSONAL_CALENDAR_IDS` (matches its plural name; resolves Constitution §7.2 drift).
- Option B: add a new env var (e.g. `PERSONAL_CALENDAR_IDS_EXTRA`) and iterate.

Revisit when a real availability miss occurs.

### OAuth Playground redirect URI
`https://developers.google.com/oauthplayground` remains registered on the OAuth Client as a fallback for browser-only re-auth if the local script is unavailable. Can be removed once the script is trusted long-term.

## Known latent issues (not fixed this session)

Deferred per session scope. Listed here so they don't drift further.

1. **`lib/availability-engine.ts:389` hardcoded `-07:00` — RESOLVED 2026-04-24 (commit 0ade6e0).** Slot-to-calendar comparison previously parsed slot times with a hardcoded PDT offset; would have started mis-subtracting by an hour every November when Bend moves to PST. Replaced with `pacificDateAtSlot` from `lib/time.ts`. Verified in production: a 2026-04-26 12pm Pacific test booking caused that slot to disappear from the public booking page after creation, confirming Layer-4 calendar-event subtraction works correctly. Same fix applied to `/api/admin/calendar-test` (commit 9c05f42, CONSTITUTION §1.4 — the diagnostic must not share the bug it diagnoses). Constitution §2.1 satisfied.

2. **`lib/google-calendar.ts:28-29` constructed event times in server-local (UTC) time — RESOLVED 2026-04-24 (commit 0ade6e0).** `parseTimeToDate` deleted; `createBookingEvent` now uses `pacificDateAtSlot` plus `await loadBusinessTimezone()` to anchor at the correct Pacific wall-clock moment. Verified in production: test booking on 2026-04-26 at 12:00 PM Pacific landed on the pinecone Google Calendar at the correct 12:00 PM PDT (previously would have been 5:00 AM due to the 7-hour offset). Constitution §2.2 satisfied.

3. **Vercel cron GET/POST mismatch — RESOLVED 2026-04-23 (commit d4b6740).** `/api/reminders` and `/api/review-request` previously exported only `POST`; Vercel Cron sends `GET`, so every scheduled tick returned 405. Both handlers renamed to `export async function GET`. Verified at the first 02:00 UTC tick after deploy (2026-04-24 02:00 UTC / 2026-04-23 19:00 PDT): both routes returned 200, Bearer-token auth passing, handler bodies executing. Constitution §5.1 satisfied.

   **Behavioral verification deferred.** The reminder flag flips (`reminder_day_before_sent`, `reminder_hour_before_sent`) and the `status` → `completed` transition will confirm on the first real in-window booking. Deliberately not creating a test booking yet: until Session 3 (timezone bugs — Constitution §2, latent issues #1 and #2 above) lands, any booking's calendar event would be written to the pinecone calendar at the wrong wall-clock time (7–8 hours off), which would mislead the kids. First behavioral verification should ride on a real booking after the timezone fix.

## Session-preamble cross-reference

When starting a calendar-integration session, pair this doc with:
- `docs/session-preamble.md` — canonical session brief.
- `CONSTITUTION.md` §1 (availability correctness), §6.2 (this doc's own rule).
- `ARCHITECTURE.md` §4 (data model), §5 (availability pipeline).

## Changelog

| Date | Change |
|---|---|
| 2026-04-23 | Initial doc. OAuth app moved to In Production (2026-04-22). Redirect URI `http://127.0.0.1:53682/` added for loopback flow. Both refresh tokens regenerated. `PERSONAL_CALENDAR_IDS` changed from dedicated blockout calendar (now deleted) to `chezziebr@gmail.com`. |
| 2026-04-23 | Cron GET/POST mismatch fixed (commit d4b6740). `/api/reminders` and `/api/review-request` renamed from `POST` to `GET` handlers; both verified 200 at the 02:00 UTC tick following deploy. Latent issue #3 resolved; behavioral verification (reminder flags flipping on real bookings) deferred until after Session 3 timezone fix. |
| 2026-04-24 | Session 3 timezone fixes shipped (commits 5172dcd, 0ade6e0, 9c05f42, 0ad9563). Latent issues #1 and #2 resolved. Created `lib/time.ts` with Pacific-timezone helpers (`pacificToday`, `pacificDateAtSlot`, `pacificDayBounds`, `pacificAddDays`, `formatPacificDate`, plus DB-backed `loadBusinessTimezone` / `loadServiceDurationMinutes` with in-process memoization); migrated every call site away from hardcoded offsets, server-local Date math, `toLocaleString` round-trips, and `.toISOString().split('T')[0]` patterns. Same fix applied to `/api/admin/calendar-test` per CONSTITUTION §1.4. Production verification (test booking 2026-04-26 12pm Pacific) discovered an additional bug family — `new Date('YYYY-MM-DD').toLocaleDateString(...)` displaying the previous day in Pacific browsers — at 8 sites (success page, admin dashboard, customers page, AvailabilitySettings, two SendGrid templates, two dead Resend templates, stats route). Added `formatPacificDate` helper; migrated all 8 sites in commit 0ad9563. CONSTITUTION §2 grep-test suite expanded with a sixth rule (`new Date(...).toLocale*`); all six rules pass clean across non-test code. End-to-end booking flow now consistent: success page, dashboard, confirmation email, and pinecone Google Calendar event all show the same Pacific wall-clock time. |
