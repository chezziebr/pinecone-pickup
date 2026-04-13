'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

export default function AdminLogin() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      })

      const result = await response.json()

      if (response.ok) {
        // Store auth token
        localStorage.setItem('adminToken', result.token)
        router.push('/admin/dashboard')
      } else {
        setError(result.error || 'Invalid password')
      }
    } catch (error) {
      console.error('Login error:', error)
      setError('Login failed. Please try again.')
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-pine-light flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        {/* Logo */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center mb-4">
            <Image
              src="/images/kids-crew.jpeg"
              alt="Pinecone Pick Up Crew"
              width={120}
              height={90}
              className="rounded-xl shadow-lg border-4 border-white"
            />
          </div>
          <h1 className="text-2xl font-fraunces font-bold text-pine mb-2">
            Admin Dashboard
          </h1>
          <p className="text-pine-mid">
            Welcome back, Bruce! 🌲
          </p>
        </div>

        {/* Login Form */}
        <div className="bg-white rounded-2xl p-8 shadow-lg">
          <form onSubmit={handleLogin}>
            <div className="mb-6">
              <label className="block text-pine font-medium mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-4 border-2 border-gray-200 rounded-lg focus:border-orange focus:ring-2 focus:ring-orange/20 outline-none transition-colors"
                placeholder="Enter admin password"
                required
              />
            </div>

            {error && (
              <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !password.trim()}
              className="w-full bg-orange hover:bg-orange/90 disabled:bg-orange/50 text-white p-4 rounded-lg font-medium text-lg transition-colors"
            >
              {loading ? 'Signing in...' : 'Access Dashboard'}
            </button>
          </form>

          <div className="mt-8 text-center">
            <a
              href="/"
              className="text-pine-mid hover:text-pine transition-colors text-sm"
            >
              ← Back to website
            </a>
          </div>
        </div>

        {/* Features Preview */}
        <div className="mt-8 text-center">
          <p className="text-pine-mid text-sm mb-4">Dashboard Features:</p>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="bg-white/50 p-3 rounded-lg">
              <div className="text-orange font-medium">📊 Analytics</div>
              <div className="text-pine-mid">Revenue & booking stats</div>
            </div>
            <div className="bg-white/50 p-3 rounded-lg">
              <div className="text-orange font-medium">👥 Customers</div>
              <div className="text-pine-mid">Manage all bookings</div>
            </div>
            <div className="bg-white/50 p-3 rounded-lg">
              <div className="text-orange font-medium">📅 Schedule</div>
              <div className="text-pine-mid">Calendar management</div>
            </div>
            <div className="bg-white/50 p-3 rounded-lg">
              <div className="text-orange font-medium">💰 Earnings</div>
              <div className="text-pine-mid">Financial tracking</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}