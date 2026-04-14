// Enhanced availability engine that integrates database settings with Google Calendar
import { supabaseAdmin } from './supabase'
import { google } from 'googleapis'
import { AvailabilitySetting, AvailabilityException, convertTo12Hour } from './types'

// Default buffer in minutes (used if no setting found in DB)
const DEFAULT_BUFFER_MINUTES = 15

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

// Fetch the configured buffer time from the database
async function getBufferMinutes(): Promise<number> {
  try {
    const { data, error } = await supabaseAdmin
      .from('business_settings')
      .select('value')
      .eq('key', 'calendar_buffer_minutes')
      .single()

    if (error || !data) return DEFAULT_BUFFER_MINUTES
    return parseInt(data.value) || DEFAULT_BUFFER_MINUTES
  } catch {
    return DEFAULT_BUFFER_MINUTES
  }
}

// Check if a booking conflicts with existing Google Calendar events
function hasGoogleCalendarConflict(
  slotStart: Date,
  slotEnd: Date,
  existingEvents: any[],
  bufferMinutes: number
): boolean {
  const bufferMs = bufferMinutes * 60 * 1000

  return existingEvents.some(event => {
    // Handle all-day events (they have .date instead of .dateTime)
    if (event.start?.date && !event.start?.dateTime) {
      // All-day event blocks the entire day
      return true
    }

    if (!event.start?.dateTime || !event.end?.dateTime) return false

    const eventStart = new Date(event.start.dateTime)
    const eventEnd = new Date(event.end.dateTime)

    // Expand the event window by the buffer on both sides
    const bufferedEventStart = new Date(eventStart.getTime() - bufferMs)
    const bufferedEventEnd = new Date(eventEnd.getTime() + bufferMs)

    // Check if the slot overlaps with the buffered event window
    return slotStart < bufferedEventEnd && slotEnd > bufferedEventStart
  })
}

// Seasonal hours type
interface SeasonalHours {
  id: string
  name: string
  start_date: string
  end_date: string
  day_of_week: number
  start_time: string
  end_time: string
  is_active: boolean
  priority: number
}

// Get all availability settings and exceptions for a specific date
export async function getAvailabilityData(date: string): Promise<{
  settings: AvailabilitySetting[]
  exceptions: AvailabilityException[]
  googleEvents: any[]
  seasonalHours: SeasonalHours[]
}> {
  const dayOfWeek = new Date(date).getDay()

  // Get database settings, exceptions, and seasonal hours
  const [settingsResult, exceptionsResult, seasonalResult] = await Promise.all([
    supabaseAdmin
      .from('availability_settings')
      .select('*')
      .eq('day_of_week', dayOfWeek)
      .order('start_time'),

    supabaseAdmin
      .from('availability_exceptions')
      .select('*')
      .eq('specific_date', date),

    supabaseAdmin
      .from('seasonal_hours')
      .select('*')
      .eq('day_of_week', dayOfWeek)
      .eq('is_active', true)
      .lte('start_date', date)
      .gte('end_date', date)
      .order('priority', { ascending: false })
  ])

  if (settingsResult.error) {
    console.error('Error fetching availability settings:', settingsResult.error)
    throw new Error('Failed to fetch availability settings')
  }

  if (exceptionsResult.error) {
    console.error('Error fetching availability exceptions:', exceptionsResult.error)
    throw new Error('Failed to fetch availability exceptions')
  }

  // Seasonal hours table may not exist yet — gracefully handle
  if (seasonalResult.error) {
    console.warn('Seasonal hours table not available:', seasonalResult.error.message)
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
    googleEvents,
    seasonalHours: seasonalResult.data || []
  }
}

