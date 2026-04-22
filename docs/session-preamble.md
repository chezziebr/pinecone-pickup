# Pinecone Pick Up Crew — Session Preamble

Paste this at the top of a new Claude Code session for this app. Fill in `{{ SESSION GOAL }}` at the bottom. Trim the meta-notes only if space is tight — the load-bearing rules and the sev-1 state are not safe to drop.

---

## 0. Shell + location

- **Repo:** `~/ChezApps/pinecone-pickup` (Mac "ChezMini", user `chezziebr`). Note: on this machine, the actual path may include an outer `Chez Apps/` folder with a space — use the absolute path that your tooling resolves.
- **Start of every session:** `ulimit -n 2147483646`
- **Branch:** work from `main` unless a branch is active. `main` auto-deploys to Vercel production — no staging environment.

## 1. Read-before-you-think

Three docs in the repo carry the state of the system. Read in this order when context matters:

- `ARCHITECTURE.md` — what the system is.
- `CONSTITUTION.md` — the rules we enforce + a grep test for each.
- `DISCOVERY_REPORT.md` — the forensic source material that produced both.

Plus, for Next.js work specifically: **this is Next 16 with `proxy.ts`, not `middleware.ts`.** Read `node_modules/next/dist/docs/` for the relevant guide before writing framework-level code. Defaults you remember from earlier Next versions may be wrong.

## 2. Load-bearing rules (cheat sheet)

Full list lives in `CONSTITUTION.md`. The ones that have bitten this app hardest:

1. **The availability pipeline must never silently drop a layer.** The four layers are: seasonal hours (or weekly settings) → weekly blockouts + partial-date exceptions → full-date exception override → Google Calendar (personal + pinecone). Any layer that can't be verified must be signaled as degraded, not absorbed into a plausible-looking empty result. (Constitution §1.1)
2. **Google Calendar failures fail closed.** If either calendar can't be reached, return `[]` slots. `getFallbackAvailableSlots` is banned; hardcoded slot lists are banned. (Constitution §1.2)
3. **Pricing lives only in `lib/pricing.ts`.** No `* 20`, `* 40`, `basePrice`, `lotSizeUnits` literals anywhere else in the codebase. The `/booking/success` page must read the server-returned price, never recompute. (Constitution §3.1–3.2)
4. **No hardcoded UTC offsets** (`-07:00`, `-08:00`) anywhere. Bend is on PDT for ~8 months, PST for ~4 months; hardcoding either silently breaks half the year. Business-time reasoning lives in `lib/time.ts`. (Constitution §2.1–2.2)
5. **Cron routes export `GET`.** Vercel Cron is GET-only; POST-only routes return 405 and nothing runs. (Constitution §5.1)
6. **No top-level `throw new Error` for missing env vars.** Module-load throws crash Vercel serverless functions before any log line prints. Validate at request time; return 503. (Constitution §4.1)
7. **Bookings must record which downstream effects succeeded.** Calendar-insert and email-send failures today are swallowed silently — a booking row can exist with no calendar event and no confirmation email, and nobody notices until the customer shows up. (Constitution §4.3)

## 3. Scope guardrails

- **Out of scope, do not accidentally weave in:** customer accounts / customer auth, online payments (Stripe etc.), SMS, multi-tenant patterns, custom-domain-requiring integrations (e.g., Resend with a non-gmail from).
- **In scope but unbuilt:** a liability-waiver checkbox on the booking form (+ `waiver_accepted_at` column), surfacing real customer reviews instead of the hardcoded fake testimonials, filling in the three "coming soon" admin tabs (or removing their advertisements).
- **Dead weight to delete, not extend:** `lib/resend.ts`, `lib/admin-auth.ts`, `lib/errors.ts`, the `resend` / `react-email` / `@react-email/components` deps, the `audit_logs` write path (no reader), `business_settings.default_service_duration_minutes` + `timezone` rows (no reader). Constitution §6.3 forbids parking dead code.

## 4. Operational reality (update as it changes)

### Hosting & infrastructure
- **Vercel free tier.** No Edge Runtime; all routes are Node serverless functions. Vercel Cron evaluates cron expressions in UTC; minimum granularity is per-minute, practical granularity is hourly on free tier.
- **No custom domain.** `pinecone-pickup.vercel.app` only. SendGrid sends from `pinecone.pickup.crew@gmail.com`; gmail-from has some deliverability risk. Resend needs a domain you own and is therefore unusable.
- **No staging environment.** `main` → Vercel production.
- **Supabase** is the sole data store. Server routes use the service-role key and bypass RLS.

### Environment variables (canonical list — the code reads exactly these)
Boot-critical: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD`, `JWT_SECRET`, `CRON_SECRET`.
Calendar: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `PERSONAL_GOOGLE_REFRESH_TOKEN`, `PERSONAL_CALENDAR_IDS` *(name plural, used singular — Constitution §7.2 flags this for cleanup)*, `PINECONE_GOOGLE_REFRESH_TOKEN`, `PINECONE_CALENDAR_ID`.
Email: `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL` (optional).
Misc: `NEXT_PUBLIC_BASE_URL` (review-email link), `NODE_ENV`.
Unused/dead: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — safe to remove from Vercel.

## 5. Known severity-1 state (as of 2026-04-22 — verify current status before assuming)

**Google Calendar integration is non-functional in production.** Both refresh tokens return `invalid_grant`. Leading cause: OAuth app stuck in Google Cloud Console "Testing" mode (7-day token expiry). Until resolved:
- The booking page offers slots that contradict the calendars.
- New bookings succeed in the DB but are not written to the pinecone calendar (the kids' primary visibility channel).
- Revenue metrics show $0 because the review-request cron (which flips status to `completed`) is also non-functional for a separate reason (see below).

**Two related bugs are dormant because of the sev-1, but will activate the moment tokens are fixed** — address them in the same change:
- `lib/availability-engine.ts:389` hardcodes `-07:00`, so from Nov 2026 onward every slot-to-calendar comparison will be an hour off.
- `lib/google-calendar.ts:28-29` constructs event times in server-local (UTC) before sending to Google, so every newly-created event will land 7–8 hours off the intended wall-clock time.

**The two Vercel crons (`/api/reminders`, `/api/review-request`) are almost certainly 405-ing every hour** because they export `POST` but Vercel Cron sends `GET`. Fix = rename the handler.

**Fastest health check:** `/api/admin/calendar-test?date=<today>` (admin-gated). Returns per-calendar connection status, event count, and error message. Before declaring the calendar integration "fixed," both calendars must return `"status": "connected"` from this endpoint.

## 6. How Chez wants to work

- Be blunt. If something is broken, say so by name. No hedging language. No sycophantic preamble.
- Show updates at key moments (finding, direction change, blocker). One sentence is usually enough. Don't narrate thinking.
- When I react to an intermediate artifact (a report, a plan, a diff), pause and wait for my signal before proceeding to the next phase.
- Don't commit unless I say to. Don't push unless I say to.
- Dual-sourced facts: when something that should exist isn't where you expect, investigate before assuming. Do not delete unfamiliar files or branches — they may be in-progress work.

---

## Session goal

{{ SESSION GOAL }}
