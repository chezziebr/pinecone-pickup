import { NextRequest, NextResponse } from 'next/server'
import { requireAdminAuth, handleRouteError } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { pacificToday } from '@/lib/time'

const FIELDS = 'id, created_at, scheduled_date, scheduled_time, first_name, last_name, email, google_event_id, calendar_sync_status, confirmation_email_sent_at'
const LIMIT_PER_CATEGORY = 100

export async function GET(request: NextRequest) {
  try {
    requireAdminAuth(request)

    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const today = pacificToday()

    const [failedRes, emailMissingRes, eventMissingRes] = await Promise.all([
      // Calendar-sync failures: terminal state. No age filter — a failure that's
      // 6 months old is still a real integrity gap. Newest first so recent
      // regressions surface at the top.
      supabaseAdmin
        .from('bookings')
        .select(FIELDS, { count: 'exact' })
        .eq('calendar_sync_status', 'failed')
        .order('created_at', { ascending: false })
        .limit(LIMIT_PER_CATEGORY),

      // Confirmation-email missing: 5-min age filter excludes bookings still in
      // the post-insert lifecycle window. Newest first.
      supabaseAdmin
        .from('bookings')
        .select(FIELDS, { count: 'exact' })
        .is('confirmation_email_sent_at', null)
        .lt('created_at', fiveMinAgo)
        .order('created_at', { ascending: false })
        .limit(LIMIT_PER_CATEGORY),

      // Future bookings missing a calendar event: ordered scheduled_date ASC so
      // the soonest-coming gap surfaces first (a booking 3 days out is more
      // urgent than one 6 months out). 5-min age filter covers transient
      // 'pending' state during the booking-insert lifecycle.
      supabaseAdmin
        .from('bookings')
        .select(FIELDS, { count: 'exact' })
        .is('google_event_id', null)
        .gte('scheduled_date', today)
        .lt('created_at', fiveMinAgo)
        .order('scheduled_date', { ascending: true })
        .limit(LIMIT_PER_CATEGORY),
    ])

    if (failedRes.error) throw failedRes.error
    if (emailMissingRes.error) throw emailMissingRes.error
    if (eventMissingRes.error) throw eventMissingRes.error

    return NextResponse.json({
      generated_at: new Date().toISOString(),
      pacific_today: today,
      limit_per_category: LIMIT_PER_CATEGORY,
      calendar_sync_failed: {
        count: failedRes.count ?? 0,
        bookings: failedRes.data ?? [],
      },
      confirmation_email_missing: {
        count: emailMissingRes.count ?? 0,
        bookings: emailMissingRes.data ?? [],
      },
      calendar_event_missing: {
        count: eventMissingRes.count ?? 0,
        bookings: eventMissingRes.data ?? [],
      },
    })
  } catch (error) {
    return handleRouteError(error, 'Booking health error')
  }
}
