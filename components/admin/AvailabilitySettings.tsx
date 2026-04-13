'use client'

import { useState, useEffect } from 'react'
import {
  AvailabilitySetting,
  AvailabilityException,
  CreateAvailabilitySettingRequest,
  CreateAvailabilityExceptionRequest,
  getDayName,
  convertTo12Hour,
  convertTo24Hour
} from '@/lib/types'

interface AvailabilitySettingsProps {
  token: string
}

export default function AvailabilitySettings({ token }: AvailabilitySettingsProps) {
  const [settings, setSettings] = useState<AvailabilitySetting[]>([])
  const [exceptions, setExceptions] = useState<AvailabilityException[]>([])
  const [loading, setLoading] = useState(true)
  const [activeSubTab, setActiveSubTab] = useState('weekly')
  const [showAddSettingModal, setShowAddSettingModal] = useState(false)
  const [showAddExceptionModal, setShowAddExceptionModal] = useState(false)

  useEffect(() => {
    fetchData()
  }, [token])

  const fetchData = async () => {
    try {
      setLoading(true)

      const [settingsResponse, exceptionsResponse] = await Promise.all([
        fetch('/api/admin/availability-settings', {
          credentials: 'include',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }),
        fetch('/api/admin/availability-exceptions', {
          credentials: 'include',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        })
      ])

      if (settingsResponse.ok) {
        const settingsData = await settingsResponse.json()
        setSettings(settingsData.settings)
      }

      if (exceptionsResponse.ok) {
        const exceptionsData = await exceptionsResponse.json()
        setExceptions(exceptionsData.exceptions)
      }
    } catch (error) {
      console.error('Error fetching availability data:', error)
    } finally {
      setLoading(false)
    }
  }

  const deleteSetting = async (id: string) => {
    if (!confirm('Are you sure you want to delete this availability setting?')) return

    try {
      const response = await fetch(`/api/admin/availability-settings?id=${id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        setSettings(prev => prev.filter(s => s.id !== id))
      } else {
        alert('Failed to delete setting')
      }
    } catch (error) {
      console.error('Error deleting setting:', error)
      alert('Failed to delete setting')
    }
  }

  const deleteException = async (id: string) => {
    if (!confirm('Are you sure you want to delete this exception?')) return

    try {
      const response = await fetch(`/api/admin/availability-exceptions?id=${id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        setExceptions(prev => prev.filter(e => e.id !== id))
      } else {
        alert('Failed to delete exception')
      }
    } catch (error) {
      console.error('Error deleting exception:', error)
      alert('Failed to delete exception')
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="text-gray-500">Loading availability settings...</div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-medium text-gray-900">
          Availability Settings
        </h3>
        <div className="text-sm text-gray-600">
          Manage your weekly schedule and special exceptions
        </div>
      </div>

      {/* Sub Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex space-x-8">
          {[
            { id: 'weekly', label: 'Weekly Schedule', icon: '📅' },
            { id: 'exceptions', label: 'Special Dates', icon: '🚫' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeSubTab === tab.id
                  ? 'border-orange text-orange'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <span className="mr-2">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Weekly Schedule Tab */}
      {activeSubTab === 'weekly' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-gray-600">
              Set your regular weekly availability. Use this for school hours, work schedules, and other recurring time blocks.
            </p>
            <button
              onClick={() => setShowAddSettingModal(true)}
              className="bg-orange hover:bg-orange/90 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              + Add Time Block
            </button>
          </div>

          <WeeklyScheduleView settings={settings} onDelete={deleteSetting} />
        </div>
      )}

      {/* Special Dates Tab */}
      {activeSubTab === 'exceptions' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-gray-600">
              Override your regular schedule for specific dates (holidays, vacation, special events).
            </p>
            <button
              onClick={() => setShowAddExceptionModal(true)}
              className="bg-orange hover:bg-orange/90 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              + Add Exception
            </button>
          </div>

          <SpecialDatesView exceptions={exceptions} onDelete={deleteException} />
        </div>
      )}

      {/* Modals */}
      {showAddSettingModal && (
        <AddSettingModal
          token={token}
          onClose={() => setShowAddSettingModal(false)}
          onSuccess={() => {
            setShowAddSettingModal(false)
            fetchData()
          }}
        />
      )}

      {showAddExceptionModal && (
        <AddExceptionModal
          token={token}
          onClose={() => setShowAddExceptionModal(false)}
          onSuccess={() => {
            setShowAddExceptionModal(false)
            fetchData()
          }}
        />
      )}
    </div>
  )
}

