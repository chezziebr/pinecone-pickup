import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth, handleRouteError } from '@/lib/auth'
import { formatPacificDate, pacificToday, pacificMonthOf } from '@/lib/time'

export async function GET(request: NextRequest) {
  try {
    // Check authorization using new secure auth
    requireAdminAuth(request)

    // Fetch all bookings with pagination and limits for security
    const { data: bookings, error: bookingsError } = await supabaseAdmin
      .from('bookings')
      .select('id, status, scheduled_date, created_at, service_type, price, payment_received, tip_amount, completed_at')
      .limit(1000) // Add reasonable limit
      .order('created_at', { ascending: false })

    if (bookingsError) {
      console.error('Failed to fetch bookings for stats:', bookingsError)
      return NextResponse.json(
        { error: 'Failed to fetch statistics' },
        { status: 500 }
      )
    }

    // Fetch all reviews with limit
    const { data: reviews, error: reviewsError } = await supabaseAdmin
      .from('reviews')
      .select('rating')
      .limit(1000)

    if (reviewsError) {
      console.error('Reviews error:', reviewsError)
    }

    const totalBookings = bookings?.length || 0
    const completedJobs = bookings?.filter(b => b.status === 'completed').length || 0
    const pendingJobs = bookings?.filter(b => b.status === 'pending' || b.status === 'confirmed').length || 0

    // Revenue: only count completed AND paid; include tip_amount.
    // CONSTITUTION §2 — "this month" is evaluated in Pacific time using the
    // actual completion timestamp, not the booked scheduled_date.
    const totalRevenue = bookings?.reduce((sum, booking) => {
      if (booking.status !== 'completed' || !booking.payment_received) return sum
      const price = parseFloat(booking.price?.toString() || '0')
      const tip = booking.tip_amount ?? 0
      return sum + price + tip
    }, 0) || 0

    const currentPacificMonth = pacificToday().slice(0, 7)
    const monthlyRevenue = bookings?.reduce((sum, booking) => {
      if (booking.status !== 'completed' || !booking.payment_received || !booking.completed_at) return sum
      if (pacificMonthOf(booking.completed_at) !== currentPacificMonth) return sum
      const price = parseFloat(booking.price?.toString() || '0')
      const tip = booking.tip_amount ?? 0
      return sum + price + tip
    }, 0) || 0

    // Calculate review stats
    const totalReviews = reviews?.length || 0
    const averageRating = reviews && reviews.length > 0
      ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
      : 0

    // Find most popular service type
    const serviceTypeCounts = bookings?.reduce((acc: Record<string, number>, booking) => {
      const serviceType = booking.service_type || 'Unknown'
      acc[serviceType] = (acc[serviceType] || 0) + 1
      return acc
    }, {}) || {}

    const topServiceType = Object.entries(serviceTypeCounts).length > 0
      ? Object.entries(serviceTypeCounts).sort(([,a], [,b]) => (b as number) - (a as number))[0][0]
      : 'No bookings yet'

    // Find busiest day of the week
    const dayOfWeekCounts = bookings?.reduce((acc: Record<string, number>, booking) => {
      const day = formatPacificDate(booking.scheduled_date, { weekday: 'long' })
      acc[day] = (acc[day] || 0) + 1
      return acc
    }, {}) || {}

    const busyDay = Object.entries(dayOfWeekCounts).length > 0
      ? Object.entries(dayOfWeekCounts).sort(([,a], [,b]) => (b as number) - (a as number))[0][0]
      : 'No pattern yet'

    const stats = {
      totalBookings,
      totalRevenue,
      monthlyRevenue,
      completedJobs,
      pendingJobs,
      averageRating,
      totalReviews,
      topServiceType,
      busyDay
    }

    return NextResponse.json(stats)

  } catch (error) {
    return handleRouteError(error, 'Admin stats error')
  }
}