// src/lib/devDrive.ts — MOTORISTA DE TESTE (só LOCAL, só em desenvolvimento): faz o carro do motorista aparecer e ANDAR pelas ruas de verdade
// (rota do Mapbox) no mapa de navegação de /aceitar-corridas/mapa, a cada passo da corrida (ir até a partida, corrida em andamento, paradas, destino).
// Em produção, staging, preview e dentro do /tres-telas (que tem o próprio GPS de teatro) isto não existe: `devDriveAvailable()` é falso.
// Também grava a posição em `localStorage.iuser_dev_pos` (que `lib/nativeGeolocation` já respeita só em dev local) para as conferências de
// "cheguei na parada" e "concluir a corrida (≤ 100 m do destino)" enxergarem o carro, e em `driver_pricing.live_*` para o passageiro ver.
'use client'

import { useEffect, useRef } from 'react'
import { isLocalDevOnly } from '@/lib/devOnly'
import { fetchRoadPath, haversineKm } from '@/lib/mapboxRoute'
import { supabase } from '@/lib/supabase/client'

export type LngLat = [number, number]
export interface DriveTarget { lng: number; lat: number; key: string }

const KEY_ON = 'iuser_dev_drive'
const KEY_SPEED = 'iuser_dev_drive_speed'
const KEY_POS = 'iuser_dev_pos'
const KEY_MARK = 'iuser_dev_pos_sim'
/** ~40 km/h: dá para acompanhar a corrida de ~3 km em alguns minutos; o chip acelera 3× e 6× */
const BASE_M_PER_S = 11

export const devDriveAvailable = (): boolean => typeof window !== 'undefined' && isLocalDevOnly() && window.parent === window
export const devDriveEnabled = (): boolean => devDriveAvailable() && window.localStorage.getItem(KEY_ON) !== '0'
export const devDriveSpeed = (): number => {
    const v = devDriveAvailable() ? Number(window.localStorage.getItem(KEY_SPEED)) : 1
    return v === 3 || v === 6 ? v : 1
}
export function setDevDriveEnabled(on: boolean) { try { if (on) window.localStorage.removeItem(KEY_ON); else window.localStorage.setItem(KEY_ON, '0') } catch { /* sem storage */ } }
export function setDevDriveSpeed(v: 1 | 3 | 6) { try { window.localStorage.setItem(KEY_SPEED, String(v)) } catch { /* sem storage */ } }

interface Path { key: string; pts: LngLat[]; cum: number[]; dist: number }

export interface UseDevDriveInput {
    /** ligado (o chip da tela liga/desliga) */
    on: boolean
    speed: number
    userId: string | null
    /** só anda com uma corrida aceita carregada */
    ready: boolean
    pos: LngLat | null
    setPos: (p: LngLat) => void
    /** para onde o carro vai agora (a partida, uma parada ou o destino); null = parado */
    target: DriveTarget | null
    /** de onde o carro "sai" quando ainda não há posição nenhuma: perto da partida */
    origin: LngLat | null
    /** leva o carro para lá uma vez por chave (ex.: acabou de tocar em "Iniciar corrida" sem ter chegado na partida) */
    snap: DriveTarget | null
}

export function useDevDrive(i: UseDevDriveInput): void {
    const ref = useRef(i)
    ref.current = i
    const path = useRef<Path | null>(null)
    const loading = useRef(false)
    const ticks = useRef(0)
    const snapped = useRef<string | null>(null)
    const started = useRef(false)

    // posição inicial: a última ao vivo do banco (se for perto da partida) ou ~1,5 km da partida
    useEffect(() => {
        if (!i.on || !i.ready || i.pos || started.current || !i.origin || !i.userId) return
        started.current = true
        const origin = i.origin
        const fallback: LngLat = [origin[0] - 0.012, origin[1] - 0.010]
        supabase.from('driver_pricing').select('live_lat, live_lng').eq('driver_id', i.userId).maybeSingle().then(({ data }) => {
            const d = data as { live_lat: number | null; live_lng: number | null } | null
            const live: LngLat | null = d && d.live_lat != null && d.live_lng != null ? [Number(d.live_lng), Number(d.live_lat)] : null
            // só reaproveita a última posição se ela for perto da partida (<= 6 km): de mais longe a demonstração leva minutos sem graça
            const start = live && haversineKm(live, origin) <= 6 ? live : fallback
            if (!ref.current.pos) ref.current.setPos(start)
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [i.on, i.ready, i.pos == null, i.origin?.[0], i.origin?.[1], i.userId])

    // "snap": leva o carro até lá na hora (uma vez por chave)
    useEffect(() => {
        if (!i.on || !i.snap || snapped.current === i.snap.key) return
        snapped.current = i.snap.key
        path.current = null
        ref.current.setPos([i.snap.lng, i.snap.lat])
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [i.on, i.snap?.key])

    // o passo de cada segundo
    useEffect(() => {
        if (!i.on) return
        const t = setInterval(() => {
            const { ready, pos, target, speed, userId, setPos } = ref.current
            if (!ready || !pos || !target) return
            let r = path.current
            if (!r || r.key !== target.key) {
                if (loading.current) return
                loading.current = true
                const key = target.key
                fetchRoadPath(pos, [target.lng, target.lat]).then((pts) => {
                    const pp: LngLat[] = pts || [pos, [target.lng, target.lat]]
                    const cum = [0]
                    for (let k = 0; k < pp.length - 1; k++) cum.push(cum[k] + haversineKm(pp[k], pp[k + 1]) * 1000)
                    path.current = { key, pts: pp, cum, dist: 0 }
                }).finally(() => { loading.current = false })
                return
            }
            const total = r.cum[r.cum.length - 1]
            if (r.dist >= total) return   // já chegou: fica parado até a próxima etapa
            r.dist = Math.min(total, r.dist + BASE_M_PER_S * (speed || 1))
            let next: LngLat
            if (r.dist >= total) next = [target.lng, target.lat]
            else {
                let k = 0
                while (r.cum[k + 1] < r.dist) k++
                const seg = r.cum[k + 1] - r.cum[k]
                const f = seg ? (r.dist - r.cum[k]) / seg : 1
                next = [r.pts[k][0] + (r.pts[k + 1][0] - r.pts[k][0]) * f, r.pts[k][1] + (r.pts[k + 1][1] - r.pts[k][1]) * f]
            }
            setPos(next)
            try { window.localStorage.setItem(KEY_POS, `${next[1]},${next[0]}`); window.localStorage.setItem(KEY_MARK, '1') } catch { /* sem storage */ }
            ticks.current++
            if (userId && ticks.current % 3 === 0) {
                supabase.from('driver_pricing').update({ live_lat: next[1], live_lng: next[0], live_updated_at: new Date().toISOString() }).eq('driver_id', userId).then(() => {})
            }
        }, 1000)
        return () => clearInterval(t)
    }, [i.on])

    // a posição fica guardada mesmo parado (as conferências de distância leem dela); ao sair da tela solta o GPS de teste
    useEffect(() => {
        if (!i.on || !i.pos) return
        try { window.localStorage.setItem(KEY_POS, `${i.pos[1]},${i.pos[0]}`); window.localStorage.setItem(KEY_MARK, '1') } catch { /* sem storage */ }
    }, [i.on, i.pos])
    useEffect(() => () => {
        try { if (window.localStorage.getItem(KEY_MARK)) { window.localStorage.removeItem(KEY_POS); window.localStorage.removeItem(KEY_MARK) } } catch { /* sem storage */ }
    }, [])
}
