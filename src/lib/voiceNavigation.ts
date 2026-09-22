// src/lib/voiceNavigation.ts
//
// Orientação por voz pro motorista durante a corrida (até a partida, e
// depois até a chegada) — anuncia a próxima manobra (virar, seguir, etc.)
// conforme ele se aproxima dela, igual a um app de navegação comum.
'use client'

import { useEffect, useRef } from 'react'
import { fetchRouteWithSteps, haversineKm, type RouteStep } from '@/lib/mapboxRoute'

// Fala uma frase, cortando o que estivesse sendo dito antes — sem isso, uma
// manobra atrás da outra empilharia e o motorista ouviria tudo atrasado.
export function speak(text: string) {
    if (typeof window === 'undefined') return
    const synth = window.speechSynthesis
    if (!synth) return
    try {
        synth.cancel()
        const utter = new SpeechSynthesisUtterance(text)
        utter.lang = 'pt-BR'
        utter.rate = 1
        utter.pitch = 1
        const voices = synth.getVoices()
        const ptVoice = voices.find((v) => v.lang?.toLowerCase().startsWith('pt'))
        if (ptVoice) utter.voice = ptVoice
        synth.speak(utter)
    } catch {
        // sem síntese de voz disponível nesse navegador — só não fala
    }
}

const REFETCH_MS = 60000 // refaz a rota de vez em quando, pra acompanhar o motorista se ele desviar
const ANNOUNCE_FAR_M = 250 // primeiro aviso, com antecedência
const ANNOUNCE_NEAR_M = 60 // segundo aviso, bem em cima da manobra
const PASS_M = 30 // considera que passou da manobra e avança pra próxima

function distancePhrase(meters: number): string {
    if (meters < 80) return 'Agora'
    const rounded = Math.round(meters / 50) * 50
    return `Em ${rounded} metros`
}

interface UseVoiceNavigationParams {
    /** O motorista quer voz ligada (preferência dele, painel-motorista). */
    enabled: boolean
    /** Só navega quando true — ex: a caminho da partida, ou corrida iniciada. */
    active: boolean
    /** Posição ao vivo do motorista, [lng, lat]. */
    driverCoords: [number, number] | null
    /** Pra onde ele está indo nessa etapa: o ponto de partida, ou o destino final. */
    targetCoords: [number, number] | null
    /** Muda quando a etapa muda (ex: `${rideId}-pickup` → `${rideId}-trip`) — refaz a rota do zero. */
    legKey: string | null
    /** Frase dita ao começar essa etapa (troca de rota) — se omitida, usa a padrão. */
    introMessage?: string
}

// Orientação de voz curva a curva: busca a rota com manobras (Mapbox
// Directions) e vai anunciando cada uma conforme a posição ao vivo do
// motorista se aproxima dela. Sem componente visual — só fala.
export function useVoiceNavigation({ enabled, active, driverCoords, targetCoords, legKey, introMessage }: UseVoiceNavigationParams) {
    const stepsRef = useRef<RouteStep[]>([])
    const nextIndexRef = useRef(0)
    const announcedFarRef = useRef<Set<number>>(new Set())
    const lastLegKeyRef = useRef<string | null>(null)
    const lastFetchAtRef = useRef(0)
    const fetchingRef = useRef(false)

    useEffect(() => {
        if (!enabled || !active || !driverCoords || !targetCoords || !legKey) {
            stepsRef.current = []
            lastLegKeyRef.current = null
            return
        }

        const legChanged = lastLegKeyRef.current !== legKey
        const dueForRefetch = legChanged || Date.now() - lastFetchAtRef.current > REFETCH_MS

        if (dueForRefetch && !fetchingRef.current) {
            fetchingRef.current = true
            lastLegKeyRef.current = legKey
            lastFetchAtRef.current = Date.now()
            fetchRouteWithSteps(driverCoords, targetCoords)
                .then((result) => {
                    stepsRef.current = result?.steps || []
                    nextIndexRef.current = 0
                    announcedFarRef.current = new Set()
                    if (legChanged && stepsRef.current.length > 0) {
                        speak(introMessage || 'Iniciando orientação por voz.')
                    }
                })
                .finally(() => {
                    fetchingRef.current = false
                })
            return
        }

        const steps = stepsRef.current
        const idx = nextIndexRef.current
        if (idx >= steps.length) return

        const step = steps[idx]
        const meters = haversineKm(driverCoords, step.location) * 1000

        if (meters <= ANNOUNCE_FAR_M && !announcedFarRef.current.has(idx)) {
            announcedFarRef.current.add(idx)
            speak(`${distancePhrase(meters)}, ${step.instruction}.`)
        } else if (meters <= ANNOUNCE_NEAR_M && announcedFarRef.current.has(idx) && !announcedFarRef.current.has(-idx - 1)) {
            // Segundo aviso, mais perto — marcado num "slot" separado (índice negativo) pra não confundir com o primeiro.
            announcedFarRef.current.add(-idx - 1)
            speak(step.instruction + '.')
        }

        if (meters <= PASS_M) {
            nextIndexRef.current = idx + 1
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, active, driverCoords, targetCoords, legKey, introMessage])

    // Corta a voz se a pessoa sair da corrida com algo tocando.
    useEffect(() => {
        return () => {
            try { window.speechSynthesis?.cancel() } catch { /* ok */ }
        }
    }, [])
}
