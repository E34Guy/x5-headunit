import { useEffect, useRef, useState } from 'react'
import type { Feature, FeatureCollection, LineString } from 'geojson'
import type { StyleSpecification } from 'maplibre-gl'
import * as maplibregl from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { Protocol } from 'pmtiles'

maplibregl.setWorkerUrl(maplibreWorkerUrl)
import Map, { Marker, type MapRef } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import { dufferinRouteCoordinates, useVehicleStore } from '../store/vehicleStore'

const LOCAL_STYLE = '/maps/style.json'
const LOCAL_ARCHIVE = '/maps/map.pmtiles'

let pmtilesReady = false

function ensurePmtilesProtocol(): void {
  if (pmtilesReady) return
  const protocol = new Protocol()
  maplibregl.addProtocol('pmtiles', protocol.tile)
  pmtilesReady = true
}

export function NavigationMap({ layout = 'card' }: { layout?: 'card' | 'stage' }) {
  const latitude = useVehicleStore((state) => state.currentLocation.latitude)
  const longitude = useVehicleStore((state) => state.currentLocation.longitude)
  const heading = useVehicleStore((state) => state.heading)
  const speed = useVehicleStore((state) => state.gpsSpeed)
  const mapRef = useRef<MapRef>(null)
  const styleRequest = useRef<AbortController | null>(null)
  const usingLocalStyle = useRef(false)
  const [mapStyle, setMapStyle] = useState<StyleSpecification>(() => fallbackStyle(isDarkCabin()))
  const [offline, setOffline] = useState(true)
  const [follow, setFollow] = useState(true)
  const [dark, setDark] = useState(isDarkCabin)
  const stage = layout === 'stage'

  useEffect(() => {
    ensurePmtilesProtocol()
    const controller = new AbortController()
    styleRequest.current = controller
    void loadLocalStyle(controller.signal).then((style) => {
      if (controller.signal.aborted || !style) return
      usingLocalStyle.current = true
      setOffline(false)
      setMapStyle(style)
    })
    return () => {
      controller.abort()
      styleRequest.current = null
    }
  }, [])

  useEffect(() => {
    const root = document.documentElement
    const observer = new MutationObserver(() => setDark(isDarkCabin()))
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (usingLocalStyle.current) return
    setMapStyle(fallbackStyle(dark))
  }, [dark])

  useEffect(() => {
    const map = mapRef.current?.getMap()
    if (!map || !follow) return
    map.easeTo({
      center: [longitude, latitude],
      bearing: heading,
      duration: 1000,
      essential: true,
    })
  }, [latitude, longitude, heading, follow])

  useEffect(() => {
    const map = mapRef.current?.getMap()
    if (!map) return
    const resize = () => map.resize()
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [mapStyle])

  return (
    <div
      className={`relative h-full min-h-0 overflow-hidden bg-surface ${
        stage ? 'rounded-3xl shadow-card' : 'rounded-2xl shadow-card ring-1 ring-black/5'
      }`}
    >
      <Map
        ref={mapRef}
        mapLib={maplibregl}
        mapStyle={mapStyle}
        initialViewState={{
          longitude,
          latitude,
          zoom: stage ? 16 : 15.5,
          bearing: heading,
          pitch: 0,
        }}
        minPitch={0}
        maxPitch={0}
        maxZoom={20}
        minZoom={2}
        dragPan
        dragRotate
        touchZoomRotate
        touchPitch={false}
        pitchWithRotate={false}
        cooperativeGestures={false}
        attributionControl={false}
        canvasContextAttributes={{ antialias: true }}
        style={{ width: '100%', height: '100%' }}
        onDragStart={() => setFollow(false)}
        onRotateStart={(event) => {
          if (event.originalEvent) setFollow(false)
        }}
        onError={() => {
          if (usingLocalStyle.current) {
            usingLocalStyle.current = false
            setOffline(true)
            setMapStyle(fallbackStyle(isDarkCabin()))
          }
        }}
      >
        <Marker longitude={longitude} latitude={latitude} rotation={heading} rotationAlignment="map" anchor="center">
          <VehicleChevron />
        </Marker>
      </Map>
      <div
        className={`pointer-events-none absolute left-3 top-3 rounded-full bg-surface/90 px-3 py-1 font-medium text-muted shadow-card ${
          stage ? 'text-sm' : 'text-xs'
        }`}
      >
        {offline ? 'Offline map' : 'Local map'} · {Math.round(speed)} km/h
      </div>
      <button
        type="button"
        onClick={() => setFollow(true)}
        aria-pressed={follow}
        className={`absolute bottom-3 right-3 min-h-12 min-w-12 rounded-full px-4 text-sm font-semibold shadow-card transition active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint ${
          follow ? 'bg-mint text-black' : 'bg-surface text-ink'
        }`}
      >
        {follow ? 'Tracking' : 'Track'}
      </button>
    </div>
  )
}

function VehicleChevron() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden="true" className="drop-shadow">
      <path d="M18 3.5 31 31.5 18 25.2 5 31.5Z" fill="#1c69d4" stroke="#ffffff" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  )
}

