// Shared type definitions for availability settings

export interface AvailabilitySetting {
  id: string
  day_of_week: number // 0 = Sunday, 6 = Saturday
  start_time: string // HH:MM:SS format (24-hour)
  end_time: string // HH:MM:SS format (24-hour)
  is_available: boolean
  slot_interval_minutes: number
  description: string | null
  created_at: string
  updated_at: string
}

export interface AvailabilityException {
  id: string
  specific_date: string // YYYY-MM-DD format
  start_time: string | null // HH:MM:SS format (24-hour), null means full day
  end_time: string | null // HH:MM:SS format (24-hour), null means full day
  is_available: boolean
  reason: string | null
  override_type: 'blackout' | 'special_hours' | 'holiday'
  created_at: string
  updated_at: string
}

export interface CreateAvailabilitySettingRequest {
  day_of_week: number
  start_time: string // Format: "HH:MM" in 24-hour format
  end_time: string // Format: "HH:MM" in 24-hour format
  is_available: boolean
  slot_interval_minutes?: number
  description?: string
}

export interface CreateAvailabilityExceptionRequest {
  specific_date: string // Format: "YYYY-MM-DD"
  start_time?: string // Format: "HH:MM" in 24-hour format, optional for full day
  end_time?: string // Format: "HH:MM" in 24-hour format, optional for full day
  is_available: boolean
  reason?: string
  override_type: 'blackout' | 'special_hours' | 'holiday'
}

export interface UpdateAvailabilitySettingRequest extends Partial<CreateAvailabilitySettingRequest> {}
export interface UpdateAvailabilityExceptionRequest extends Partial<CreateAvailabilityExceptionRequest> {}

// Time conversion utilities
export function convertTo24Hour(time12h: string): string {
  const [time, period] = time12h.split(' ')
  const [hours, minutes] = time.split(':').map(Number)
  let hour24 = hours

  if (period === 'PM' && hours !== 12) hour24 += 12
  if (period === 'AM' && hours === 12) hour24 = 0

  return `${hour24.toString().padStart(2, '0')}:${(minutes || 0).toString().padStart(2, '0')}:00`
}

export function convertTo12Hour(time24h: string): string {
  const [hours, minutes] = time24h.split(':').map(Number)
  const hour12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours
  const period = hours >= 12 ? 'PM' : 'AM'

  return `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`
}

export function getDayName(dayOfWeek: number): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  return days[dayOfWeek] || 'Unknown'
}