import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    // Check authorization using new secure auth
    requireAdminAuth(request)

    // Fetch all bookings to aggregate customer data
    const { data: bookings, error: bookingsError } = await supabaseAdmin
      .from('bookings')
      .select('*')
      .order('created_at', { ascending: false })

    if (bookingsError) {
      throw bookingsError
    }

    // Group bookings by customer email
    const customerMap = new Map()

    bookings?.forEach(booking => {
      const customerKey = booking.email

      if (!customerMap.has(customerKey)) {
        customerMap.set(customerKey, {
          id: booking.id,
          first_name: booking.first_name,
          last_name: booking.last_name,
          email: booking.email,
          phone: booking.phone,
          address: booking.address,
          bookings: [],
          totalBookings: 0,
          totalSpent: 0,
          lastBooking: null,
          serviceTypes: {}
        })
      }

      const customer = customerMap.get(customerKey)
      customer.bookings.push(booking)
      customer.totalBookings += 1

      // Only count completed bookings for revenue
      if (booking.status === 'completed') {
        customer.totalSpent += parseFloat(booking.price || 0) // Fixed: use price field consistently
      }

      // Track service types to determine preference
      const serviceType = booking.service_type || 'Unknown'
      customer.serviceTypes[serviceType] = (customer.serviceTypes[serviceType] || 0) + 1

      // Track most recent booking
      if (!customer.lastBooking || new Date(booking.scheduled_date) > new Date(customer.lastBooking)) {
        customer.lastBooking = booking.scheduled_date
      }
    })

    // Format customer data
    const customers = Array.from(customerMap.values()).map(customer => {
      // Find preferred service type
      const preferredService = Object.entries(customer.serviceTypes).length > 0
        ? Object.entries(customer.serviceTypes)
            .sort(([,a], [,b]) => (b as number) - (a as number))[0][0]
        : 'No bookings'

      return {
        id: customer.id,
        first_name: customer.first_name,
        last_name: customer.last_name,
        email: customer.email,
        phone: customer.phone,
        address: customer.address,
        totalBookings: customer.totalBookings,
        totalSpent: customer.totalSpent,
        lastBooking: customer.lastBooking,
        preferredService
      }
    })

    // Sort by total spent (highest first)
    customers.sort((a, b) => b.totalSpent - a.totalSpent)

    return NextResponse.json({
      customers,
      total: customers.length
    })

  } catch (error) {
    console.error('Admin customers error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch customers' },
      { status: 500 }
    )
  }
}