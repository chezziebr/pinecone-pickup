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
  const [seasonalHours, setSeasonalHours] = useState<any[]>([])
  const [bufferMinutes, setBufferMinutes] = useState(0)
  const [loading, setLoading] = useState(true)
  const [activeSubTab, setActiveSubTab] = useState('weekly')
  const [showAddSettingModal, setShowAddSettingModal] = useState(false)
  const [showAddExceptionModal, setShowAddExceptionModal] = useState(false)
  const [showAddSeasonModal, setShowAddSeasonModal] = useState(false)
  const [editingSetting, setEditingSetting] = useState<AvailabilitySetting | null>(null)
  const [editingException, setEditingException] = useState<AvailabilityException | null>(null)
  const [editingSeasonalHour, setEditingSeasonalHour] = useState<any | null>(null)
  const [bufferSaving, setBufferSaving] = useState(false)

  useEffect(() => {
    fetchData()
  }, [token])

  const fetchSeasonalHours = async () => {
    try {
      const response = await fetch('/api/admin/seasonal-hours', {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (response.status === 401) {
        localStorage.removeItem('adminToken')
        window.location.href = '/admin'
        return
      }

      if (response.ok) {
        const data = await response.json()
        setSeasonalHours(data.hours || [])
      }
    } catch (error) {
      console.error('Error fetching seasonal hours:', error)
    }
  }

  const fetchBusinessSettings = async () => {
    try {
      const response = await fetch('/api/admin/business-settings', {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (response.status === 401) {
        localStorage.removeItem('adminToken')
        window.location.href = '/admin'
        return
      }

      if (response.ok) {
        const data = await response.json()
        const bufferSetting = data.settings.find((s: any) => s.key === 'calendar_buffer_minutes')
        if (bufferSetting) {
          setBufferMinutes(parseInt(bufferSetting.value) || 0)
        }
      }
    } catch (error) {
      console.error('Error fetching business settings:', error)
    }
  }

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

      // If 401, token is invalid — redirect to login
      if (settingsResponse.status === 401 || exceptionsResponse.status === 401) {
        localStorage.removeItem('adminToken')
        window.location.href = '/admin'
        return
      }

      if (settingsResponse.ok) {
        const settingsData = await settingsResponse.json()
        setSettings(settingsData.settings)
      }

      if (exceptionsResponse.ok) {
        const exceptionsData = await exceptionsResponse.json()
        setExceptions(exceptionsData.exceptions)
      }

      await Promise.all([
        fetchSeasonalHours(),
        fetchBusinessSettings()
      ])
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

  const deleteSeasonalHour = async (id: string) => {
    if (!confirm('Are you sure you want to delete this seasonal hour entry?')) return

    try {
      const response = await fetch(`/api/admin/seasonal-hours?id=${id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        setSeasonalHours(prev => prev.filter(s => s.id !== id))
      } else {
        alert('Failed to delete seasonal hour')
      }
    } catch (error) {
      console.error('Error deleting seasonal hour:', error)
      alert('Failed to delete seasonal hour')
    }
  }

  const saveBufferMinutes = async () => {
    if (bufferMinutes < 0 || bufferMinutes > 120) {
      alert('Buffer time must be between 0 and 120 minutes')
      return
    }

    setBufferSaving(true)

    try {
      const response = await fetch('/api/admin/business-settings', {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          key: 'calendar_buffer_minutes',
          value: bufferMinutes.toString()
        })
      })

      if (response.status === 401) {
        localStorage.removeItem('adminToken')
        window.location.href = '/admin'
        return
      }

      if (response.ok) {
        alert('Buffer time saved successfully')
      } else {
        alert('Failed to save buffer time')
      }
    } catch (error) {
      console.error('Error saving buffer time:', error)
      alert('Failed to save buffer time')
    } finally {
      setBufferSaving(false)
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
            { id: 'exceptions', label: 'Special Dates', icon: '🚫' },
            { id: 'seasonal', label: 'Seasonal Hours', icon: '🌲' },
            { id: 'settings', label: 'Settings', icon: '⚙️' }
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

          <WeeklyScheduleView settings={settings} onDelete={deleteSetting} onEdit={setEditingSetting} />
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

          <SpecialDatesView exceptions={exceptions} onDelete={deleteException} onEdit={setEditingException} />
        </div>
      )}

      {/* Seasonal Hours Tab */}
      {activeSubTab === 'seasonal' && (
        <div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <p className="text-sm text-blue-800">
              Seasonal hours define your base operating hours. These are the hours customers can book during the specified date range.
            </p>
          </div>
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-gray-600">
              Set different operating hours for different seasons or time periods.
            </p>
            <button
              onClick={() => setShowAddSeasonModal(true)}
              className="bg-orange hover:bg-orange/90 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              + Add Season
            </button>
          </div>

          <SeasonalHoursView seasonalHours={seasonalHours} onDelete={deleteSeasonalHour} onEdit={setEditingSeasonalHour} />
        </div>
      )}

      {/* Settings Tab */}
      {activeSubTab === 'settings' && (
        <div>
          <div className="space-y-6">
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h4 className="text-lg font-medium text-gray-900 mb-2">Google Calendar Buffer Time</h4>
              <p className="text-sm text-gray-600 mb-4">
                Buffer time is added before and after each Google Calendar event. This prevents bookings from being scheduled too close to your other commitments.
              </p>
              <div className="flex items-end space-x-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Buffer Time (minutes)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="120"
                    value={bufferMinutes}
                    onChange={e => setBufferMinutes(Math.max(0, Math.min(120, parseInt(e.target.value) || 0)))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 mt-1">Recommended: 15 minutes</p>
                </div>
                <button
                  onClick={saveBufferMinutes}
                  disabled={bufferSaving}
                  className="bg-orange hover:bg-orange/90 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {bufferSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
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

      {editingSetting && (
        <EditSettingModal
          token={token}
          setting={editingSetting}
          onClose={() => setEditingSetting(null)}
          onSuccess={() => {
            setEditingSetting(null)
            fetchData()
          }}
        />
      )}

      {editingException && (
        <EditExceptionModal
          token={token}
          exception={editingException}
          onClose={() => setEditingException(null)}
          onSuccess={() => {
            setEditingException(null)
            fetchData()
          }}
        />
      )}

      {showAddSeasonModal && (
        <AddSeasonModal
          token={token}
          onClose={() => setShowAddSeasonModal(false)}
          onSuccess={() => {
            setShowAddSeasonModal(false)
            fetchSeasonalHours()
          }}
        />
      )}

      {editingSeasonalHour && (
        <EditSeasonModal
          token={token}
          seasonalHour={editingSeasonalHour}
          onClose={() => setEditingSeasonalHour(null)}
          onSuccess={() => {
            setEditingSeasonalHour(null)
            fetchSeasonalHours()
          }}
        />
      )}
    </div>
  )
}

// Weekly Schedule View Component
function WeeklyScheduleView({
  settings,
  onDelete,
  onEdit
}: {
  settings: AvailabilitySetting[]
  onDelete: (id: string) => void
  onEdit: (setting: AvailabilitySetting) => void
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
                      onClick={() => onEdit(setting)}
                      className="text-blue-600 hover:text-blue-800 p-1"
                      title="Edit"
                    >
                      ✏️
                    </button>
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
  onDelete,
  onEdit
}: {
  exceptions: AvailabilityException[]
  onDelete: (id: string) => void
  onEdit: (exception: AvailabilityException) => void
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
              onClick={() => onEdit(exception)}
              className="text-blue-600 hover:text-blue-800 p-1"
              title="Edit"
            >
              ✏️
            </button>
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

// Seasonal Hours View Component
function SeasonalHoursView({
  seasonalHours,
  onDelete,
  onEdit
}: {
  seasonalHours: any[]
  onDelete: (id: string) => void
  onEdit: (hour: any) => void
}) {
  const groupedByName = seasonalHours.reduce((acc, hour) => {
    if (!acc[hour.name]) {
      acc[hour.name] = []
    }
    acc[hour.name].push(hour)
    return acc
  }, {} as Record<string, any[]>)

  if (!seasonalHours.length) {
    return (
      <div className="text-center py-8 text-gray-500">
        <div className="text-4xl mb-4">🌲</div>
        <p>No seasonal hours configured</p>
        <p className="text-sm mt-2">Add seasonal schedules to define operating hours for different time periods.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {(Object.entries(groupedByName) as [string, any[]][]).map(([name, hours]) => {
        const firstHour = hours[0]
        const hoursByDay = hours.reduce((acc: Record<number, any>, hour: any) => {
          acc[hour.day_of_week] = hour
          return acc
        }, {} as Record<number, any>)

        return (
          <div key={name} className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="font-medium text-gray-900">{name}</h4>
                <p className="text-sm text-gray-600">
                  {firstHour.start_date} to {firstHour.end_date}
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  firstHour.is_active
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {firstHour.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>

            <div className="overflow-x-auto mb-3">
              <table className="w-full text-sm">
                <tbody>
                  {[0, 1, 2, 3, 4, 5, 6].map(dayNum => {
                    const hour = hoursByDay[dayNum]
                    return (
                      <tr key={dayNum} className="border-t border-gray-100">
                        <td className="py-2 px-2 text-gray-700 font-medium w-24">{getDayName(dayNum)}</td>
                        <td className="py-2 px-2 text-gray-600">
                          {hour ? `${convertTo12Hour(hour.start_time)} - ${convertTo12Hour(hour.end_time)}` : '-'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end space-x-2">
              <button
                onClick={() => onEdit(firstHour)}
                className="text-blue-600 hover:text-blue-800 text-sm px-3 py-1"
                title="Edit"
              >
                ✏️ Edit
              </button>
              <button
                onClick={() => onDelete(firstHour.id)}
                className="text-red-600 hover:text-red-800 text-sm px-3 py-1"
                title="Delete"
              >
                🗑️ Delete
              </button>
            </div>
          </div>
        )
      })}
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

// Edit Setting Modal Component
function EditSettingModal({
  token,
  setting,
  onClose,
  onSuccess
}: {
  token: string
  setting: AvailabilitySetting
  onClose: () => void
  onSuccess: () => void
}) {
  // Extract HH:MM from HH:MM:SS stored in the database
  const toHHMM = (time: string) => time.slice(0, 5)

  const [formData, setFormData] = useState({
    day_of_week: setting.day_of_week,
    start_time: toHHMM(setting.start_time),
    end_time: toHHMM(setting.end_time),
    is_available: setting.is_available,
    description: setting.description || ''
  })
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    try {
      const response = await fetch(`/api/admin/availability-settings/${setting.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      })

      if (response.ok) {
        onSuccess()
      } else {
        const error = await response.json()
        alert(`Failed to update setting: ${error.error}`)
      }
    } catch (error) {
      console.error('Error updating setting:', error)
      alert('Failed to update setting')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium">Edit Time Block</h3>
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
              Day of Week
            </label>
            <select
              value={formData.day_of_week}
              onChange={e => setFormData(prev => ({ ...prev, day_of_week: parseInt(e.target.value) }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange focus:border-transparent"
            >
              {[
                { value: 0, label: 'Sunday' },
                { value: 1, label: 'Monday' },
                { value: 2, label: 'Tuesday' },
                { value: 3, label: 'Wednesday' },
                { value: 4, label: 'Thursday' },
                { value: 5, label: 'Friday' },
                { value: 6, label: 'Saturday' }
              ].map(day => (
                <option key={day.value} value={day.value}>{day.label}</option>
              ))}
            </select>
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
                  name="edit-availability"
                  checked={formData.is_available === true}
                  onChange={() => setFormData(prev => ({ ...prev, is_available: true }))}
                  className="mr-2"
                />
                <span className="text-green-700">Available for bookings</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="edit-availability"
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
              {submitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Edit Exception Modal Component
function EditExceptionModal({
  token,
  exception,
  onClose,
  onSuccess
}: {
  token: string
  exception: AvailabilityException
  onClose: () => void
  onSuccess: () => void
}) {
  const toHHMM = (time: string | null) => time ? time.slice(0, 5) : ''

  const [formData, setFormData] = useState({
    specific_date: exception.specific_date,
    start_time: toHHMM(exception.start_time),
    end_time: toHHMM(exception.end_time),
    is_available: exception.is_available,
    reason: exception.reason || '',
    override_type: exception.override_type
  })
  const [isFullDay, setIsFullDay] = useState(!exception.start_time && !exception.end_time)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    try {
      const requestData: any = {
        specific_date: formData.specific_date,
        is_available: formData.is_available,
        reason: formData.reason || undefined,
        override_type: formData.override_type
      }

      if (!isFullDay) {
        requestData.start_time = formData.start_time
        requestData.end_time = formData.end_time
      } else {
        requestData.start_time = null
        requestData.end_time = null
      }

      const response = await fetch(`/api/admin/availability-exceptions/${exception.id}`, {
        method: 'PUT',
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
        alert(`Failed to update exception: ${error.error}`)
      }
    } catch (error) {
      console.error('Error updating exception:', error)
      alert('Failed to update exception')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium">Edit Special Date</h3>
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
                  name="edit-timeRange"
                  checked={isFullDay}
                  onChange={() => setIsFullDay(true)}
                  className="mr-2"
                />
                <span>Full day</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="edit-timeRange"
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
                  name="edit-exception-availability"
                  checked={formData.is_available === true}
                  onChange={() => setFormData(prev => ({ ...prev, is_available: true }))}
                  className="mr-2"
                />
                <span className="text-green-700">Available for bookings</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="edit-exception-availability"
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
              {submitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Add Season Modal Component
function AddSeasonModal({
  token,
  onClose,
  onSuccess
}: {
  token: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [formData, setFormData] = useState({
    name: '',
    start_date: '',
    end_date: '',
    start_time: '09:00',
    end_time: '17:00',
    is_active: true
  })
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]) // Default to weekdays
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.name.trim()) {
      alert('Please enter a season name')
      return
    }

    if (!formData.start_date || !formData.end_date) {
      alert('Please select start and end dates')
      return
    }

    if (selectedDays.length === 0) {
      alert('Please select at least one day')
      return
    }

    setSubmitting(true)

    try {
      const promises = selectedDays.map(day_of_week =>
        fetch('/api/admin/seasonal-hours', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            name: formData.name,
            start_date: formData.start_date,
            end_date: formData.end_date,
            day_of_week,
            start_time: formData.start_time,
            end_time: formData.end_time,
            is_active: formData.is_active
          })
        })
      )

      const responses = await Promise.all(promises)

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
        alert(`Failed to create some seasonal hours:\n${errors.join('\n')}`)
        onSuccess()
      }
    } catch (error) {
      console.error('Error creating seasonal hours:', error)
      alert('Failed to create seasonal hours')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-screen overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium">Add Season</h3>
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
              Season Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., Summer Hours, Winter Hours"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange focus:border-transparent"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={formData.start_date}
                onChange={e => setFormData(prev => ({ ...prev, start_date: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End Date
              </label>
              <input
                type="date"
                value={formData.end_date}
                onChange={e => setFormData(prev => ({ ...prev, end_date: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange focus:border-transparent"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Days of Week
            </label>
            <p className="text-xs text-gray-500 mb-2">Select which days apply to this season</p>
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
                        setSelectedDays(prev => [...prev, day.value].sort())
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
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={e => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                className="mr-2"
              />
              <span className="text-sm text-gray-700">Active</span>
            </label>
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

// Edit Season Modal Component
function EditSeasonModal({
  token,
  seasonalHour,
  onClose,
  onSuccess
}: {
  token: string
  seasonalHour: any
  onClose: () => void
  onSuccess: () => void
}) {
  const toHHMM = (time: string) => time.slice(0, 5)

  const [formData, setFormData] = useState({
    name: seasonalHour.name,
    start_date: seasonalHour.start_date,
    end_date: seasonalHour.end_date,
    day_of_week: seasonalHour.day_of_week,
    start_time: toHHMM(seasonalHour.start_time),
    end_time: toHHMM(seasonalHour.end_time),
    is_active: seasonalHour.is_active
  })
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    try {
      const response = await fetch(`/api/admin/seasonal-hours/${seasonalHour.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: formData.name,
          start_date: formData.start_date,
          end_date: formData.end_date,
          day_of_week: formData.day_of_week,
          start_time: formData.start_time,
          end_time: formData.end_time,
          is_active: formData.is_active
        })
      })

      if (response.status === 401) {
        localStorage.removeItem('adminToken')
        window.location.href = '/admin'
        return
      }

      if (response.ok) {
        onSuccess()
      } else {
        const error = await response.json()
        alert(`Failed to update seasonal hour: ${error.error}`)
      }
    } catch (error) {
      console.error('Error updating seasonal hour:', error)
      alert('Failed to update seasonal hour')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium">Edit Seasonal Hour</h3>
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
              Season Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange focus:border-transparent"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={formData.start_date}
                onChange={e => setFormData(prev => ({ ...prev, start_date: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End Date
              </label>
              <input
                type="date"
                value={formData.end_date}
                onChange={e => setFormData(prev => ({ ...prev, end_date: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange focus:border-transparent"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Day of Week
            </label>
            <select
              value={formData.day_of_week}
              onChange={e => setFormData(prev => ({ ...prev, day_of_week: parseInt(e.target.value) }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange focus:border-transparent"
            >
              {[
                { value: 0, label: 'Sunday' },
                { value: 1, label: 'Monday' },
                { value: 2, label: 'Tuesday' },
                { value: 3, label: 'Wednesday' },
                { value: 4, label: 'Thursday' },
                { value: 5, label: 'Friday' },
                { value: 6, label: 'Saturday' }
              ].map(day => (
                <option key={day.value} value={day.value}>{day.label}</option>
              ))}
            </select>
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
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={e => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                className="mr-2"
              />
              <span className="text-sm text-gray-700">Active</span>
            </label>
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
              {submitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}