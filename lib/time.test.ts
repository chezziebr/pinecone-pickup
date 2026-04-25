import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_BUSINESS_TIMEZONE,
  DEFAULT_SERVICE_DURATION_MINUTES,
  pacificAddDays,
  pacificDateAtSlot,
  pacificDayBounds,
  pacificToday,
} from './time'

afterEach(() => {
  vi.useRealTimers()
})

describe('DEFAULT constants', () => {
  it('exposes the expected defaults', () => {
    expect(DEFAULT_BUSINESS_TIMEZONE).toBe('America/Los_Angeles')
    expect(DEFAULT_SERVICE_DURATION_MINUTES).toBe(90)
  })
})

describe('pacificDateAtSlot', () => {
  it('resolves PDT dates correctly (2026-06-15 3:00 PM → 22:00 UTC)', () => {
    const d = pacificDateAtSlot('2026-06-15', '3:00 PM')
    expect(d.toISOString()).toBe('2026-06-15T22:00:00.000Z')
  })

  it('resolves PST dates correctly (2026-12-15 3:00 PM → 23:00 UTC)', () => {
    const d = pacificDateAtSlot('2026-12-15', '3:00 PM')
    expect(d.toISOString()).toBe('2026-12-15T23:00:00.000Z')
  })

  it('resolves AM/minute variants (2026-06-15 9:30 AM → 16:30 UTC)', () => {
    const d = pacificDateAtSlot('2026-06-15', '9:30 AM')
    expect(d.toISOString()).toBe('2026-06-15T16:30:00.000Z')
  })

  it('resolves 12 AM and 12 PM correctly', () => {
    expect(pacificDateAtSlot('2026-06-15', '12:00 AM').toISOString()).toBe(
      '2026-06-15T07:00:00.000Z',
    )
    expect(pacificDateAtSlot('2026-06-15', '12:00 PM').toISOString()).toBe(
      '2026-06-15T19:00:00.000Z',
    )
  })

  it('throws on malformed slot strings', () => {
    expect(() => pacificDateAtSlot('2026-06-15', '15:00')).toThrow(/Invalid slot/)
    expect(() => pacificDateAtSlot('2026-06-15', 'banana')).toThrow(/Invalid slot/)
  })
})

describe('pacificToday', () => {
  it('returns Pacific-local date when UTC has rolled over but Pacific has not', () => {
    // 06:00 UTC on 2026-06-16 = 23:00 PDT on 2026-06-15.
    // A naive `new Date().toISOString().split('T')[0]` would say 2026-06-16;
    // the Pacific calendar date is still 2026-06-15.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-16T06:00:00Z'))
    expect(pacificToday()).toBe('2026-06-15')
  })

  it('returns Pacific-local date when it has just rolled forward', () => {
    // 08:00 UTC on 2026-06-16 = 01:00 PDT on 2026-06-16.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-16T08:00:00Z'))
    expect(pacificToday()).toBe('2026-06-16')
  })
})

describe('pacificDayBounds', () => {
  it('returns half-open UTC bounds for a PDT day', () => {
    const { start, end } = pacificDayBounds('2026-06-15')
    expect(start.toISOString()).toBe('2026-06-15T07:00:00.000Z')
    expect(end.toISOString()).toBe('2026-06-16T07:00:00.000Z')
  })

  it('returns half-open UTC bounds for a PST day', () => {
    const { start, end } = pacificDayBounds('2026-12-15')
    expect(start.toISOString()).toBe('2026-12-15T08:00:00.000Z')
    expect(end.toISOString()).toBe('2026-12-16T08:00:00.000Z')
  })
})

describe('pacificAddDays', () => {
  it('adds days across month boundary', () => {
    expect(pacificAddDays('2026-06-30', 1)).toBe('2026-07-01')
  })

  it('adds days across year boundary', () => {
    expect(pacificAddDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('subtracts days', () => {
    expect(pacificAddDays('2026-06-01', -1)).toBe('2026-05-31')
  })

  it('is DST-safe (spring-forward day)', () => {
    // 2026-03-08 is the PDT transition in the US. Adding 1 day should land on
    // 2026-03-09 regardless of whether 24h-math would have pushed to 03-09 01:00.
    expect(pacificAddDays('2026-03-08', 1)).toBe('2026-03-09')
  })
})
