// src/hooks/useSpeechInput.ts — falar em vez de digitar (o ditado do PRÓPRIO navegador, em português; nada é gravado pelo iUser).
// Onde o navegador não tem ditado (alguns Safari/Firefox), `supported` é falso e o botão do microfone não aparece.
'use client'
import { useCallback, useEffect, useRef, useState } from 'react'

export function useSpeechInput(onText: (text: string, final: boolean) => void) {
    const [supported, setSupported] = useState(false)
    const [listening, setListening] = useState(false)
    const rec = useRef<any>(null)
    const cb = useRef(onText)
    cb.current = onText

    useEffect(() => {
        const W = window as any
        setSupported(!!(W.SpeechRecognition || W.webkitSpeechRecognition))
        return () => { try { rec.current?.abort() } catch { /* ok */ } }
    }, [])

    const start = useCallback(() => {
        const W = window as any
        const SR = W.SpeechRecognition || W.webkitSpeechRecognition
        if (!SR) return false
        try { rec.current?.abort() } catch { /* ok */ }
        const r = new SR()
        r.lang = 'pt-BR'
        r.interimResults = true
        r.continuous = false
        r.maxAlternatives = 1
        r.onresult = (e: any) => {
            let text = ''
            let final = false
            for (let i = 0; i < e.results.length; i++) { text += e.results[i][0].transcript; if (e.results[i].isFinal) final = true }
            cb.current(text.trim(), final)
        }
        r.onerror = () => setListening(false)
        r.onend = () => setListening(false)
        rec.current = r
        try { r.start(); setListening(true); return true } catch { setListening(false); return false }
    }, [])

    const stop = useCallback(() => { try { rec.current?.stop() } catch { /* ok */ } setListening(false) }, [])
    return { supported, listening, start, stop }
}
