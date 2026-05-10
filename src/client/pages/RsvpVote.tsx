import { useState, useEffect, useRef } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import {
  Bike, MapPin, Calendar, Clock, Check, X,
  AlertTriangle, Mountain, Navigation, ExternalLink, CheckCircle2,
} from 'lucide-react'
import { renderBikeRoute, RouteInfo, buildBikeDirectionsUrl } from '../lib/maps'

interface Destination {
  id: string
  name: string
  address?: string
  mapsUrl?: string
}

interface BikeEvent {
  id: string
  title: string
  eventDate: string
  meetTime: string
  description?: string
  status: string
  startPointName?: string
  startPointAddress?: string
}

interface RsvpData {
  event: BikeEvent
  destinations: Destination[]
  voteTallies: Record<string, number>
  member: { id: string; name: string }
  rsvp: { status: 'pending' | 'yes' | 'no'; destinationVoteId?: string | null; respondedAt?: string }
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  const ampm = h >= 12 ? 'PM' : 'AM'
  return `${hour12}:${String(m).padStart(2, '0')} ${ampm}`
}

export default function RsvpVote() {
  const { eventId } = useParams<{ eventId: string }>()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''

  const [data, setData] = useState<RsvpData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [status, setStatus] = useState<'pending' | 'yes' | 'no'>('pending')
  const [selectedDestId, setSelectedDestId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submittedMsg, setSubmittedMsg] = useState('')

  const mapRef = useRef<HTMLDivElement>(null)
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null)
  const [routeLoading, setRouteLoading] = useState(false)

  const fetchData = async () => {
    const res = await fetch(`/api/rsvp/${eventId}?token=${token}`)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(j.error || 'Invalid or expired link')
      setLoading(false)
      return
    }
    const d: RsvpData = await res.json()
    setData(d)
    setStatus(d.rsvp.status)
    setSelectedDestId(d.rsvp.destinationVoteId || null)
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [eventId, token])

  // Render route on the map whenever the selection or event data changes
  useEffect(() => {
    if (!data || !mapRef.current) return
    const start = data.event.startPointAddress
    const dest = data.destinations.find(d => d.id === selectedDestId)
    if (!start || !dest?.address) {
      setRouteInfo(null)
      return
    }
    setRouteLoading(true)
    setRouteInfo(null)
    renderBikeRoute(start, dest.address, mapRef.current)
      .then(info => setRouteInfo(info))
      .catch(() => setRouteInfo(null))
      .finally(() => setRouteLoading(false))
  }, [data, selectedDestId])

  const submit = async () => {
    if (!data) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/rsvp/${eventId}/respond?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          destinationVoteId: status === 'yes' ? selectedDestId : null,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError(j.error || 'Could not save your response')
      } else {
        setSubmittedMsg(status === 'yes' ? "You're in! 🚲" : 'Got it — maybe next time!')
        setTimeout(() => setSubmittedMsg(''), 4000)
        await fetchData()
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-500" />
    </div>
  )

  if (error || !data) return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center">
        <AlertTriangle className="mx-auto text-red-400 mb-3" size={48} />
        <h2 className="text-lg font-semibold text-gray-700">{error || 'Event not found'}</h2>
        <p className="text-sm text-gray-400 mt-1">This link may be invalid or expired.</p>
      </div>
    </div>
  )

  const { event, destinations, voteTallies, member } = data
  const isCancelled = event.status === 'cancelled'
  const selectedDest = destinations.find(d => d.id === selectedDestId)
  const noStartPoint = !event.startPointAddress

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-gradient-to-br from-amber-500 to-orange-500 text-white px-4 py-6">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-2 mb-1 text-amber-50">
            <Bike size={20} />
            <span className="font-semibold text-sm">Bike Party</span>
          </div>
          <h1 className="text-2xl font-bold mb-2">{event.title}</h1>
          <div className="flex flex-col gap-1 text-amber-50 text-sm">
            <div className="flex items-center gap-2">
              <Calendar size={14} />
              <span>{formatDate(event.eventDate)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock size={14} />
              <span>{formatTime(event.meetTime)}</span>
            </div>
            {event.startPointName && (
              <div className="flex items-center gap-2">
                <MapPin size={14} />
                <span>Meet at {event.startPointName}</span>
              </div>
            )}
          </div>
          {event.description && (
            <p className="mt-3 text-sm text-amber-50/90">{event.description}</p>
          )}
        </div>
      </div>

      {submittedMsg && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-green-600 text-white px-5 py-3 rounded-xl shadow-lg z-50 text-sm font-medium flex items-center gap-2">
          <CheckCircle2 size={16} /> {submittedMsg}
        </div>
      )}

      <div className="max-w-lg mx-auto px-4 py-5 space-y-4">
        {isCancelled && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3 text-red-700">
            <AlertTriangle size={20} />
            <p className="text-sm font-medium">This ride has been cancelled.</p>
          </div>
        )}

        {/* RSVP confirmation */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-800 mb-3">Hey {member.name} — coming?</h2>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setStatus('yes')}
              disabled={isCancelled}
              className={`py-3 rounded-lg font-medium text-sm flex items-center justify-center gap-2 border-2 transition ${
                status === 'yes'
                  ? 'bg-green-500 border-green-500 text-white'
                  : 'bg-white border-gray-200 text-gray-700 hover:border-green-300'
              } ${isCancelled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Check size={16} /> I'm in
            </button>
            <button
              type="button"
              onClick={() => setStatus('no')}
              disabled={isCancelled}
              className={`py-3 rounded-lg font-medium text-sm flex items-center justify-center gap-2 border-2 transition ${
                status === 'no'
                  ? 'bg-gray-700 border-gray-700 text-white'
                  : 'bg-white border-gray-200 text-gray-700 hover:border-gray-400'
              } ${isCancelled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <X size={16} /> Can't make it
            </button>
          </div>
        </div>

        {/* Destinations + map (only if going) */}
        {status === 'yes' && !isCancelled && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-800 mb-1 flex items-center gap-2">
              <MapPin size={16} /> Where should we ride?
            </h2>
            <p className="text-xs text-gray-500 mb-4">Tap a destination to preview the route.</p>

            {noStartPoint && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-xs text-amber-800">
                The organizer hasn't set a meet point yet, so we can't show route distances.
              </div>
            )}

            {/* Map */}
            <div
              ref={mapRef}
              className="w-full h-64 rounded-lg bg-gray-100 mb-3 overflow-hidden"
              style={{ display: selectedDestId && !noStartPoint ? 'block' : 'none' }}
            />
            {!selectedDestId && !noStartPoint && (
              <div className="w-full h-32 rounded-lg bg-gray-50 border border-dashed border-gray-200 mb-3 flex items-center justify-center text-xs text-gray-400">
                Select a destination to see the route
              </div>
            )}

            {/* Route info */}
            {selectedDestId && !noStartPoint && (
              <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <Navigation size={14} className="inline text-gray-500 mr-1" />
                  <span className="text-xs text-gray-500">Round trip</span>
                  <div className="text-base font-bold text-gray-800">
                    {routeLoading ? '…' : routeInfo?.roundTrip ?? '—'}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <Mountain size={14} className="inline text-gray-500 mr-1" />
                  <span className="text-xs text-gray-500">Elevation gain</span>
                  <div className="text-base font-bold text-gray-800">
                    {routeLoading ? '…' : routeInfo?.elevationGainFt ?? '—'}
                  </div>
                </div>
              </div>
            )}

            {/* Destination list */}
            <div className="space-y-2">
              {destinations.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No destinations yet — check back soon!</p>
              ) : destinations.map(dest => {
                const votes = voteTallies[dest.id] || 0
                const isSelected = selectedDestId === dest.id
                return (
                  <button
                    key={dest.id}
                    type="button"
                    onClick={() => setSelectedDestId(dest.id)}
                    className={`w-full text-left p-3 rounded-lg border-2 transition flex items-center gap-3 ${
                      isSelected
                        ? 'border-amber-500 bg-amber-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                      isSelected ? 'border-amber-500 bg-amber-500' : 'border-gray-300'
                    }`}>
                      {isSelected && <Check size={12} className="text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{dest.name}</div>
                      {dest.address && <div className="text-xs text-gray-500 truncate">{dest.address}</div>}
                    </div>
                    {votes > 0 && (
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full flex-shrink-0">
                        {votes} vote{votes !== 1 ? 's' : ''}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {selectedDest?.mapsUrl && (
              <a
                href={selectedDest.mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700"
              >
                <ExternalLink size={11} /> Open bike directions in Google Maps
              </a>
            )}
            {!selectedDest?.mapsUrl && selectedDest?.address && event.startPointAddress && (
              <a
                href={buildBikeDirectionsUrl(event.startPointAddress, selectedDest.address)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700"
              >
                <ExternalLink size={11} /> Open bike directions in Google Maps
              </a>
            )}
          </div>
        )}

        {/* Submit */}
        {!isCancelled && (
          <button
            type="button"
            onClick={submit}
            disabled={status === 'pending' || submitting}
            className={`w-full py-3.5 rounded-xl font-semibold text-sm transition ${
              status === 'pending' || submitting
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-amber-500 hover:bg-amber-600 text-white shadow-sm'
            }`}
          >
            {submitting ? 'Saving…' : status === 'yes' ? 'Lock it in' : status === 'no' ? "We'll miss you" : 'Pick yes or no'}
          </button>
        )}
      </div>
    </div>
  )
}
