import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { checkRateLimit, RATE_LIMITS, rateLimitResponse } from '@/lib/rate-limit'
import { validateReviewData, ReviewData } from '@/lib/validation'
import { v4 as uuidv4 } from 'uuid'

export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting
    const rateLimitResult = checkRateLimit(request, RATE_LIMITS.REVIEW)
    if (!rateLimitResult.success) {
      return rateLimitResponse(rateLimitResult.error!)
    }
    const body = await request.json()

    // Validate and sanitize input data
    const validationResult = validateReviewData(body)
    if (!validationResult.isValid) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validationResult.errors
        },
        { status: 400 }
      )
    }

    const { bookingId, rating, comment, neighborhood } = validationResult.sanitizedData as ReviewData

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

    // Check for existing review (prevent duplicates)
    const { data: existingReview, error: reviewCheckError } = await supabaseAdmin
      .from('reviews')
      .select('id')
      .eq('booking_id', bookingId)
      .single()

    if (reviewCheckError && reviewCheckError.code !== 'PGRST116') {
      console.error('Error checking for existing review:', reviewCheckError)
      return NextResponse.json(
        { error: 'Failed to verify review status' },
        { status: 500 }
      )
    }

    if (existingReview) {
      return NextResponse.json(
        { error: 'A review has already been submitted for this booking' },
        { status: 409 }
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