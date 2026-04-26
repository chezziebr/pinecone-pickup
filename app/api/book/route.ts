import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getAvailableSlots, createBookingEvent } from '@/lib/google-calendar'
import { sendConfirmationEmail } from '@/lib/sendgrid'
import { checkRateLimit, RATE_LIMITS, rateLimitResponse } from '@/lib/rate-limit'
import { validateBookingData } from '@/lib/validation'
import { validateBusinessHours, validateFutureDate, validateReasonableAdvanceBooking, isValidServiceForDate } from '@/lib/availability'
import { v4 as uuidv4 } from 'uuid'

// Lot size mapping for price calculation
const lotSizeUnits: Record<string, number> = {
  '¼ acre': 1,
  '½ acre': 2,
  '¾ acre': 3,
  '1 acre+': 4
}

export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting
    const rateLimitResult = checkRateLimit(request, RATE_LIMITS.BOOKING)
    if (!rateLimitResult.success) {
      return rateLimitResponse(rateLimitResult.error!)
    }

    const body = await request.json()

    // Validate and sanitize input data
    const validationResult = validateBookingData(body)
    if (!validationResult.isValid) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validationResult.errors
        },
        { status: 400 }
      )
    }

    const sanitizedData = validationResult.sanitizedData!

    // Business logic validations
    if (!validateFutureDate(sanitizedData.scheduled_date!)) {
      return NextResponse.json(
        { error: 'Cannot schedule bookings in the past' },
        { status: 400 }
      )
    }

    if (!validateReasonableAdvanceBooking(sanitizedData.scheduled_date!)) {
      return NextResponse.json(
        { error: 'Cannot schedule bookings more than 1 year in advance' },
        { status: 400 }
      )
    }

    if (!(await validateBusinessHours(sanitizedData.scheduled_date!, sanitizedData.scheduled_time!))) {
      return NextResponse.json(
        { error: 'Selected time is outside business hours' },
        { status: 400 }
      )
    }

    if (!isValidServiceForDate(sanitizedData.scheduled_date!, sanitizedData.service_type!)) {
      return NextResponse.json(
        { error: 'Selected service is not available for this date' },
        { status: 400 }
      )
    }

    // Re-check slot availability using sanitized data
    const availableSlots = await getAvailableSlots(sanitizedData.scheduled_date!)
    if (!availableSlots.includes(sanitizedData.scheduled_time!)) {
      return NextResponse.json(
        { error: 'Selected time slot is no longer available' },
        { status: 409 }
      )
    }

    // Calculate price using sanitized data
    const units = lotSizeUnits[sanitizedData.lot_size!]
    const basePrice = sanitizedData.service_type === 'pickup_only' ? 20 : 40
    const totalPrice = basePrice * units

    // Create booking record
    const bookingId = uuidv4()
    const bookingData = {
      id: bookingId,
      first_name: sanitizedData.first_name!,
      last_name: sanitizedData.last_name!,
      email: sanitizedData.email!,
      phone: sanitizedData.phone!,
      address: sanitizedData.address!,
      lot_size: sanitizedData.lot_size!,
      service_type: sanitizedData.service_type! as 'pickup_only' | 'pickup_haul',
      price: totalPrice,
      scheduled_date: sanitizedData.scheduled_date!,
      scheduled_time: sanitizedData.scheduled_time!,
      notes: sanitizedData.notes || null,
      reminders_opted_in: sanitizedData.reminders_opted_in ?? true,
      status: 'confirmed' as const,
      created_at: new Date().toISOString(),
      reminder_day_before_sent: false,
      reminder_hour_before_sent: false,
      review_request_sent: false,
      google_event_id: null,
      calendar_sync_status: 'pending' as const,
      confirmation_email_sent_at: null
    }

    // Insert booking into Supabase
    const { error: dbError } = await supabaseAdmin
      .from('bookings')
      .insert(bookingData)

    if (dbError) {
      console.error('Database error:', dbError)
      return NextResponse.json(
        { error: 'Failed to save booking' },
        { status: 500 }
      )
    }

    // Create Google Calendar event
    try {
      const googleEventId = await createBookingEvent(bookingData)

      const { error: updateError } = await supabaseAdmin
        .from('bookings')
        .update({
          google_event_id: googleEventId,
          calendar_sync_status: 'success'
        })
        .eq('id', bookingId)

      if (updateError) {
        console.error('[booking] calendar_status_update failed', {
          bookingId,
          attempted_status: 'success',
          error: updateError.message,
        })
      }

      ;(bookingData as any).google_event_id = googleEventId
    } catch (eventError) {
      console.error('[booking] calendar_event_creation failed', {
        bookingId,
        error: eventError instanceof Error ? eventError.message : String(eventError),
        stack: eventError instanceof Error ? eventError.stack : undefined,
      })

      const { error: updateError } = await supabaseAdmin
        .from('bookings')
        .update({ calendar_sync_status: 'failed' })
        .eq('id', bookingId)

      if (updateError) {
        console.error('[booking] calendar_status_update failed', {
          bookingId,
          attempted_status: 'failed',
          error: updateError.message,
        })
      }
    }

    // Send confirmation email
    try {
      await sendConfirmationEmail(bookingData)

      const { error: updateError } = await supabaseAdmin
        .from('bookings')
        .update({ confirmation_email_sent_at: new Date().toISOString() })
        .eq('id', bookingId)

      if (updateError) {
        console.error('[booking] email_status_update failed', {
          bookingId,
          error: updateError.message,
        })
      }
    } catch (emailError) {
      console.error('[booking] confirmation_email failed', {
        bookingId,
        error: emailError instanceof Error ? emailError.message : String(emailError),
        stack: emailError instanceof Error ? emailError.stack : undefined,
      })
    }

    return NextResponse.json({
      success: true,
      bookingId: bookingId,
      price: totalPrice
    })

  } catch (error) {
    // Enhanced error logging with context
    console.error('Booking API error:', {
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      ip: request.headers.get('x-forwarded-for') || 'unknown',
      userAgent: request.headers.get('user-agent')
    })

    // Return sanitized error response
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to create booking. Please try again.'
      },
      { status: 500 }
    )
  }
}