import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendReviewRequest } from '@/lib/sendgrid'

// Require CRON_SECRET - no fallback for security
const CRON_SECRET = process.env.CRON_SECRET

if (!CRON_SECRET) {
  throw new Error('Missing required environment variable: CRON_SECRET must be set')
}

export async function POST(request: NextRequest) {
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

    const now = new Date()
    const losAngelesTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Los_Angeles"}))

    let sent = 0

    try {
      // Get confirmed bookings where review request hasn't been sent
      const { data: completedBookings, error: fetchError } = await supabaseAdmin
        .from('bookings')
        .select('*')
        .eq('review_request_sent', false)
        .eq('status', 'confirmed')

      if (fetchError) {
        console.error('Error fetching completed bookings:', fetchError)
        return NextResponse.json(
          { error: 'Failed to fetch bookings' },
          { status: 500 }
        )
      }

      if (completedBookings) {
        for (const booking of completedBookings) {
          // Parse booking time and calculate end time
          const [time, period] = booking.scheduled_time.split(' ')
          const [hours, minutes] = time.split(':').map(Number)
          let hour24 = hours
          if (period === 'PM' && hours !== 12) hour24 += 12
          if (period === 'AM' && hours === 12) hour24 = 0

          const bookingDateTime = new Date(booking.scheduled_date + 'T00:00:00')
          bookingDateTime.setHours(hour24, minutes || 0, 0, 0)

          // Add 90 minutes for service duration + 2 hours buffer
          const serviceEndTime = new Date(bookingDateTime.getTime() + (90 * 60 * 1000))
          const reviewThreshold = new Date(serviceEndTime.getTime() + (2 * 60 * 60 * 1000))

          // Check if enough time has passed since service completion
          if (losAngelesTime >= reviewThreshold) {
            try {
              await sendReviewRequest(booking)

              await supabaseAdmin
                .from('bookings')
                .update({
                  review_request_sent: true,
                  status: 'completed'
                })
                .eq('id', booking.id)

              sent++
            } catch (error) {
              console.error(`Failed to send review request for booking ${booking.id}:`, error)
            }
          }
        }
      }
    } catch (error) {
      console.error('Review request processing error:', error)
    }

    return NextResponse.json({ sent })

  } catch (error) {
    console.error('Review request API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}