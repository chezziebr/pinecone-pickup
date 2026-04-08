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
  notes?: string
  reminders_opted_in: boolean
  google_event_id?: string | null
}