import { google } from 'googleapis'
import { BookingData } from './availability'
import {
  loadBusinessTimezone,
  loadServiceDurationMinutes,
  pacificDateAtSlot,
} from './time'

// Helper to create OAuth2 clients
function createOAuthClient(refreshToken: string) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'urn:ietf:wg:oauth:2.0:oob'
  )

  oauth2Client.setCredentials({
    refresh_token: refreshToken
  })

  return oauth2Client
}

// Use the enhanced availability engine instead of hardcoded logic
export { getAvailableSlots } from './availability-engine'

export async function getAvailableDates(year: number, month: number): Promise<string[]> {
  try {
    // Import the function locally to avoid circular dependency issues
    const { getAvailableSlots: getSlots } = await import('./availability-engine')

    const availableDates: string[] = []
    const daysInMonth = new Date(year, month, 0).getDate()
    const today = new Date()

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month - 1, day)
      const dateString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

      // Skip past dates
      if (date < today) continue

      const dayOfWeek = date.getDay()
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
      const isWeekdayAfter230 = !isWeekend && date.getHours() >= 14.5

      // Only check weekends or weekdays after 2:30 PM
      if (isWeekend || (!isWeekend && dayOfWeek !== 0)) {
        const slots = await getSlots(dateString)
        if (slots.length > 0) {
          availableDates.push(dateString)
        }
      }
    }

    return availableDates
  } catch (error) {
    console.error('Error getting available dates:', error)
    return []
  }
}

export async function createBookingEvent(booking: BookingData): Promise<string> {
  try {
    const pineconeAuth = createOAuthClient(process.env.PINECONE_GOOGLE_REFRESH_TOKEN!)
    const calendar = google.calendar({ version: 'v3' })

    const tz = await loadBusinessTimezone()
    const durationMs = (await loadServiceDurationMinutes()) * 60 * 1000

    const startTime = pacificDateAtSlot(booking.scheduled_date, booking.scheduled_time, tz)
    const endTime = new Date(startTime.getTime() + durationMs)

    const event = {
      summary: `Pinecone Pick Up — ${booking.first_name} ${booking.last_name}`,
      description: [
        `Address: ${booking.address}`,
        `Lot Size: ${booking.lot_size}`,
        `Service: ${booking.service_type === 'pickup_only' ? 'Pick Up Only' : 'Pick Up + Haul Away'}`,
        `Price: $${booking.price}`,
        `Phone: ${booking.phone}`,
        `Email: ${booking.email}`,
        booking.notes ? `Notes: ${booking.notes}` : ''
      ].filter(Boolean).join('\n'),
      start: {
        dateTime: startTime.toISOString(),
        timeZone: tz,
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone: tz,
      },
    }

    const response = await calendar.events.insert({
      auth: pineconeAuth,
      calendarId: process.env.PINECONE_CALENDAR_ID!,
      requestBody: event,
    })

    return response.data.id!
  } catch (error) {
    console.error('Error creating booking event:', error)
    throw new Error('Failed to create calendar event')
  }
}