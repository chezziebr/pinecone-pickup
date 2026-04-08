import { NextRequest, NextResponse } from 'next/server'
import { getAvailableSlots, getAvailableDates } from '@/lib/google-calendar'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date')
    const month = searchParams.get('month')

    if (date) {
      // Get available slots for a specific date
      const slots = await getAvailableSlots(date)
      return NextResponse.json({ slots })
    } else if (month) {
      // Get available dates for a month
      const [year, monthNum] = month.split('-').map(Number)
      const dates = await getAvailableDates(year, monthNum)
      return NextResponse.json({ dates })
    } else {
      return NextResponse.json(
        { error: 'Either date or month parameter is required' },
        { status: 400 }
      )
    }
  } catch (error) {
    console.error('Availability API error:', error)
    return NextResponse.json(
      { error: 'Failed to get availability' },
      { status: 500 }
    )
  }
}