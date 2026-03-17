import { useState } from 'react'
import { Bike, Plus, Minus, Send } from 'lucide-react'
import PlacesAutocomplete, { PlaceResult } from '../components/PlacesAutocomplete'

interface Person {
  name: string
  phone: string
}

export default function Signup() {
  const [people, setPeople] = useState<Person[]>([{ name: '', phone: '' }])
  const [suggestion, setSuggestion] = useState({ name: '', address: '', description: '' })
  const [submittedMembers, setSubmittedMembers] = useState(false)
  const [submittedSuggestion, setSubmittedSuggestion] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const addPerson = () => setPeople([...people, { name: '', phone: '' }])
  const removePerson = (i: number) => setPeople(people.filter((_, idx) => idx !== i))
  const updatePerson = (i: number, field: keyof Person, value: string) => {
    const next = [...people]
    next[i][field] = value
    setPeople(next)
  }

  const submitSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const valid = people.filter(p => p.name.trim() && p.phone.trim())
    if (valid.length === 0) return setError('Please add at least one person with name and phone.')
    setLoading(true)
    try {
      const res = await fetch('/api/public/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ people: valid }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setSubmittedMembers(true)
      setPeople([{ name: '', phone: '' }])
    } catch (err: any) {
      setError(err.message)
    }
    setLoading(false)
  }

  const submitSuggestion = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!suggestion.name.trim()) return setError('Please search for and select a destination.')
    // Use first person's name if available
    const firstName = people[0]?.name || 'Anonymous'
    const firstPhone = people[0]?.phone || ''
    setLoading(true)
    try {
      const res = await fetch('/api/public/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberName: firstName,
          memberPhone: firstPhone,
          name: suggestion.name,
          address: suggestion.address,
          description: suggestion.description,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setSubmittedSuggestion(true)
      setSuggestion({ name: '', address: '', description: '' })
    } catch (err: any) {
      setError(err.message)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white">
      {/* Header */}
      <div className="bg-green-600 text-white px-4 py-8 text-center">
        <div className="flex items-center justify-center gap-3 mb-2">
          <Bike size={40} />
          <h1 className="text-3xl font-bold">Bike Party</h1>
        </div>
        <p className="text-green-100 text-lg">Group rides, good vibes</p>
      </div>

      <div className="max-w-lg mx-auto px-4 py-8 space-y-8">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">{error}</div>
        )}

        {/* Sign-up section */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-xl font-bold mb-1">Join the Crew</h2>
          <p className="text-gray-500 text-sm mb-5">Add yourself and anyone riding with you. We'll text you before rides.</p>

          {submittedMembers ? (
            <div className="text-center py-6">
              <div className="text-4xl mb-3">🎉</div>
              <p className="font-semibold text-green-700">You're in! See you on the road.</p>
              <button
                className="mt-4 text-sm text-green-600 underline"
                onClick={() => setSubmittedMembers(false)}
              >
                Add more people
              </button>
            </div>
          ) : (
            <form onSubmit={submitSignup} className="space-y-4">
              {people.map((person, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <div className="flex-1 space-y-2">
                    <input
                      type="text"
                      placeholder="Name"
                      value={person.name}
                      onChange={e => updatePerson(i, 'name', e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                    />
                    <input
                      type="tel"
                      placeholder="Phone number"
                      value={person.phone}
                      onChange={e => updatePerson(i, 'phone', e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                    />
                  </div>
                  {people.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removePerson(i)}
                      className="mt-1 p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Minus size={18} />
                    </button>
                  )}
                </div>
              ))}

              <button
                type="button"
                onClick={addPerson}
                className="flex items-center gap-2 text-sm text-green-600 hover:text-green-700 font-medium py-1"
              >
                <Plus size={16} /> Add another rider
              </button>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
              >
                <Send size={18} />
                {loading ? 'Signing up...' : 'Sign Me Up!'}
              </button>
            </form>
          )}
        </div>

        {/* Suggestion section */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-xl font-bold mb-1">Suggest a Destination</h2>
          <p className="text-gray-500 text-sm mb-5">Got a great ride spot? Share it with the crew.</p>

          {submittedSuggestion ? (
            <div className="text-center py-6">
              <div className="text-4xl mb-3">🗺️</div>
              <p className="font-semibold text-green-700">Thanks for the suggestion!</p>
              <button
                className="mt-4 text-sm text-green-600 underline"
                onClick={() => setSubmittedSuggestion(false)}
              >
                Add another
              </button>
            </div>
          ) : (
            <form onSubmit={submitSuggestion} className="space-y-3">
              <PlacesAutocomplete
                placeholder="Search for a destination..."
                onSelect={place => setSuggestion(s => ({ ...s, name: place.name, address: place.address }))}
              />
              {suggestion.address && (
                <p className="text-xs text-gray-500 px-1">{suggestion.address}</p>
              )}
              <textarea
                placeholder="Any details? (optional)"
                value={suggestion.description}
                onChange={e => setSuggestion(s => ({ ...s, description: e.target.value }))}
                rows={2}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 resize-none"
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-white border-2 border-green-600 hover:bg-green-50 disabled:opacity-50 text-green-700 font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
              >
                <MapPin size={18} />
                {loading ? 'Submitting...' : 'Submit Suggestion'}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 pb-4">
          Your phone number is only used for ride notifications. No spam.
        </p>
      </div>
    </div>
  )
}
