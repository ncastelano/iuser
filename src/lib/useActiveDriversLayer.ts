// Camada "motoristas disponíveis" do mapa do /pedir-motorista (v3): busca perto do ponto de interesse (partida, ou o centro do mapa),
// atualiza a cada 30 s enquanto a aba está visível e desenha um marcador por motorista no MESMO estilo do /radar (foto do veículo num
// quadrado de borda verde). Tocar no marcador seleciona o motorista (o card com os detalhes e o "chamar" é da tela). Posição aproximada;
// fonte e regras de privacidade em lib/radarDrivers.ts.
'use client'

import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import { supabase } from '@/lib/supabase/client'
import { countDriversByKind, createDriverMarkerElement, fetchRadarDrivers, type RadarDriverItem } from '@/lib/radarDrivers'

const REFRESH_MS = 30_000

interface Options {
    map: mapboxgl.Map | null
    mapReady: boolean
    enabled: boolean
    /** [lng, lat] do ponto de partida, se já houver; senão usa o centro do mapa */
    focus: [number, number] | null
    /** tocou no marcador de um motorista */
    onSelect?: (driver: RadarDriverItem) => void
}

export function useActiveDriversLayer({ map, mapReady, enabled, focus, onSelect }: Options) {
    const [drivers, setDrivers] = useState<RadarDriverItem[]>([])
    const [loaded, setLoaded] = useState(false)
    const markersRef = useRef<mapboxgl.Marker[]>([])
    const unmountsRef = useRef<(() => void)[]>([])
    const fittedRef = useRef(false)
    const onSelectRef = useRef(onSelect)
    onSelectRef.current = onSelect

    // busca (e repete a cada 30 s com a aba visível)
    useEffect(() => {
        if (!enabled || !map || !mapReady) return
        let cancelled = false
        const run = async () => {
            if (document.visibilityState !== 'visible') return
            const c = focus ? { lng: focus[0], lat: focus[1] } : map.getCenter()
            const list = await fetchRadarDrivers(supabase, c.lat, c.lng, 30)
            if (!cancelled && list) { setDrivers(list); setLoaded(true) }   // falha da consulta: mantém o que já havia e não afirma "sem motoristas"
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
        const clear = () => {
            markersRef.current.forEach((m) => m.remove())
            markersRef.current = []
            unmountsRef.current.forEach((u) => u())
            unmountsRef.current = []
        }
        clear()
        if (!enabled || !map || !mapReady) return
        markersRef.current = drivers.map((d) => {
            const { el, unmount } = createDriverMarkerElement(d, () => {
                map.flyTo({ center: [d.lng, d.lat], zoom: Math.max(map.getZoom(), 15), duration: 600 })
                onSelectRef.current?.(d)
            })
            unmountsRef.current.push(unmount)
            return new mapboxgl.Marker({ element: el, anchor: 'center' }).setLngLat([d.lng, d.lat]).addTo(map)
        })
        return clear
    }, [drivers, enabled, map, mapReady])

    return { drivers, counts: countDriversByKind(drivers), loaded }
}
