// Enhanced availability engine that integrates database settings with Google Calendar
import { supabaseAdmin } from './supabase'
import { google } from 'googleapis'
import { AvailabilitySetting, AvailabilityException, convertTo12Hour } from './types'

// OAuth client creation function (copied from google-calendar.ts)
function createOAuthClient(refreshToken: string) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'urn:ietf:wg:oauth:2.0:oob'
  )

  oauth2Client.setCredentials({
    refresh_token: refreshToken,
  })

  return oauth2Client
}

// Check if a booking conflicts with existing Google Calendar events
function hasGoogleCalendarConflict(
  eventStart: Date,
  eventEnd: Date,
  existingEvents: any[]
): boolean {
  const bufferStart = new Date(eventStart.getTime() - (15 * 60 * 1000)) // 15 min before
  const bufferEnd = new Date(eventEnd.getTime() + (15 * 60 * 1000)) // 15 min after

  return existingEvents.some(event => {
    if (!event.start?.dateTime || !event.end?.dateTime) return false

    const eventStartTime = new Date(event.start.dateTime)
    const eventEndTime = new Date(event.end.dateTime)

    // Check if the new booking overlaps with existing event (including buffer)
    return eventStart < eventEndTime && eventEnd > eventStartTime
  })
}

// Get all availability settings and exceptions for a specific date
export async function getAvailabilityData(date: string): Promise<{
  settings: AvailabilitySetting[]
  exceptions: AvailabilityException[]
  googleEvents: any[]
}> {
  const dayOfWeek = new Date(date).getDay()

  // Get database settings and exceptions
  const [settingsResult, exceptionsResult] = await Promise.all([
    supabaseAdmin
      .from('availability_settings')
      .select('*')
      .eq('day_of_week', dayOfWeek)
      .order('start_time'),

    supabaseAdmin
      .from('availability_exceptions')
      .select('*')
      .eq('specific_date', date)
  ])

  if (settingsResult.error) {
    console.error('Error fetching availability settings:', settingsResult.error)
    throw new Error('Failed to fetch availability settings')
  }

  if (exceptionsResult.error) {
    console.error('Error fetching availability exceptions:', exceptionsResult.error)
    throw new Error('Failed to fetch availability exceptions')
  }

  // Get Google Calendar events
  let googleEvents: any[] = []
  try {
    const personalAuth = createOAuthClient(process.env.PERSONAL_GOOGLE_REFRESH_TOKEN!)
    const pineconeAuth = createOAuthClient(process.env.PINECONE_GOOGLE_REFRESH_TOKEN!)
    const calendar = google.calendar({ version: 'v3' })

    const startOfDay = new Date(date + 'T00:00:00')
    const endOfDay = new Date(date + 'T23:59:59')

    const [personalEvents, pineconeEvents] = await Promise.all([
      calendar.events.list({
        auth: personalAuth,
        calendarId: process.env.PERSONAL_CALENDAR_IDS!,
        timeMin: startOfDay.toISOString(),
        timeMax: endOfDay.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
      }),
      calendar.events.list({
        auth: pineconeAuth,
        calendarId: process.env.PINECONE_CALENDAR_ID!,
        timeMin: startOfDay.toISOString(),
        timeMax: endOfDay.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
      })
    ])

    googleEvents = [
      ...(personalEvents.data.items || []),
      ...(pineconeEvents.data.items || [])
    ]
  } catch (error) {
    console.error('Error fetching Google Calendar events:', error)
    // Continue without Google Calendar data (degraded mode)
  }

  return {
    settings: settingsResult.data || [],
    exceptions: exceptionsResult.data || [],
    googleEvents
  }
}

// Generate available time slots for a specific date
export async function getAvailableSlots(date: string): Promise<string[]> {
  try {
    const { settings, exceptions, googleEvents } = await getAvailabilityData(date)

    // If there are exceptions for this date, they override the regular schedule
    if (exceptions.length > 0) {
      return processExceptionsAvailability(date, exceptions, googleEvents)
    }

    // Otherwise, use regular weekly settings
    return processRegularAvailability(date, settings, googleEvents)
  } catch (error) {
    console.error('Error getting available slots:', error)

    // Fallback to original hardcoded logic if database is unavailable
    return getFallbackAvailableSlots(date)
  }
}

// Process availability based on date-specific exceptions
function processExceptionsAvailability(
  date: string,
  exceptions: AvailabilityException[],
  googleEvents: any[]
): string[] {
  const availableSlots: string[] = []

  for (const exception of exceptions) {
    if (!exception.is_available) {
      // This exception blocks availability
      continue
    }

    // Generate slots for this available exception
    if (!exception.start_time || !exception.end_time) {
      // Full day availability - generate hourly slots from 9 AM to 5 PM
      const slots = generateHourlySlots('09:00:00', '17:00:00')
      availableSlots.push(...slots)
    } else {
      // Specific time range
      const slots = generateHourlySlots(exception.start_time, exception.end_time)
      availableSlots.push(...slots)
    }
  }

  // Filter out slots that conflict with Google Calendar events
  return filterGoogleCalendarConflicts(date, availableSlots, googleEvents)
}

// Process availability based on regular weekly settings
function processRegularAvailability(
  date: string,
  settings: AvailabilitySetting[],
  googleEvents: any[]
): string[] {
  const availableSlots: string[] = []

  for (const setting of settings) {
    if (!setting.is_available) {
      // This setting blocks availability
      continue
    }

    // Generate slots for this available time block
    const slots = generateSlotsWithInterval(
      setting.start_time,
      setting.end_time,
      setting.slot_interval_minutes
    )
    availableSlots.push(...slots)
  }

  // If no settings found, fall back to original hardcoded logic
  if (availableSlots.length === 0) {
    return getFallbackAvailableSlots(date)
  }

  // Filter out slots that conflict with Google Calendar events
  return filterGoogleCalendarConflicts(date, availableSlots, googleEvents)
}

