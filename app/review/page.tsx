'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

function ReviewPageContent() {
  const searchParams = useSearchParams()
  const bookingId = searchParams.get('booking')

  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [comment, setComment] = useState('')
  const [neighborhood, setNeighborhood] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  if (!bookingId) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="max-w-md mx-auto text-center p-8">
          <div className="text-4xl mb-4">🤔</div>
          <h1 className="text-2xl font-fraunces font-bold text-pine mb-4">
            Review Link Invalid
          </h1>
          <p className="text-gray-600 mb-6">
            This review link appears to be invalid. Please check your email for the correct link.
          </p>
          <Link
            href="/"
            className="inline-block bg-pine hover:bg-pine-mid text-white px-6 py-3 rounded-full font-medium transition-colors"
          >
            Back to Home
          </Link>
        </div>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (rating === 0) {
      setError('Please select a rating')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      const response = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId,
          rating,
          comment: comment.trim() || null,
          neighborhood: neighborhood.trim() || null
        })
      })

      const result = await response.json()

      if (response.ok) {
        setSubmitted(true)
      } else {
        setError(result.error || 'Something went wrong. Please try again.')
      }
    } catch (error) {
      console.error('Review submission error:', error)
      setError('Network error. Please check your connection and try again.')
    }

    setSubmitting(false)
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="max-w-md mx-auto text-center p-8">
          <div className="text-6xl mb-4">🌲</div>
          <h1 className="text-3xl font-fraunces font-bold text-pine mb-4">
            Thank you!
          </h1>
          <p className="text-xl text-gray-600 mb-6">
            We really appreciate your feedback. It helps us grow!
          </p>
          <Link
            href="/"
            className="inline-block bg-orange hover:bg-orange/90 text-white px-8 py-4 rounded-full font-medium text-lg transition-colors"
          >
            Back to Home
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cream">
      <div className="max-w-2xl mx-auto px-4 py-20">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="text-6xl mb-4">⭐</div>
          <h1 className="text-3xl md:text-4xl font-fraunces font-bold text-pine mb-4">
            How did we do?
          </h1>
          <p className="text-xl text-gray-600">
            Your feedback helps Bruce, Zoë, and Chase improve their service!
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-8 shadow-lg">
          {/* Error Message */}
          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6">
              {error}
            </div>
          )}

          {/* Star Rating */}
          <div className="mb-8">
            <label className="block text-lg font-medium text-gray-700 mb-4">
              Rate your experience *
            </label>
            <div className="flex justify-center space-x-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="text-4xl transition-colors focus:outline-none"
                >
                  <span
                    className={
                      star <= (hoverRating || rating)
                        ? 'text-yellow-400'
                        : 'text-gray-300'
                    }
                  >
                    ★
                  </span>
                </button>
              ))}
            </div>
            <div className="text-center mt-2">
              <span className="text-gray-600">
                {rating === 0
                  ? 'Click to rate'
                  : rating === 1
                  ? 'Poor'
                  : rating === 2
                  ? 'Fair'
                  : rating === 3
                  ? 'Good'
                  : rating === 4
                  ? 'Very Good'
                  : 'Excellent'}
              </span>
            </div>
          </div>

          {/* Comment */}
          <div className="mb-6">
            <label className="block text-lg font-medium text-gray-700 mb-3">
              Anything you'd like to share? (optional)
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              placeholder="Tell us about your experience..."
              className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange focus:border-orange"
            />
          </div>

          {/* Neighborhood */}
          <div className="mb-8">
            <label className="block text-lg font-medium text-gray-700 mb-3">
              Your neighborhood (optional)
            </label>
            <input
              type="text"
              value={neighborhood}
              onChange={(e) => setNeighborhood(e.target.value)}
              placeholder="e.g. Awbrey Butte"
              className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange focus:border-orange"
            />
            <p className="text-sm text-gray-500 mt-2">
              We may use this in testimonials (with your permission)
            </p>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={submitting || rating === 0}
            className="w-full bg-orange hover:bg-orange/90 disabled:bg-orange/50 text-white p-4 rounded-full font-medium text-lg transition-colors"
          >
            {submitting ? 'Submitting...' : 'Submit Review'}
          </button>

          {/* Back Link */}
          <div className="text-center mt-6">
            <Link
              href="/"
              className="text-gray-600 hover:text-pine transition-colors"
            >
              ← Back to website
            </Link>
          </div>
        </form>

        {/* Thank You Note */}
        <div className="text-center mt-12 p-6 bg-white/50 rounded-2xl">
          <p className="text-gray-600">
            Thank you for choosing Pinecone Pick Up Crew! 🌲
          </p>
        </div>
      </div>
    </div>
  )
}

export default function ReviewPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-cream flex items-center justify-center"><div>Loading...</div></div>}>
      <ReviewPageContent />
    </Suspense>
  )
}