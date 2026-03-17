import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, MapPin, ExternalLink, Plus, Trash2,
  Send, Users, MessageSquare, UserCheck, AlertTriangle, Bike, X, Search, Navigation
} from 'lucide-react'
import PlacesAutocomplete, { PlaceResult } from '../components/PlacesAutocomplete'
import { buildBikeDirectionsUrl, getBikeDistance } from '../lib/maps'

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

interface Member {
  id: string
  name: string
  phone: string
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
  conversationSid?: string
}

interface EventData {
  event: BikeEvent
  destinations: Destination[]
  rsvps: RsvpItem[]
  delegates?: Array<{ id: string; delegateName: string; token: string }>
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

// Modal to search and select a rider to delegate admin
function DelegateModal({ onSelect, onClose }: {
  onSelect: (member: Member) => void
  onClose: () => void
}) {
  const [members, setMembers] = useState<Member[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const token = localStorage.getItem('adminToken') || ''

  useEffect(() => {
    fetch('/api/admin/members', { headers: { 'x-admin-token': token } })
      .then(r => r.json())
      .then(data => { setMembers(Array.isArray(data) ? data : []); setLoading(false) })
  }, [])

  const filtered = members.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.phone.includes(search)
  )

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm max-h-[70vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h3 className="font-semibold">Choose a Rider</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={16} /></button>
        </div>
        <div className="p-3 border-b border-gray-100">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or phone..."
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            />
          </div>
        </div>
        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No riders found</p>
          ) : (
            filtered.map(m => (
              <button
                key={m.id}
                onClick={() => onSelect(m)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-green-50 text-left transition-colors border-b border-gray-50 last:border-0"
              >
                <div>
                  <p className="text-sm font-medium">{m.name}</p>
                  <p className="text-xs text-gray-400">{m.phone}</p>
                </div>
                <span className="text-xs text-green-600 font-medium">Select</span>
              </button>
            ))
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
  const [showDelegateModal, setShowDelegateModal] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  // Distance for final destination
  const [distance, setDistance] = useState<{ oneWay: string; roundTrip: string } | null>(null)
  const [distanceLoading, setDistanceLoading] = useState(false)

  // Departure point editing
  const [editingDeparture, setEditingDeparture] = useState(false)
  const [pendingDeparture, setPendingDeparture] = useState<{ name: string; address: string } | null>(null)

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

  // Recompute bike distance when final destination + start point are both known
  useEffect(() => {
    if (!data) return
    const { event, destinations } = data
    if (!event.startPointAddress || !event.finalDestinationId) { setDistance(null); return }
    const finalDest = destinations.find(d => d.id === event.finalDestinationId)
    if (!finalDest?.address) { setDistance(null); return }
    setDistanceLoading(true)
    setDistance(null)
    getBikeDistance(event.startPointAddress, finalDest.address)
      .then(d => setDistance(d))
      .catch(() => setDistance(null))
      .finally(() => setDistanceLoading(false))
  }, [data])

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

  const delegateTo = async (member: Member) => {
    setShowDelegateModal(false)
    const res = await adminFetch(`/events/${id}/delegate`, {
      method: 'POST', body: JSON.stringify({ memberId: member.id }),
    })
    const d = await res.json()
    if (res.ok) { await load(); flash(`Admin link sent to ${member.name} via SMS!`) }
    else flash(`Error: ${d.error}`)
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

      {showDelegateModal && (
        <DelegateModal
          onSelect={delegateTo}
          onClose={() => setShowDelegateModal(false)}
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

        {/* Departure point */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold text-sm text-gray-700 flex items-center gap-2">
              <Navigation size={16} /> Departure Point
            </h2>
            {!editingDeparture && (
              <button onClick={() => setEditingDeparture(true)}
                className="text-xs text-green-600 hover:text-green-700 font-medium">
                {event.startPointAddress ? 'Change' : 'Set'}
              </button>
            )}
          </div>

          {editingDeparture ? (
            <div className="space-y-2">
              <PlacesAutocomplete
                placeholder="Search for start location..."
                onSelect={place => setPendingDeparture({ name: place.name, address: place.address })}
              />
              {pendingDeparture && (
                <p className="text-xs text-gray-400 px-1">{pendingDeparture.address}</p>
              )}
              <div className="flex gap-2 pt-1">
                <button onClick={() => { setEditingDeparture(false); setPendingDeparture(null) }}
                  className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-lg text-sm hover:bg-gray-50">
                  Cancel
                </button>
                <button onClick={saveDeparture} disabled={!pendingDeparture}
                  className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white py-2 rounded-lg text-sm font-medium">
                  Save
                </button>
              </div>
            </div>
          ) : event.startPointAddress ? (
            <p className="text-sm text-gray-700">{event.startPointName || event.startPointAddress}</p>
          ) : (
            <p className="text-sm text-gray-400">No departure point set — add one to get bike directions and distance.</p>
          )}
        </div>

        {/* Route info — shown when start point + final destination are known */}
        {event.startPointAddress && event.finalDestinationId && (() => {
          const finalDest = destinations.find(d => d.id === event.finalDestinationId)
          if (!finalDest) return null
          const mapsUrl = finalDest.address
            ? buildBikeDirectionsUrl(event.startPointAddress!, finalDest.address)
            : finalDest.mapsUrl
          return (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <p className="text-xs font-semibold text-green-700 uppercase tracking-wide flex items-center gap-1">
                    <Navigation size={12} /> Route
                  </p>
                  <p className="text-sm text-gray-700">
                    <span className="font-medium">From:</span> {event.startPointName || event.startPointAddress}
                  </p>
                  <p className="text-sm text-gray-700">
                    <span className="font-medium">To:</span> {finalDest.name}
                  </p>
                  {distanceLoading ? (
                    <p className="text-xs text-gray-400">Computing distance…</p>
                  ) : distance ? (
                    <p className="text-sm text-green-700 font-medium">
                      🚲 {distance.oneWay} one-way · {distance.roundTrip} round trip
                    </p>
                  ) : (
                    <p className="text-xs text-gray-400">Distance unavailable — destination may need an address.</p>
                  )}
                </div>
                {mapsUrl && (
                  <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                    className="flex-shrink-0 flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors">
                    <ExternalLink size={12} /> Open in Maps
                  </a>
                )}
              </div>
            </div>
          )
        })()}

        {/* Destinations */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
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
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-sm text-gray-700 flex items-center gap-2">
              <UserCheck size={16} /> Delegate Admin Access
            </h2>
            <button
              onClick={() => setShowDelegateModal(true)}
              className="text-sm bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-colors"
            >
              <Plus size={14} /> Add Delegate
            </button>
          </div>
          <p className="text-xs text-gray-400 mb-3">Select a rider — they'll get the admin link via SMS.</p>
          {data.delegates && data.delegates.length > 0 ? (
            <div className="space-y-1">
              {data.delegates.map(d => (
                <div key={d.id} className="flex items-center gap-2 text-sm py-1.5 border-b border-gray-50 last:border-0">
                  <UserCheck size={13} className="text-green-500 flex-shrink-0" />
                  <span className="font-medium">{d.delegateName}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400">No delegates yet</p>
          )}
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
