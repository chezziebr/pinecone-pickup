// Comprehensive input validation utilities

import { pacificAddDays, pacificToday } from './time'

export interface BookingData {
  first_name: string
  last_name: string
  email: string
  phone: string
  address: string
  lot_size: string
  service_type: string
  scheduled_date: string
  scheduled_time: string
  notes?: string
  reminders_opted_in?: boolean
  waiver_accepted_at: string
}

export interface ValidationResult<T = any> {
  isValid: boolean
  errors: Record<string, string>
  sanitizedData?: Partial<T>
}

// Validation patterns
const PATTERNS = {
  EMAIL: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  PHONE: /^[\+]?[(]?[\d\s\-\(\)\.]{10,20}$/,
  NAME: /^[a-zA-Z\s\-'\.]{1,50}$/,
  DATE: /^\d{4}-\d{2}-\d{2}$/,
  TIME: /^(1[0-2]|[1-9]):[0-5]\d\s?(AM|PM)$/,
  UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  ISO_TIMESTAMP: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/
}

const ALLOWED_VALUES = {
  LOT_SIZES: ['¼ acre', '½ acre', '¾ acre', '1 acre+'],
  SERVICE_TYPES: ['pickup_only', 'pickup_haul'],
  STATUSES: ['confirmed', 'completed', 'pending', 'cancelled']
}

// Sanitization functions
function sanitizeString(input: any, maxLength: number = 255): string {
  if (typeof input !== 'string') return ''
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove potential XSS characters
    .substring(0, maxLength)
}

function sanitizeEmail(input: any): string {
  const email = sanitizeString(input, 254).toLowerCase()
  return email.replace(/[^\w@.-]/g, '') // Remove special chars except email valid ones
}

function sanitizePhone(input: any): string {
  const phone = sanitizeString(input, 20)
  return phone.replace(/[^\d\s\-\(\)\+\.]/g, '') // Keep only phone-valid characters
}

function sanitizeName(input: any): string {
  const name = sanitizeString(input, 50)
  return name.replace(/[^a-zA-Z\s\-'\.]/g, '') // Keep only name-valid characters
}

function sanitizeAddress(input: any): string {
  const address = sanitizeString(input, 200)
  return address.replace(/[<>]/g, '') // Basic XSS prevention
}

// Main validation functions
export function validateBookingData(data: any): ValidationResult<BookingData> {
  const errors: Record<string, string> = {}
  const sanitized: Partial<BookingData> = {}

  // First name validation
  if (!data.first_name || typeof data.first_name !== 'string') {
    errors.first_name = 'First name is required'
  } else {
    const sanitizedFirstName = sanitizeName(data.first_name)
    if (!PATTERNS.NAME.test(sanitizedFirstName)) {
      errors.first_name = 'First name contains invalid characters'
    } else if (sanitizedFirstName.length < 1) {
      errors.first_name = 'First name is required'
    } else {
      sanitized.first_name = sanitizedFirstName
    }
  }

  // Last name validation
  if (!data.last_name || typeof data.last_name !== 'string') {
    errors.last_name = 'Last name is required'
  } else {
    const sanitizedLastName = sanitizeName(data.last_name)
    if (!PATTERNS.NAME.test(sanitizedLastName)) {
      errors.last_name = 'Last name contains invalid characters'
    } else if (sanitizedLastName.length < 1) {
      errors.last_name = 'Last name is required'
    } else {
      sanitized.last_name = sanitizedLastName
    }
  }

  // Email validation
  if (!data.email || typeof data.email !== 'string') {
    errors.email = 'Email is required'
  } else {
    const sanitizedEmail = sanitizeEmail(data.email)
    if (!PATTERNS.EMAIL.test(sanitizedEmail)) {
      errors.email = 'Please enter a valid email address'
    } else {
      sanitized.email = sanitizedEmail
    }
  }

  // Phone validation
  if (!data.phone || typeof data.phone !== 'string') {
    errors.phone = 'Phone number is required'
  } else {
    const sanitizedPhone = sanitizePhone(data.phone)
    if (!PATTERNS.PHONE.test(sanitizedPhone)) {
      errors.phone = 'Please enter a valid phone number'
    } else {
      sanitized.phone = sanitizedPhone
    }
  }

  // Address validation
  if (!data.address || typeof data.address !== 'string') {
    errors.address = 'Address is required'
  } else {
    const sanitizedAddress = sanitizeAddress(data.address)
    if (sanitizedAddress.length < 5) {
      errors.address = 'Please enter a complete address'
    } else {
      sanitized.address = sanitizedAddress
    }
  }

  // Lot size validation
  if (!data.lot_size || !ALLOWED_VALUES.LOT_SIZES.includes(data.lot_size)) {
    errors.lot_size = 'Please select a valid lot size'
  } else {
    sanitized.lot_size = data.lot_size
  }

  // Service type validation
  if (!data.service_type || !ALLOWED_VALUES.SERVICE_TYPES.includes(data.service_type)) {
    errors.service_type = 'Please select a valid service type'
  } else {
    sanitized.service_type = data.service_type
  }

  // Date validation
  if (!data.scheduled_date || typeof data.scheduled_date !== 'string') {
    errors.scheduled_date = 'Scheduled date is required'
  } else if (!PATTERNS.DATE.test(data.scheduled_date)) {
    errors.scheduled_date = 'Please enter a valid date (YYYY-MM-DD)'
  } else {
    const todayStr = pacificToday()
    const oneYearOutStr = pacificAddDays(todayStr, 365)

    if (data.scheduled_date < todayStr) {
      errors.scheduled_date = 'Cannot schedule bookings in the past'
    } else if (data.scheduled_date > oneYearOutStr) {
      errors.scheduled_date = 'Cannot schedule bookings more than 1 year in advance'
    } else {
      sanitized.scheduled_date = data.scheduled_date
    }
  }

  // Time validation
  if (!data.scheduled_time || typeof data.scheduled_time !== 'string') {
    errors.scheduled_time = 'Scheduled time is required'
  } else if (!PATTERNS.TIME.test(data.scheduled_time)) {
    errors.scheduled_time = 'Please enter a valid time (e.g., "3:00 PM")'
  } else {
    sanitized.scheduled_time = data.scheduled_time
  }

  // Notes validation (optional)
  if (data.notes !== undefined) {
    if (typeof data.notes !== 'string') {
      errors.notes = 'Notes must be text'
    } else {
      const sanitizedNotes = sanitizeString(data.notes, 500)
      sanitized.notes = sanitizedNotes.length > 0 ? sanitizedNotes : undefined
    }
  }

  // Reminders opt-in validation (optional)
  if (data.reminders_opted_in !== undefined) {
    sanitized.reminders_opted_in = Boolean(data.reminders_opted_in)
  }

  // Waiver acceptance validation (required)
  if (!data.waiver_accepted_at || typeof data.waiver_accepted_at !== 'string') {
    errors.waiver_accepted_at = 'Liability waiver must be accepted to book'
  } else if (!PATTERNS.ISO_TIMESTAMP.test(data.waiver_accepted_at) || isNaN(Date.parse(data.waiver_accepted_at))) {
    errors.waiver_accepted_at = 'Invalid waiver acceptance timestamp'
  } else {
    sanitized.waiver_accepted_at = data.waiver_accepted_at
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    sanitizedData: sanitized
  }
}

export interface ReviewData {
  bookingId: string
  rating: number
  comment?: string
  neighborhood?: string
}

export function validateReviewData(data: any): ValidationResult<ReviewData> {
  const errors: Record<string, string> = {}
  const sanitized: Partial<ReviewData> = {}

  // Booking ID validation
  if (!data.bookingId || typeof data.bookingId !== 'string') {
    errors.bookingId = 'Booking ID is required'
  } else if (!PATTERNS.UUID.test(data.bookingId)) {
    errors.bookingId = 'Invalid booking ID format'
  } else {
    sanitized.bookingId = data.bookingId
  }

  // Rating validation
  if (data.rating === undefined || data.rating === null) {
    errors.rating = 'Rating is required'
  } else if (!Number.isInteger(data.rating) || data.rating < 1 || data.rating > 5) {
    errors.rating = 'Rating must be an integer between 1 and 5'
  } else {
    sanitized.rating = data.rating
  }

  // Comment validation (optional)
  if (data.comment !== undefined) {
    if (typeof data.comment !== 'string') {
      errors.comment = 'Comment must be text'
    } else {
      const sanitizedComment = sanitizeString(data.comment, 1000)
      sanitized.comment = sanitizedComment.length > 0 ? sanitizedComment : undefined
    }
  }

  // Neighborhood validation (optional)
  if (data.neighborhood !== undefined) {
    if (typeof data.neighborhood !== 'string') {
      errors.neighborhood = 'Neighborhood must be text'
    } else {
      const sanitizedNeighborhood = sanitizeString(data.neighborhood, 100)
      sanitized.neighborhood = sanitizedNeighborhood.length > 0 ? sanitizedNeighborhood : undefined
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    sanitizedData: sanitized
  }
}

export interface AdminBookingUpdate {
  id: string
  status?: string
  notes?: string
}

export function validateAdminBookingUpdate(data: any): ValidationResult<AdminBookingUpdate> {
  const errors: Record<string, string> = {}
  const sanitized: Partial<AdminBookingUpdate> = {}

  // ID validation
  if (!data.id || typeof data.id !== 'string') {
    errors.id = 'Booking ID is required'
  } else if (!PATTERNS.UUID.test(data.id)) {
    errors.id = 'Invalid booking ID format'
  } else {
    sanitized.id = data.id
  }

  // Status validation (optional)
  if (data.status !== undefined) {
    if (!ALLOWED_VALUES.STATUSES.includes(data.status)) {
      errors.status = 'Invalid status value'
    } else {
      sanitized.status = data.status
    }
  }

  // Notes validation (optional)
  if (data.notes !== undefined) {
    if (typeof data.notes !== 'string') {
      errors.notes = 'Notes must be text'
    } else {
      const sanitizedNotes = sanitizeString(data.notes, 500)
      sanitized.notes = sanitizedNotes
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    sanitizedData: sanitized
  }
}