// Generate available time slots for a specific date
// LAYERED AVAILABILITY SYSTEM:
//   Layer 1 (Base): Seasonal hours define operating hours (when you're "open")
//   Layer 2 (Subtract): Weekly blockouts remove time from base hours (school, work, etc.)
//   Layer 3 (Override): Date exceptions override everything for specific dates
//   Layer 4 (Subtract): Google Calendar events remove conflicting slots
//   Result: What remains = what customers can book
export async function getAvailableSlots(date: string): Promise<string[]> {
  try {
    const { settings, exceptions, googleEvents, seasonalHours } = await getAvailabilityData(date)

    // LAYER 3: Date exceptions override everything for specific dates
    if (exceptions.length > 0) {
      // Check if any exception fully blocks this date
      const fullDayBlock = exceptions.find(e => !e.is_available && !e.start_time && !e.end_time)
      if (fullDayBlock) {
        return [] // Entire day is blocked (holiday, vacation, etc.)
      }

      // If there are "available" exceptions (special hours), use those exclusively
      const availableExceptions = exceptions.filter(e => e.is_available)
      if (availableExceptions.length > 0) {
        return await processExceptionsAvailability(date, exceptions, googleEvents)
      }

      // If there are only partial blockout exceptions, they'll be applied as subtractions below
    }

    // LAYER 1: Start with base operating hours
    let baseSlots: string[] = []

    if (seasonalHours.length > 0) {
      // Seasonal hours are the base operating hours
      for (const hours of seasonalHours) {
        const slots = generateSlotsWithInterval(hours.start_time, hours.end_time, 60)
        baseSlots.push(...slots)
      }
    } else {
      // No seasonal hours defined — check for "available" weekly settings as fallback
      const availableSettings = settings.filter(s => s.is_available)
      if (availableSettings.length > 0) {
        for (const setting of availableSettings) {
          const slots = generateSlotsWithInterval(
            setting.start_time,
            setting.end_time,
            setting.slot_interval_minutes
          )
          baseSlots.push(...slots)
        }
      } else {
        // No seasonal hours AND no available weekly settings — use hardcoded fallback
        return getFallbackAvailableSlots(date)
      }
    }

    if (baseSlots.length === 0) {
      return []
    }

    // LAYER 2: Subtract weekly blockouts (settings with is_available = false)
    const blockouts = settings.filter(s => !s.is_available)
    if (blockouts.length > 0) {
      baseSlots = subtractBlockouts(baseSlots, blockouts)
    }

    // Also subtract partial date-exception blockouts (ones with specific time ranges)
    const partialBlockExceptions = exceptions.filter(e => !e.is_available && e.start_time && e.end_time)
    if (partialBlockExceptions.length > 0) {
      baseSlots = subtractExceptionBlockouts(baseSlots, partialBlockExceptions)
    }

    if (baseSlots.length === 0) {
      return []
    }

    // LAYER 4: Google Calendar events remove conflicting slots
    return await filterGoogleCalendarConflicts(date, baseSlots, googleEvents)
  } catch (error) {
    console.error('Error getting available slots:', error)

    // Fallback to original hardcoded logic if database is unavailable
    return getFallbackAvailableSlots(date)
  }
}

// Remove slots that fall within weekly blockout periods
function subtractBlockouts(slots: string[], blockouts: AvailabilitySetting[]): string[] {
  return slots.filter(slot => {
    const slotTime24 = slotTo24Hour(slot)
    for (const blockout of blockouts) {
      // Check if slot time falls within the blockout range
      if (slotTime24 >= blockout.start_time.slice(0, 5) && slotTime24 < blockout.end_time.slice(0, 5)) {
        return false // Blocked
      }
    }
    return true
  })
}

// Remove slots that fall within date-exception blockout periods
function subtractExceptionBlockouts(slots: string[], exceptions: AvailabilityException[]): string[] {
  return slots.filter(slot => {
    const slotTime24 = slotTo24Hour(slot)
    for (const exc of exceptions) {
      if (exc.start_time && exc.end_time) {
        if (slotTime24 >= exc.start_time.slice(0, 5) && slotTime24 < exc.end_time.slice(0, 5)) {
          return false // Blocked
        }
      }
    }
    return true
  })
}

// Convert a 12-hour slot string (e.g. "3:00 PM") to "HH:MM" 24-hour format
function slotTo24Hour(slot: string): string {
  const [timeStr, period] = slot.split(' ')
  const [hours, minutes] = timeStr.split(':').map(Number)
  let hour24 = hours
  if (period === 'PM' && hours !== 12) hour24 += 12
  if (period === 'AM' && hours === 12) hour24 = 0
  return `${hour24.toString().padStart(2, '0')}:${(minutes || 0).toString().padStart(2, '0')}`
}

// Process availability based on date-specific exceptions
async function processExceptionsAvailability(
  date: string,
  exceptions: AvailabilityException[],
  googleEvents: any[]
): Promise<string[]> {
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
  return await filterGoogleCalendarConflicts(date, availableSlots, googleEvents)
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
async function filterGoogleCalendarConflicts(
  date: string,
  slots: string[],
  googleEvents: any[]
): Promise<string[]> {
  const bufferMinutes = await getBufferMinutes()

  return slots.filter(slot => {
    // Convert slot time to Date object
    const [timeStr, period] = slot.split(' ')
    const [hours, minutes] = timeStr.split(':').map(Number)
    let hour24 = hours

    if (period === 'PM' && hours !== 12) hour24 += 12
    if (period === 'AM' && hours === 12) hour24 = 0

    // Use explicit timezone-aware date construction
    const slotStart = new Date(`${date}T${hour24.toString().padStart(2, '0')}:${(minutes || 0).toString().padStart(2, '0')}:00-07:00`)

    // Assume 90 minutes duration for service (matching existing logic)
    const slotEnd = new Date(slotStart.getTime() + (90 * 60 * 1000))

    // Check if this slot conflicts with any Google Calendar events
    return !hasGoogleCalendarConflict(slotStart, slotEnd, googleEvents, bufferMinutes)
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

// Validate that a requested time is within available business hours
// Uses the same layered system as getAvailableSlots for consistency
export async function validateBusinessHours(date: string, time: string): Promise<boolean> {
  try {
    // Get all available slots (already applies the full layered system)
    const availableSlots = await getAvailableSlots(date)

    // Check if the requested time matches any available slot
    return availableSlots.includes(time)
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