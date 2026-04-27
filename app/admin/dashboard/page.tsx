'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AvailabilitySettings from '@/components/admin/AvailabilitySettings'
import { formatPacificDate, pacificToday, pacificMonthOf } from '@/lib/time'
import { formatServiceType } from '@/lib/format'

const VALID_TABS = ['overview', 'bookings', 'customers', 'finances', 'schedule']

interface DashboardStats {
  totalBookings: number
  totalRevenue: number
  monthlyRevenue: number
  completedJobs: number
  pendingJobs: number
  averageRating: number
  totalReviews: number
  topServiceType: string
  busyDay: string
}

interface RecentBooking {
  id: string
  customer_name: string
  scheduled_date: string
  scheduled_time: string
  service_type: string
  amount: number
  status: string
  payment_received?: boolean | null
  payment_method?: string | null
  tip_amount?: number | null
  completed_at?: string | null
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [recentBookings, setRecentBookings] = useState<RecentBooking[]>([])
  const [allBookings, setAllBookings] = useState<RecentBooking[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === 'undefined') return 'overview'
    const tab = new URLSearchParams(window.location.search).get('tab')
    return tab && VALID_TABS.includes(tab) ? tab : 'overview'
  })
  const router = useRouter()

  // Finances tab aggregations — recompute when allBookings changes.
  const financesData = useMemo(() => {
    const completedPaid = allBookings.filter(
      b => b.status === 'completed' && b.payment_received === true
    )

    const totalRevenue = completedPaid.reduce(
      (sum, b) => sum + b.amount + (b.tip_amount ?? 0),
      0
    )
    const totalTips = completedPaid.reduce(
      (sum, b) => sum + (b.tip_amount ?? 0),
      0
    )

    const methodOrder = [
      { key: 'cash', label: 'Cash' },
      { key: 'venmo', label: 'Venmo' },
      { key: 'check', label: 'Check' },
      { key: 'other', label: 'Other' },
    ]
    const methodBreakdown = methodOrder.map(({ key, label }) => {
      const matching = completedPaid.filter(b => b.payment_method === key)
      return {
        method: label,
        count: matching.length,
        total: matching.reduce(
          (sum, b) => sum + b.amount + (b.tip_amount ?? 0),
          0
        ),
      }
    })

    // Last 6 calendar months in Pacific time, newest first.
    const today = pacificToday()
    const [yyyy, mm] = today.split('-').map(Number)
    const months: { key: string; label: string; total: number }[] = []
    for (let i = 0; i < 6; i++) {
      let m = mm - i
      let y = yyyy
      while (m <= 0) {
        m += 12
        y -= 1
      }
      const key = `${y}-${String(m).padStart(2, '0')}`
      const label = formatPacificDate(`${key}-01`, { month: 'long', year: 'numeric' })
      const monthTotal = completedPaid
        .filter(b => b.completed_at && pacificMonthOf(b.completed_at) === key)
        .reduce((sum, b) => sum + b.amount + (b.tip_amount ?? 0), 0)
      months.push({ key, label, total: monthTotal })
    }

    return { totalRevenue, totalTips, methodBreakdown, months }
  }, [allBookings])

  useEffect(() => {
    const token = localStorage.getItem('adminToken')
    if (!token) {
      router.push('/admin')
      return
    }
    fetchDashboardData()
  }, [router])

  const fetchDashboardData = async () => {
    try {
      const token = localStorage.getItem('adminToken')

      const [statsResponse, bookingsResponse, allBookingsResponse] = await Promise.all([
        fetch('/api/admin/stats', {
          credentials: 'include',
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch('/api/admin/bookings?limit=5', {
          credentials: 'include',
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch('/api/admin/bookings?limit=500&sortBy=scheduled_date&order=asc', {
          credentials: 'include',
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ])

      // If any endpoint returns 401, token is invalid — redirect to login
      if (statsResponse.status === 401 || bookingsResponse.status === 401 || allBookingsResponse.status === 401) {
        localStorage.removeItem('adminToken')
        router.push('/admin')
        return
      }

      if (statsResponse.ok) {
        const statsData = await statsResponse.json()
        setStats(statsData)
      }

      if (bookingsResponse.ok) {
        const bookingsData = await bookingsResponse.json()
        setRecentBookings(bookingsData.bookings || [])
      }

      if (allBookingsResponse.ok) {
        const allBookingsData = await allBookingsResponse.json()
        setAllBookings(allBookingsData.bookings || [])
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
    }
    setLoading(false)
  }

  const handleLogout = () => {
    localStorage.removeItem('adminToken')
    router.push('/admin')
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return formatPacificDate(dateString, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed': return 'bg-green-100 text-green-800'
      case 'completed': return 'bg-blue-100 text-blue-800'
      case 'pending': return 'bg-yellow-100 text-yellow-800'
      case 'cancelled': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-pine-light flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange mx-auto mb-4"></div>
          <p className="text-pine-mid">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-pine-light">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link href="/" className="text-pine hover:text-pine-mid transition-colors">
                <div className="font-fraunces text-xl font-bold">
                  Pinecone <span className="text-pine-light">Pick Up Crew</span>
                </div>
              </Link>
              <div className="text-orange bg-orange/10 px-3 py-1 rounded-full text-sm">
                Admin Dashboard
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-pine-mid">Welcome back, Bruce!</span>
              <button
                onClick={handleLogout}
                className="bg-pine hover:bg-pine-mid text-white px-4 py-2 rounded-lg text-sm transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <div className="flex items-center">
                <div className="bg-green-100 p-3 rounded-lg">
                  <span className="text-green-600 text-xl">💰</span>
                </div>
                <div className="ml-4">
                  <p className="text-sm text-gray-600">Total Revenue</p>
                  <p className="text-2xl font-bold text-green-600">
                    {formatCurrency(stats.totalRevenue)}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg p-6 shadow-sm">
              <div className="flex items-center">
                <div className="bg-blue-100 p-3 rounded-lg">
                  <span className="text-blue-600 text-xl">📅</span>
                </div>
                <div className="ml-4">
                  <p className="text-sm text-gray-600">Total Bookings</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {stats.totalBookings}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg p-6 shadow-sm">
              <div className="flex items-center">
                <div className="bg-orange/20 p-3 rounded-lg">
                  <span className="text-orange text-xl">📊</span>
                </div>
                <div className="ml-4">
                  <p className="text-sm text-gray-600">This Month</p>
                  <p className="text-2xl font-bold text-orange">
                    {formatCurrency(stats.monthlyRevenue)}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg p-6 shadow-sm">
              <div className="flex items-center">
                <div className="bg-yellow-100 p-3 rounded-lg">
                  <span className="text-yellow-600 text-xl">⭐</span>
                </div>
                <div className="ml-4">
                  <p className="text-sm text-gray-600">Average Rating</p>
                  <p className="text-2xl font-bold text-yellow-600">
                    {stats.averageRating.toFixed(1)} / 5
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="bg-white rounded-lg shadow-sm mb-8">
          <div className="border-b border-gray-200">
            <nav className="flex space-x-8 px-6">
              {[
                { id: 'overview', label: 'Overview', icon: '📊' },
                { id: 'bookings', label: 'Bookings', icon: '📅' },
                { id: 'customers', label: 'Customers', icon: '👥' },
                { id: 'finances', label: 'Finances', icon: '💰' },
                { id: 'schedule', label: 'Schedule', icon: '🗓️' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm ${
                    activeTab === tab.id
                      ? 'border-orange text-orange'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <span className="mr-2">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'overview' && (
              <div className="space-y-6">
                {/* Recent Bookings */}
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">
                    Recent Bookings
                  </h3>
                  <div className="bg-gray-50 rounded-lg overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Customer
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Date & Time
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Service
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Amount
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {recentBookings.length > 0 ? (
                          recentBookings.map((booking) => (
                            <tr key={booking.id} className="hover:bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                {booking.customer_name}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {formatDate(booking.scheduled_date)} at {booking.scheduled_time}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {formatServiceType(booking.service_type)}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {formatCurrency(booking.amount)}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(booking.status)}`}>
                                  {booking.status}
                                </span>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                              No bookings yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Quick Actions */}
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">
                    Quick Actions
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <button
                      onClick={() => setActiveTab('bookings')}
                      className="bg-orange hover:bg-orange/90 text-white p-4 rounded-lg text-left transition-colors"
                    >
                      <div className="text-2xl mb-2">📝</div>
                      <div className="font-medium">Manage Bookings</div>
                      <div className="text-sm opacity-90">View and update customer bookings</div>
                    </button>

                    <button
                      onClick={() => setActiveTab('schedule')}
                      className="bg-pine hover:bg-pine-mid text-white p-4 rounded-lg text-left transition-colors"
                    >
                      <div className="text-2xl mb-2">📅</div>
                      <div className="font-medium">Update Schedule</div>
                      <div className="text-sm opacity-90">Block times and manage availability</div>
                    </button>

                    <button
                      onClick={() => setActiveTab('finances')}
                      className="bg-green-600 hover:bg-green-700 text-white p-4 rounded-lg text-left transition-colors"
                    >
                      <div className="text-2xl mb-2">💰</div>
                      <div className="font-medium">Financial Reports</div>
                      <div className="text-sm opacity-90">Track earnings and generate reports</div>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'bookings' && (
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  All Bookings
                </h3>
                <div className="bg-gray-50 rounded-lg overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Customer
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Date & Time
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Service
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Booked Price
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {allBookings.length > 0 ? (
                        allBookings.map((booking) => (
                          <tr key={booking.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {booking.customer_name}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {formatDate(booking.scheduled_date)} at {booking.scheduled_time}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {formatServiceType(booking.service_type)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {formatCurrency(booking.amount)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(booking.status)}`}>
                                {booking.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              {booking.status === 'confirmed' && (
                                <Link
                                  href={`/admin/bookings/${booking.id}/complete`}
                                  className="inline-flex items-center px-3 py-1 bg-orange hover:bg-orange/90 text-white text-xs font-medium rounded-full transition-colors"
                                >
                                  Complete
                                </Link>
                              )}
                              {booking.status === 'completed' && (
                                <Link
                                  href={`/admin/bookings/${booking.id}/complete`}
                                  className="inline-flex items-center px-3 py-1 bg-pine hover:bg-pine-mid text-white text-xs font-medium rounded-full transition-colors"
                                >
                                  Edit
                                </Link>
                              )}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                            No bookings yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'customers' && (
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  Customer Management
                </h3>
                <Link
                  href="/admin/customers"
                  className="block bg-pine hover:bg-pine-mid text-white p-4 rounded-lg transition-colors max-w-md"
                >
                  <div className="text-2xl mb-2">👥</div>
                  <div className="font-medium">Manage Customers →</div>
                  <div className="text-sm opacity-90">View customer profiles and booking history on the standalone customers page</div>
                </Link>
              </div>
            )}

            {activeTab === 'finances' && (
              <div className="space-y-6">
                {/* Top totals */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-white rounded-lg p-6 shadow-sm">
                    <div className="text-sm text-gray-600 mb-2">Total Revenue (all-time)</div>
                    <div className="text-3xl font-bold text-pine">{formatCurrency(financesData.totalRevenue)}</div>
                  </div>
                  <div className="bg-white rounded-lg p-6 shadow-sm">
                    <div className="text-sm text-gray-600 mb-2">Total Tips Received</div>
                    <div className="text-3xl font-bold text-pine">{formatCurrency(financesData.totalTips)}</div>
                  </div>
                </div>

                {/* Payment Method Breakdown */}
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">
                    Payment Method Breakdown
                  </h3>
                  <div className="bg-gray-50 rounded-lg overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Method
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Count
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Total
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {financesData.methodBreakdown.map(({ method, count, total }) => (
                          <tr key={method}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {method}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 text-right">
                              {count}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 text-right">
                              {formatCurrency(total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Monthly Breakdown */}
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">
                    Revenue by Month (last 6)
                  </h3>
                  <div className="bg-gray-50 rounded-lg overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Month
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Revenue
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {financesData.months.map(({ key, label, total }) => (
                          <tr key={key}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {label}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 text-right">
                              {formatCurrency(total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'schedule' && (
              <AvailabilitySettings token={localStorage.getItem('adminToken') || ''} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}