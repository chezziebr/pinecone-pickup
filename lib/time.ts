// Pacific-timezone arithmetic. The single home for wall-clock ↔ UTC conversion
// in this codebase. Call sites must not roll their own — see CONSTITUTION §2.

import { format as formatInTimeZone, fromZonedTime } from 'date-fns-tz'

// The only place this literal is allowed to appear in non-test code (§2.3).
export const DEFAULT_BUSINESS_TIMEZONE = 'America/Los_Angeles'
export const DEFAULT_SERVICE_DURATION_MINUTES = 90

// Today's calendar date in the given timezone, as YYYY-MM-DD.
export function pacificToday(tz: string = DEFAULT_BUSINESS_TIMEZONE): string {
  return formatInTimeZone(new Date(), 'yyyy-MM-dd', { timeZone: tz })
}

// A UTC Date corresponding to a wall-clock moment on a given date in the given
// timezone. Example: pacificDateAtSlot('2026-06-15', '3:00 PM') ->
// 2026-06-15T22:00:00.000Z (PDT, UTC-7). December 15 would be UTC-8.
export function pacificDateAtSlot(
  dateStr: string,
  slotStr: string,
  tz: string = DEFAULT_BUSINESS_TIMEZONE,
): Date {
  const { hours, minutes } = parseSlot(slotStr)
  const hh = String(hours).padStart(2, '0')
  const mm = String(minutes).padStart(2, '0')
  return fromZonedTime(`${dateStr}T${hh}:${mm}:00`, tz)
}

// Half-open UTC bounds for a given calendar date in the given timezone.
// `end` is the start of the *next* day — matches Google Calendar's exclusive
// `timeMax` semantics and avoids the 1-second-off-at-midnight edge.
export function pacificDayBounds(
  dateStr: string,
  tz: string = DEFAULT_BUSINESS_TIMEZONE,
): { start: Date; end: Date } {
  const start = fromZonedTime(`${dateStr}T00:00:00`, tz)
  const end = fromZonedTime(`${pacificAddDays(dateStr, 1)}T00:00:00`, tz)
  return { start, end }
}

// Calendar-day addition on a YYYY-MM-DD string. DST-safe: adds whole days,
// not 24-hour intervals, so fall-back / spring-forward don't shift the result.
export function pacificAddDays(
  dateStr: string,
  days: number,
  _tz: string = DEFAULT_BUSINESS_TIMEZONE,
): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const base = new Date(Date.UTC(y, m - 1, d))
  base.setUTCDate(base.getUTCDate() + days)
  const yy = base.getUTCFullYear()
  const mm = String(base.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(base.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

function parseSlot(slotStr: string): { hours: number; minutes: number } {
  const match = slotStr.trim().match(/^(1[0-2]|[1-9]):([0-5][0-9])\s*(AM|PM)$/i)
  if (!match) {
    throw new Error(`Invalid slot string: "${slotStr}". Expected "H:MM AM|PM".`)
  }
  let hours = parseInt(match[1], 10)
  const minutes = parseInt(match[2], 10)
  const period = match[3].toUpperCase()
  if (period === 'PM' && hours !== 12) hours += 12
  if (period === 'AM' && hours === 12) hours = 0
  return { hours, minutes }
}

// --- DB-backed settings loaders ------------------------------------------
// Memoized for the serverless instance's lifetime. Updating the row in
// business_settings takes effect at next cold start, not immediately.
// Acceptable for values that change ~never (tz, service duration).
// Dynamic supabase import keeps this module safe to import from client
// components; the loader is only ever called server-side.

let cachedBusinessTimezone: string | null = null
let cachedServiceDurationMinutes: number | null = null

export async function loadBusinessTimezone(): Promise<string> {
  if (cachedBusinessTimezone !== null) return cachedBusinessTimezone
  try {
    const { supabaseAdmin } = await import('./supabase')
    const { data, error } = await supabaseAdmin
      .from('business_settings')
      .select('value')
      .eq('key', 'timezone')
      .maybeSingle()
    cachedBusinessTimezone =
      error || !data?.value ? DEFAULT_BUSINESS_TIMEZONE : String(data.value)
  } catch {
    cachedBusinessTimezone = DEFAULT_BUSINESS_TIMEZONE
  }
  return cachedBusinessTimezone
}

export async function loadServiceDurationMinutes(): Promise<number> {
  if (cachedServiceDurationMinutes !== null) return cachedServiceDurationMinutes
  try {
    const { supabaseAdmin } = await import('./supabase')
    const { data, error } = await supabaseAdmin
      .from('business_settings')
      .select('value')
      .eq('key', 'default_service_duration_minutes')
      .maybeSingle()
    if (error || !data?.value) {
      cachedServiceDurationMinutes = DEFAULT_SERVICE_DURATION_MINUTES
    } else {
      const parsed = Number(data.value)
      cachedServiceDurationMinutes =
        Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SERVICE_DURATION_MINUTES
    }
  } catch {
    cachedServiceDurationMinutes = DEFAULT_SERVICE_DURATION_MINUTES
  }
  return cachedServiceDurationMinutes
}
