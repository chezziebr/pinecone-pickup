import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendDayBeforeReminder, sendHourBeforeReminder } from '@/lib/sendgrid'
import { loadBusinessTimezone, pacificAddDays, pacificDateAtSlot, pacificToday } from '@/lib/time'

// Require CRON_SECRET - no fallback for security
const CRON_SECRET = process.env.CRON_SECRET

if (!CRON_SECRET) {
  throw new Error('Missing required environment variable: CRON_SECRET must be set')
}

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization')
    const expectedAuth = `Bearer ${CRON_SECRET}`

    if (!authHeader || authHeader !== expectedAuth) {
      console.warn('Unauthorized cron request attempt:', {
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent'),
        timestamp: new Date().toISOString()
      })
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const tz = await loadBusinessTimezone()
    const now = new Date()
    const tomorrowDateStr = pacificAddDays(pacificToday(tz), 1, tz)

    let dayBeforeSent = 0
    let hourBeforeSent = 0

    // Day-before reminders
    try {
      const { data: dayBeforeBookings, error: dayBeforeError } = await supabaseAdmin
        .from('bookings')
        .select('*')
        .eq('scheduled_date', tomorrowDateStr)
        .eq('reminders_opted_in', true)
        .eq('reminder_day_before_sent', false)
        .eq('status', 'confirmed')

      if (dayBeforeError) {
        console.error('Error fetching day-before bookings:', dayBeforeError)
      } else if (dayBeforeBookings) {
        for (const booking of dayBeforeBookings) {
          try {
            await sendDayBeforeReminder(booking)

            await supabaseAdmin
              .from('bookings')
              .update({ reminder_day_before_sent: true })
              .eq('id', booking.id)

            dayBeforeSent++
          } catch (error) {
            console.error(`Failed to send day-before reminder for booking ${booking.id}:`, error)
          }
        }
      }
    } catch (error) {
      console.error('Day-before reminder processing error:', error)
    }

    // 1-hour before reminders
    try {
      // Get bookings scheduled between now and 70 minutes from now
      const hourFromNow = new Date(now.getTime() + (70 * 60 * 1000))

      const { data: hourBeforeBookings, error: hourBeforeError } = await supabaseAdmin
        .from('bookings')
        .select('*')
        .eq('reminders_opted_in', true)
        .eq('reminder_hour_before_sent', false)
        .eq('status', 'confirmed')

      if (hourBeforeError) {
        console.error('Error fetching hour-before bookings:', hourBeforeError)
      } else if (hourBeforeBookings) {
        for (const booking of hourBeforeBookings) {
          const bookingDateTime = pacificDateAtSlot(booking.scheduled_date, booking.scheduled_time, tz)

          // Check if booking is within the next 70 minutes
          if (bookingDateTime >= now && bookingDateTime <= hourFromNow) {
            try {
              await sendHourBeforeReminder(booking)

              await supabaseAdmin
                .from('bookings')
                .update({ reminder_hour_before_sent: true })
                .eq('id', booking.id)

              hourBeforeSent++
            } catch (error) {
              console.error(`Failed to send hour-before reminder for booking ${booking.id}:`, error)
            }
          }
        }
      }
    } catch (error) {
      console.error('Hour-before reminder processing error:', error)
    }

    return NextResponse.json({
      sent: {
        dayBefore: dayBeforeSent,
        hourBefore: hourBeforeSent
      }
    })

  } catch (error) {
    console.error('Reminders API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}