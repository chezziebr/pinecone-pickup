import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth, handleRouteError } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    requireAdminAuth(request)

    const { data: hours, error } = await supabaseAdmin
      .from('seasonal_hours')
      .select('*')
      .order('start_date, day_of_week, start_time')

    if (error) {
      console.error('Error fetching seasonal hours:', error)
      return NextResponse.json(
        { error: 'Failed to fetch seasonal hours' },
        { status: 500 }
      )
    }

    return NextResponse.json({ hours })
  } catch (error) {
    return handleRouteError(error, 'Seasonal hours GET error')
  }
}

export async function POST(request: NextRequest) {
  try {
    requireAdminAuth(request)

    const body = await request.json()

    // Validate required fields
    if (
      !body.name ||
      !body.start_date ||
      !body.end_date ||
      body.day_of_week === undefined ||
      !body.start_time ||
      !body.end_time
    ) {
      return NextResponse.json(
        { error: 'name, start_date, end_date, day_of_week, start_time, and end_time are required' },
        { status: 400 }
      )
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(body.start_date) || !dateRegex.test(body.end_date)) {
      return NextResponse.json(
        { error: 'Invalid date format. Use YYYY-MM-DD' },
        { status: 400 }
      )
    }

    // Validate time format (HH:MM)
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/
    if (!timeRegex.test(body.start_time) || !timeRegex.test(body.end_time)) {
      return NextResponse.json(
        { error: 'Invalid time format. Use HH:MM in 24-hour format' },
        { status: 400 }
      )
    }

    const { data, error } = await supabaseAdmin
      .from('seasonal_hours')
      .insert({
        name: body.name,
        start_date: body.start_date,
        end_date: body.end_date,
        day_of_week: body.day_of_week,
        start_time: body.start_time + ':00',
        end_time: body.end_time + ':00',
        is_active: body.is_active !== false,
        priority: body.priority || 0
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating seasonal hours:', error)
      return NextResponse.json(
        { error: 'Failed to create seasonal hours' },
        { status: 500 }
      )
    }

    return NextResponse.json({ hours: data }, { status: 201 })
  } catch (error) {
    return handleRouteError(error, 'Seasonal hours POST error')
  }
}

export async function DELETE(request: NextRequest) {
  try {
    requireAdminAuth(request)

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'ID is required' },
        { status: 400 }
      )
    }

    const { error } = await supabaseAdmin
      .from('seasonal_hours')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting seasonal hours:', error)
      return NextResponse.json(
        { error: 'Failed to delete seasonal hours' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleRouteError(error, 'Seasonal hours DELETE error')
  }
}
