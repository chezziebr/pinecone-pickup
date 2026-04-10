export type BookingData = {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string
  address: string
  lot_size: string
  service_type: 'pickup_only' | 'pickup_haul'
  price: number
  scheduled_date: string
  scheduled_time: string
  notes?: string | null
  reminders_opted_in: boolean
  google_event_id?: string | null
}

// Business logic validation functions
export function validateBusinessHours(date: string, time: string): boolean {
  const scheduleDate = new Date(date)
  const dayOfWeek = scheduleDate.getDay() // 0 = Sunday, 6 = Saturday

  // Parse time
  const [timeStr, period] = time.split(' ')
  const [hours, minutes] = timeStr.split(':').map(Number)
  let hour24 = hours
  if (period === 'PM' && hours !== 12) hour24 += 12
  if (period === 'AM' && hours === 12) hour24 = 0

  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

  if (isWeekend) {
    // Weekends: 9 AM - 4 PM
    return hour24 >= 9 && hour24 <= 16
  } else {
    // Weekdays: 3 PM - 5 PM
    return hour24 >= 15 && hour24 <= 17
  }
}

export function validateFutureDate(date: string): boolean {
  const scheduleDate = new Date(date)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return scheduleDate >= today
}

export function validateReasonableAdvanceBooking(date: string): boolean {
  const scheduleDate = new Date(date)
  const today = new Date()
  const maxAdvance = new Date(today.getTime() + (365 * 24 * 60 * 60 * 1000)) // 1 year

  return scheduleDate <= maxAdvance
}

export function isValidServiceForDate(date: string, service_type: string): boolean {
  // Business logic: All services available on all valid dates
  // Could be extended for seasonal restrictions
  return ['pickup_only', 'pickup_haul'].includes(service_type)
}

export function calculateServiceDuration(service_type: string, lot_size: string): number {
  // Base duration in minutes
  const baseDuration = service_type === 'pickup_only' ? 60 : 90

  // Lot size multipliers
  const sizeMultipliers: Record<string, number> = {
    '¼ acre': 1,
    '½ acre': 1.2,
    '¾ acre': 1.5,
    '1 acre+': 2
  }

  const multiplier = sizeMultipliers[lot_size] || 1
  return Math.ceil(baseDuration * multiplier)
}