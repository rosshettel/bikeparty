import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, MapPin, ExternalLink, Plus, Trash2,
  Send, Users, MessageSquare, UserCheck, AlertTriangle, Bike, X, Navigation
} from 'lucide-react'
import PlacesAutocomplete, { PlaceResult } from '../components/PlacesAutocomplete'
import { buildBikeDirectionsUrl, renderBikeRoute, RouteInfo } from '../lib/maps'

interface Destination {
  id: string
  name: string
  address?: string
  mapsUrl?: string
}

interface RsvpItem {
  id: string
  memberId: string
  status: 'pending' | 'yes' | 'no'
  destinationVote?: Destination
  member?: { name: string; phone: string }
}


interface BikeEvent {
  id: string
  title: string
  eventDate: string
  meetTime: string
  description?: string
  status: string
  finalDestinationId?: string
  startPointName?: string
  startPointAddress?: string
  invitesSentAt?: string
  groupChatCreatedAt?: string
  dayOfConfirmSentAt?: string
  conversationSid?: string
  scheduledInviteAt?: string
  scheduledDayOfConfirmAt?: string
  scheduledGroupChatAt?: string
}

const HOUR_OPTIONS = Array.from({ length: 9 }, (_, i) => i + 9)
function formatHour(h: number) {
  if (h === 12) return '12:00 PM'
  return h < 12 ? `${h}:00 AM` : `${h - 12}:00 PM`
}
function getLocalHour(iso: string): number {
  return new Date(iso).getHours()
}
function getDaysBefore(eventDate: string, iso: string): number {
  const [y, m, d] = eventDate.split('-').map(Number)
  const evDay = new Date(y, m - 1, d)
  const schDay = new Date(iso)
  const schDateOnly = new Date(schDay.getFullYear(), schDay.getMonth(), schDay.getDate())
  return Math.round((evDay.getTime() - schDateOnly.getTime()) / 86400000)
}
function computeScheduledTimes(eventDate: string, headsUpDaysBefore: number, dayOfConfirmHour: number, groupChatHour: number) {
  const [year, month, day] = eventDate.split('-').map(Number)
  return {
    scheduledInviteAt: new Date(year, month - 1, day - headsUpDaysBefore, 9, 0, 0).toISOString(),
    scheduledDayOfConfirmAt: new Date(year, month - 1, day, dayOfConfirmHour, 0, 0).toISOString(),
    scheduledGroupChatAt: new Date(year, month - 1, day, groupChatHour, 0, 0).toISOString(),
  }
}

interface EventData {
  event: BikeEvent
  destinations: Destination[]
  rsvps: RsvpItem[]
}

