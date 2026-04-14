import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth, handleRouteError } from '@/lib/auth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ email: string }> }
) {
  try {
    // Check authorization using new secure auth
    requireAdminAuth(request)

    const resolvedParams = await params
    const email = decodeURIComponent(resolvedParams.email)

    // Fetch all bookings for this customer
    const { data: bookings, error: bookingsError } = await supabaseAdmin
      .from('bookings')
      .select('*')
      .eq('email', email)
      .order('scheduled_date', { ascending: false })

    if (bookingsError) {
      throw bookingsError
    }

    // Fetch reviews for this customer
    const { data: reviews, error: reviewsError } = await supabaseAdmin
      .from('reviews')
      .select('*')
      .in('booking_id', bookings?.map(b => b.id) || [])
      .order('created_at', { ascending: false })

    if (reviewsError) {
      console.error('Reviews error:', reviewsError)
    }

    // Format booking data
    const formattedBookings = bookings?.map(booking => ({
      id: booking.id,
      scheduled_date: booking.scheduled_date,
      scheduled_time: booking.scheduled_time,
      service_type: booking.service_type,
      lot_size: booking.lot_size,
      amount: parseFloat(booking.price || 0), // Fixed: use price field consistently
      status: booking.status,
      notes: booking.notes,
      created_at: booking.created_at,
      google_event_id: booking.google_event_id
    })) || []

    // Calculate customer stats
    const totalBookings = formattedBookings.length
    const completedBookings = formattedBookings.filter(b => b.status === 'completed')
    const totalSpent = completedBookings.reduce((sum, booking) => sum + booking.amount, 0)
    const averageRating = reviews && reviews.length > 0
      ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
      : null

    return NextResponse.json({
      bookings: formattedBookings,
      reviews: reviews || [],
      stats: {
        totalBookings,
        completedBookings: completedBookings.length,
        totalSpent,
        averageRating
      }
    })

  } catch (error) {
    return handleRouteError(error, 'Customer details error')
  }
}