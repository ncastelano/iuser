// Vitrine que passa de N em N sozinha, sem repetir até mostrar todos (e recomeça), e que o usuário também controla:
// deslizar (dedo ou touchpad) troca na hora, os pontinhos levam direto a uma página e o mouse em cima pausa.
// Usado em "Quem já oferece serviço" e "Produtos em destaque".
'use client'

import { useEffect, useRef, useState } from 'react'

export function usePagedRotation(total: number, pageSize: number, intervalMs = 7000) {
    const pages = Math.max(1, Math.ceil(total / pageSize))
    const [page, setPage] = useState(0)
    const [dir, setDir] = useState<1 | -1>(1)
    const [paused, setPaused] = useState(false)
    const touchRef = useRef<{ x: number; y: number } | null>(null)
    // Touchpad manda dezenas de eventos por passada (com inércia): uma passada = uma troca só
    const wheelRef = useRef({ sum: 0, last: 0, locked: false })

    // Se a lista encolher, não fica numa página que não existe mais
    useEffect(() => { if (page >= pages) setPage(0) }, [pages, page])

    // Depende de `page`: trocar na mão (deslizar ou pontinho) reinicia a contagem
    useEffect(() => {
        if (pages <= 1 || paused) return
        const timer = setTimeout(() => { setDir(1); setPage((p) => (p + 1) % pages) }, intervalMs)
        return () => clearTimeout(timer)
    }, [pages, paused, page, intervalMs])

    const go = (delta: 1 | -1) => { setDir(delta); setPage((p) => (p + delta + pages) % pages) }
    const goTo = (i: number) => { setDir(i >= page ? 1 : -1); setPage(i) }

    const handlers = {
        onMouseEnter: () => setPaused(true),
        onMouseLeave: () => setPaused(false),
        onTouchStart: (e: React.TouchEvent) => { touchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; setPaused(true) },
        onTouchEnd: (e: React.TouchEvent) => {
            const start = touchRef.current
            touchRef.current = null
            setPaused(false)
            if (!start || pages <= 1) return
            const dx = e.changedTouches[0].clientX - start.x
            const dy = e.changedTouches[0].clientY - start.y
            if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3) go(dx < 0 ? 1 : -1)
        },
        onWheel: (e: React.WheelEvent) => {
            if (pages <= 1 || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return
            const w = wheelRef.current
            const now = Date.now()
            // Silêncio de 50 ms = a passada (e a inércia dela) acabou: libera a próxima
            if (now - w.last > 50) { w.locked = false; w.sum = 0 }
            w.last = now
            if (w.locked) return
            w.sum += e.deltaX
            if (Math.abs(w.sum) > 60) { go(w.sum > 0 ? 1 : -1); w.locked = true; w.sum = 0 }
        },
    }

    return { page, dir, pages, go, goTo, handlers, visibleRange: [page * pageSize, page * pageSize + pageSize] as const }
}
