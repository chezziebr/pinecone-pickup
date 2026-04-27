import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth, handleRouteError } from '@/lib/auth'
import { validatePostServiceData, PostServiceData } from '@/lib/validation'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    requireAdminAuth(request)

    const { id } = await params
    const body = await request.json()

    const validationResult = validatePostServiceData(body)
    if (!validationResult.isValid) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.errors },
        { status: 400 }
      )
    }

    const sanitized = validationResult.sanitizedData as PostServiceData

    // Read current row to preserve completed_at on edit (real-world completion is a one-time event).
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('bookings')
      .select('completed_at')
      .eq('id', id)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: 'Booking not found' },
        { status: 404 }
      )
    }

    const updateData = {
      actual_lot_size: sanitized.actual_lot_size ?? null,
      payment_received: sanitized.payment_received,
      payment_method: sanitized.payment_method ?? null,
      tip_amount: sanitized.tip_amount ?? null,
      completion_notes: sanitized.completion_notes ?? null,
      completed_at: existing.completed_at ?? new Date().toISOString(),
      status: 'completed',
    }

    const { data, error } = await supabaseAdmin
      .from('bookings')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      throw error
    }

    return NextResponse.json({ success: true, booking: data })
  } catch (error) {
    return handleRouteError(error, 'Post-service completion error')
  }
}
