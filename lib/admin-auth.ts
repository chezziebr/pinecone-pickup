import { NextRequest } from 'next/server'
import { verifyAdminToken } from './auth'

interface AdminAuthResult {
  success: boolean
  error?: string
  payload?: any
}

export async function verifyAdminAuth(request: NextRequest): Promise<AdminAuthResult> {
  try {
    const payload = verifyAdminToken(request)

    if (!payload) {
      return {
        success: false,
        error: 'Unauthorized: Invalid or missing admin token'
      }
    }

    return {
      success: true,
      payload
    }
  } catch (error) {
    console.error('Admin auth verification failed:', error)
    return {
      success: false,
      error: 'Authentication failed'
    }
  }
}