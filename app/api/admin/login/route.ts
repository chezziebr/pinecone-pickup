import { NextRequest, NextResponse } from 'next/server'
import { sign } from 'jsonwebtoken'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'pinecone2024'
const JWT_SECRET = process.env.JWT_SECRET || 'pinecone-admin-secret-key'

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json()

    if (!password) {
      return NextResponse.json(
        { error: 'Password is required' },
        { status: 400 }
      )
    }

    if (password !== ADMIN_PASSWORD) {
      return NextResponse.json(
        { error: 'Invalid password' },
        { status: 401 }
      )
    }

    // Generate JWT token
    const token = sign(
      {
        admin: true,
        timestamp: Date.now()
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    )

    return NextResponse.json({
      success: true,
      token,
      message: 'Login successful'
    })

  } catch (error) {
    console.error('Admin login error:', error)
    return NextResponse.json(
      { error: 'Login failed' },
      { status: 500 }
    )
  }
}