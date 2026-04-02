'use client'
import { useEffect } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type { Property, Producer } from '@/types'

interface PropertiesMapProps {
  properties: (Property & { producer?: Producer })[]
  centerLat?: number
  centerLng?: number
  zoom?: number
  highlightLat?: number
  highlightLng?: number
  highlightLabel?: string
}

export default function PropertiesMap({
  properties,
  centerLat = -15.7942,
  centerLng = -47.8822,
  zoom = 5,
  highlightLat,
  highlightLng,
  highlightLabel,
}: PropertiesMapProps) {
  const withGps = properties.filter((p) => p.gps_lat !== null && p.gps_lng !== null)

  // Auto-center on properties if available
  const mapCenter: [number, number] =
    withGps.length > 0
      ? [withGps[0].gps_lat!, withGps[0].gps_lng!]
      : highlightLat !== undefined && highlightLng !== undefined
      ? [highlightLat, highlightLng]
      : [centerLat, centerLng]

  return (
    <MapContainer
      center={mapCenter}
      zoom={zoom}
      className="w-full h-full rounded-xl"
      style={{ minHeight: 320 }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {withGps.map((prop) => (
        <CircleMarker
          key={prop.id}
          center={[prop.gps_lat!, prop.gps_lng!]}
          radius={8}
          pathOptions={{ color: '#16a34a', fillColor: '#16a34a', fillOpacity: 0.8, weight: 2 }}
        >
          <Popup>
            <div className="text-sm">
              <p className="font-semibold">{prop.name}</p>
              {prop.producer && <p className="text-gray-600">{prop.producer.name}</p>}
              <p className="text-gray-500">{prop.municipality}</p>
              {prop.area_ha && <p className="text-gray-500">{prop.area_ha} ha</p>}
            </div>
          </Popup>
        </CircleMarker>
      ))}

      {highlightLat !== undefined && highlightLng !== undefined && (
        <CircleMarker
          center={[highlightLat, highlightLng]}
          radius={10}
          pathOptions={{ color: '#dc2626', fillColor: '#dc2626', fillOpacity: 0.9, weight: 2 }}
        >
          <Popup>
            <p className="text-sm font-semibold">{highlightLabel ?? 'Localização da visita'}</p>
          </Popup>
        </CircleMarker>
      )}
    </MapContainer>
  )
}
