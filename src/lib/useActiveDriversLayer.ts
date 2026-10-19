// Camada "motoristas ativos" do mapa do /pedir-motorista (v3): busca perto do ponto de interesse (partida, ou o centro do mapa),
// atualiza a cada 30 s enquanto a aba está visível e desenha um marcador por motorista (carro/moto/bicicleta) na posição aproximada.
'use client'

import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import { supabase } from '@/lib/supabase/client'
import { vehicleMarkerHtml } from '@/lib/vehicleMarkerIcon'
import { countByKind, fetchActiveDrivers, type ActiveDriver } from '@/lib/activeDrivers'

const REFRESH_MS = 30_000
const MARKER_COLOR = '#2563eb'

interface Options {
    map: mapboxgl.Map | null
    mapReady: boolean
    enabled: boolean
    /** [lng, lat] do ponto de partida, se já houver; senão usa o centro do mapa */
    focus: [number, number] | null
}

export function useActiveDriversLayer({ map, mapReady, enabled, focus }: Options) {
    const [drivers, setDrivers] = useState<ActiveDriver[]>([])
    const [loaded, setLoaded] = useState(false)
    const markersRef = useRef<mapboxgl.Marker[]>([])
    const fittedRef = useRef(false)

    // busca (e repete a cada 30 s com a aba visível)
    useEffect(() => {
        if (!enabled || !map || !mapReady) return
        let cancelled = false
        const run = async () => {
            if (document.visibilityState !== 'visible') return
            const c = focus ? { lng: focus[0], lat: focus[1] } : map.getCenter()
            const list = await fetchActiveDrivers(supabase, c.lat, c.lng, 30)
            if (!cancelled) { setDrivers(list); setLoaded(true) }
        }
        void run()
        const t = setInterval(() => { void run() }, REFRESH_MS)
        const onVis = () => { if (document.visibilityState === 'visible') void run() }
        document.addEventListener('visibilitychange', onVis)
        return () => { cancelled = true; clearInterval(t); document.removeEventListener('visibilitychange', onVis) }
        // focus por valor (não por referência) para não refazer a busca a cada render
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, map, mapReady, focus?.[0], focus?.[1]])

    // 1ª vez com motoristas e sem ponto de partida: enquadra todos no mapa (se houver partida/localização, o mapa já está onde importa)
    useEffect(() => {
        if (!enabled || !map || !mapReady || fittedRef.current || focus || drivers.length === 0) return
        fittedRef.current = true
        const bounds = new mapboxgl.LngLatBounds()
        drivers.forEach((d) => bounds.extend([d.lng, d.lat]))
        try { map.fitBounds(bounds, { padding: { top: 70, bottom: 30, left: 30, right: 30 }, maxZoom: 14, duration: 600 }) } catch { /* mapa ainda sem tamanho */ }
    }, [drivers, enabled, map, mapReady, focus])

    // desenha os marcadores
    useEffect(() => {
        markersRef.current.forEach((m) => m.remove())
        markersRef.current = []
        if (!enabled || !map || !mapReady) return
        markersRef.current = drivers.map((d) => {
            const el = document.createElement('div')
            el.setAttribute('aria-label', `Motorista ativo (${d.kind})`)
            el.innerHTML = vehicleMarkerHtml(d.kind, MARKER_COLOR)
            return new mapboxgl.Marker({ element: el, anchor: 'center' }).setLngLat([d.lng, d.lat]).addTo(map)
        })
        return () => { markersRef.current.forEach((m) => m.remove()); markersRef.current = [] }
    }, [drivers, enabled, map, mapReady])

    return { drivers, counts: countByKind(drivers), loaded }
}
