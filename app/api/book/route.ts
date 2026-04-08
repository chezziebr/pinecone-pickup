import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getAvailableSlots, createBookingEvent } from '@/lib/google-calendar'
import { sendConfirmationEmail } from '@/lib/resend'
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
    const body = await request.json()

    // Validate required fields
    const requiredFields = [
      'first_name',
      'last_name',
      'email',
      'phone',
      'address',
      'lot_size',
      'service_type',
      'scheduled_date',
      'scheduled_time'
    ]

    const missingFields = requiredFields.filter(field => !body[field])
    if (missingFields.length > 0) {
      return NextResponse.json(
        { error: 'Missing required fields', fields: missingFields },
        { status: 400 }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(body.email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      )
    }

    // Validate service type
    if (!['pickup_only', 'pickup_haul'].includes(body.service_type)) {
      return NextResponse.json(
        { error: 'Invalid service type' },
        { status: 400 }
      )
    }

    // Re-check slot availability
    const availableSlots = await getAvailableSlots(body.scheduled_date)
    if (!availableSlots.includes(body.scheduled_time)) {
      return NextResponse.json(
        { error: 'Selected time slot is no longer available' },
        { status: 409 }
      )
    }

    // Calculate price
    const units = lotSizeUnits[body.lot_size]
    if (!units) {
      return NextResponse.json(
        { error: 'Invalid lot size' },
        { status: 400 }
      )
    }

    const basePrice = body.service_type === 'pickup_only' ? 20 : 40
    const totalPrice = basePrice * units

    // Create booking record
    const bookingId = uuidv4()
    const bookingData = {
      id: bookingId,
      first_name: body.first_name,
      last_name: body.last_name,
      email: body.email,
      phone: body.phone,
      address: body.address,
      lot_size: body.lot_size,
      service_type: body.service_type,
      price: totalPrice,
      scheduled_date: body.scheduled_date,
      scheduled_time: body.scheduled_time,
      notes: body.notes || null,
      reminders_opted_in: body.reminders_opted_in ?? true,
      status: 'confirmed',
      created_at: new Date().toISOString(),
      reminder_day_before_sent: false,
      reminder_hour_before_sent: false,
      review_request_sent: false,
      google_event_id: null
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

      // Update booking with Google event ID
      await supabaseAdmin
        .from('bookings')
        .update({ google_event_id: googleEventId })
        .eq('id', bookingId)

      ;(bookingData as any).google_event_id = googleEventId
    } catch (eventError) {
      console.error('Calendar event error:', eventError)
      // Continue with booking even if calendar event fails
    }

    // Send confirmation email
    try {
      await sendConfirmationEmail(bookingData)
    } catch (emailError) {
      console.error('Email error:', emailError)
      // Continue with booking even if email fails
    }

    return NextResponse.json({
      success: true,
      bookingId: bookingId,
      price: totalPrice
    })

  } catch (error) {
    console.error('Booking API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}