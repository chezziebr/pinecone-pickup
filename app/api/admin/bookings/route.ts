import { NextRequest, NextResponse } from 'next/server'
import { verify } from 'jsonwebtoken'
import { supabaseAdmin } from '@/lib/supabase'

const JWT_SECRET = process.env.JWT_SECRET || 'pinecone-admin-secret-key'

function verifyToken(token: string) {
  try {
    return verify(token, JWT_SECRET) as { admin: boolean }
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  try {
    // Check authorization
    const authHeader = request.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')

    if (!token || !verifyToken(token)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

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
      amount: parseFloat(booking.amount || 0),
      status: booking.status,
      notes: booking.notes,
      reminders_opted_in: booking.reminders_opted_in,
      created_at: booking.created_at,
      google_event_id: booking.google_event_id
    })) || []

    return NextResponse.json({
      bookings: formattedBookings,
      total: count,
      limit,
      offset
    })

  } catch (error) {
    console.error('Admin bookings error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch bookings' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    // Check authorization
    const authHeader = request.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')

    if (!token || !verifyToken(token)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id, status, notes } = await request.json()

    if (!id) {
      return NextResponse.json(
        { error: 'Booking ID is required' },
        { status: 400 }
      )
    }

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
    console.error('Admin booking update error:', error)
    return NextResponse.json(
      { error: 'Failed to update booking' },
      { status: 500 }
    )
  }
}