// Weekly Schedule View Component
function WeeklyScheduleView({
  settings,
  onDelete
}: {
  settings: AvailabilitySetting[]
  onDelete: (id: string) => void
}) {
  // Group settings by day of week
  const settingsByDay = settings.reduce((acc, setting) => {
    if (!acc[setting.day_of_week]) {
      acc[setting.day_of_week] = []
    }
    acc[setting.day_of_week].push(setting)
    return acc
  }, {} as Record<number, AvailabilitySetting[]>)

  return (
    <div className="space-y-4">
      {[0, 1, 2, 3, 4, 5, 6].map(dayNum => (
        <div key={dayNum} className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium text-gray-900">{getDayName(dayNum)}</h4>
            <div className="text-sm text-gray-500">
              {settingsByDay[dayNum]?.length || 0} time blocks
            </div>
          </div>

          {settingsByDay[dayNum]?.length ? (
            <div className="space-y-2">
              {settingsByDay[dayNum].map(setting => (
                <div
                  key={setting.id}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    setting.is_available
                      ? 'border-green-200 bg-green-50'
                      : 'border-red-200 bg-red-50'
                  }`}
                >
                  <div className="flex items-center space-x-4">
                    <div className={`w-3 h-3 rounded-full ${
                      setting.is_available ? 'bg-green-500' : 'bg-red-500'
                    }`} />
                    <div>
                      <div className="font-medium">
                        {convertTo12Hour(setting.start_time)} - {convertTo12Hour(setting.end_time)}
                      </div>
                      {setting.description && (
                        <div className="text-sm text-gray-600">{setting.description}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      setting.is_available
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {setting.is_available ? 'Available' : 'Blocked'}
                    </span>
                    <button
                      onClick={() => onDelete(setting.id)}
                      className="text-red-600 hover:text-red-800 p-1"
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-gray-500 text-sm italic">No time blocks set for this day</div>
          )}
        </div>
      ))}
    </div>
  )
}

// Special Dates View Component
function SpecialDatesView({
  exceptions,
  onDelete
}: {
  exceptions: AvailabilityException[]
  onDelete: (id: string) => void
}) {
  const sortedExceptions = exceptions.sort((a, b) =>
    new Date(a.specific_date).getTime() - new Date(b.specific_date).getTime()
  )

  if (!sortedExceptions.length) {
    return (
      <div className="text-center py-8 text-gray-500">
        <div className="text-4xl mb-4">📅</div>
        <p>No special date exceptions set</p>
        <p className="text-sm mt-2">Add holidays, vacation days, or special availability here.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {sortedExceptions.map(exception => (
        <div
          key={exception.id}
          className={`flex items-center justify-between p-4 rounded-lg border ${
            exception.is_available
              ? 'border-blue-200 bg-blue-50'
              : 'border-red-200 bg-red-50'
          }`}
        >
          <div className="flex items-center space-x-4">
            <div className={`w-3 h-3 rounded-full ${
              exception.is_available ? 'bg-blue-500' : 'bg-red-500'
            }`} />
            <div>
              <div className="font-medium">
                {new Date(exception.specific_date).toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </div>
              {exception.start_time && exception.end_time && (
                <div className="text-sm text-gray-600">
                  {convertTo12Hour(exception.start_time)} - {convertTo12Hour(exception.end_time)}
                </div>
              )}
              {exception.reason && (
                <div className="text-sm text-gray-600">{exception.reason}</div>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <span className={`px-2 py-1 rounded text-xs font-medium ${
              exception.override_type === 'holiday' ? 'bg-purple-100 text-purple-800' :
              exception.override_type === 'blackout' ? 'bg-red-100 text-red-800' :
              'bg-blue-100 text-blue-800'
            }`}>
              {exception.override_type}
            </span>
            <span className={`px-2 py-1 rounded text-xs font-medium ${
              exception.is_available
                ? 'bg-green-100 text-green-800'
                : 'bg-red-100 text-red-800'
            }`}>
              {exception.is_available ? 'Available' : 'Blocked'}
            </span>
            <button
              onClick={() => onDelete(exception.id)}
              className="text-red-600 hover:text-red-800 p-1"
              title="Delete"
            >
              🗑️
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

// Add Setting Modal Component
function AddSettingModal({
  token,
  onClose,
  onSuccess
}: {
  token: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [formData, setFormData] = useState({
    start_time: '09:00',
    end_time: '15:00',
    is_available: false, // Default to blocked (like school hours)
    description: ''
  })
  const [selectedDays, setSelectedDays] = useState<number[]>([1]) // Default to Monday
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (selectedDays.length === 0) {
      alert('Please select at least one day')
      return
    }

    setSubmitting(true)

    try {
      // Create settings for each selected day
      const promises = selectedDays.map(day_of_week =>
        fetch('/api/admin/availability-settings', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            ...formData,
            day_of_week
          })
        })
      )

      const responses = await Promise.all(promises)

      // Check if all requests succeeded
      const errors = []
      for (let i = 0; i < responses.length; i++) {
        if (!responses[i].ok) {
          const error = await responses[i].json()
          const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][selectedDays[i]]
          errors.push(`${dayName}: ${error.error}`)
        }
      }

      if (errors.length === 0) {
        onSuccess()
      } else {
        alert(`Failed to create some settings:\n${errors.join('\n')}`)
        // Still call onSuccess to refresh the data in case some succeeded
        onSuccess()
      }
    } catch (error) {
      console.error('Error creating settings:', error)
      alert('Failed to create settings')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium">Add Time Block</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Days of Week
            </label>
            <p className="text-xs text-gray-500 mb-2">Select multiple days to apply the same time block</p>
            <div className="flex space-x-2 mb-3">
              <button
                type="button"
                onClick={() => setSelectedDays([1, 2, 3, 4, 5])}
                className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
              >
                Weekdays
              </button>
              <button
                type="button"
                onClick={() => setSelectedDays([0, 6])}
                className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors"
              >
                Weekends
              </button>
              <button
                type="button"
                onClick={() => setSelectedDays([0, 1, 2, 3, 4, 5, 6])}
                className="px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded hover:bg-purple-200 transition-colors"
              >
                All Days
              </button>
              <button
                type="button"
                onClick={() => setSelectedDays([])}
                className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
              >
                Clear
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 0, label: 'Sunday' },
                { value: 1, label: 'Monday' },
                { value: 2, label: 'Tuesday' },
                { value: 3, label: 'Wednesday' },
                { value: 4, label: 'Thursday' },
                { value: 5, label: 'Friday' },
                { value: 6, label: 'Saturday' }
              ].map(day => (
                <label key={day.value} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={selectedDays.includes(day.value)}
                    onChange={e => {
                      if (e.target.checked) {
                        setSelectedDays(prev => [...prev, day.value])
                      } else {
                        setSelectedDays(prev => prev.filter(d => d !== day.value))
                      }
                    }}
                    className="mr-2"
                  />
                  <span className="text-sm">{day.label}</span>
                </label>
              ))}
            </div>
            {selectedDays.length === 0 && (
              <p className="text-red-500 text-xs mt-1">Please select at least one day</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Time
              </label>
              <input
                type="time"
                value={formData.start_time}
                onChange={e => setFormData(prev => ({ ...prev, start_time: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End Time
              </label>
              <input
                type="time"
                value={formData.end_time}
                onChange={e => setFormData(prev => ({ ...prev, end_time: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange focus:border-transparent"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Availability
            </label>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="availability"
                  checked={formData.is_available === true}
                  onChange={() => setFormData(prev => ({ ...prev, is_available: true }))}
                  className="mr-2"
                />
                <span className="text-green-700">Available for bookings</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="availability"
                  checked={formData.is_available === false}
                  onChange={() => setFormData(prev => ({ ...prev, is_available: false }))}
                  className="mr-2"
                />
                <span className="text-red-700">Blocked (not available)</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description (Optional)
            </label>
            <input
              type="text"
              value={formData.description}
              onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="e.g., School hours, Work time, etc."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange focus:border-transparent"
            />
          </div>

          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2 bg-orange hover:bg-orange/90 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Add Exception Modal Component
function AddExceptionModal({
  token,
  onClose,
  onSuccess
}: {
  token: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [formData, setFormData] = useState({
    specific_date: '',
    start_time: '',
    end_time: '',
    is_available: false,
    reason: '',
    override_type: 'blackout' as 'blackout' | 'special_hours' | 'holiday'
  })
  const [isFullDay, setIsFullDay] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    try {
      const requestData: CreateAvailabilityExceptionRequest = {
        specific_date: formData.specific_date,
        is_available: formData.is_available,
        reason: formData.reason || undefined,
        override_type: formData.override_type
      }

      if (!isFullDay) {
        requestData.start_time = formData.start_time
        requestData.end_time = formData.end_time
      }

      const response = await fetch('/api/admin/availability-exceptions', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(requestData)
      })

      if (response.ok) {
        onSuccess()
      } else {
        const error = await response.json()
        alert(`Failed to create exception: ${error.error}`)
      }
    } catch (error) {
      console.error('Error creating exception:', error)
      alert('Failed to create exception')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium">Add Special Date</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date
            </label>
            <input
              type="date"
              value={formData.specific_date}
              onChange={e => setFormData(prev => ({ ...prev, specific_date: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange focus:border-transparent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Time Range
            </label>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="timeRange"
                  checked={isFullDay}
                  onChange={() => setIsFullDay(true)}
                  className="mr-2"
                />
                <span>Full day</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="timeRange"
                  checked={!isFullDay}
                  onChange={() => setIsFullDay(false)}
                  className="mr-2"
                />
                <span>Specific time range</span>
              </label>
            </div>
          </div>

          {!isFullDay && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Time
                </label>
                <input
                  type="time"
                  value={formData.start_time}
                  onChange={e => setFormData(prev => ({ ...prev, start_time: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange focus:border-transparent"
                  required={!isFullDay}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End Time
                </label>
                <input
                  type="time"
                  value={formData.end_time}
                  onChange={e => setFormData(prev => ({ ...prev, end_time: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange focus:border-transparent"
                  required={!isFullDay}
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Exception Type
            </label>
            <select
              value={formData.override_type}
              onChange={e => setFormData(prev => ({ ...prev, override_type: e.target.value as any }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange focus:border-transparent"
            >
              <option value="blackout">Blackout (Not available)</option>
              <option value="holiday">Holiday</option>
              <option value="special_hours">Special Hours</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Availability
            </label>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="availability"
                  checked={formData.is_available === true}
                  onChange={() => setFormData(prev => ({ ...prev, is_available: true }))}
                  className="mr-2"
                />
                <span className="text-green-700">Available for bookings</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="availability"
                  checked={formData.is_available === false}
                  onChange={() => setFormData(prev => ({ ...prev, is_available: false }))}
                  className="mr-2"
                />
                <span className="text-red-700">Blocked (not available)</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reason (Optional)
            </label>
            <input
              type="text"
              value={formData.reason}
              onChange={e => setFormData(prev => ({ ...prev, reason: e.target.value }))}
              placeholder="e.g., Christmas holiday, Vacation, etc."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange focus:border-transparent"
            />
          </div>

          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2 bg-orange hover:bg-orange/90 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}