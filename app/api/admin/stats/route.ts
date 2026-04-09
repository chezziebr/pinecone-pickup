import { NextRequest, NextResponse } from 'next/server'
import { verify } from 'jsonwebtoken'
import { supabase } from '@/lib/supabase'

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

    // Fetch all bookings
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('*')

    if (bookingsError) {
      throw bookingsError
    }

    // Fetch all reviews
    const { data: reviews, error: reviewsError } = await supabase
      .from('reviews')
      .select('rating')

    if (reviewsError) {
      console.error('Reviews error:', reviewsError)
    }

    // Calculate stats
    const now = new Date()
    const thisMonth = now.getMonth()
    const thisYear = now.getFullYear()

    const totalBookings = bookings?.length || 0
    const completedJobs = bookings?.filter(b => b.status === 'completed').length || 0
    const pendingJobs = bookings?.filter(b => b.status === 'pending' || b.status === 'confirmed').length || 0

    // Calculate revenue
    const totalRevenue = bookings?.reduce((sum, booking) => {
      if (booking.status === 'completed') {
        return sum + parseFloat(booking.amount || 0)
      }
      return sum
    }, 0) || 0

    const monthlyRevenue = bookings?.reduce((sum, booking) => {
      const bookingDate = new Date(booking.scheduled_date)
      if (booking.status === 'completed' &&
          bookingDate.getMonth() === thisMonth &&
          bookingDate.getFullYear() === thisYear) {
        return sum + parseFloat(booking.amount || 0)
      }
      return sum
    }, 0) || 0

    // Calculate review stats
    const totalReviews = reviews?.length || 0
    const averageRating = reviews?.length > 0
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
    console.error('Admin stats error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    )
  }
}