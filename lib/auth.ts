import { NextRequest } from 'next/server'
import { verify } from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET

if (!JWT_SECRET) {
  throw new Error('Missing required environment variable: JWT_SECRET')
}

interface AdminTokenPayload {
  admin: boolean
  timestamp: number
  ip?: string
  iss?: string
  aud?: string
}

export function verifyAdminToken(request: NextRequest): AdminTokenPayload | null {
  try {
    // Try to get token from cookie first (preferred method)
    let token = request.cookies.get('admin-token')?.value

    // Fallback to Authorization header for backward compatibility
    if (!token) {
      const authHeader = request.headers.get('Authorization')
      token = authHeader?.replace('Bearer ', '')
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
    throw new Error('Unauthorized: Invalid or missing admin token')
  }

  return payload
}