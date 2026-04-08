'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface AvailabilityResponse {
  dates?: string[]
  slots?: string[]
}

export default function BookingForm() {
  const router = useRouter()
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [availableDates, setAvailableDates] = useState<string[]>([])
  const [availableSlots, setAvailableSlots] = useState<string[]>([])
  const [loadingDates, setLoadingDates] = useState(false)
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Form state
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    address: '',
    lot_size: '',
    service_type: '',
    scheduled_date: '',
    scheduled_time: '',
    notes: '',
    reminders_opted_in: true
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  // Fetch available dates for the current month
  const fetchAvailableDates = async (date: Date) => {
    setLoadingDates(true)
    try {
      const monthStr = date.toISOString().slice(0, 7) // YYYY-MM format
      const response = await fetch(`/api/availability?month=${monthStr}`)
      const data: AvailabilityResponse = await response.json()
      setAvailableDates(data.dates || [])
    } catch (error) {
      console.error('Error fetching available dates:', error)
      setAvailableDates([])
    }
    setLoadingDates(false)
  }

  // Fetch available slots for selected date
  const fetchAvailableSlots = async (date: string) => {
    setLoadingSlots(true)
    try {
      const response = await fetch(`/api/availability?date=${date}`)
      const data: AvailabilityResponse = await response.json()
      setAvailableSlots(data.slots || [])
    } catch (error) {
      console.error('Error fetching available slots:', error)
      setAvailableSlots([])
    }
    setLoadingSlots(false)
  }

  // Load dates when component mounts or month changes
  useEffect(() => {
    fetchAvailableDates(currentMonth)
  }, [currentMonth])

  // Handle date selection
  const handleDateSelect = (date: string) => {
    setFormData(prev => ({ ...prev, scheduled_date: date, scheduled_time: '' }))
    setAvailableSlots([])
    fetchAvailableSlots(date)
    setErrors(prev => ({ ...prev, scheduled_date: '', scheduled_time: '' }))
  }

  // Handle time slot selection
  const handleTimeSelect = (time: string) => {
    setFormData(prev => ({ ...prev, scheduled_time: time }))
    setErrors(prev => ({ ...prev, scheduled_time: '' }))
  }

  // Navigate to previous/next month
  const navigateMonth = (direction: 'prev' | 'next') => {
    const newMonth = new Date(currentMonth)
    newMonth.setMonth(currentMonth.getMonth() + (direction === 'next' ? 1 : -1))
    setCurrentMonth(newMonth)
    setFormData(prev => ({ ...prev, scheduled_date: '', scheduled_time: '' }))
    setAvailableSlots([])
    fetchAvailableDates(newMonth)
  }

  // Generate calendar days
  const generateCalendarDays = () => {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const startDate = new Date(firstDay)
    startDate.setDate(startDate.getDate() - firstDay.getDay())

    const days = []
    const today = new Date().toISOString().split('T')[0]

    for (let i = 0; i < 42; i++) {
      const date = new Date(startDate)
      date.setDate(startDate.getDate() + i)
      const dateStr = date.toISOString().split('T')[0]
      const isCurrentMonth = date.getMonth() === month
      const isPast = dateStr < today
      const isAvailable = availableDates.includes(dateStr)
      const isSelected = formData.scheduled_date === dateStr

      days.push({
        date: date.getDate(),
        dateStr,
        isCurrentMonth,
        isPast,
        isAvailable: isCurrentMonth && !isPast && isAvailable,
        isSelected
      })
    }

    return days
  }

  // Handle form input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    const newValue = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value

    setFormData(prev => ({ ...prev, [name]: newValue }))
    setErrors(prev => ({ ...prev, [name]: '' }))
  }

  // Validate form
  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!formData.first_name) newErrors.first_name = 'First name is required'
    if (!formData.last_name) newErrors.last_name = 'Last name is required'
    if (!formData.email) newErrors.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) newErrors.email = 'Invalid email format'
    if (!formData.phone) newErrors.phone = 'Phone number is required'
    if (!formData.address) newErrors.address = 'Address is required'
    if (!formData.lot_size) newErrors.lot_size = 'Lot size is required'
    if (!formData.service_type) newErrors.service_type = 'Service type is required'
    if (!formData.scheduled_date) newErrors.scheduled_date = 'Date is required'
    if (!formData.scheduled_time) newErrors.scheduled_time = 'Time is required'

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch('/api/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      const result = await response.json()

      if (response.ok) {
        // Redirect to success page
        const params = new URLSearchParams({
          name: formData.first_name,
          date: formData.scheduled_date,
          time: formData.scheduled_time,
          service: formData.service_type === 'pickup_only' ? 'Pick Up Only' : 'Pick Up + Haul Away',
          address: formData.address
        })
        router.push(`/booking/success?${params}`)
      } else {
        if (response.status === 409) {
          setErrors({ scheduled_time: 'This time slot is no longer available. Please select another time.' })
          fetchAvailableSlots(formData.scheduled_date)
        } else {
          setErrors({ general: result.error || 'Something went wrong. Please try again.' })
        }
      }
    } catch (error) {
      console.error('Booking error:', error)
      setErrors({ general: 'Network error. Please check your connection and try again.' })
    }
    setSubmitting(false)
  }

  const monthName = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const days = generateCalendarDays()

  return (
    <section id="booking" className="py-20 px-4 bg-pine-light">
      <div className="max-w-4xl mx-auto">
        {/* Section header */}
        <div className="text-center mb-12">
          <div className="inline-block bg-orange/10 text-orange px-4 py-2 rounded-full text-base font-medium mb-4">
            Book your pick up
          </div>
          <h2 className="text-3xl md:text-4xl font-fraunces font-bold text-pine mb-4">
            Schedule your crew.
          </h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Pick a time that works for you. You'll get instant confirmation and reminders.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-8 shadow-lg">
          {/* General error */}
          {errors.general && (
            <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6">
              {errors.general}
            </div>
          )}

          {/* Personal Info */}
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                First Name *
              </label>
              <input
                type="text"
                name="first_name"
                value={formData.first_name}
                onChange={handleInputChange}
                className={`w-full p-3 border rounded-lg ${errors.first_name ? 'border-red-500' : 'border-gray-300'}`}
              />
              {errors.first_name && <p className="text-red-500 text-sm mt-1">{errors.first_name}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Last Name *
              </label>
              <input
                type="text"
                name="last_name"
                value={formData.last_name}
                onChange={handleInputChange}
                className={`w-full p-3 border rounded-lg ${errors.last_name ? 'border-red-500' : 'border-gray-300'}`}
              />
              {errors.last_name && <p className="text-red-500 text-sm mt-1">{errors.last_name}</p>}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6 mb-8">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email *
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                className={`w-full p-3 border rounded-lg ${errors.email ? 'border-red-500' : 'border-gray-300'}`}
              />
              {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Phone *
              </label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleInputChange}
                className={`w-full p-3 border rounded-lg ${errors.phone ? 'border-red-500' : 'border-gray-300'}`}
              />
              {errors.phone && <p className="text-red-500 text-sm mt-1">{errors.phone}</p>}
            </div>
          </div>

          {/* Address */}
          <div className="mb-8">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Service Address *
            </label>
            <input
              type="text"
              name="address"
              value={formData.address}
              onChange={handleInputChange}
              placeholder="123 Pine Street, Bend, OR 97701"
              className={`w-full p-3 border rounded-lg ${errors.address ? 'border-red-500' : 'border-gray-300'}`}
            />
            {errors.address && <p className="text-red-500 text-sm mt-1">{errors.address}</p>}
          </div>

          {/* Lot Size & Service Type */}
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Lot Size *
              </label>
              <select
                name="lot_size"
                value={formData.lot_size}
                onChange={handleInputChange}
                className={`w-full p-3 border rounded-lg ${errors.lot_size ? 'border-red-500' : 'border-gray-300'}`}
              >
                <option value="">Select lot size</option>
                <option value="¼ acre">¼ acre</option>
                <option value="½ acre">½ acre</option>
                <option value="¾ acre">¾ acre</option>
                <option value="1 acre+">1 acre+</option>
              </select>
              {errors.lot_size && <p className="text-red-500 text-sm mt-1">{errors.lot_size}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Service Type *
              </label>
              <select
                name="service_type"
                value={formData.service_type}
                onChange={handleInputChange}
                className={`w-full p-3 border rounded-lg ${errors.service_type ? 'border-red-500' : 'border-gray-300'}`}
              >
                <option value="">Select service</option>
                <option value="pickup_only">Pick Up Only ($20)</option>
                <option value="pickup_haul">Pick Up + Haul Away ($40)</option>
              </select>
              {errors.service_type && <p className="text-red-500 text-sm mt-1">{errors.service_type}</p>}
            </div>
          </div>

          {/* Calendar */}
          <div className="mb-8">
            <label className="block text-sm font-medium text-gray-700 mb-4">
              Select Date *
            </label>

            {/* Month navigation */}
            <div className="flex justify-between items-center mb-4">
              <button
                type="button"
                onClick={() => navigateMonth('prev')}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                ←
              </button>
              <h3 className="font-semibold text-lg">{monthName}</h3>
              <button
                type="button"
                onClick={() => navigateMonth('next')}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                →
              </button>
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1 mb-4">
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
                <div key={day} className="p-2 text-center text-sm font-medium text-gray-500">
                  {day}
                </div>
              ))}
              {loadingDates ? (
                <div className="col-span-7 p-8 text-center text-gray-500">
                  Loading available dates...
                </div>
              ) : (
                days.map((day, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => day.isAvailable ? handleDateSelect(day.dateStr) : undefined}
                    disabled={!day.isAvailable}
                    className={`p-2 text-sm rounded ${
                      day.isSelected
                        ? 'bg-pine text-white'
                        : day.isAvailable
                        ? 'bg-pine-light text-pine hover:bg-pine hover:text-white'
                        : 'text-gray-300 cursor-not-allowed'
                    } ${!day.isCurrentMonth ? 'opacity-30' : ''}`}
                  >
                    {day.date}
                  </button>
                ))
              )}
            </div>
            {errors.scheduled_date && <p className="text-red-500 text-sm">{errors.scheduled_date}</p>}
          </div>

          {/* Time Slots */}
          {formData.scheduled_date && (
            <div className="mb-8">
              <label className="block text-sm font-medium text-gray-700 mb-4">
                Select Time *
              </label>
              {loadingSlots ? (
                <div className="p-8 text-center text-gray-500">
                  Loading available times...
                </div>
              ) : availableSlots.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  No available time slots for this date.
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {availableSlots.map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => handleTimeSelect(slot)}
                      className={`p-3 text-sm rounded-lg border-2 ${
                        formData.scheduled_time === slot
                          ? 'bg-orange text-white border-orange'
                          : 'bg-pine-light text-pine border-pine-light hover:border-pine'
                      }`}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              )}
              {errors.scheduled_time && <p className="text-red-500 text-sm mt-2">{errors.scheduled_time}</p>}
            </div>
          )}

          {/* Notes */}
          <div className="mb-8">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Additional Notes (optional)
            </label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleInputChange}
              rows={3}
              placeholder="Any special instructions or details we should know?"
              className="w-full p-3 border border-gray-300 rounded-lg"
            />
          </div>

          {/* Reminders */}
          <div className="mb-8">
            <label className="flex items-center">
              <input
                type="checkbox"
                name="reminders_opted_in"
                checked={formData.reminders_opted_in}
                onChange={handleInputChange}
                className="mr-3"
              />
              <span className="text-sm text-gray-700">
                Send me a reminder the day before and 1 hour before my pick up
              </span>
            </label>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-orange hover:bg-orange/90 disabled:bg-orange/50 text-white p-4 rounded-full font-medium text-lg transition-colors"
          >
            {submitting ? 'Confirming Booking...' : 'Confirm Booking →'}
          </button>
        </form>
      </div>
    </section>
  )
}