async function loadLocalStyle(signal: AbortSignal): Promise<StyleSpecification | null> {
  try {
    const response = await fetch(LOCAL_STYLE, { signal, cache: 'no-store' })
    if (!response.ok) return null
    const style: unknown = await response.json()
    if (!isStyle(style) || !hasTileSource(style)) return null
    if (styleUsesArchive(style)) {
      const archive = await fetch(LOCAL_ARCHIVE, { method: 'HEAD', signal, cache: 'no-store' })
      if (!archive.ok) return null
    }
    return style
  } catch {
    return null
  }
}

function isStyle(value: unknown): value is StyleSpecification {
  if (typeof value !== 'object' || value === null) return false
  const version = (value as { version?: unknown }).version
  return version === 8 && Array.isArray((value as { layers?: unknown }).layers)
}

function hasTileSource(style: StyleSpecification): boolean {
  const sources = style.sources ?? {}
  return Object.values(sources).some((source) => {
    if (typeof source !== 'object' || source === null || !('type' in source)) return false
    return source.type === 'vector' || source.type === 'raster' || source.type === 'raster-dem'
  })
}

function styleUsesArchive(style: StyleSpecification): boolean {
  return JSON.stringify(style).includes(LOCAL_ARCHIVE) || JSON.stringify(style).includes('pmtiles://')
}

function fallbackStyle(dark: boolean): StyleSpecification {
  return {
    version: 8,
    name: 'cabin-offline',
    sources: {
      graticule: {
        type: 'geojson',
        data: graticule(),
      },
      dufferin: {
        type: 'geojson',
        data: line(dufferinRouteCoordinates()),
      },
    },
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: { 'background-color': dark ? '#17191c' : '#2b2e33' },
      },
      {
        id: 'graticule',
        type: 'line',
        source: 'graticule',
        paint: {
          'line-color': dark ? '#3a3f46' : '#6d737c',
          'line-width': 1,
        },
      },
      {
        id: 'dufferin-casing',
        type: 'line',
        source: 'dufferin',
        paint: {
          'line-color': dark ? '#d5d8dc' : '#9aa0a6',
          'line-width': 12,
        },
      },
      {
        id: 'dufferin',
        type: 'line',
        source: 'dufferin',
        paint: {
          'line-color': dark ? '#ff6600' : '#f3f4f6',
          'line-width': 5,
        },
      },
    ],
  }
}

function graticule(): FeatureCollection<LineString> {
  const features: Feature<LineString>[] = []
  const originLatitude = 43.723
  const originLongitude = -79.4565
  const span = 0.02
  const step = 0.0015
  for (let longitude = originLongitude - span; longitude <= originLongitude + span; longitude += step) {
    features.push(line([
      [roundCoord(longitude), originLatitude - span],
      [roundCoord(longitude), originLatitude + span],
    ]))
  }
  for (let latitude = originLatitude - span; latitude <= originLatitude + span; latitude += step) {
    features.push(line([
      [originLongitude - span, roundCoord(latitude)],
      [originLongitude + span, roundCoord(latitude)],
    ]))
  }
  return { type: 'FeatureCollection', features }
}

function roundCoord(value: number): number {
  return Math.round(value * 1000) / 1000
}

function line(coordinates: [number, number][]): Feature<LineString> {
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates },
  }
}

function isDarkCabin(): boolean {
  return document.documentElement.classList.contains('dark')
}
