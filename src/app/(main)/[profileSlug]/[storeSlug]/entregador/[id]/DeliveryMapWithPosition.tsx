// app/(main)/entregador/[id]/components/DeliveryMapWithPosition.tsx
'use client'

import React, { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

import icon from 'leaflet/dist/images/marker-icon.png'
import iconShadow from 'leaflet/dist/images/marker-shadow.png'
const DefaultIcon = L.icon({ iconUrl: icon.src, shadowUrl: iconShadow.src, iconSize: [25, 41], iconAnchor: [12, 41] })
L.Marker.prototype.options.icon = DefaultIcon

export interface RouteStop {
    lat: number
    lng: number
    label: string
    address: string
    status: string
}

export interface DeliveryMapWithPositionProps {
    stops: RouteStop[]
    currentPosition?: { lat: number; lng: number } | null
    geoError?: string | null
}

function MapController({ stops, currentPosition }: { stops: RouteStop[]; currentPosition?: { lat: number; lng: number } | null }) {
    const map = useMap()
    const markersRef = useRef<L.Marker[]>([])

    useEffect(() => {
        markersRef.current.forEach(m => m.remove())
        markersRef.current = []

        stops.forEach(stop => {
            const iconHtml = `<div style="
        background: ${stop.status === 'delivered' ? '#22c55e' : '#f97316'};
        color: white;
        border-radius: 50%;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        font-weight: bold;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        border: 2px solid white;
      ">${stop.label}</div>`
            const customIcon = L.divIcon({ html: iconHtml, className: '', iconSize: [24, 24], iconAnchor: [12, 12] })
            const marker = L.marker([stop.lat, stop.lng], { icon: customIcon })
                .bindPopup(`<b>${stop.label}ª Parada</b><br/>${stop.address}`)
                .addTo(map)
            markersRef.current.push(marker)
        })

        if (currentPosition) {
            const positionIcon = L.divIcon({
                html: `<div style="
          background: #3b82f6;
          color: white;
          border-radius: 50%;
          width: 20px;
          height: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          box-shadow: 0 0 12px rgba(59,130,246,0.8);
          border: 2px solid white;
        ">📍</div>`,
                className: '',
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            })
            const posMarker = L.marker([currentPosition.lat, currentPosition.lng], { icon: positionIcon })
                .bindPopup('Sua posição atual')
                .addTo(map)
            markersRef.current.push(posMarker)

            // Centralizar o mapa na posição atual, mas mantendo os stops visíveis
            const bounds = L.latLngBounds([
                ...stops.map(s => [s.lat, s.lng] as [number, number]),
                [currentPosition.lat, currentPosition.lng] as [number, number]
            ])
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 })
        }

        return () => {
            markersRef.current.forEach(m => m.remove())
        }
    }, [stops, currentPosition, map])

    return null
}

export default function DeliveryMapWithPosition({ stops, currentPosition, geoError }: DeliveryMapWithPositionProps) {
    if (stops.length === 0 && !currentPosition) {
        return (
            <div className="h-full flex items-center justify-center text-xs" style={{ background: '#f3f4f6', color: '#6b7280', borderRadius: '0.75rem' }}>
                Nenhum ponto no mapa
            </div>
        )
    }

    const centerLat = stops.length > 0
        ? stops.reduce((s, p) => s + p.lat, 0) / stops.length
        : currentPosition?.lat ?? -23.5
    const centerLng = stops.length > 0
        ? stops.reduce((s, p) => s + p.lng, 0) / stops.length
        : currentPosition?.lng ?? -46.6

    const polylinePositions: [number, number][] = stops.map(s => [s.lat, s.lng] as [number, number])

    return (
        <>
            {geoError && (
                <div className="absolute top-2 left-2 z-10 bg-red-500 text-white text-[10px] px-2 py-1 rounded-full">
                    {geoError}
                </div>
            )}
            <MapContainer
                center={[centerLat, centerLng]}
                zoom={13}
                style={{ height: '100%', width: '100%' }}
                scrollWheelZoom={false}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapController stops={stops} currentPosition={currentPosition} />
                {polylinePositions.length > 1 && (
                    <Polyline positions={polylinePositions} color="#f97316" weight={4} opacity={0.8} />
                )}
            </MapContainer>
        </>
    )
}