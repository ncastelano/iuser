// src/components/SeenBox.tsx
//
// Caixa que avisa quando alguém VIU o conteúdo dentro dela, sem precisar clicar:
//   - passou o mouse por cima (web) por um instante, ou
//   - o card ficou visível na tela (a maior parte dele) por um tempinho — é o que vale no celular.
// Dispara uma vez por card/aba (e, com seenKey, uma vez por sessão do navegador). Quem usa decide o que registrar
// (ex: trackServiceRequestView). Mantém o mesmo comportamento de uma <div>: className, style, onClick etc.
'use client'

import { useEffect, useRef } from 'react'

interface SeenBoxProps extends React.HTMLAttributes<HTMLDivElement> {
    onSeen: () => void
    /** Chave pra não registrar de novo na mesma sessão (ex: `request:<id>`) */
    seenKey?: string
    /** Quanto tempo visível até contar como visto (ms) */
    dwellMs?: number
    /** Quanto tempo com o mouse em cima até contar como visto (ms) */
    hoverMs?: number
}

export default function SeenBox({ onSeen, seenKey, dwellMs = 1000, hoverMs = 250, children, onMouseEnter, onMouseLeave, ...rest }: SeenBoxProps) {
    const ref = useRef<HTMLDivElement>(null)
    const firedRef = useRef(false)
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const onSeenRef = useRef(onSeen)
    onSeenRef.current = onSeen

    const fire = () => {
        if (firedRef.current) return
        firedRef.current = true
        if (seenKey) {
            try {
                const k = `seen:${seenKey}`
                if (sessionStorage.getItem(k)) return
                sessionStorage.setItem(k, '1')
            } catch { /* sem sessionStorage: registra mesmo assim (o banco também não duplica) */ }
        }
        onSeenRef.current()
    }
    const clear = () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null } }

    useEffect(() => {
        const el = ref.current
        if (!el || typeof IntersectionObserver === 'undefined') return
        const io = new IntersectionObserver(
            (entries) => {
                const visible = entries.some((e) => e.isIntersecting && e.intersectionRatio >= 0.6)
                clear()
                if (visible && !firedRef.current) timerRef.current = setTimeout(fire, dwellMs)
            },
            { threshold: [0, 0.6, 1] },
        )
        io.observe(el)
        return () => { io.disconnect(); clear() }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dwellMs])

    return (
        <div
            ref={ref}
            {...rest}
            onMouseEnter={(e) => { onMouseEnter?.(e); clear(); if (!firedRef.current) timerRef.current = setTimeout(fire, hoverMs) }}
            onMouseLeave={(e) => { onMouseLeave?.(e); clear() }}
        >
            {children}
        </div>
    )
}
