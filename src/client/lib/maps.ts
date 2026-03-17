// Singleton Maps API loader — fetches key from server, loads script once

let apiKey = ''
let loadPromise: Promise<void> | null = null

export async function getConfig(): Promise<{ googleMapsApiKey: string }> {
  const res = await fetch('/api/config')
  return res.json()
}

export async function loadMapsApi(): Promise<void> {
  if (window.google?.maps?.places) return
  if (loadPromise) return loadPromise

  if (!apiKey) {
    const config = await getConfig()
    apiKey = config.googleMapsApiKey
  }

  if (!apiKey) {
    console.warn('No Google Maps API key configured')
    return
  }

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Google Maps'))
    document.head.appendChild(script)
  })

  return loadPromise
}

export function buildBikeDirectionsUrl(origin: string, destination: string): string {
  const params = new URLSearchParams({
    api: '1',
    origin,
    destination,
    travelmode: 'bicycling',
  })
  return `https://www.google.com/maps/dir/?${params.toString()}`
}

export async function getBikeDistance(
  origin: string,
  destination: string
): Promise<{ oneWay: string; roundTrip: string; miles: number } | null> {
  await loadMapsApi()
  if (!window.google?.maps) return null

  return new Promise(resolve => {
    const service = new google.maps.DirectionsService()
    service.route(
      { origin, destination, travelMode: google.maps.TravelMode.BICYCLING },
      (result, status) => {
        if (status !== 'OK' || !result) { resolve(null); return }
        const meters = result.routes[0]?.legs[0]?.distance?.value ?? 0
        const miles = meters / 1609.344
        resolve({ oneWay: `${miles.toFixed(1)} mi`, roundTrip: `${(miles * 2).toFixed(1)} mi`, miles })
      }
    )
  })
}

/** Render a bike route on a map element and return distance info. */
export async function renderBikeRoute(
  origin: string,
  destination: string,
  mapDiv: HTMLElement
): Promise<{ oneWay: string; roundTrip: string; miles: number } | null> {
  await loadMapsApi()
  if (!window.google?.maps) return null

  return new Promise(resolve => {
    const map = new google.maps.Map(mapDiv, {
      zoom: 12,
      mapTypeId: 'roadmap',
      disableDefaultUI: true,
      zoomControl: true,
      gestureHandling: 'cooperative',
    })

    const renderer = new google.maps.DirectionsRenderer({
      map,
      polylineOptions: { strokeColor: '#16a34a', strokeWeight: 5 },
    })

    new google.maps.DirectionsService().route(
      { origin, destination, travelMode: google.maps.TravelMode.BICYCLING },
      (result, status) => {
        if (status !== 'OK' || !result) { resolve(null); return }
        renderer.setDirections(result)
        const meters = result.routes[0]?.legs[0]?.distance?.value ?? 0
        const miles = meters / 1609.344
        resolve({ oneWay: `${miles.toFixed(1)} mi`, roundTrip: `${(miles * 2).toFixed(1)} mi`, miles })
      }
    )
  })
}
