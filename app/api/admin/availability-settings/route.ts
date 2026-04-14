import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth, handleRouteError } from '@/lib/auth'
import {
  AvailabilitySetting,
  CreateAvailabilitySettingRequest,
  UpdateAvailabilitySettingRequest
} from '@/lib/types'

export async function GET(request: NextRequest) {
  try {
    // Check authorization using secure auth
    requireAdminAuth(request)

    // Get all availability settings ordered by day of week and start time
    const { data: settings, error } = await supabaseAdmin
      .from('availability_settings')
      .select('*')
      .order('day_of_week, start_time')

    if (error) {
      console.error('Error fetching availability settings:', error)
      return NextResponse.json(
        { error: 'Failed to fetch availability settings' },
        { status: 500 }
      )
    }

    return NextResponse.json({ settings })
  } catch (error) {
    return handleRouteError(error, 'Availability settings GET error')
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check authorization using secure auth
    requireAdminAuth(request)

    const body: CreateAvailabilitySettingRequest = await request.json()

    // Validate required fields
    if (
      typeof body.day_of_week !== 'number' ||
      body.day_of_week < 0 ||
      body.day_of_week > 6 ||
      !body.start_time ||
      !body.end_time ||
      typeof body.is_available !== 'boolean'
    ) {
      return NextResponse.json(
        { error: 'Invalid input: day_of_week (0-6), start_time, end_time, and is_available are required' },
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

    // Convert times to full time format for database
    const startTime = body.start_time + ':00'
    const endTime = body.end_time + ':00'

    // Validate that start time is before end time
    if (startTime >= endTime) {
      return NextResponse.json(
        { error: 'Start time must be before end time' },
        { status: 400 }
      )
    }

    // Create the setting
    const { data, error } = await supabaseAdmin
      .from('availability_settings')
      .insert({
        day_of_week: body.day_of_week,
        start_time: startTime,
        end_time: endTime,
        is_available: body.is_available,
        slot_interval_minutes: body.slot_interval_minutes || 60,
        description: body.description || null,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating availability setting:', error)
      if (error.code === '23505') { // Unique constraint violation
        return NextResponse.json(
          { error: 'Availability setting for this day and time range already exists' },
          { status: 409 }
        )
      }
      return NextResponse.json(
        { error: 'Failed to create availability setting' },
        { status: 500 }
      )
    }

    return NextResponse.json({ setting: data }, { status: 201 })
  } catch (error) {
    return handleRouteError(error, 'Availability settings POST error')
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Check authorization using secure auth
    requireAdminAuth(request)

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'Setting ID is required' },
        { status: 400 }
      )
    }

    const { error } = await supabaseAdmin
      .from('availability_settings')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting availability setting:', error)
      return NextResponse.json(
        { error: 'Failed to delete availability setting' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleRouteError(error, 'Availability settings DELETE error')
  }
}