// Generate time slots with specified interval
function generateSlotsWithInterval(
  startTime: string,
  endTime: string,
  intervalMinutes: number
): string[] {
  const slots: string[] = []

  // Parse start time
  const [startHour, startMin] = startTime.split(':').map(Number)
  const [endHour, endMin] = endTime.split(':').map(Number)

  let currentHour = startHour
  let currentMin = startMin

  while (currentHour < endHour || (currentHour === endHour && currentMin <= endMin)) {
    // Convert to 12-hour format for display
    const timeStr = `${currentHour.toString().padStart(2, '0')}:${currentMin.toString().padStart(2, '0')}:00`
    slots.push(convertTo12Hour(timeStr))

    // Add interval
    currentMin += intervalMinutes
    if (currentMin >= 60) {
      currentHour += Math.floor(currentMin / 60)
      currentMin = currentMin % 60
    }

    // Stop before end time (don't include the end time slot)
    if (currentHour > endHour || (currentHour === endHour && currentMin >= endMin)) {
      break
    }
  }

  return slots
}

// Generate hourly slots (default behavior)
function generateHourlySlots(startTime: string, endTime: string): string[] {
  return generateSlotsWithInterval(startTime, endTime, 60)
}

// Filter out slots that conflict with Google Calendar events
function filterGoogleCalendarConflicts(
  date: string,
  slots: string[],
  googleEvents: any[]
): string[] {
  return slots.filter(slot => {
    // Convert slot time to Date object
    const [timeStr, period] = slot.split(' ')
    const [hours, minutes] = timeStr.split(':').map(Number)
    let hour24 = hours

    if (period === 'PM' && hours !== 12) hour24 += 12
    if (period === 'AM' && hours === 12) hour24 = 0

    const slotStart = new Date(date + 'T00:00:00')
    slotStart.setHours(hour24, minutes || 0, 0, 0)

    // Assume 90 minutes duration for service (matching existing logic)
    const slotEnd = new Date(slotStart.getTime() + (90 * 60 * 1000))

    // Check if this slot conflicts with any Google Calendar events
    return !hasGoogleCalendarConflict(slotStart, slotEnd, googleEvents)
  })
}

// Fallback to original hardcoded logic if database is unavailable
function getFallbackAvailableSlots(date: string): string[] {
  console.warn('Using fallback availability logic - database unavailable')

  const dayOfWeek = new Date(date).getDay()
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

  // Original hardcoded slots
  return isWeekend
    ? ['9:00 AM', '10:00 AM', '11:00 AM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM']
    : ['3:00 PM', '4:00 PM', '5:00 PM']
}

// Updated business hours validation using database settings
export async function validateBusinessHours(date: string, time: string): Promise<boolean> {
  try {
    const { settings, exceptions } = await getAvailabilityData(date)

    // Parse requested time
    const [timeStr, period] = time.split(' ')
    const [hours, minutes] = timeStr.split(':').map(Number)
    let hour24 = hours
    if (period === 'PM' && hours !== 12) hour24 += 12
    if (period === 'AM' && hours === 12) hour24 = 0

    const requestedTime = `${hour24.toString().padStart(2, '0')}:${(minutes || 0).toString().padStart(2, '0')}:00`

    // Check exceptions first (they override regular settings)
    for (const exception of exceptions) {
      if (!exception.is_available) {
        // If there's a blocking exception for this date
        if (!exception.start_time || !exception.end_time) {
          // Full day block
          return false
        } else {
          // Partial day block - check if requested time falls in blocked range
          if (requestedTime >= exception.start_time && requestedTime < exception.end_time) {
            return false
          }
        }
      } else {
        // If there's an availability exception for this date
        if (!exception.start_time || !exception.end_time) {
          // Full day available - check other exceptions
          continue
        } else {
          // Partial day available - check if requested time falls in available range
          if (requestedTime >= exception.start_time && requestedTime < exception.end_time) {
            return true
          }
        }
      }
    }

    // If exceptions exist but none matched, and we had available exceptions, it's not available
    if (exceptions.length > 0 && exceptions.some(e => e.is_available)) {
      return false
    }

    // Check regular weekly settings
    for (const setting of settings) {
      if (setting.is_available && requestedTime >= setting.start_time && requestedTime < setting.end_time) {
        return true
      }
      if (!setting.is_available && requestedTime >= setting.start_time && requestedTime < setting.end_time) {
        return false
      }
    }

    // If no settings found, fall back to original logic
    if (settings.length === 0) {
      return validateBusinessHoursFallback(date, time)
    }

    // If no matching setting found, assume not available
    return false

  } catch (error) {
    console.error('Error validating business hours:', error)
    return validateBusinessHoursFallback(date, time)
  }
}

// Fallback business hours validation (original hardcoded logic)
function validateBusinessHoursFallback(date: string, time: string): boolean {
  const scheduleDate = new Date(date)
  const dayOfWeek = scheduleDate.getDay()

  const [timeStr, period] = time.split(' ')
  const [hours, minutes] = timeStr.split(':').map(Number)
  let hour24 = hours
  if (period === 'PM' && hours !== 12) hour24 += 12
  if (period === 'AM' && hours === 12) hour24 = 0

  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

  if (isWeekend) {
    return hour24 >= 9 && hour24 <= 16
  } else {
    return hour24 >= 15 && hour24 <= 17
  }
}

// Export the enhanced functions to replace the original ones
export {
  validateBusinessHours as validateBusinessHoursDatabase,
  getAvailableSlots as getAvailableSlotsDatabase
}