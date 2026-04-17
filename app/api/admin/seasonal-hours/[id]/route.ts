import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth, handleRouteError } from '@/lib/auth'
import { normalizeTime } from '@/lib/types'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params
    requireAdminAuth(request)

    const body = await request.json()
    const { id } = resolvedParams

    const updateData: any = {}

    if (body.name !== undefined) updateData.name = body.name
    if (body.start_date !== undefined) updateData.start_date = body.start_date
    if (body.end_date !== undefined) updateData.end_date = body.end_date
    if (body.day_of_week !== undefined) updateData.day_of_week = body.day_of_week

    if (body.start_time !== undefined) {
      const normalized = normalizeTime(body.start_time)
      if (!normalized) {
        return NextResponse.json({ error: 'Invalid start_time format. Use HH:MM in 24-hour format or 12-hour format (e.g., "3:30 PM")' }, { status: 400 })
      }
      updateData.start_time = normalized
    }
    if (body.end_time !== undefined) {
      const normalized = normalizeTime(body.end_time)
      if (!normalized) {
        return NextResponse.json({ error: 'Invalid end_time format. Use HH:MM in 24-hour format or 12-hour format (e.g., "3:30 PM")' }, { status: 400 })
      }
      updateData.end_time = normalized
    }
    if (body.is_active !== undefined) updateData.is_active = body.is_active
    if (body.priority !== undefined) updateData.priority = body.priority

    const { data, error } = await supabaseAdmin
      .from('seasonal_hours')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating seasonal hours:', error)
      return NextResponse.json(
        { error: 'Failed to update seasonal hours' },
        { status: 500 }
      )
    }

    return NextResponse.json({ hours: data })
  } catch (error) {
    return handleRouteError(error, 'Seasonal hours PUT error')
  }
}
