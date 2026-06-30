// app/(main)/[profileSlug]/[storeSlug]/entregadores/components/DeliveryMap.tsx
'use client'

import React, { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Corrigir ícones padrão do Leaflet (necessário com bundlers)
import icon from 'leaflet/dist/images/marker-icon.png'
import iconShadow from 'leaflet/dist/images/marker-shadow.png'
const DefaultIcon = L.icon({ iconUrl: icon.src, shadowUrl: iconShadow.src, iconSize: [25, 41], iconAnchor: [12, 41] })
L.Marker.prototype.options.icon = DefaultIcon

export interface Stop {
    lat: number
    lng: number
    label: string
    address: string
    status: string
}

export interface DeliveryMapProps {
    stops: Stop[]
}

// Componente para criar ícones numerados e customizados
function NumberedMarkers({ stops }: { stops: Stop[] }) {
    const map = useMap()
    const markersRef = useRef<L.Marker[]>([])

    useEffect(() => {
        // Limpar marcadores anteriores
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

        return () => {
            markersRef.current.forEach(m => m.remove())
        }
    }, [stops, map])

    return null
}

export default function DeliveryMap({ stops }: DeliveryMapProps) {
    if (stops.length === 0) {
        return (
            <div className="h-full flex items-center justify-center text-xs"
                style={{ background: '#f3f4f6', color: '#6b7280', borderRadius: '0.75rem' }}>
                Nenhum ponto no mapa
            </div>
        )
    }

    const centerLat = stops.reduce((sum, s) => sum + s.lat, 0) / stops.length
    const centerLng = stops.reduce((sum, s) => sum + s.lng, 0) / stops.length
    const polylinePositions = stops.map(s => [s.lat, s.lng] as [number, number])

    return (
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
            <NumberedMarkers stops={stops} />
            {polylinePositions.length > 1 && (
                <Polyline positions={polylinePositions} color="#f97316" weight={4} opacity={0.8} />
            )}
        </MapContainer>
    )
}