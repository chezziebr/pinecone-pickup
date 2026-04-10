import { NextRequest } from 'next/server'

interface RateLimitConfig {
  maxRequests: number
  windowMs: number
  message?: string
}

interface RateLimitEntry {
  count: number
  resetTime: number
}

// In-memory rate limit store (use Redis in production)
const rateLimitStore = new Map<string, RateLimitEntry>()

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key)
    }
  }
}, 5 * 60 * 1000)

function getRateLimitKey(request: NextRequest, identifier?: string): string {
  if (identifier) {
    return `rate_limit_${identifier}`
  }

  // Get IP address from various headers
  const forwarded = request.headers.get('x-forwarded-for')
  const realIp = request.headers.get('x-real-ip')
  const ip = forwarded ? forwarded.split(',')[0].trim() : realIp || 'unknown'

  return `rate_limit_${ip}_${request.url}`
}

export function checkRateLimit(
  request: NextRequest,
  config: RateLimitConfig,
  identifier?: string
): { success: boolean; error?: string; remaining?: number } {
  const key = getRateLimitKey(request, identifier)
  const now = Date.now()
  const resetTime = now + config.windowMs

  const existing = rateLimitStore.get(key)

  if (!existing || now > existing.resetTime) {
    // First request or window has expired
    rateLimitStore.set(key, {
      count: 1,
      resetTime
    })
    return {
      success: true,
      remaining: config.maxRequests - 1
    }
  }

  if (existing.count >= config.maxRequests) {
    return {
      success: false,
      error: config.message || `Rate limit exceeded. Try again in ${Math.ceil((existing.resetTime - now) / 1000)} seconds.`
    }
  }

  // Increment count
  existing.count += 1
  rateLimitStore.set(key, existing)

  return {
    success: true,
    remaining: config.maxRequests - existing.count
  }
}

// Predefined rate limit configs
export const RATE_LIMITS = {
  BOOKING: {
    maxRequests: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
    message: 'Too many booking attempts. Please try again in 15 minutes.'
  },
  AVAILABILITY: {
    maxRequests: 30,
    windowMs: 60 * 1000, // 1 minute
    message: 'Too many availability requests. Please try again in a moment.'
  },
  REVIEW: {
    maxRequests: 3,
    windowMs: 60 * 60 * 1000, // 1 hour
    message: 'Too many review submissions. Please try again later.'
  },
  ADMIN_LOGIN: {
    maxRequests: 10,
    windowMs: 15 * 60 * 1000, // 15 minutes
    message: 'Too many login attempts. Please try again in 15 minutes.'
  }
} as const

export function rateLimitResponse(error: string) {
  return Response.json(
    { error },
    { status: 429 }
  )
}