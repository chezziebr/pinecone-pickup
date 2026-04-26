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

// Use the enhanced business hours validation from availability engine
export { validateBusinessHoursDatabase as validateBusinessHours } from './availability-engine'

import { pacificAddDays, pacificToday } from './time'

export function validateFutureDate(date: string): boolean {
  return date >= pacificToday()
}

export function validateReasonableAdvanceBooking(date: string): boolean {
  return date <= pacificAddDays(pacificToday(), 365)
}

export function isValidServiceForDate(date: string, service_type: string): boolean {
  // Business logic: All services available on all valid dates
  // Could be extended for seasonal restrictions
  return ['pickup_only', 'pickup_haul'].includes(service_type)
}

