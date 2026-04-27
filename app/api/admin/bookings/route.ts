import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth, handleRouteError } from '@/lib/auth'
import { validateAdminBookingUpdate, AdminBookingUpdate } from '@/lib/validation'

export async function GET(request: NextRequest) {
  try {
    // Check authorization using new secure auth
    requireAdminAuth(request)

    // Get query parameters
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')
    const status = searchParams.get('status')
    const sortBy = searchParams.get('sortBy') || 'scheduled_date'
    const order = searchParams.get('order') || 'desc'

    // Build query
    let query = supabaseAdmin
      .from('bookings')
      .select(`
        *,
        customer_name:first_name,
        customer_last_name:last_name,
        customer_email:email,
        customer_phone:phone
      `)
      .range(offset, offset + limit - 1)
      .order(sortBy, { ascending: order === 'asc' })

    // Apply status filter if provided
    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    const { data: bookings, error: bookingsError, count } = await query

    if (bookingsError) {
      throw bookingsError
    }

    // Format the data for the frontend
    const formattedBookings = bookings?.map(booking => ({
      id: booking.id,
      customer_name: `${booking.first_name} ${booking.last_name}`,
      customer_email: booking.email,
      customer_phone: booking.phone,
      address: booking.address,
      scheduled_date: booking.scheduled_date,
      scheduled_time: booking.scheduled_time,
      service_type: booking.service_type,
      lot_size: booking.lot_size,
      amount: parseFloat(booking.price || 0), // Fixed: use price field consistently
      status: booking.status,
      notes: booking.notes,
      reminders_opted_in: booking.reminders_opted_in,
      created_at: booking.created_at,
      google_event_id: booking.google_event_id,
      // Post-service columns (migration 007). Null on confirmed-but-not-completed.
      actual_lot_size: booking.actual_lot_size,
      payment_received: booking.payment_received,
      payment_method: booking.payment_method,
      tip_amount: booking.tip_amount,
      completion_notes: booking.completion_notes,
      completed_at: booking.completed_at
    })) || []

    return NextResponse.json({
      bookings: formattedBookings,
      total: count,
      limit,
      offset
    })

  } catch (error) {
    return handleRouteError(error, 'Admin bookings GET error')
  }
}

export async function PATCH(request: NextRequest) {
  try {
    // Check authorization using new secure auth
    requireAdminAuth(request)

    const body = await request.json()

    // Validate and sanitize input data
    const validationResult = validateAdminBookingUpdate(body)
    if (!validationResult.isValid) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validationResult.errors
        },
        { status: 400 }
      )
    }

    const { id, status, notes } = validationResult.sanitizedData as AdminBookingUpdate

    // Update booking
    const updateData: any = {}
    if (status) updateData.status = status
    if (notes !== undefined) updateData.notes = notes

    const { data, error } = await supabaseAdmin
      .from('bookings')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      throw error
    }

    return NextResponse.json({
      success: true,
      booking: data
    })

  } catch (error) {
    return handleRouteError(error, 'Admin booking update error')
  }
}