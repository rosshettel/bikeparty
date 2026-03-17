import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, MapPin, ExternalLink, Plus, Trash2, CheckCircle,
  Send, Users, MessageSquare, UserCheck, AlertTriangle, Copy, Bike
} from 'lucide-react'

interface Destination {
  id: string
  name: string
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

interface EventAdminPageProps {
  isDelegate?: boolean
  delegateToken?: string
  delegateName?: string
}

function EventAdminContent({ isDelegate = false, delegateToken, delegateName }: EventAdminPageProps) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const adminToken = localStorage.getItem('adminToken') || ''

  const [data, setData] = useState<EventData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionMsg, setActionMsg] = useState('')

  // Forms
  const [newDest, setNewDest] = useState({ name: '', mapsUrl: '' })
  const [blastMsg, setBlastMsg] = useState('')
  const [blastAudience, setBlastAudience] = useState<'confirmed' | 'all'>('confirmed')
  const [delegateForm, setDelegateForm] = useState({ name: '', memberId: '' })
  const [delegateLink, setDelegateLink] = useState('')
  const [cancelMsg, setCancelMsg] = useState('')
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(isDelegate ? { 'x-event-token': delegateToken! } : { 'x-admin-token': adminToken }),
  }

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
      const d = await res.json()
      setData(d)
    } catch {
      setError('Network error')
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

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

  // Vote tallies
  const voteTallies: Record<string, number> = {}
  confirmed.forEach(r => {
    if (r.destinationVote?.id) {
      voteTallies[r.destinationVote.id] = (voteTallies[r.destinationVote.id] || 0) + 1
    }
  })

  const addDestination = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newDest.name.trim()) return
    const res = await adminFetch(`/events/${id}/destinations`, {
      method: 'POST',
      body: JSON.stringify(newDest),
    })
    if (res.ok) { setNewDest({ name: '', mapsUrl: '' }); await load(); flash('Destination added') }
  }

  const deleteDestination = async (destId: string) => {
    await adminFetch(`/events/${id}/destinations/${destId}`, { method: 'DELETE' })
    await load()
    flash('Destination removed')
  }

  const selectDestination = async (destId: string) => {
    await adminFetch(`/events/${id}/destinations/${destId}/select`, { method: 'POST' })
    await load()
    flash('Final destination set!')
  }

  const sendInvites = async () => {
    const res = await adminFetch(`/events/${id}/invite`, { method: 'POST' })
    const d = await res.json()
    if (res.ok) flash(`Invites sent to ${d.sent} riders!`)
    else flash(`Error: ${d.error}`)
  }

  const sendBlast = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!blastMsg.trim()) return
    const res = await adminFetch(`/events/${id}/blast`, {
      method: 'POST',
      body: JSON.stringify({ message: blastMsg, audience: blastAudience }),
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

  const createDelegate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!delegateForm.name.trim()) return
    const res = await adminFetch(`/events/${id}/delegate`, {
      method: 'POST',
      body: JSON.stringify({ delegateName: delegateForm.name }),
    })
    const d = await res.json()
    if (res.ok) { setDelegateLink(d.link); setDelegateForm({ name: '', memberId: '' }); await load() }
    else flash(`Error: ${d.error}`)
  }

  const cancelEvent = async () => {
    const res = await adminFetch(`/events/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ message: cancelMsg || undefined }),
    })
    if (res.ok) { await load(); setShowCancelConfirm(false); flash('Event cancelled') }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          {!isDelegate && (
            <button onClick={() => navigate('/admin/calendar')} className="text-gray-400 hover:text-gray-600">
              <ArrowLeft size={20} />
            </button>
          )}
          {isDelegate && <Bike size={24} className="text-green-600" />}
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold">{event.title}</h1>
              {isCancelled && (
                <span className="px-2 py-0.5 bg-red-100 text-red-600 text-xs font-medium rounded-full">Cancelled</span>
              )}
            </div>
            <p className="text-sm text-gray-500">
              {event.eventDate} at {event.meetTime}
              {isDelegate && delegateName && ` • Admin: ${delegateName}`}
            </p>
          </div>
        </div>
      </div>

      {actionMsg && (
        <div className="fixed bottom-4 right-4 bg-green-600 text-white px-4 py-3 rounded-xl shadow-lg z-50 text-sm font-medium">
          {actionMsg}
        </div>
      )}

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* RSVP Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Going', count: confirmed.length, color: 'bg-green-50 text-green-700 border-green-200' },
            { label: 'Not Going', count: declined.length, color: 'bg-red-50 text-red-700 border-red-200' },
            { label: 'No Response', count: pending.length, color: 'bg-gray-50 text-gray-600 border-gray-200' },
          ].map(s => (
            <div key={s.label} className={`rounded-xl border p-4 text-center ${s.color}`}>
              <div className="text-2xl font-bold">{s.count}</div>
              <div className="text-xs font-medium mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Confirmed riders list */}
        {confirmed.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-sm text-gray-700 mb-3 flex items-center gap-2">
              <Users size={16} /> Confirmed Riders
            </h2>
            <div className="space-y-2">
              {confirmed.map(r => (
                <div key={r.id} className="flex items-center justify-between text-sm">
                  <span className="font-medium">{r.member?.name || 'Unknown'}</span>
                  {r.destinationVote && (
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                      voted: {r.destinationVote.name}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Destinations */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-sm text-gray-700 mb-4 flex items-center gap-2">
            <MapPin size={16} /> Destinations
          </h2>

          {destinations.length === 0 && (
            <p className="text-sm text-gray-400 mb-4">No destinations yet</p>
          )}

          <div className="space-y-3 mb-4">
            {destinations.map(dest => {
              const votes = voteTallies[dest.id] || 0
              const isFinal = event.finalDestinationId === dest.id
              return (
                <div key={dest.id} className={`flex items-center gap-3 p-3 rounded-lg border ${isFinal ? 'border-green-400 bg-green-50' : 'border-gray-100 bg-gray-50'}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{dest.name}</span>
                      {isFinal && <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full">FINAL</span>}
                      {votes > 0 && <span className="text-xs text-gray-500">{votes} vote{votes !== 1 ? 's' : ''}</span>}
                    </div>
                    {dest.mapsUrl && (
                      <a href={dest.mapsUrl} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-green-600 hover:underline flex items-center gap-1 mt-0.5">
                        <ExternalLink size={11} /> Bike directions
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {!isFinal && (
                      <button
                        onClick={() => selectDestination(dest.id)}
                        className="text-xs bg-green-100 hover:bg-green-200 text-green-700 px-2.5 py-1 rounded-lg font-medium transition-colors"
                        title="Set as final destination"
                      >
                        Select
                      </button>
                    )}
                    <button
                      onClick={() => deleteDestination(dest.id)}
                      className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          <form onSubmit={addDestination} className="flex gap-2">
            <div className="flex-1 space-y-2">
              <input
                type="text"
                placeholder="Destination name"
                value={newDest.name}
                onChange={e => setNewDest(d => ({ ...d, name: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              />
              <input
                type="url"
                placeholder="Google Maps bike URL (optional)"
                value={newDest.mapsUrl}
                onChange={e => setNewDest(d => ({ ...d, mapsUrl: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              />
            </div>
            <button type="submit"
              className="self-start bg-green-600 hover:bg-green-700 text-white p-2.5 rounded-lg transition-colors">
              <Plus size={18} />
            </button>
          </form>
        </div>

        {/* SMS Actions */}
        {!isCancelled && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
            <h2 className="font-semibold text-sm text-gray-700 flex items-center gap-2">
              <MessageSquare size={16} /> SMS Actions
            </h2>

            {/* Send Invites */}
            <div className="border border-gray-100 rounded-lg p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Send 2-Day Invites</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {event.invitesSentAt
                      ? `Sent ${new Date(event.invitesSentAt).toLocaleString()}`
                      : 'Text all riders asking for RSVP + destination vote'}
                  </p>
                </div>
                <button
                  onClick={sendInvites}
                  className="flex-shrink-0 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors"
                >
                  <Send size={14} /> Send
                </button>
              </div>
            </div>

            {/* Group Chat */}
            <div className="border border-gray-100 rounded-lg p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Create Group Chat</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {event.groupChatCreatedAt
                      ? `Created ${new Date(event.groupChatCreatedAt).toLocaleString()}`
                      : `Create Twilio group with ${confirmed.length} confirmed riders`}
                  </p>
                </div>
                <button
                  onClick={createGroupChat}
                  disabled={confirmed.length === 0}
                  className="flex-shrink-0 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors"
                >
                  <Users size={14} /> Create
                </button>
              </div>
            </div>

            {/* Blast */}
            <div className="border border-gray-100 rounded-lg p-4">
              <p className="text-sm font-medium mb-2">Text Blast</p>
              <form onSubmit={sendBlast} className="space-y-2">
                <div className="flex gap-2 text-xs">
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input type="radio" checked={blastAudience === 'confirmed'} onChange={() => setBlastAudience('confirmed')} />
                    Confirmed riders only
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input type="radio" checked={blastAudience === 'all'} onChange={() => setBlastAudience('all')} />
                    All members
                  </label>
                </div>
                <textarea
                  placeholder="Your message..."
                  value={blastMsg}
                  onChange={e => setBlastMsg(e.target.value)}
                  rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 resize-none"
                />
                <button type="submit"
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors">
                  <Send size={14} /> Send Blast
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Delegation (admin only) */}
        {!isDelegate && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-sm text-gray-700 mb-4 flex items-center gap-2">
              <UserCheck size={16} /> Delegate Admin Access
            </h2>
            <form onSubmit={createDelegate} className="space-y-2">
              <input
                type="text"
                placeholder="Delegate's name"
                value={delegateForm.name}
                onChange={e => setDelegateForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              />
              <button type="submit"
                className="w-full border border-green-600 text-green-700 hover:bg-green-50 py-2 rounded-lg text-sm font-medium transition-colors">
                Generate Link
              </button>
            </form>

            {delegateLink && (
              <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-xs text-gray-600 mb-1">Share this link:</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs break-all text-gray-800">{delegateLink}</code>
                  <button
                    onClick={() => { navigator.clipboard.writeText(delegateLink); flash('Copied!') }}
                    className="flex-shrink-0 p-1.5 text-green-600 hover:bg-green-100 rounded"
                  >
                    <Copy size={14} />
                  </button>
                </div>
              </div>
            )}

            {data.delegates && data.delegates.length > 0 && (
              <div className="mt-4">
                <p className="text-xs text-gray-500 mb-2">Existing delegates:</p>
                {data.delegates.map(d => (
                  <div key={d.id} className="text-xs text-gray-600 py-1">{d.delegateName}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Cancel Event */}
        {!isCancelled && (
          <div className="bg-white rounded-xl border border-red-100 p-5">
            <h2 className="font-semibold text-sm text-red-600 mb-3 flex items-center gap-2">
              <AlertTriangle size={16} /> Cancel Event
            </h2>
            {!showCancelConfirm ? (
              <button
                onClick={() => setShowCancelConfirm(true)}
                className="w-full border border-red-300 text-red-600 hover:bg-red-50 py-2.5 rounded-lg text-sm font-medium transition-colors"
              >
                Cancel This Ride
              </button>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">This will cancel the event. Optionally send a message to confirmed riders:</p>
                <textarea
                  placeholder="Cancellation message (optional)"
                  value={cancelMsg}
                  onChange={e => setCancelMsg(e.target.value)}
                  rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
                />
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

export default function EventAdmin() {
  const adminToken = localStorage.getItem('adminToken') || ''
  const navigate = useNavigate()

  useEffect(() => {
    if (!adminToken) navigate('/admin')
  }, [])

  return <EventAdminContent isDelegate={false} />
}
