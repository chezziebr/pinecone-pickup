import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth, handleRouteError } from '@/lib/auth'
import { UpdateAvailabilitySettingRequest, normalizeTime } from '@/lib/types'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params

    // Verify admin authentication
    requireAdminAuth(request)

    const body: UpdateAvailabilitySettingRequest = await request.json()
    const { id } = resolvedParams

    // Build update object with only provided fields
    const updateData: any = {}

    if (body.day_of_week !== undefined) {
      if (body.day_of_week < 0 || body.day_of_week > 6) {
        return NextResponse.json(
          { error: 'day_of_week must be between 0 and 6' },
          { status: 400 }
        )
      }
      updateData.day_of_week = body.day_of_week
    }

    if (body.start_time !== undefined) {
      const normalizedStartTime = normalizeTime(body.start_time)
      if (!normalizedStartTime) {
        return NextResponse.json(
          { error: 'Invalid start_time format. Use HH:MM in 24-hour format or 12-hour format (e.g., "3:30 PM")' },
          { status: 400 }
        )
      }
      updateData.start_time = normalizedStartTime
    }

    if (body.end_time !== undefined) {
      const normalizedEndTime = normalizeTime(body.end_time)
      if (!normalizedEndTime) {
        return NextResponse.json(
          { error: 'Invalid end_time format. Use HH:MM in 24-hour format or 12-hour format (e.g., "3:30 PM")' },
          { status: 400 }
        )
      }
      updateData.end_time = normalizedEndTime
    }

    if (body.is_available !== undefined) {
      updateData.is_available = body.is_available
    }

    if (body.slot_interval_minutes !== undefined) {
      updateData.slot_interval_minutes = body.slot_interval_minutes
    }

    if (body.description !== undefined) {
      updateData.description = body.description
    }

    // Validate that start time is before end time if both are provided
    if (updateData.start_time && updateData.end_time) {
      if (updateData.start_time >= updateData.end_time) {
        return NextResponse.json(
          { error: 'Start time must be before end time' },
          { status: 400 }
        )
      }
    }

    const { data, error } = await supabaseAdmin
      .from('availability_settings')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating availability setting:', error)
      if (error.code === '23505') { // Unique constraint violation
        return NextResponse.json(
          { error: 'Availability setting for this day and time range already exists' },
          { status: 409 }
        )
      }
      return NextResponse.json(
        { error: 'Failed to update availability setting' },
        { status: 500 }
      )
    }

    return NextResponse.json({ setting: data })
  } catch (error) {
    return handleRouteError(error, 'Availability settings PUT error')
  }
}
