// app/(main)/rastrear/[checkout_id]/components/CustomerTrackingMap.tsx
'use client'

import React, { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

import icon from 'leaflet/dist/images/marker-icon.png'
import iconShadow from 'leaflet/dist/images/marker-shadow.png'
const DefaultIcon = L.icon({ iconUrl: icon.src, shadowUrl: iconShadow.src, iconSize: [25, 41], iconAnchor: [12, 41] })
L.Marker.prototype.options.icon = DefaultIcon

export interface TrackingStop {
    sequence: number
    lat: number
    lng: number
    address: string
    status: string
}

export interface CustomerTrackingMapProps {
    storeLat: number
    storeLng: number
    stops: TrackingStop[]
    activeStopIndex: number // índice da parada atual (em trânsito ou próxima)
}

function CustomerMarkers({ storeLat, storeLng, stops, activeStopIndex }: CustomerTrackingMapProps) {
    const map = useMap()
    const markersRef = useRef<L.Marker[]>([])

    useEffect(() => {
        markersRef.current.forEach(m => m.remove())
        markersRef.current = []

        // Marcador da loja
        const storeIconHtml = `<div style="
      background: #3b82f6;
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
    ">L</div>`
        const storeIcon = L.divIcon({ html: storeIconHtml, className: '', iconSize: [24, 24], iconAnchor: [12, 12] })
        L.marker([storeLat, storeLng], { icon: storeIcon }).bindPopup('Loja').addTo(map)

        stops.forEach((stop, idx) => {
            const isActive = idx === activeStopIndex
            const isDelivered = stop.status === 'delivered'
            let bgColor = '#6b7280' // cinza pendente
            if (isDelivered) bgColor = '#22c55e'
            else if (isActive) bgColor = '#f97316'

            const iconHtml = `<div style="
        background: ${bgColor};
        color: white;
        border-radius: 50%;
        width: 22px;
        height: 22px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        font-weight: bold;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        border: 2px solid white;
        ${isActive ? 'animation: pulse 1.5s infinite;' : ''}
      ">${stop.sequence}</div>`
            const customIcon = L.divIcon({
                html: iconHtml,
                className: '',
                iconSize: [22, 22],
                iconAnchor: [11, 11],
            })
            const marker = L.marker([stop.lat, stop.lng], { icon: customIcon })
                .bindPopup(`<b>Parada ${stop.sequence}</b><br/>${stop.address}${isActive ? '<br/><em>Entregador está aqui</em>' : ''}`)
                .addTo(map)
            markersRef.current.push(marker)
        })

        return () => {
            markersRef.current.forEach(m => m.remove())
        }
    }, [storeLat, storeLng, stops, activeStopIndex, map])

    return null
}

export default function CustomerTrackingMap(props: CustomerTrackingMapProps) {
    const { storeLat, storeLng, stops } = props

    if (stops.length === 0) {
        return (
            <div className="h-full flex items-center justify-center text-xs" style={{ background: '#f3f4f6', color: '#6b7280', borderRadius: '0.75rem' }}>
                Aguardando rota...
            </div>
        )
    }

    const allLats = [storeLat, ...stops.map(s => s.lat)]
    const allLngs = [storeLng, ...stops.map(s => s.lng)]
    const centerLat = allLats.reduce((a, b) => a + b, 0) / allLats.length
    const centerLng = allLngs.reduce((a, b) => a + b, 0) / allLngs.length

    const polylinePositions: [number, number][] = [
        [storeLat, storeLng],
        ...stops.map(s => [s.lat, s.lng] as [number, number])
    ]

    return (
        <MapContainer
            center={[centerLat, centerLng]}
            zoom={12}
            style={{ height: '100%', width: '100%' }}
            scrollWheelZoom={false}
        >
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <CustomerMarkers {...props} />
            <Polyline positions={polylinePositions} color="#f97316" weight={4} opacity={0.8} />
        </MapContainer>
    )
}