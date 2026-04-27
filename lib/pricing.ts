export const PICKUP_BASE_PER_UNIT = 20
export const HAUL_AWAY_FEE = 20

export const LOT_SIZE_UNITS: Record<string, number> = {
  '¼ acre': 1,
  '½ acre': 2,
  '¾ acre': 3,
  '1 acre+': 3, // default; 1+ is manual-review territory (deferred workflow)
}

export function calculateBookingPrice(lot_size: string, service_type: string): number {
  const units = LOT_SIZE_UNITS[lot_size] ?? 0
  const baseTotal = units * PICKUP_BASE_PER_UNIT
  const haul = service_type === 'pickup_haul' ? HAUL_AWAY_FEE : 0
  return baseTotal + haul
}
