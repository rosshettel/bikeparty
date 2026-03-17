import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, dateFnsLocalizer, Event as RBCEvent } from 'react-big-calendar'
import { format, parse, startOfWeek, getDay, parseISO, addDays } from 'date-fns'
import { enUS } from 'date-fns/locale'
import { Bike, Plus, LogOut, Users, MapPin, MessageSquare } from 'lucide-react'
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

interface NewEventForm {
  title: string
  eventDate: string
  meetTime: string
  description: string
}

export default function AdminCalendar() {
  const [events, setEvents] = useState<BikeEvent[]>([])
  const [showNewEvent, setShowNewEvent] = useState(false)
  const [form, setForm] = useState<NewEventForm>({ title: '', eventDate: '', meetTime: '18:00', description: '' })
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
    const members = await membersRes.json()
    const suggestions = await suggestionsRes.json()
    setStats({ members: members.length || 0, suggestions: suggestions.length || 0 })
  }

  const createEvent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim() || !form.eventDate) return setError('Title and date required')
    setLoading(true)
    const res = await apiFetch('/events', {
      method: 'POST',
      body: JSON.stringify(form),
    })
    if (res.ok) {
      await loadEvents()
      setForm({ title: '', eventDate: '', meetTime: '18:00', description: '' })
      setShowNewEvent(false)
      setError('')
    } else {
      const d = await res.json()
      setError(d.error)
    }
    setLoading(false)
  }

  const logout = () => {
    localStorage.removeItem('adminToken')
    navigate('/admin')
  }

  // Convert events to react-big-calendar format
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
    const bikeEvent = event.resource as BikeEvent
    navigate(`/admin/events/${bikeEvent.id}`)
  }

  const handleSelectSlot = ({ start }: { start: Date }) => {
    const dateStr = format(start, 'yyyy-MM-dd')
    setForm(f => ({ ...f, eventDate: dateStr }))
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
          {/* Stats */}
          <div className="hidden sm:flex items-center gap-4 text-sm text-gray-600">
            <span className="flex items-center gap-1"><Users size={14} /> {stats.members} riders</span>
            <span className="flex items-center gap-1"><MapPin size={14} /> {stats.suggestions} suggestions</span>
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
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
                  <textarea
                    placeholder="Meet at the fountain, bring lights..."
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    rows={3}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 resize-none"
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => { setShowNewEvent(false); setError('') }}
                    className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-xl font-medium hover:bg-gray-50 transition-colors">
                    Cancel
                  </button>
                  <button type="submit" disabled={loading}
                    className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-2.5 rounded-xl font-medium transition-colors">
                    {loading ? 'Creating...' : 'Create Ride'}
                  </button>
                </div>
              </form>
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