// Modal showing a list of riders for a given RSVP status
function RsvpModal({ title, rsvps, onClose }: {
  title: string
  rsvps: RsvpItem[]
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm max-h-[70vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h3 className="font-semibold">{title} ({rsvps.length})</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={16} /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-4">
          {rsvps.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Nobody yet</p>
          ) : (
            <div className="space-y-2">
              {rsvps.map(r => (
                <div key={r.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-sm font-medium">{r.member?.name || 'Unknown'}</p>
                    <p className="text-xs text-gray-400">{r.member?.phone}</p>
                  </div>
                  {r.destinationVote && (
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                      {r.destinationVote.name}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}


export default function EventAdmin() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const adminToken = localStorage.getItem('adminToken') || ''

  const [data, setData] = useState<EventData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionMsg, setActionMsg] = useState('')

  // Modals
  const [rsvpModal, setRsvpModal] = useState<'yes' | 'no' | 'pending' | null>(null)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  // Delegate
  const [delegatePhone, setDelegatePhone] = useState('')
  const [delegateSending, setDelegateSending] = useState(false)

  // Route map
  const mapRef = useRef<HTMLDivElement>(null)
  const [distance, setDistance] = useState<RouteInfo | null>(null)
  const [distanceLoading, setDistanceLoading] = useState(false)

  // Departure point editing
  const [editingDeparture, setEditingDeparture] = useState(false)
  const [pendingDeparture, setPendingDeparture] = useState<{ name: string; address: string } | null>(null)

  // Notification schedule editing
  const [editingSchedule, setEditingSchedule] = useState(false)
  const [scheduleForm, setScheduleForm] = useState({ headsUpDaysBefore: 3, dayOfConfirmHour: 10, groupChatHour: 17 })

  // Forms
  const [newDest, setNewDest] = useState({ name: '', address: '', mapsUrl: '' })
  const [blastMsg, setBlastMsg] = useState('')
  const [blastAudience, setBlastAudience] = useState<'confirmed' | 'all'>('confirmed')
  const [cancelMsg, setCancelMsg] = useState('')

  useEffect(() => { if (!adminToken) navigate('/admin') }, [])

  const headers = { 'Content-Type': 'application/json', 'x-admin-token': adminToken }
  const adminFetch = (path: string, opts: RequestInit = {}) =>
    fetch(`/api/admin${path}`, { ...opts, headers: { ...headers, ...((opts.headers as Record<string, string>) || {}) } })

  const flash = (msg: string) => {
    setActionMsg(msg)
    setTimeout(() => setActionMsg(''), 3000)
  }

  const load = async () => {
    try {
      const res = await adminFetch(`/events/${id}`)
      if (!res.ok) { setError('Failed to load event'); setLoading(false); return }
      setData(await res.json())
    } catch {
      setError('Network error')
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  // Render route map + compute distance when start + final destination are both known
  useEffect(() => {
    if (!data || !mapRef.current) return
    const { event, destinations } = data
    if (!event.startPointAddress || !event.finalDestinationId) { setDistance(null); return }
    const finalDest = destinations.find(d => d.id === event.finalDestinationId)
    if (!finalDest?.address) { setDistance(null); return }
    setDistanceLoading(true)
    setDistance(null)
    renderBikeRoute(event.startPointAddress, finalDest.address, mapRef.current)
      .then(d => setDistance(d))
      .catch(() => setDistance(null))
      .finally(() => setDistanceLoading(false))
  }, [data, mapRef.current])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-600" />
    </div>
  )
  if (error || !data) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-red-600">{error || 'Event not found'}</p>
    </div>
  )

  const { event, destinations, rsvps } = data
  const confirmed = rsvps.filter(r => r.status === 'yes')
  const declined = rsvps.filter(r => r.status === 'no')
  const pending = rsvps.filter(r => r.status === 'pending')
  const isCancelled = event.status === 'cancelled'

  const voteTallies: Record<string, number> = {}
  confirmed.forEach(r => {
    if (r.destinationVote?.id) voteTallies[r.destinationVote.id] = (voteTallies[r.destinationVote.id] || 0) + 1
  })

  const rsvpModalList = rsvpModal === 'yes' ? confirmed : rsvpModal === 'no' ? declined : pending
  const rsvpModalTitle = rsvpModal === 'yes' ? 'Going' : rsvpModal === 'no' ? 'Not Going' : 'No Response'

  const saveDeparture = async () => {
    if (!pendingDeparture) return
    const res = await adminFetch(`/events/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ startPointName: pendingDeparture.name, startPointAddress: pendingDeparture.address }),
    })
    if (res.ok) { setEditingDeparture(false); setPendingDeparture(null); await load(); flash('Departure point updated') }
  }

  const openEditSchedule = () => {
    if (event.scheduledInviteAt) setScheduleForm(f => ({ ...f, headsUpDaysBefore: getDaysBefore(event.eventDate, event.scheduledInviteAt!) }))
    if (event.scheduledDayOfConfirmAt) setScheduleForm(f => ({ ...f, dayOfConfirmHour: getLocalHour(event.scheduledDayOfConfirmAt!) }))
    if (event.scheduledGroupChatAt) setScheduleForm(f => ({ ...f, groupChatHour: getLocalHour(event.scheduledGroupChatAt!) }))
    setEditingSchedule(true)
  }

  const saveSchedule = async () => {
    const times = computeScheduledTimes(event.eventDate, scheduleForm.headsUpDaysBefore, scheduleForm.dayOfConfirmHour, scheduleForm.groupChatHour)
    const res = await adminFetch(`/events/${id}`, { method: 'PATCH', body: JSON.stringify(times) })
    if (res.ok) { setEditingSchedule(false); await load(); flash('Notification schedule updated') }
  }

  const addDestination = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newDest.name.trim()) return
    const res = await adminFetch(`/events/${id}/destinations`, { method: 'POST', body: JSON.stringify(newDest) })
    if (res.ok) { setNewDest({ name: '', address: '', mapsUrl: '' }); await load(); flash('Destination added') }
  }

  const deleteDestination = async (destId: string) => {
    await adminFetch(`/events/${id}/destinations/${destId}`, { method: 'DELETE' })
    await load(); flash('Destination removed')
  }

  const selectDestination = async (destId: string) => {
    await adminFetch(`/events/${id}/destinations/${destId}/select`, { method: 'POST' })
    await load(); flash('Final destination set!')
  }

  const sendInvites = async () => {
    const res = await adminFetch(`/events/${id}/invite`, { method: 'POST' })
    const d = await res.json()
    flash(res.ok ? `Invites sent to ${d.sent} riders!` : `Error: ${d.error}`)
  }

  const sendBlast = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!blastMsg.trim()) return
    const res = await adminFetch(`/events/${id}/blast`, {
      method: 'POST', body: JSON.stringify({ message: blastMsg, audience: blastAudience }),
    })
    const d = await res.json()
    if (res.ok) { setBlastMsg(''); flash(`Blast sent to ${d.sent} riders!`) }
    else flash(`Error: ${d.error}`)
  }

  const createGroupChat = async () => {
    const res = await adminFetch(`/events/${id}/groupchat`, { method: 'POST' })
    const d = await res.json()
    if (res.ok) { await load(); flash('Group chat created!') }
    else flash(`Error: ${d.error}`)
  }

  const sendDelegate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!delegatePhone.trim()) return
    setDelegateSending(true)
    const res = await adminFetch(`/events/${id}/delegate`, {
      method: 'POST', body: JSON.stringify({ phone: delegatePhone }),
    })
    const d = await res.json()
    if (res.ok) { setDelegatePhone(''); flash('Admin link sent via SMS!') }
    else flash(`Error: ${d.error}`)
    setDelegateSending(false)
  }

  const cancelEvent = async () => {
    const res = await adminFetch(`/events/${id}/cancel`, {
      method: 'POST', body: JSON.stringify({ message: cancelMsg || undefined }),
    })
    if (res.ok) { await load(); setShowCancelConfirm(false); flash('Event cancelled') }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <button onClick={() => navigate('/admin/calendar')} className="text-gray-400 hover:text-gray-600">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold">{event.title}</h1>
              {isCancelled && (
                <span className="px-2 py-0.5 bg-red-100 text-red-600 text-xs font-medium rounded-full">Cancelled</span>
              )}
            </div>
            <p className="text-sm text-gray-500">{event.eventDate} at {event.meetTime}</p>
          </div>
        </div>
      </div>

      {actionMsg && (
        <div className="fixed bottom-4 right-4 bg-green-600 text-white px-4 py-3 rounded-xl shadow-lg z-50 text-sm font-medium">
          {actionMsg}
        </div>
      )}

      {rsvpModal && (
        <RsvpModal
          title={rsvpModalTitle}
          rsvps={rsvpModalList}
          onClose={() => setRsvpModal(null)}
        />
      )}

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* RSVP Stats — clickable */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Going', count: confirmed.length, key: 'yes' as const, color: 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' },
            { label: 'Not Going', count: declined.length, key: 'no' as const, color: 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100' },
            { label: 'No Response', count: pending.length, key: 'pending' as const, color: 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100' },
          ].map(s => (
            <button
              key={s.label}
              onClick={() => setRsvpModal(s.key)}
              className={`rounded-xl border p-4 text-center transition-colors cursor-pointer ${s.color}`}
            >
              <div className="text-2xl font-bold">{s.count}</div>
              <div className="text-xs font-medium mt-1">{s.label}</div>
            </button>
          ))}
        </div>

        {/* Route card — map + 3 big stats */}
        {(() => {
          const finalDest = destinations.find(d => d.id === event.finalDestinationId)
          const hasRoute = !!(event.startPointAddress && finalDest?.address)
          const mapsUrl = event.startPointAddress && finalDest?.address
            ? buildBikeDirectionsUrl(event.startPointAddress, finalDest.address)
            : finalDest?.mapsUrl

          if (!hasRoute && !distanceLoading) return null

          return (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="flex items-center justify-between px-5 pt-4 pb-2">
                <h2 className="font-semibold text-sm text-gray-700 flex items-center gap-2">
                  <Navigation size={16} /> Route
                </h2>
                {mapsUrl && (
                  <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs font-medium text-green-600 hover:text-green-700">
                    <ExternalLink size={12} /> Open in Maps
                  </a>
                )}
              </div>

              {/* Map */}
              <div ref={mapRef} className="w-full" style={{ height: 320 }} />

              {/* 3 large stats */}
              <div className="grid grid-cols-3 divide-x divide-gray-100 border-t border-gray-100">
                {distanceLoading ? (
                  <div className="col-span-3 flex justify-center items-center py-6">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-green-600" />
                  </div>
                ) : distance ? (
                  <>
                    <div className="text-center py-5 px-2">
                      <div className="text-2xl font-bold text-gray-900">{distance.oneWay}</div>
                      <div className="text-xs text-gray-400 mt-1">One Way</div>
                    </div>
                    <div className="text-center py-5 px-2">
                      <div className="text-2xl font-bold text-gray-900">{distance.elevationGainFt ?? '—'}</div>
                      <div className="text-xs text-gray-400 mt-1">Elevation Gain</div>
                    </div>
                    <div className="text-center py-5 px-2">
                      <div className="text-2xl font-bold text-gray-900">{distance.roundTrip}</div>
                      <div className="text-xs text-gray-400 mt-1">Round Trip</div>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          )
        })()}

        {/* Departure & Destinations */}
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {/* Departure */}
          <div className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-sm text-gray-700 flex items-center gap-2">
                <Bike size={16} /> Departure
              </h2>
              {!editingDeparture && event.startPointAddress && (
                <button onClick={() => setEditingDeparture(true)}
                  className="text-xs text-gray-400 hover:text-green-600 font-medium">
                  Change
                </button>
              )}
            </div>
            {editingDeparture ? (
              <div className="space-y-2">
                <PlacesAutocomplete
                  placeholder="Search for start location..."
                  onSelect={place => setPendingDeparture({ name: place.name, address: place.address })}
                />
                {pendingDeparture && <p className="text-xs text-gray-400">{pendingDeparture.address}</p>}
                <div className="flex gap-2">
                  <button onClick={() => { setEditingDeparture(false); setPendingDeparture(null) }}
                    className="flex-1 border border-gray-200 text-gray-600 py-1.5 rounded-lg text-xs hover:bg-gray-50">
                    Cancel
                  </button>
                  <button onClick={saveDeparture} disabled={!pendingDeparture}
                    className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white py-1.5 rounded-lg text-xs font-medium">
                    Save
                  </button>
                </div>
              </div>
            ) : event.startPointAddress ? (
              <p className="text-sm text-gray-800">{event.startPointName || event.startPointAddress}</p>
            ) : (
              <button onClick={() => setEditingDeparture(true)}
                className="text-sm text-green-600 hover:text-green-700 font-medium">
                + Set departure point
              </button>
            )}
          </div>

          {/* Destinations */}
          <div className="p-5">
            <h2 className="font-semibold text-sm text-gray-700 mb-4 flex items-center gap-2">
              <MapPin size={16} /> Destinations
            </h2>
            {destinations.length === 0 && <p className="text-sm text-gray-400 mb-4">No destinations yet</p>}
            <div className="space-y-3 mb-4">
              {destinations.map(dest => {
                const votes = voteTallies[dest.id] || 0
                const isFinal = event.finalDestinationId === dest.id
                return (
                  <div key={dest.id} className={`flex items-center gap-3 p-3 rounded-lg border ${isFinal ? 'border-green-400 bg-green-50' : 'border-gray-100 bg-gray-50'}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{dest.name}</span>
                        {isFinal && <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full">FINAL</span>}
                        {votes > 0 && <span className="text-xs text-gray-500">{votes} vote{votes !== 1 ? 's' : ''}</span>}
                      </div>
                      {(dest.address && event.startPointAddress
                        ? buildBikeDirectionsUrl(event.startPointAddress, dest.address)
                        : dest.mapsUrl) && (
                        <a
                          href={dest.address && event.startPointAddress
                            ? buildBikeDirectionsUrl(event.startPointAddress, dest.address)
                            : dest.mapsUrl!}
                          target="_blank" rel="noopener noreferrer"
                          className="text-xs text-green-600 hover:underline flex items-center gap-1 mt-0.5">
                          <ExternalLink size={11} /> Bike directions
                        </a>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {!isFinal && (
                        <button onClick={() => selectDestination(dest.id)}
                          className="text-xs bg-green-100 hover:bg-green-200 text-green-700 px-2.5 py-1 rounded-lg font-medium transition-colors">
                          Select
                        </button>
                      )}
                      <button onClick={() => deleteDestination(dest.id)}
                        className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
            <form onSubmit={addDestination} className="space-y-2">
              <div className="flex gap-2">
                <div className="flex-1">
                  <PlacesAutocomplete
                    placeholder="Search for a destination..."
                    onSelect={(place: PlaceResult) => setNewDest(d => ({ ...d, name: place.name, address: place.address }))}
                  />
                  {newDest.address && (
                    <p className="text-xs text-gray-400 mt-1 px-1">{newDest.address}</p>
                  )}
                </div>
                <button type="submit" className="self-start bg-green-600 hover:bg-green-700 text-white p-2.5 rounded-lg transition-colors">
                  <Plus size={18} />
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Notification Schedule */}
        {!isCancelled && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-sm text-gray-700 flex items-center gap-2">
                <Send size={16} /> Notification Schedule
              </h2>
              {!editingSchedule && (
                <button onClick={openEditSchedule} className="text-xs text-gray-400 hover:text-green-600 font-medium">Edit</button>
              )}
            </div>
            {editingSchedule ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Heads-up + vote</label>
                  <select
                    value={scheduleForm.headsUpDaysBefore}
                    onChange={e => setScheduleForm(f => ({ ...f, headsUpDaysBefore: Number(e.target.value) }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                  >
                    {[7, 6, 5, 4, 3, 2, 1].map(d => (
                      <option key={d} value={d}>{d} day{d !== 1 ? 's' : ''} before</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Day-of confirmation</label>
                  <select
                    value={scheduleForm.dayOfConfirmHour}
                    onChange={e => setScheduleForm(f => ({ ...f, dayOfConfirmHour: Number(e.target.value) }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                  >
                    {HOUR_OPTIONS.map(h => (
                      <option key={h} value={h}>{formatHour(h)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Group chat creation</label>
                  <select
                    value={scheduleForm.groupChatHour}
                    onChange={e => setScheduleForm(f => ({ ...f, groupChatHour: Number(e.target.value) }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                  >
                    {HOUR_OPTIONS.map(h => (
                      <option key={h} value={h}>{formatHour(h)}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={() => setEditingSchedule(false)}
                    className="flex-1 border border-gray-200 text-gray-600 py-1.5 rounded-lg text-xs hover:bg-gray-50">
                    Cancel
                  </button>
                  <button onClick={saveSchedule}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white py-1.5 rounded-lg text-xs font-medium">
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Heads-up + vote</span>
                  {event.scheduledInviteAt
                    ? <span className="text-gray-700">{getDaysBefore(event.eventDate, event.scheduledInviteAt)} days before{event.invitesSentAt ? ' ✓' : ''}</span>
                    : <span className="text-gray-300">not set</span>}
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Day-of confirmation</span>
                  {event.scheduledDayOfConfirmAt
                    ? <span className="text-gray-700">{formatHour(getLocalHour(event.scheduledDayOfConfirmAt))}{event.dayOfConfirmSentAt ? ' ✓' : ''}</span>
                    : <span className="text-gray-300">not set</span>}
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Group chat creation</span>
                  {event.scheduledGroupChatAt
                    ? <span className="text-gray-700">{formatHour(getLocalHour(event.scheduledGroupChatAt))}{event.groupChatCreatedAt ? ' ✓' : ''}</span>
                    : <span className="text-gray-300">not set</span>}
                </div>
              </div>
            )}
          </div>
        )}

        {/* SMS Actions */}
        {!isCancelled && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
            <h2 className="font-semibold text-sm text-gray-700 flex items-center gap-2">
              <MessageSquare size={16} /> SMS Actions
            </h2>
            <div className="border border-gray-100 rounded-lg p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Send 2-Day Invites</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {event.invitesSentAt ? `Sent ${new Date(event.invitesSentAt).toLocaleString()}` : 'Text all riders asking for RSVP + destination vote'}
                  </p>
                </div>
                <button onClick={sendInvites}
                  className="flex-shrink-0 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors">
                  <Send size={14} /> Send
                </button>
              </div>
            </div>
            <div className="border border-gray-100 rounded-lg p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Create Group Chat</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {event.groupChatCreatedAt ? `Created ${new Date(event.groupChatCreatedAt).toLocaleString()}` : `Twilio group with ${confirmed.length} confirmed riders`}
                  </p>
                </div>
                <button onClick={createGroupChat} disabled={confirmed.length === 0}
                  className="flex-shrink-0 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors">
                  <Users size={14} /> Create
                </button>
              </div>
            </div>
            <div className="border border-gray-100 rounded-lg p-4">
              <p className="text-sm font-medium mb-2">Text Blast</p>
              <form onSubmit={sendBlast} className="space-y-2">
                <div className="flex gap-3 text-xs">
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input type="radio" checked={blastAudience === 'confirmed'} onChange={() => setBlastAudience('confirmed')} />
                    Confirmed riders only
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input type="radio" checked={blastAudience === 'all'} onChange={() => setBlastAudience('all')} />
                    All members
                  </label>
                </div>
                <textarea placeholder="Your message..." value={blastMsg}
                  onChange={e => setBlastMsg(e.target.value)} rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 resize-none" />
                <button type="submit"
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors">
                  <Send size={14} /> Send Blast
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Delegation */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-sm text-gray-700 mb-3 flex items-center gap-2">
            <UserCheck size={16} /> Send Admin Access
          </h2>
          <form onSubmit={sendDelegate} className="flex gap-2">
            <input
              type="tel"
              placeholder="Phone number"
              value={delegatePhone}
              onChange={e => setDelegatePhone(e.target.value)}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            />
            <button
              type="submit"
              disabled={delegateSending || !delegatePhone.trim()}
              className="bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors"
            >
              <Send size={14} /> Send
            </button>
          </form>
          <p className="text-xs text-gray-400 mt-2">They'll receive the event admin link via SMS.</p>
        </div>

        {/* Cancel Event */}
        {!isCancelled && (
          <div className="bg-white rounded-xl border border-red-100 p-5">
            <h2 className="font-semibold text-sm text-red-600 mb-3 flex items-center gap-2">
              <AlertTriangle size={16} /> Cancel Event
            </h2>
            {!showCancelConfirm ? (
              <button onClick={() => setShowCancelConfirm(true)}
                className="w-full border border-red-300 text-red-600 hover:bg-red-50 py-2.5 rounded-lg text-sm font-medium transition-colors">
                Cancel This Ride
              </button>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">This will cancel the event. Optionally send a message to confirmed riders:</p>
                <textarea placeholder="Cancellation message (optional)" value={cancelMsg}
                  onChange={e => setCancelMsg(e.target.value)} rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 resize-none" />
                <div className="flex gap-2">
                  <button onClick={() => setShowCancelConfirm(false)}
                    className="flex-1 border border-gray-200 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors">
                    Keep Event
                  </button>
                  <button onClick={cancelEvent}
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg text-sm font-medium transition-colors">
                    Yes, Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
