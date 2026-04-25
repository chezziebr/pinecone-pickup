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