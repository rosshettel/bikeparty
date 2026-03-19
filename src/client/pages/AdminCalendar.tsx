import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, dateFnsLocalizer, Event as RBCEvent } from 'react-big-calendar'
import { format, parse, startOfWeek, getDay, addWeeks, addMonths, parseISO, isAfter, isBefore, isEqual } from 'date-fns'
import { enUS } from 'date-fns/locale'
import { Link } from 'react-router-dom'
import { Bike, Plus, LogOut, Users, MapPin, X, Repeat } from 'lucide-react'
import PlacesAutocomplete from '../components/PlacesAutocomplete'
import 'react-big-calendar/lib/css/react-big-calendar.css'

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 0 }),
  getDay,
  locales: { 'en-US': enUS },
})

interface BikeEvent {
  id: string
  title: string
  eventDate: string
  meetTime: string
  description?: string
  status: string
  finalDestinationId?: string
  createdAt: string
}

interface Suggestion {
  id: string
  memberName: string
  memberPhone?: string
  name: string
  description?: string
  createdAt: string
}

interface NewEventForm {
  title: string
  eventDate: string
  meetTime: string
  description: string
  startPointName: string
  startPointAddress: string
  recurring: boolean
  frequency: 'weekly' | 'biweekly' | 'monthly'
  repeatUntil: string
}

function getRecurringDates(startDate: string, frequency: string, repeatUntil: string): string[] {
  const dates: string[] = []
  let current = parseISO(startDate)
  const end = parseISO(repeatUntil)
  if (!repeatUntil || isBefore(end, current)) return [startDate]

  while (!isAfter(current, end)) {
    dates.push(format(current, 'yyyy-MM-dd'))
    if (frequency === 'weekly') current = addWeeks(current, 1)
    else if (frequency === 'biweekly') current = addWeeks(current, 2)
    else current = addMonths(current, 1)
  }
  return dates
}

