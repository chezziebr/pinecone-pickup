import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/auth'
import {
  AvailabilityException,
  CreateAvailabilityExceptionRequest,
} from '@/lib/types'

export async function GET(request: NextRequest) {
  try {
    // Check authorization using secure auth
    requireAdminAuth(request)

    const { searchParams } = new URL(request.url)
    const fromDate = searchParams.get('from')
    const toDate = searchParams.get('to')

    let query = supabaseAdmin
      .from('availability_exceptions')
      .select('*')
      .order('specific_date, start_time')

    // Optional date filtering
    if (fromDate) {
      query = query.gte('specific_date', fromDate)
    }
    if (toDate) {
      query = query.lte('specific_date', toDate)
    }

    const { data: exceptions, error } = await query

    if (error) {
      console.error('Error fetching availability exceptions:', error)
      return NextResponse.json(
        { error: 'Failed to fetch availability exceptions' },
        { status: 500 }
      )
    }

    return NextResponse.json({ exceptions })
  } catch (error) {
    console.error('Availability exceptions API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check authorization using secure auth
    requireAdminAuth(request)

    const body: CreateAvailabilityExceptionRequest = await request.json()

    // Validate required fields
    if (
      !body.specific_date ||
      typeof body.is_available !== 'boolean' ||
      !['blackout', 'special_hours', 'holiday'].includes(body.override_type)
    ) {
      return NextResponse.json(
        { error: 'Invalid input: specific_date, is_available, and override_type are required' },
        { status: 400 }
      )
    }

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(body.specific_date)) {
      return NextResponse.json(
        { error: 'Invalid date format. Use YYYY-MM-DD' },
        { status: 400 }
      )
    }

    // Validate time format if provided (HH:MM)
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/
    if (body.start_time && !timeRegex.test(body.start_time)) {
      return NextResponse.json(
        { error: 'Invalid start_time format. Use HH:MM in 24-hour format' },
        { status: 400 }
      )
    }
    if (body.end_time && !timeRegex.test(body.end_time)) {
      return NextResponse.json(
        { error: 'Invalid end_time format. Use HH:MM in 24-hour format' },
        { status: 400 }
      )
    }

    // Convert times to full time format for database (if provided)
    const startTime = body.start_time ? body.start_time + ':00' : null
    const endTime = body.end_time ? body.end_time + ':00' : null

    // Validate that start time is before end time if both are provided
    if (startTime && endTime && startTime >= endTime) {
      return NextResponse.json(
        { error: 'Start time must be before end time' },
        { status: 400 }
      )
    }

    // Create the exception
    const { data, error } = await supabaseAdmin
      .from('availability_exceptions')
      .insert({
        specific_date: body.specific_date,
        start_time: startTime,
        end_time: endTime,
        is_available: body.is_available,
        reason: body.reason || null,
        override_type: body.override_type,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating availability exception:', error)
      return NextResponse.json(
        { error: 'Failed to create availability exception' },
        { status: 500 }
      )
    }

    return NextResponse.json({ exception: data }, { status: 201 })
  } catch (error) {
    console.error('Availability exceptions POST error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
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
        { error: 'Exception ID is required' },
        { status: 400 }
      )
    }

    const { error } = await supabaseAdmin
      .from('availability_exceptions')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting availability exception:', error)
      return NextResponse.json(
        { error: 'Failed to delete availability exception' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Availability exceptions DELETE error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}