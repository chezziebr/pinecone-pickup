import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth, handleRouteError } from '@/lib/auth'
import { UpdateAvailabilityExceptionRequest } from '@/lib/types'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params

    // Verify admin authentication
    requireAdminAuth(request)

    const body: UpdateAvailabilityExceptionRequest = await request.json()
    const { id } = resolvedParams

    // Build update object with only provided fields
    const updateData: any = {}

    if (body.specific_date !== undefined) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/
      if (!dateRegex.test(body.specific_date)) {
        return NextResponse.json(
          { error: 'Invalid date format. Use YYYY-MM-DD' },
          { status: 400 }
        )
      }
      updateData.specific_date = body.specific_date
    }

    if (body.start_time !== undefined) {
      const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/
      if (body.start_time && !timeRegex.test(body.start_time)) {
        return NextResponse.json(
          { error: 'Invalid start_time format. Use HH:MM in 24-hour format' },
          { status: 400 }
        )
      }
      updateData.start_time = body.start_time ? body.start_time + ':00' : null
    }

    if (body.end_time !== undefined) {
      const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/
      if (body.end_time && !timeRegex.test(body.end_time)) {
        return NextResponse.json(
          { error: 'Invalid end_time format. Use HH:MM in 24-hour format' },
          { status: 400 }
        )
      }
      updateData.end_time = body.end_time ? body.end_time + ':00' : null
    }

    if (body.is_available !== undefined) {
      updateData.is_available = body.is_available
    }

    if (body.reason !== undefined) {
      updateData.reason = body.reason || null
    }

    if (body.override_type !== undefined) {
      if (!['blackout', 'special_hours', 'holiday'].includes(body.override_type)) {
        return NextResponse.json(
          { error: 'Invalid override_type' },
          { status: 400 }
        )
      }
      updateData.override_type = body.override_type
    }

    // Validate that start time is before end time if both are provided
    if (updateData.start_time && updateData.end_time && updateData.start_time >= updateData.end_time) {
      return NextResponse.json(
        { error: 'Start time must be before end time' },
        { status: 400 }
      )
    }

    const { data, error } = await supabaseAdmin
      .from('availability_exceptions')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating availability exception:', error)
      return NextResponse.json(
        { error: 'Failed to update availability exception' },
        { status: 500 }
      )
    }

    return NextResponse.json({ exception: data })
  } catch (error) {
    return handleRouteError(error, 'Availability exceptions PUT error')
  }
}
