import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    requireAdminAuth(request)

    const { data: settings, error } = await supabaseAdmin
      .from('business_settings')
      .select('*')
      .order('key')

    if (error) {
      console.error('Error fetching business settings:', error)
      return NextResponse.json(
        { error: 'Failed to fetch business settings' },
        { status: 500 }
      )
    }

    return NextResponse.json({ settings })
  } catch (error) {
    console.error('Business settings API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    requireAdminAuth(request)

    const body = await request.json()
    const { key, value } = body

    if (!key || value === undefined) {
      return NextResponse.json(
        { error: 'key and value are required' },
        { status: 400 }
      )
    }

    // Validate specific settings
    if (key === 'calendar_buffer_minutes') {
      const mins = parseInt(value)
      if (isNaN(mins) || mins < 0 || mins > 120) {
        return NextResponse.json(
          { error: 'Buffer must be between 0 and 120 minutes' },
          { status: 400 }
        )
      }
    }

    const { data, error } = await supabaseAdmin
      .from('business_settings')
      .upsert(
        { key, value: String(value), updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      )
      .select()
      .single()

    if (error) {
      console.error('Error updating business setting:', error)
      return NextResponse.json(
        { error: 'Failed to update setting' },
        { status: 500 }
      )
    }

    return NextResponse.json({ setting: data })
  } catch (error) {
    console.error('Business settings PUT error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
