// Display-formatting helpers (non-time). Time formatters live in lib/time.ts.

export function formatServiceType(serviceType: string): string {
  if (serviceType === 'pickup_only') return 'Pick Up Only'
  if (serviceType === 'pickup_haul') return 'Pick Up + Haul Away'
  return serviceType
}
