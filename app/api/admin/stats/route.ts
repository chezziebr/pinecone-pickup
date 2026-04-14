import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth, handleRouteError } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    // Check authorization using new secure auth
    requireAdminAuth(request)

    // Fetch all bookings with pagination and limits for security
    const { data: bookings, error: bookingsError } = await supabaseAdmin
      .from('bookings')
      .select('id, status, scheduled_date, created_at, service_type, price')
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

    // Calculate stats safely
    const now = new Date()
    const thisMonth = now.getMonth()
    const thisYear = now.getFullYear()

    const totalBookings = bookings?.length || 0
    const completedJobs = bookings?.filter(b => b.status === 'completed').length || 0
    const pendingJobs = bookings?.filter(b => b.status === 'pending' || b.status === 'confirmed').length || 0

    // Calculate revenue using 'price' field (fixed field inconsistency)
    const totalRevenue = bookings?.reduce((sum, booking) => {
      if (booking.status === 'completed' && booking.price) {
        return sum + parseFloat(booking.price.toString())
      }
      return sum
    }, 0) || 0

    const monthlyRevenue = bookings?.reduce((sum, booking) => {
      const bookingDate = new Date(booking.scheduled_date)
      if (booking.status === 'completed' &&
          bookingDate.getMonth() === thisMonth &&
          bookingDate.getFullYear() === thisYear &&
          booking.price) {
        return sum + parseFloat(booking.price.toString())
      }
      return sum
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
      const day = new Date(booking.scheduled_date).toLocaleDateString('en-US', { weekday: 'long' })
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