import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { v4 as uuidv4 } from 'uuid'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate required fields
    const { bookingId, rating, comment, neighborhood } = body

    if (!bookingId || !rating) {
      return NextResponse.json(
        { error: 'bookingId and rating are required' },
        { status: 400 }
      )
    }

    // Validate rating range
    if (rating < 1 || rating > 5 || !Number.isInteger(rating)) {
      return NextResponse.json(
        { error: 'Rating must be an integer between 1 and 5' },
        { status: 400 }
      )
    }

    // Verify booking exists
    const { data: booking, error: bookingError } = await supabaseAdmin
      .from('bookings')
      .select('id, first_name, last_name')
      .eq('id', bookingId)
      .single()

    if (bookingError || !booking) {
      return NextResponse.json(
        { error: 'Booking not found' },
        { status: 404 }
      )
    }

    // Create review record
    const reviewData = {
      id: uuidv4(),
      booking_id: bookingId,
      rating,
      comment: comment || null,
      neighborhood: neighborhood || null,
      created_at: new Date().toISOString()
    }

    const { error: reviewError } = await supabaseAdmin
      .from('reviews')
      .insert(reviewData)

    if (reviewError) {
      console.error('Error creating review:', reviewError)
      return NextResponse.json(
        { error: 'Failed to save review' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Review API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}