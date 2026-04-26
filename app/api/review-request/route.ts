import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendReviewRequest } from '@/lib/sendgrid'
import { loadBusinessTimezone, loadServiceDurationMinutes, pacificDateAtSlot } from '@/lib/time'

export async function GET(request: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET
    if (!cronSecret) {
      console.error('CRON_SECRET not configured')
      return NextResponse.json(
        { error: 'CRON_SECRET not configured' },
        { status: 503 }
      )
    }

    const authHeader = request.headers.get('authorization')
    const expectedAuth = `Bearer ${cronSecret}`

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
    const tz = await loadBusinessTimezone()
    const durationMs = (await loadServiceDurationMinutes()) * 60 * 1000

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
          const bookingDateTime = pacificDateAtSlot(booking.scheduled_date, booking.scheduled_time, tz)

          // Service end + 2-hour buffer before sending the review request
          const serviceEndTime = new Date(bookingDateTime.getTime() + durationMs)
          const reviewThreshold = new Date(serviceEndTime.getTime() + (2 * 60 * 60 * 1000))

          if (now >= reviewThreshold) {
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