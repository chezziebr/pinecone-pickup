'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatPacificDate } from '@/lib/time'

interface Booking {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string
  address: string
  lot_size: string
  service_type: string
  price: number
  scheduled_date: string
  scheduled_time: string
  status: string
  actual_lot_size?: string | null
  payment_received?: boolean | null
  payment_method?: string | null
  tip_amount?: number | null
  completion_notes?: string | null
  completed_at?: string | null
}

const LOT_SIZES = ['¼ acre', '½ acre', '¾ acre', '1 acre+']
const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'venmo', label: 'Venmo' },
  { value: 'check', label: 'Check' },
  { value: 'other', label: 'Other' },
]

export default function CompleteBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const [booking, setBooking] = useState<Booking | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [notFound, setNotFound] = useState(false)

  // Form state
  const [actualLotSize, setActualLotSize] = useState('')
  const [paymentReceived, setPaymentReceived] = useState<boolean | null>(null)
  const [paymentMethod, setPaymentMethod] = useState('')
  const [tipAmount, setTipAmount] = useState('')
  const [completionNotes, setCompletionNotes] = useState('')

  useEffect(() => {
    const token = localStorage.getItem('adminToken')
    if (!token) {
      router.push('/admin')
      return
    }

    const fetchBooking = async () => {
      try {
        const res = await fetch(`/api/admin/bookings/${id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        if (res.status === 401) {
          localStorage.removeItem('adminToken')
          router.push('/admin')
          return
        }
        if (res.status === 404) {
          setNotFound(true)
          setLoading(false)
          return
        }
        if (!res.ok) {
          throw new Error('Failed to load booking')
        }
        const data = await res.json()
        const b: Booking = data.booking
        setBooking(b)

        if (b.status === 'completed') {
          setActualLotSize(b.actual_lot_size || b.lot_size)
          setPaymentReceived(b.payment_received ?? null)
          setPaymentMethod(b.payment_method || '')
          setTipAmount(b.tip_amount != null ? String(b.tip_amount) : '')
          setCompletionNotes(b.completion_notes || '')
        } else {
          setActualLotSize(b.lot_size)
        }
      } catch (e) {
        console.error('Error loading booking:', e)
      }
      setLoading(false)
    }

    fetchBooking()
  }, [router, id])

  const handlePaymentReceivedChange = (value: boolean) => {
    setPaymentReceived(value)
    if (!value) {
      setPaymentMethod('')
      setTipAmount('')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrors({})

    const token = localStorage.getItem('adminToken')
    if (!token) {
      router.push('/admin')
      return
    }

    const body: Record<string, unknown> = {
      actual_lot_size: actualLotSize,
    }
    if (paymentReceived !== null) {
      body.payment_received = paymentReceived
    }
    if (paymentReceived === true) {
      if (paymentMethod) body.payment_method = paymentMethod
      if (tipAmount) body.tip_amount = parseInt(tipAmount, 10)
    }
    if (completionNotes) body.completion_notes = completionNotes

    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/bookings/${id}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })

      if (res.status === 401) {
        localStorage.removeItem('adminToken')
        router.push('/admin')
        return
      }

      const result = await res.json()

      if (!res.ok) {
        if (result.details) {
          setErrors(result.details)
        } else {
          setErrors({ general: result.error || 'Something went wrong' })
        }
        setSubmitting(false)
        return
      }

      router.push('/admin/dashboard?tab=bookings')
    } catch {
      setErrors({ general: 'Network error. Please try again.' })
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-cream p-8">
        <div className="max-w-2xl mx-auto bg-white rounded-2xl p-8 shadow-lg">
          <h1 className="text-2xl font-bold text-pine mb-4">Booking not found</h1>
          <p className="text-gray-600 mb-6">No booking exists with that ID.</p>
          <Link href="/admin/dashboard?tab=bookings" className="inline-block bg-pine hover:bg-pine-mid text-white px-6 py-3 rounded-full font-medium">
            ← Back to Bookings
          </Link>
        </div>
      </div>
    )
  }

  if (!booking) {
    return null
  }

  const isEditMode = booking.status === 'completed'
  const submitButtonText = submitting
    ? 'Saving...'
    : (isEditMode ? 'Save Changes' : 'Mark Complete')

  return (
    <div className="min-h-screen bg-cream p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <Link href="/admin/dashboard?tab=bookings" className="text-pine hover:underline text-sm">
            ← Back to Bookings
          </Link>
          <h1 className="text-3xl font-fraunces font-bold text-pine mt-3">
            {isEditMode ? 'Edit completed booking' : 'Mark booking complete'}
          </h1>
        </div>

        {/* Read-only booking info */}
        <div className="bg-white rounded-2xl p-6 shadow-lg mb-6">
          <h2 className="text-lg font-semibold text-pine mb-4">Booking details</h2>
          <div className="grid md:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <span className="text-gray-600">Customer:</span>{' '}
              <span className="font-medium">{booking.first_name} {booking.last_name}</span>
            </div>
            <div>
              <span className="text-gray-600">Phone:</span>{' '}
              <span className="font-medium">{booking.phone}</span>
            </div>
            <div className="md:col-span-2">
              <span className="text-gray-600">Email:</span>{' '}
              <span className="font-medium">{booking.email}</span>
            </div>
            <div className="md:col-span-2">
              <span className="text-gray-600">Address:</span>{' '}
              <span className="font-medium">{booking.address}</span>
            </div>
            <div>
              <span className="text-gray-600">Date:</span>{' '}
              <span className="font-medium">
                {formatPacificDate(booking.scheduled_date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </span>
            </div>
            <div>
              <span className="text-gray-600">Time:</span>{' '}
              <span className="font-medium">{booking.scheduled_time}</span>
            </div>
            <div>
              <span className="text-gray-600">Booked lot size:</span>{' '}
              <span className="font-medium">{booking.lot_size}</span>
            </div>
            <div>
              <span className="text-gray-600">Service:</span>{' '}
              <span className="font-medium">{booking.service_type === 'pickup_only' ? 'Pick Up Only' : 'Pick Up + Haul Away'}</span>
            </div>
            <div>
              <span className="text-gray-600">Booked price:</span>{' '}
              <span className="font-medium">${booking.price}</span>
            </div>
            <div>
              <span className="text-gray-600">Status:</span>{' '}
              <span className="font-medium">{booking.status}</span>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 shadow-lg">
          {errors.general && (
            <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6">
              {errors.general}
            </div>
          )}

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Actual lot size
              <span className="text-gray-500 font-normal ml-1">(may differ from booked)</span>
            </label>
            <select
              value={actualLotSize}
              onChange={(e) => setActualLotSize(e.target.value)}
              className={`w-full p-3 border rounded-lg ${errors.actual_lot_size ? 'border-red-500' : 'border-gray-300'}`}
            >
              {LOT_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}{size === booking.lot_size ? ' (as booked)' : ''}
                </option>
              ))}
            </select>
            {errors.actual_lot_size && <p className="text-red-500 text-sm mt-1">{errors.actual_lot_size}</p>}
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Payment received? *
            </label>
            <div className="flex gap-6">
              <label className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  name="payment_received"
                  checked={paymentReceived === true}
                  onChange={() => handlePaymentReceivedChange(true)}
                  className="mr-2"
                />
                <span className="text-sm">Yes</span>
              </label>
              <label className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  name="payment_received"
                  checked={paymentReceived === false}
                  onChange={() => handlePaymentReceivedChange(false)}
                  className="mr-2"
                />
                <span className="text-sm">No</span>
              </label>
            </div>
            {errors.payment_received && <p className="text-red-500 text-sm mt-1">{errors.payment_received}</p>}
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Payment method {paymentReceived === true && '*'}
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              disabled={paymentReceived !== true}
              className={`w-full p-3 border rounded-lg ${errors.payment_method ? 'border-red-500' : 'border-gray-300'} ${paymentReceived !== true ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : ''}`}
            >
              <option value="">Select method</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            {errors.payment_method && <p className="text-red-500 text-sm mt-1">{errors.payment_method}</p>}
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tip received <span className="text-gray-500 font-normal">(whole dollars, optional)</span>
            </label>
            <div className="relative">
              <span className={`absolute left-3 top-1/2 -translate-y-1/2 ${paymentReceived !== true ? 'text-gray-400' : 'text-gray-500'}`}>$</span>
              <input
                type="number"
                min="0"
                step="1"
                value={tipAmount}
                onChange={(e) => setTipAmount(e.target.value)}
                disabled={paymentReceived !== true}
                placeholder="0"
                className={`w-full p-3 pl-7 border rounded-lg ${errors.tip_amount ? 'border-red-500' : 'border-gray-300'} ${paymentReceived !== true ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : ''}`}
              />
            </div>
            {errors.tip_amount && <p className="text-red-500 text-sm mt-1">{errors.tip_amount}</p>}
          </div>

          <div className="mb-8">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Completion notes <span className="text-gray-500 font-normal">(optional)</span>
            </label>
            <textarea
              value={completionNotes}
              onChange={(e) => setCompletionNotes(e.target.value)}
              rows={3}
              placeholder="Anything notable about the service?"
              className={`w-full p-3 border rounded-lg ${errors.completion_notes ? 'border-red-500' : 'border-gray-300'}`}
            />
            {errors.completion_notes && <p className="text-red-500 text-sm mt-1">{errors.completion_notes}</p>}
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 bg-orange hover:bg-orange/90 disabled:bg-orange/50 text-white p-4 rounded-full font-medium transition-colors"
            >
              {submitButtonText}
            </button>
            <Link
              href="/admin/dashboard?tab=bookings"
              className="flex-1 text-center bg-white border-2 border-gray-300 hover:border-pine text-gray-700 hover:text-pine p-4 rounded-full font-medium transition-colors"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
