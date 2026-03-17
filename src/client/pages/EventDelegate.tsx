import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import {
  MapPin, ExternalLink, Plus, Trash2, CheckCircle,
  Send, Users, MessageSquare, AlertTriangle, Bike
} from 'lucide-react'

interface Destination {
  id: string
  name: string
  mapsUrl?: string
}

interface RsvpItem {
  id: string
  status: 'pending' | 'yes' | 'no'
  destinationVote?: Destination
  member?: { name: string }
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
}

export default function EventDelegate() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''

  const [event, setEvent] = useState<BikeEvent | null>(null)
  const [destinations, setDestinations] = useState<Destination[]>([])
  const [rsvps, setRsvps] = useState<RsvpItem[]>([])
  const [delegateName, setDelegateName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionMsg, setActionMsg] = useState('')
  const [newDest, setNewDest] = useState({ name: '', mapsUrl: '' })
  const [blastMsg, setBlastMsg] = useState('')

  const flash = (msg: string) => {
    setActionMsg(msg)
    setTimeout(() => setActionMsg(''), 3000)
  }

  const fetchData = async () => {
    const res = await fetch(`/api/twilio/event-token/${id}?token=${token}`)
    if (!res.ok) { setError('Invalid or expired link'); setLoading(false); return }
    const d = await res.json()
    setEvent(d.event)
    setDestinations(d.destinations)
    setRsvps(d.rsvps)
    setDelegateName(d.delegateName)
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [id, token])

  const tokenHeaders = { 'Content-Type': 'application/json', 'x-event-token': token }

  const addDestination = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newDest.name.trim()) return
    const res = await fetch(`/api/admin/events/${id}/destinations`, {
      method: 'POST',
      headers: tokenHeaders,
      body: JSON.stringify(newDest),
    })
    if (res.ok) { setNewDest({ name: '', mapsUrl: '' }); await fetchData(); flash('Added!') }
  }

  const deleteDestination = async (destId: string) => {
    await fetch(`/api/admin/events/${id}/destinations/${destId}`, { method: 'DELETE', headers: tokenHeaders })
    await fetchData()
    flash('Removed')
  }

  const selectDestination = async (destId: string) => {
    await fetch(`/api/admin/events/${id}/destinations/${destId}/select`, { method: 'POST', headers: tokenHeaders })
    await fetchData()
    flash('Final destination set!')
  }

  const sendBlast = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!blastMsg.trim()) return
    const res = await fetch(`/api/admin/events/${id}/blast`, {
      method: 'POST',
      headers: tokenHeaders,
      body: JSON.stringify({ message: blastMsg, audience: 'confirmed' }),
    })
    const d = await res.json()
    if (res.ok) { setBlastMsg(''); flash(`Sent to ${d.sent} riders!`) }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-600" />
    </div>
  )

  if (error || !event) return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center">
        <AlertTriangle className="mx-auto text-red-400 mb-3" size={48} />
        <h2 className="text-lg font-semibold text-gray-700">{error || 'Event not found'}</h2>
        <p className="text-sm text-gray-400 mt-1">This link may be invalid or expired.</p>
      </div>
    </div>
  )

  const confirmed = rsvps.filter(r => r.status === 'yes')
  const voteTallies: Record<string, number> = {}
  confirmed.forEach(r => {
    if (r.destinationVote?.id) {
      voteTallies[r.destinationVote.id] = (voteTallies[r.destinationVote.id] || 0) + 1
    }
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-green-600 text-white px-4 py-6">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-2 mb-1">
            <Bike size={22} />
            <span className="font-semibold">Bike Party</span>
          </div>
          <h1 className="text-xl font-bold">{event.title}</h1>
          <p className="text-green-100 text-sm">{event.eventDate} at {event.meetTime} • Admin: {delegateName}</p>
        </div>
      </div>

      {actionMsg && (
        <div className="fixed bottom-4 right-4 bg-green-600 text-white px-4 py-3 rounded-xl shadow-lg z-50 text-sm font-medium">
          {actionMsg}
        </div>
      )}

      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Going', count: confirmed.length, color: 'bg-green-50 text-green-700 border-green-200' },
            { label: 'Not Going', count: rsvps.filter(r => r.status === 'no').length, color: 'bg-red-50 text-red-700 border-red-200' },
            { label: 'No Response', count: rsvps.filter(r => r.status === 'pending').length, color: 'bg-gray-50 text-gray-600 border-gray-200' },
          ].map(s => (
            <div key={s.label} className={`rounded-xl border p-3 text-center ${s.color}`}>
              <div className="text-xl font-bold">{s.count}</div>
              <div className="text-xs font-medium mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Destinations */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-sm text-gray-700 mb-3 flex items-center gap-2"><MapPin size={15} /> Destinations</h2>
          <div className="space-y-2 mb-4">
            {destinations.map(dest => {
              const votes = voteTallies[dest.id] || 0
              const isFinal = event.finalDestinationId === dest.id
              return (
                <div key={dest.id} className={`p-3 rounded-lg border flex items-center gap-3 ${isFinal ? 'border-green-400 bg-green-50' : 'border-gray-100 bg-gray-50'}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{dest.name}</span>
                      {isFinal && <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full">FINAL</span>}
                      {votes > 0 && <span className="text-xs text-gray-500">{votes} vote{votes !== 1 ? 's' : ''}</span>}
                    </div>
                    {dest.mapsUrl && (
                      <a href={dest.mapsUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-green-600 flex items-center gap-1 mt-0.5">
                        <ExternalLink size={11} /> Bike directions
                      </a>
                    )}
                  </div>
                  <div className="flex gap-1">
                    {!isFinal && (
                      <button onClick={() => selectDestination(dest.id)} className="text-xs bg-green-100 hover:bg-green-200 text-green-700 px-2 py-1 rounded font-medium">
                        Pick
                      </button>
                    )}
                    <button onClick={() => deleteDestination(dest.id)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          <form onSubmit={addDestination} className="space-y-2">
            <input type="text" placeholder="Add destination" value={newDest.name}
              onChange={e => setNewDest(d => ({ ...d, name: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
            <input type="url" placeholder="Google Maps URL (optional)" value={newDest.mapsUrl}
              onChange={e => setNewDest(d => ({ ...d, mapsUrl: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
            <button type="submit" className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg text-sm font-medium">
              Add Destination
            </button>
          </form>
        </div>

        {/* Text Blast */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-sm text-gray-700 mb-3 flex items-center gap-2"><Send size={15} /> Text Blast to Confirmed Riders</h2>
          <form onSubmit={sendBlast} className="space-y-2">
            <textarea placeholder="Your message..." value={blastMsg}
              onChange={e => setBlastMsg(e.target.value)} rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 resize-none" />
            <button type="submit" className="w-full bg-orange-500 hover:bg-orange-600 text-white py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2">
              <Send size={14} /> Send to {confirmed.length} Riders
            </button>
          </form>
        </div>

        {/* Confirmed riders */}
        {confirmed.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-sm text-gray-700 mb-3 flex items-center gap-2"><Users size={15} /> Going ({confirmed.length})</h2>
            {confirmed.map(r => (
              <div key={r.id} className="flex items-center justify-between py-1.5 text-sm border-b border-gray-50 last:border-0">
                <span>{r.member?.name || 'Unknown'}</span>
                {r.destinationVote && <span className="text-xs text-gray-400">{r.destinationVote.name}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