export default function AdminCalendar() {
  const [events, setEvents] = useState<BikeEvent[]>([])
  const [showNewEvent, setShowNewEvent] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [form, setForm] = useState<NewEventForm>({
    title: '', eventDate: '', meetTime: '18:00', description: '',
    startPointName: '', startPointAddress: '',
    recurring: false, frequency: 'weekly', repeatUntil: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [stats, setStats] = useState({ members: 0, suggestions: 0 })
  const navigate = useNavigate()

  const token = localStorage.getItem('adminToken') || ''

  const apiFetch = useCallback((path: string, opts: RequestInit = {}) =>
    fetch(`/api/admin${path}`, {
      ...opts,
      headers: { 'x-admin-token': token, 'Content-Type': 'application/json', ...opts.headers },
    }), [token])

  useEffect(() => {
    if (!token) { navigate('/admin'); return }
    loadEvents()
    loadStats()
  }, [])

  const loadEvents = async () => {
    const res = await apiFetch('/events')
    if (res.status === 401) { navigate('/admin'); return }
    const data = await res.json()
    setEvents(Array.isArray(data) ? data : [])
  }

  const loadStats = async () => {
    const [membersRes, suggestionsRes] = await Promise.all([
      apiFetch('/members'),
      apiFetch('/suggestions'),
    ])
    const membersData = await membersRes.json()
    const suggestionsData = await suggestionsRes.json()
    setSuggestions(Array.isArray(suggestionsData) ? suggestionsData : [])
    setStats({ members: membersData.length || 0, suggestions: Array.isArray(suggestionsData) ? suggestionsData.length : 0 })
  }

  const openSuggestions = async () => {
    // Refresh suggestions before showing
    const res = await apiFetch('/suggestions')
    const data = await res.json()
    setSuggestions(Array.isArray(data) ? data : [])
    setShowSuggestions(true)
  }

  const createEvent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim() || !form.eventDate) return setError('Title and date required')
    if (form.recurring && !form.repeatUntil) return setError('Repeat until date required')
    setLoading(true)
    setError('')

    const dates = form.recurring
      ? getRecurringDates(form.eventDate, form.frequency, form.repeatUntil)
      : [form.eventDate]

    try {
      for (const date of dates) {
        const res = await apiFetch('/events', {
          method: 'POST',
          body: JSON.stringify({
            title: form.title,
            eventDate: date,
            meetTime: form.meetTime,
            description: form.description,
            startPointName: form.startPointName || undefined,
            startPointAddress: form.startPointAddress || undefined,
          }),
        })
        if (!res.ok) {
          const d = await res.json()
          setError(d.error)
          setLoading(false)
          return
        }
      }
      await loadEvents()
      setForm({ title: '', eventDate: '', meetTime: '18:00', description: '', startPointName: '', startPointAddress: '', recurring: false, frequency: 'weekly', repeatUntil: '' })
      setShowNewEvent(false)
    } catch (err: any) {
      setError(err.message)
    }
    setLoading(false)
  }

  const logout = () => {
    localStorage.removeItem('adminToken')
    navigate('/admin')
  }

  const calEvents: RBCEvent[] = events.map(ev => {
    const [year, month, day] = ev.eventDate.split('-').map(Number)
    const [h, m] = ev.meetTime.split(':').map(Number)
    const start = new Date(year, month - 1, day, h, m)
    const end = new Date(year, month - 1, day, h + 2, m)
    return {
      title: `${ev.status === 'cancelled' ? '❌ ' : '🚲 '}${ev.title}`,
      start,
      end,
      resource: ev,
    }
  })

  const handleSelectEvent = (event: RBCEvent) => {
    navigate(`/admin/events/${(event.resource as BikeEvent).id}`)
  }

  const handleSelectSlot = ({ start }: { start: Date }) => {
    setForm(f => ({ ...f, eventDate: format(start, 'yyyy-MM-dd'), startPointName: '', startPointAddress: '' }))
    setShowNewEvent(true)
  }

  const eventStyleGetter = (event: RBCEvent) => {
    const bikeEvent = event.resource as BikeEvent
    return {
      style: {
        backgroundColor: bikeEvent.status === 'cancelled' ? '#ef4444' : '#16a34a',
        borderColor: bikeEvent.status === 'cancelled' ? '#dc2626' : '#15803d',
      }
    }
  }

  const recurringPreview = form.recurring && form.eventDate && form.repeatUntil
    ? getRecurringDates(form.eventDate, form.frequency, form.repeatUntil)
    : []

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bike size={28} className="text-green-600" />
          <div>
            <h1 className="text-xl font-bold">Bike Party Admin</h1>
            <p className="text-xs text-gray-500">Ride management</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-4 text-sm text-gray-600">
            <Link to="/admin/members" className="flex items-center gap-1 hover:text-green-600 transition-colors">
              <Users size={14} /> {stats.members} riders
            </Link>
            <button
              onClick={openSuggestions}
              className="flex items-center gap-1 hover:text-green-600 transition-colors"
            >
              <MapPin size={14} /> {stats.suggestions} suggestions
            </button>
          </div>
          <button
            onClick={() => setShowNewEvent(true)}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors"
          >
            <Plus size={16} /> New Ride
          </button>
          <button onClick={logout} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <LogOut size={18} />
          </button>
        </div>
      </div>

      <div className="p-6" style={{ height: 'calc(100vh - 73px)' }}>
        {/* New event modal */}
        {showNewEvent && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
              <h2 className="text-lg font-bold mb-4">New Group Ride</h2>
              {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
              <form onSubmit={createEvent} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ride Title</label>
                  <input
                    type="text"
                    placeholder="e.g. Saturday Night Ride"
                    value={form.title}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {form.recurring ? 'First Date' : 'Date'}
                    </label>
                    <input
                      type="date"
                      value={form.eventDate}
                      onChange={e => setForm(f => ({ ...f, eventDate: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Meet Time</label>
                    <input
                      type="time"
                      value={form.meetTime}
                      onChange={e => setForm(f => ({ ...f, meetTime: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Point (optional)</label>
                  <PlacesAutocomplete
                    placeholder="Where does the ride start?"
                    onSelect={place => setForm(f => ({ ...f, startPointName: place.name, startPointAddress: place.address }))}
                  />
                  {form.startPointAddress && (
                    <p className="text-xs text-gray-400 mt-1 px-1">{form.startPointAddress}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
                  <textarea
                    placeholder="Meet at the fountain, bring lights..."
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    rows={2}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 resize-none"
                  />
                </div>

                {/* Recurring toggle */}
                <div className="border border-gray-100 rounded-xl p-3 space-y-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.recurring}
                      onChange={e => setForm(f => ({ ...f, recurring: e.target.checked }))}
                      className="w-4 h-4 accent-green-600"
                    />
                    <span className="text-sm font-medium flex items-center gap-1.5">
                      <Repeat size={14} className="text-green-600" /> Recurring ride
                    </span>
                  </label>

                  {form.recurring && (
                    <div className="space-y-3 pl-6">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Frequency</label>
                        <div className="flex gap-2">
                          {(['weekly', 'biweekly', 'monthly'] as const).map(f => (
                            <label key={f} className={`flex-1 text-center text-xs py-1.5 rounded-lg border cursor-pointer transition-colors ${form.frequency === f ? 'bg-green-600 text-white border-green-600' : 'border-gray-200 hover:border-green-300'}`}>
                              <input type="radio" name="frequency" value={f} checked={form.frequency === f}
                                onChange={() => setForm(frm => ({ ...frm, frequency: f }))} className="sr-only" />
                              {f === 'weekly' ? 'Weekly' : f === 'biweekly' ? 'Every 2 wks' : 'Monthly'}
                            </label>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Repeat until</label>
                        <input
                          type="date"
                          value={form.repeatUntil}
                          min={form.eventDate}
                          onChange={e => setForm(f => ({ ...f, repeatUntil: e.target.value }))}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                        />
                      </div>
                      {recurringPreview.length > 0 && (
                        <p className="text-xs text-green-700 bg-green-50 px-3 py-2 rounded-lg">
                          Creates <strong>{recurringPreview.length}</strong> rides: {recurringPreview[0]} → {recurringPreview[recurringPreview.length - 1]}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={() => { setShowNewEvent(false); setError('') }}
                    className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-xl font-medium hover:bg-gray-50 transition-colors">
                    Cancel
                  </button>
                  <button type="submit" disabled={loading}
                    className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-2.5 rounded-xl font-medium transition-colors">
                    {loading ? 'Creating...' : form.recurring && recurringPreview.length > 1 ? `Create ${recurringPreview.length} Rides` : 'Create Ride'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Suggestions modal */}
        {showSuggestions && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
              <div className="flex items-center justify-between p-5 border-b border-gray-100">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <MapPin size={18} className="text-green-600" /> Ride Suggestions
                </h2>
                <button onClick={() => setShowSuggestions(false)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                  <X size={18} />
                </button>
              </div>
              <div className="overflow-y-auto flex-1 p-5">
                {suggestions.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-8">No suggestions yet</p>
                ) : (
                  <div className="space-y-3">
                    {suggestions.map(s => (
                      <div key={s.id} className="border border-gray-100 rounded-xl p-4 bg-gray-50">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-sm">{s.name}</p>
                            {s.description && <p className="text-sm text-gray-600 mt-0.5">{s.description}</p>}
                          </div>
                          <button
                            onClick={() => {
                              setForm(f => ({ ...f, title: s.name }))
                              setShowSuggestions(false)
                              setShowNewEvent(true)
                            }}
                            className="flex-shrink-0 text-xs bg-green-100 hover:bg-green-200 text-green-700 px-2.5 py-1 rounded-lg font-medium transition-colors"
                          >
                            Use
                          </button>
                        </div>
                        <p className="text-xs text-gray-400 mt-2">
                          from {s.memberName}{s.memberPhone ? ` · ${s.memberPhone}` : ''} · {s.createdAt.slice(0, 10)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <Calendar
          localizer={localizer}
          events={calEvents}
          startAccessor="start"
          endAccessor="end"
          style={{ height: '100%' }}
          onSelectEvent={handleSelectEvent}
          onSelectSlot={handleSelectSlot}
          selectable
          eventPropGetter={eventStyleGetter}
          views={['month', 'week', 'agenda']}
          defaultView="month"
        />
      </div>
    </div>
  )
}
