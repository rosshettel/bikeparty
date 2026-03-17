import { useEffect, useRef, useState } from 'react'
import { loadMapsApi } from '../lib/maps'
import { MapPin } from 'lucide-react'

export interface PlaceResult {
  name: string
  address: string
  placeId: string
}

interface Props {
  placeholder?: string
  className?: string
  onSelect: (place: PlaceResult) => void
  /** If true, show just an address field (no establishment name) */
  addressOnly?: boolean
}

export default function PlacesAutocomplete({ placeholder = 'Search for a place...', className = '', onSelect, addressOnly = false }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    loadMapsApi().then(() => setReady(true)).catch(console.error)
  }, [])

  useEffect(() => {
    if (!ready || !inputRef.current) return

    const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
      types: addressOnly ? ['geocode'] : ['establishment', 'geocode'],
      fields: ['name', 'formatted_address', 'place_id', 'geometry'],
    })

    const listener = autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace()
      if (!place.formatted_address) return

      const name = addressOnly
        ? (place.formatted_address ?? '')
        : (place.name || place.formatted_address || '')

      const result: PlaceResult = {
        name,
        address: place.formatted_address ?? '',
        placeId: place.place_id ?? '',
      }
      setValue(name)
      onSelect(result)
    })

    return () => {
      google.maps.event.removeListener(listener)
    }
  }, [ready, addressOnly, onSelect])

  const baseClass = `w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 pl-9`

  return (
    <div className="relative">
      <MapPin size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
      <input
        ref={inputRef}
        type="text"
        placeholder={ready ? placeholder : 'Loading maps...'}
        disabled={!ready}
        value={value}
        onChange={e => setValue(e.target.value)}
        className={`${baseClass} ${className} ${!ready ? 'opacity-60' : ''}`}
        autoComplete="off"
      />
    </div>
  )
}
