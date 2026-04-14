import { NextRequest, NextResponse } from 'next/server'
import { sign } from 'jsonwebtoken'
import { compare, hash } from 'bcryptjs'

// Require environment variables - no fallbacks for security
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD
const JWT_SECRET = process.env.JWT_SECRET

if (!ADMIN_PASSWORD || !JWT_SECRET) {
  console.error('WARNING: Missing ADMIN_PASSWORD or JWT_SECRET environment variables. Admin login will fail.')
}

// Rate limiting store (in production, use Redis)
const loginAttempts = new Map<string, { count: number; lastAttempt: number }>()
const MAX_ATTEMPTS = 5
const LOCKOUT_DURATION = 15 * 60 * 1000 // 15 minutes

function getRateLimitKey(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded ? forwarded.split(',')[0] : 'unknown'
  return `login_attempts_${ip}`
}

function isRateLimited(key: string): boolean {
  const attempts = loginAttempts.get(key)
  if (!attempts) return false

  const now = Date.now()
  if (now - attempts.lastAttempt > LOCKOUT_DURATION) {
    loginAttempts.delete(key)
    return false
  }

  return attempts.count >= MAX_ATTEMPTS
}

function recordLoginAttempt(key: string, success: boolean) {
  const now = Date.now()
  const attempts = loginAttempts.get(key) || { count: 0, lastAttempt: now }

  if (success) {
    loginAttempts.delete(key)
  } else {
    attempts.count += 1
    attempts.lastAttempt = now
    loginAttempts.set(key, attempts)
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check env vars are configured
    if (!ADMIN_PASSWORD || !JWT_SECRET) {
      console.error('Admin login failed: ADMIN_PASSWORD or JWT_SECRET not configured')
      return NextResponse.json(
        { error: 'Server configuration error. Contact administrator.' },
        { status: 500 }
      )
    }

    const rateLimitKey = getRateLimitKey(request)

    // Check rate limiting
    if (isRateLimited(rateLimitKey)) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again in 15 minutes.' },
        { status: 429 }
      )
    }

    const body = await request.json()
    const { password } = body

    // Input validation
    if (!password || typeof password !== 'string') {
      recordLoginAttempt(rateLimitKey, false)
      return NextResponse.json(
        { error: 'Password is required' },
        { status: 400 }
      )
    }

    if (password.length > 128) {
      recordLoginAttempt(rateLimitKey, false)
      return NextResponse.json(
        { error: 'Invalid password' },
        { status: 401 }
      )
    }

    // Verify password (support both plain text for migration and hashed)
    let isValidPassword = false
    if (ADMIN_PASSWORD && ADMIN_PASSWORD.startsWith('$2b$')) {
      // Hashed password
      isValidPassword = await compare(password, ADMIN_PASSWORD)
    } else if (ADMIN_PASSWORD) {
      // Plain text password (for migration period)
      isValidPassword = password === ADMIN_PASSWORD
    }

    if (!isValidPassword) {
      recordLoginAttempt(rateLimitKey, false)
      return NextResponse.json(
        { error: 'Invalid password' },
        { status: 401 }
      )
    }

    // Successful login
    recordLoginAttempt(rateLimitKey, true)

    // Generate secure JWT token
    const token = sign(
      {
        admin: true,
        timestamp: Date.now(),
        ip: request.headers.get('x-forwarded-for') || 'unknown'
      },
      JWT_SECRET!,
      {
        expiresIn: '8h', // Reduced from 24h for security
        issuer: 'pinecone-pickup',
        audience: 'admin-panel'
      }
    )

    // Return token in response body for Authorization header usage
    // Also set cookie as backup with path '/' to cover API routes
    const response = NextResponse.json({
      success: true,
      message: 'Login successful',
      token: token
    })

    response.cookies.set('admin-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 8 * 60 * 60, // 8 hours
      path: '/'
    })

    return response

  } catch (error) {
    console.error('Admin login error:', error)
    return NextResponse.json(
      { error: 'Login failed' },
      { status: 500 }
    )
  }
}