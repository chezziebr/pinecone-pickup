'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { formatPacificDate } from '@/lib/time'

function BookingSuccessContent() {
  const searchParams = useSearchParams()

  const name = searchParams.get('name') || 'there'
  const date = searchParams.get('date') || ''
  const time = searchParams.get('time') || ''
  const service = searchParams.get('service') || ''
  const address = searchParams.get('address') || ''
  const price = searchParams.get('price') || ''

  // Format the date
  const formattedDate = date ? formatPacificDate(date, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }) : ''

  return (
    <div className="min-h-screen bg-cream">
      <div className="max-w-4xl mx-auto px-4 py-20">
        {/* Success Header */}
        <div className="text-center mb-12">
          <div className="text-6xl mb-4">🌲</div>
          <h1 className="text-4xl md:text-5xl font-fraunces font-black text-pine mb-4">
            You're booked!
          </h1>
          <p className="text-xl text-gray-600">
            We can't wait to clear your yard, {name}!
          </p>
        </div>

        {/* Booking Summary Card */}
        <div className="bg-white rounded-2xl p-8 shadow-lg mb-8">
          <h2 className="text-2xl font-fraunces font-bold text-pine mb-6">
            Booking Summary
          </h2>

          <div className="space-y-4">
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-gray-600">Customer</span>
              <span className="font-medium">{name}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-gray-600">Date & Time</span>
              <span className="font-medium">{formattedDate} at {time}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-gray-600">Address</span>
              <span className="font-medium text-right max-w-xs">{address}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-gray-600">Service</span>
              <span className="font-medium">{service}</span>
            </div>
            {price && (
              <div className="flex justify-between items-center py-2 text-lg font-bold">
                <span className="text-pine">Total Price</span>
                <span className="text-pine">${price}</span>
              </div>
            )}
          </div>
        </div>

        {/* Confirmation Message */}
        <div className="bg-pine-light border-l-4 border-pine p-6 rounded-lg mb-8">
          <div className="flex items-start">
            <div className="text-2xl mr-3">📧</div>
            <div>
              <h3 className="font-bold text-pine mb-2">Check your email for your confirmation</h3>
              <p className="text-gray-700">
                We've sent you a confirmation email with all the details.
                You'll also get reminder emails before we arrive!
              </p>
            </div>
          </div>
        </div>

        {/* Payment Info */}
        <div className="bg-orange-light border-l-4 border-orange p-6 rounded-lg mb-8">
          <div className="flex items-start">
            <div className="text-2xl mr-3">💰</div>
            <div>
              <h3 className="font-bold text-orange mb-2">Payment is cash or Venmo to Bruce on the day</h3>
              <p className="text-gray-700">
                No need to pay now! We accept cash or Venmo (@bruce-pinecone) when we arrive.
              </p>
            </div>
          </div>
        </div>

        {/* Contact Info */}
        <div className="bg-white border border-gray-200 p-6 rounded-lg mb-8">
          <div className="flex items-start">
            <div className="text-2xl mr-3">📞</div>
            <div>
              <h3 className="font-bold text-pine mb-2">Questions? Need to reschedule?</h3>
              <p className="text-gray-700 mb-2">
                Call or text Bruce: <a href="tel:8582205674" className="font-bold text-pine hover:text-orange">858-220-5674</a>
              </p>
              <p className="text-gray-700">
                Or email us: <a href="mailto:pinecone.pickup.crew@gmail.com" className="font-bold text-pine hover:text-orange">pinecone.pickup.crew@gmail.com</a>
              </p>
            </div>
          </div>
        </div>

        {/* Back to Home */}
        <div className="text-center">
          <Link
            href="/"
            className="inline-block bg-pine hover:bg-pine-mid text-white px-8 py-4 rounded-full font-medium text-lg transition-colors"
          >
            ← Back to Home
          </Link>
        </div>

        {/* Fun Message */}
        <div className="text-center mt-12">
          <p className="text-gray-600 text-lg">
            🌲 Get ready for a pinecone-free yard! 🌲
          </p>
        </div>
      </div>
    </div>
  )
}

export default function BookingSuccess() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-cream flex items-center justify-center"><div>Loading...</div></div>}>
      <BookingSuccessContent />
    </Suspense>
  )
}