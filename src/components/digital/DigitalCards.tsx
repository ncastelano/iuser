// src/components/digital/DigitalCards.tsx — a fileira (ou grade) de cartões de produto digital com o destaque de prévia: um cartão por vez, a cada 3 s.
// Na FILEIRA que rola de lado o destaque percorre todos os cartões com prévia e a fileira rola sozinha até o cartão da vez (pausa por alguns segundos quando a pessoa toca ou rola
// a fileira); na GRADE vale quem está à vista na tela.
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useNavProgressStore } from '@/store/useNavProgressStore'
import type { ShowcaseItem } from '@/modules/digital'
import DigitalCard from './DigitalCard'
import { useSpotlight } from './useSpotlight'

const TOUCH_PAUSE_MS = 7000

export default function DigitalCards({ items, layout }: { items: ShowcaseItem[]; layout: 'strip' | 'grid' }) {
    const router = useRouter()
    const startNavProgress = useNavProgressStore((s) => s.start)
    const strip = useRef<HTMLDivElement>(null)
    const pauseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const [visible, setVisible] = useState<Record<string, true>>({})     // grade: cartões à vista
    const [stripOnScreen, setStripOnScreen] = useState(false)            // fileira: a seção está à vista
    const [touched, setTouched] = useState(false)                        // a pessoa mexeu na fileira há pouco

    const onVisible = useCallback((id: string, v: boolean) => setVisible((cur) => { if (!!cur[id] === v) return cur; const n = { ...cur }; if (v) n[id] = true; else delete n[id]; return n }), [])
    const withPreview = items.filter((i) => i.previewItemId).map((i) => i.id)
    const ids = layout === 'strip' ? (stripOnScreen && !touched ? withPreview : []) : withPreview.filter((id) => visible[id])
    const { active, next, interact } = useSpotlight(ids)
    const open = (p: ShowcaseItem) => { startNavProgress(); router.push(`/${p.storeSlug}/${p.slug}`) }

    // a seção da fileira está (em boa parte) à vista?
    useEffect(() => {
        const el = strip.current
        if (layout !== 'strip' || !el || typeof IntersectionObserver === 'undefined') return
        const io = new IntersectionObserver(([e]) => setStripOnScreen(e.isIntersecting && e.intersectionRatio >= 0.5), { threshold: [0, 0.5, 1] })
        io.observe(el)
        return () => io.disconnect()
    }, [layout, items.length])

    // (o espaço extra em volta da fileira — com margem negativa para não afastar o resto da página — é para a sombra de destaque não ser cortada pela rolagem)
    // a fileira rola sozinha até o cartão da vez (só no sentido horizontal)
    useEffect(() => {
        const el = strip.current
        if (layout !== 'strip' || !el || !active) return
        const card = el.querySelector<HTMLElement>(`[data-digital-id="${active}"]`)
        if (!card) return
        const left = card.offsetLeft - (el.clientWidth - card.clientWidth) / 2
        el.scrollTo({ left: Math.max(0, left), behavior: 'smooth' })
    }, [active, layout])

    const touch = () => {
        setTouched(true)
        if (pauseTimer.current) clearTimeout(pauseTimer.current)
        pauseTimer.current = setTimeout(() => setTouched(false), TOUCH_PAUSE_MS)
    }
    useEffect(() => () => { if (pauseTimer.current) clearTimeout(pauseTimer.current) }, [])

    const cards = items.map((p) => (
        <DigitalCard key={p.id} p={p} spotlight={active === p.id} upNext={next === p.id} onVisible={onVisible} onInteract={interact} onOpen={() => open(p)}
            className={layout === 'strip' ? 'snap-start flex-shrink-0 w-[272px] sm:w-[300px]' : 'w-full'} />
    ))
    return layout === 'strip'
        ? <div ref={strip} onPointerDown={touch} onWheel={touch} onTouchMove={touch} className="flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-pl-6 scroll-pr-6 -mx-6 px-6 -mt-3 pt-4 -mb-10 pb-14" style={{ scrollbarWidth: 'none' }}>{cards}</div>
        : <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{cards}</div>
}
