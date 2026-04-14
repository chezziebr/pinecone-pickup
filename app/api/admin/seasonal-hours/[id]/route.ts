import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth, handleRouteError } from '@/lib/auth'

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
      const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/
      if (!timeRegex.test(body.start_time)) {
        return NextResponse.json({ error: 'Invalid start_time format' }, { status: 400 })
      }
      updateData.start_time = body.start_time + ':00'
    }
    if (body.end_time !== undefined) {
      const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/
      if (!timeRegex.test(body.end_time)) {
        return NextResponse.json({ error: 'Invalid end_time format' }, { status: 400 })
      }
      updateData.end_time = body.end_time + ':00'
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
