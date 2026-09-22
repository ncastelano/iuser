// src/app/(main)/pedir-motorista/escolher-local/page.tsx
//
// Escolher no mapa a partida, a chegada ou a parada do pedido de corrida —
// rota própria (não uma camada por cima de /pedir-motorista), porque
// misturar os dois mapas na mesma tela estava dando problema. O local
// escolhido é gravado no mesmo rascunho usado pelo redirect de login
// (sessionStorage) e a pessoa volta pra /pedir-motorista, que já sabe
// restaurar dali.
'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { X } from 'lucide-react'
import { saveRideDraft, loadRideDraft } from '@/lib/rideRequestDraft'
import { useProfile } from '@/app/contexts/ProfileContext'
import { addRecentRideOrigin } from '@/lib/recentRideOrigins'
import { addRecentRideDestination } from '@/lib/recentRideDestinations'
import { saveRidePlace } from '@/lib/savedRidePlaces'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'
const DEFAULT_CENTER: [number, number] = [-63.9039, -8.7612] // Porto Velho

type FieldKind = 'origin' | 'destination' | 'stop0' | 'stop1'

const FIELD_LABEL: Record<FieldKind, string> = {
    origin: 'Mova o mapa até a partida',
    destination: 'Mova o mapa até a chegada',
    stop0: 'Mova o mapa até a 1ª parada',
    stop1: 'Mova o mapa até a 2ª parada',
}

async function reverseGeocode(lng: number, lat: number): Promise<string | null> {
    try {
        const res = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${mapboxgl.accessToken}&language=pt&types=address,place,locality`
        )
        const data = await res.json()
        return data.features?.[0]?.place_name || null
    } catch {
        return null
    }
}

export default function EscolherLocalPage() {
    const router = useRouter()
    const { userId } = useProfile()
    const mapContainerRef = useRef<HTMLDivElement | null>(null)
    const mapRef = useRef<mapboxgl.Map | null>(null)

    const [field, setField] = useState<FieldKind | null>(null)
    const [address, setAddress] = useState('')
    const [resolving, setResolving] = useState(false)

    // Lido do próprio window.location (não useSearchParams/Suspense), mesmo
    // padrão já usado em /pedir-motorista pra não precisar de Suspense aqui.
    useEffect(() => {
        if (typeof window === 'undefined') return
        const f = new URLSearchParams(window.location.search).get('field')
        if (f === 'origin' || f === 'destination' || f === 'stop0' || f === 'stop1') setField(f)
        else router.replace('/pedir-motorista')
    }, [router])

    // Mapa: centraliza no que já estava escolhido pra esse campo (se houver),
    // senão na partida/chegada já escolhidas, senão o centro padrão.
    useEffect(() => {
        if (!field || !mapContainerRef.current || mapRef.current) return

        const draft = loadRideDraft()
        const currentForField =
            field === 'origin' ? draft?.origin
                : field === 'destination' ? draft?.destination
                    : draft?.stops?.[field === 'stop0' ? 0 : 1]
        const start: [number, number] =
            currentForField?.coords || draft?.origin?.coords || draft?.destination?.coords || DEFAULT_CENTER

        const map = new mapboxgl.Map({
            container: mapContainerRef.current,
            style: 'mapbox://styles/mapbox/streets-v12',
            center: start,
            zoom: 16,
            attributionControl: false,
        })
        mapRef.current = map

        const resolveCenter = async () => {
            const center = map.getCenter()
            setResolving(true)
            const result = await reverseGeocode(center.lng, center.lat)
            setResolving(false)
            setAddress(result || `Local (${center.lat.toFixed(5)}, ${center.lng.toFixed(5)})`)
        }

        map.on('load', resolveCenter)
        map.on('moveend', resolveCenter)

        return () => {
            map.remove()
            mapRef.current = null
        }
    }, [field])

    const handleCancel = () => router.push('/pedir-motorista')

    const handleConfirm = () => {
        if (!field || !mapRef.current) return
        const center = mapRef.current.getCenter()
        const place = { address: address || `Local (${center.lat.toFixed(5)}, ${center.lng.toFixed(5)})`, coords: [center.lng, center.lat] as [number, number] }

        if (field === 'origin') {
            addRecentRideOrigin(place)
            if (userId) saveRidePlace(userId, 'origin', place).catch(() => {})
        } else if (field === 'destination') {
            addRecentRideDestination(place)
            if (userId) saveRidePlace(userId, 'destination', place).catch(() => {})
        }

        const draft = loadRideDraft() || {}
        if (field === 'origin' || field === 'destination') {
            draft[field] = place
        } else {
            const idx = field === 'stop0' ? 0 : 1
            const stops = Array.isArray(draft.stops) ? [...draft.stops] : []
            while (stops.length <= idx) stops.push({ address: '', coords: null, complement: '', complementOpen: false })
            stops[idx] = { ...stops[idx], address: place.address, coords: place.coords }
            draft.stops = stops
        }
        saveRideDraft({ ...draft, fromMapPicker: true })
        router.push('/pedir-motorista')
    }

    return (
        <div className="fixed inset-0" style={{ zIndex: 0 }}>
            <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" style={{ background: '#111' }} />

            <div className="absolute top-6 left-4 right-4 z-10 flex items-center gap-3">
                <button
                    onClick={handleCancel}
                    className="w-11 h-11 rounded-full flex items-center justify-center shadow-xl flex-shrink-0"
                    style={{ background: '#fff', color: '#111' }}
                >
                    <X size={20} />
                </button>
                <div className="flex-1 px-4 py-2.5 rounded-full shadow-xl text-center" style={{ background: '#fff' }}>
                    <span className="text-xs font-black" style={{ color: '#111' }}>
                        {field ? FIELD_LABEL[field] : 'Escolher local'}
                    </span>
                </div>
            </div>

            {/* Pin fixo no centro da tela — o mapa se move por baixo dele */}
            <div className="absolute z-10 pointer-events-none" style={{ left: '50%', top: '50%', transform: 'translate(-50%, -100%)' }}>
                <svg width="36" height="48" viewBox="0 0 24 32" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.4))' }}>
                    <path d="M12 0C5.383 0 0 5.383 0 12c0 9 12 20 12 20s12-11 12-20C24 5.383 18.617 0 12 0z" fill="#f97316" stroke="white" strokeWidth="1.5" />
                    <circle cx="12" cy="12" r="4.5" fill="white" />
                </svg>
            </div>
            <div className="absolute z-[9] pointer-events-none rounded-full" style={{ left: '50%', top: '50%', width: 10, height: 4, marginLeft: -5, marginTop: 2, background: 'rgba(0,0,0,0.35)', filter: 'blur(1px)' }} />

            <div className="absolute left-4 right-4 z-10" style={{ bottom: 28 }}>
                <div className="rounded-2xl p-4 shadow-2xl" style={{ background: GRADIENT }}>
                    <p className="text-[10px] font-black uppercase tracking-wider text-white/80 mb-1">Local selecionado</p>
                    <p className="text-sm font-bold text-white mb-3 min-h-[20px]">
                        {resolving ? 'Obtendo endereço...' : (address || 'Mova o mapa para escolher')}
                    </p>
                    <button
                        onClick={handleConfirm}
                        disabled={resolving || !field}
                        className="w-full py-3 rounded-xl font-black uppercase text-xs tracking-wider disabled:opacity-60"
                        style={{ background: '#fff', color: '#dc2626' }}
                    >
                        Confirmar localização
                    </button>
                </div>
            </div>
        </div>
    )
}
