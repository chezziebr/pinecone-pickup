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

1. **`lib/availability-engine.ts:389` hardcodes `-07:00`.** Works in PDT; breaks every November when Bend moves to PST. Slot-to-calendar comparison will be off by one hour for ~4 months per year. Constitution §2.1 violation.

2. **`lib/google-calendar.ts:28-29` constructs event times in server-local time (UTC on Vercel).** Currently writing events at wrong wall-clock times. Every new booking's calendar event appears on the pinecone calendar 7–8 hours off Pacific — e.g., a customer-booked 3:00 PM pickup shows up as an 8:00 AM event for the kids to see. This is Session 3 (timezone bugs) in the followup queue and should be prioritized. Constitution §2.2 violation.

3. **Vercel crons 405-ing.** `/api/reminders` and `/api/review-request` export only `POST`; Vercel Cron sends `GET`. Reminders not being sent; bookings never flip to `completed`; revenue metrics stay at $0. Constitution §5.1 violation.

## Session-preamble cross-reference

When starting a calendar-integration session, pair this doc with:
- `docs/session-preamble.md` — canonical session brief.
- `CONSTITUTION.md` §1 (availability correctness), §6.2 (this doc's own rule).
- `ARCHITECTURE.md` §4 (data model), §5 (availability pipeline).

## Changelog

| Date | Change |
|---|---|
| 2026-04-23 | Initial doc. OAuth app moved to In Production (2026-04-22). Redirect URI `http://127.0.0.1:53682/` added for loopback flow. Both refresh tokens regenerated. `PERSONAL_CALENDAR_IDS` changed from dedicated blockout calendar (now deleted) to `chezziebr@gmail.com`. |
