import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendDayBeforeReminder, sendHourBeforeReminder } from '@/lib/resend'

export async function POST(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization')
    const expectedAuth = `Bearer ${process.env.CRON_SECRET}`

    if (authHeader !== expectedAuth) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const now = new Date()
    const losAngelesTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Los_Angeles"}))

    // Calculate tomorrow's date in LA timezone
    const tomorrow = new Date(losAngelesTime)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowDateStr = tomorrow.toISOString().split('T')[0]

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
      const hourFromNow = new Date(losAngelesTime.getTime() + (70 * 60 * 1000))

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
          // Parse booking time in LA timezone
          const [time, period] = booking.scheduled_time.split(' ')
          const [hours, minutes] = time.split(':').map(Number)
          let hour24 = hours
          if (period === 'PM' && hours !== 12) hour24 += 12
          if (period === 'AM' && hours === 12) hour24 = 0

          const bookingDateTime = new Date(booking.scheduled_date + 'T00:00:00')
          bookingDateTime.setHours(hour24, minutes || 0, 0, 0)

          // Check if booking is within the next 70 minutes
          if (bookingDateTime >= losAngelesTime && bookingDateTime <= hourFromNow) {
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