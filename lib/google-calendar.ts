import { google } from 'googleapis'
import { BookingData } from './availability'

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

// Helper to parse time string to Date object
function parseTimeToDate(date: string, timeString: string): Date {
  const [time, period] = timeString.split(' ')
  const [hours, minutes] = time.split(':').map(Number)

  let hour24 = hours
  if (period === 'PM' && hours !== 12) hour24 += 12
  if (period === 'AM' && hours === 12) hour24 = 0

  const dateObj = new Date(date + 'T00:00:00')
  dateObj.setHours(hour24, minutes || 0, 0, 0)

  return dateObj
}

// Helper to check if a time slot conflicts with existing events
function hasTimeConflict(slotTime: Date, events: any[]): boolean {
  const slotStart = new Date(slotTime)
  const slotEnd = new Date(slotTime.getTime() + (90 * 60 * 1000)) // 1.5 hours

  // Check ±1.5 hours buffer
  const bufferStart = new Date(slotStart.getTime() - (90 * 60 * 1000))
  const bufferEnd = new Date(slotEnd.getTime() + (90 * 60 * 1000))

  return events.some(event => {
    if (!event.start?.dateTime || !event.end?.dateTime) return false

    const eventStart = new Date(event.start.dateTime)
    const eventEnd = new Date(event.end.dateTime)

    // Check if event overlaps with buffered slot time
    return eventStart < bufferEnd && eventEnd > bufferStart
  })
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
      const dateString = date.toISOString().split('T')[0]

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

    // Parse the scheduled time
    const startTime = parseTimeToDate(booking.scheduled_date, booking.scheduled_time)
    const endTime = new Date(startTime.getTime() + (90 * 60 * 1000)) // 1.5 hours

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
        timeZone: 'America/Los_Angeles',
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone: 'America/Los_Angeles',
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