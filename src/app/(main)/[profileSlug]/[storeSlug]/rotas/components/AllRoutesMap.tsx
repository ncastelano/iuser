// app/(main)/[profileSlug]/[storeSlug]/rotas/components/AllRoutesMap.tsx
'use client'

import React, { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Corrigir ícones padrão do Leaflet
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

export interface EmployeeRoute {
    employeeId: string
    employeeName: string
    color: string
    stops: RouteStop[]
}

export interface AllRoutesMapProps {
    storeLat: number
    storeLng: number
    routes: EmployeeRoute[]
}

// Componente para renderizar todos os marcadores e polylinhas das rotas
function RoutesRenderer({ routes, storeLat, storeLng }: { routes: EmployeeRoute[]; storeLat: number; storeLng: number }) {
    const map = useMap()
    const markersRef = useRef<L.Marker[]>([])

    useEffect(() => {
        // Limpar marcadores anteriores
        markersRef.current.forEach(m => m.remove())
        markersRef.current = []

        // Marcador da loja (ponto de partida)
        const storeIconHtml = `<div style="
      background: #3b82f6;
      color: white;
      border-radius: 50%;
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: bold;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      border: 2px solid white;
    ">🏪</div>`
        const storeIcon = L.divIcon({ html: storeIconHtml, className: '', iconSize: [28, 28], iconAnchor: [14, 14] })
        const storeMarker = L.marker([storeLat, storeLng], { icon: storeIcon })
            .bindPopup('Sua Loja')
            .addTo(map)
        markersRef.current.push(storeMarker)

        // Para cada entregador, desenhar seus pontos e rota
        routes.forEach(route => {
            const positions: [number, number][] = [[storeLat, storeLng]] // começa na loja

            route.stops.forEach(stop => {
                const iconHtml = `<div style="
          background: ${stop.status === 'delivered' ? '#22c55e' : route.color};
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
        ">${stop.label}</div>`
                const customIcon = L.divIcon({ html: iconHtml, className: '', iconSize: [22, 22], iconAnchor: [11, 11] })
                const marker = L.marker([stop.lat, stop.lng], { icon: customIcon })
                    .bindPopup(`<b>${route.employeeName}</b><br/>${stop.label}ª Parada<br/>${stop.address}`)
                    .addTo(map)
                markersRef.current.push(marker)
                positions.push([stop.lat, stop.lng])
            })

            // Polyline da rota
            if (positions.length > 1) {
                const polyline = L.polyline(positions, { color: route.color, weight: 4, opacity: 0.7 }).addTo(map)
                // guardar referência? não é necessário, mas poderia
            }
        })

        return () => {
            markersRef.current.forEach(m => m.remove())
        }
    }, [routes, storeLat, storeLng, map])

    return null
}

export default function AllRoutesMap({ storeLat, storeLng, routes }: AllRoutesMapProps) {
    if (routes.length === 0) {
        return (
            <div className="h-full flex items-center justify-center text-xs"
                style={{ background: '#f3f4f6', color: '#6b7280', borderRadius: '0.75rem' }}>
                Nenhuma rota no dia
            </div>
        )
    }

    // Calcular centro aproximado (média das primeiras paradas)
    const allPoints = routes.flatMap(r => r.stops)
    const centerLat = allPoints.length > 0 ? allPoints.reduce((s, p) => s + p.lat, 0) / allPoints.length : storeLat
    const centerLng = allPoints.length > 0 ? allPoints.reduce((s, p) => s + p.lng, 0) / allPoints.length : storeLng

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
            <RoutesRenderer routes={routes} storeLat={storeLat} storeLng={storeLng} />
        </MapContainer>
    )
}