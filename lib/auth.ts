import { NextRequest, NextResponse } from 'next/server'
import { verify } from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET

if (!JWT_SECRET) {
  console.error('WARNING: Missing JWT_SECRET environment variable. Admin auth will fail.')
}

interface AdminTokenPayload {
  admin: boolean
  timestamp: number
  ip?: string
  iss?: string
  aud?: string
}

// Custom error class so we can distinguish auth errors from real server errors
export class AuthError extends Error {
  status: number
  constructor(message: string, status: number = 401) {
    super(message)
    this.name = 'AuthError'
    this.status = status
  }
}

export function verifyAdminToken(request: NextRequest): AdminTokenPayload | null {
  try {
    if (!JWT_SECRET) {
      console.error('JWT_SECRET not configured')
      return null
    }

    // Try to get token from cookie first (preferred method)
    let token = request.cookies.get('admin-token')?.value

    // Fallback to Authorization header for backward compatibility
    if (!token) {
      const authHeader = request.headers.get('Authorization')
      const bearerToken = authHeader?.replace('Bearer ', '')
      // Don't accept "undefined" or "null" as valid tokens
      if (bearerToken && bearerToken !== 'undefined' && bearerToken !== 'null') {
        token = bearerToken
      }
    }

    if (!token) {
      return null
    }

    const payload = verify(token, JWT_SECRET, {
      issuer: 'pinecone-pickup',
      audience: 'admin-panel'
    }) as AdminTokenPayload

    // Additional security checks
    if (!payload.admin) {
      return null
    }

    return payload

  } catch (error) {
    console.error('Token verification failed:', error)
    return null
  }
}

export function requireAdminAuth(request: NextRequest) {
  const payload = verifyAdminToken(request)

  if (!payload) {
    throw new AuthError('Unauthorized: Invalid or missing admin token', 401)
  }

  return payload
}

// Helper to handle auth errors in catch blocks — use this in every admin route
export function handleRouteError(error: unknown, fallbackMessage: string) {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: error.status }
    )
  }

  console.error(fallbackMessage, error)
  return NextResponse.json(
    { error: fallbackMessage },
    { status: 500 }
  )
}
