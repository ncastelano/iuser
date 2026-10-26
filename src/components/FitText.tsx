// src/components/FitText.tsx
//
// Texto que ocupa TODO o espaço do quadro onde está: procura a maior letra (entre `min` e `max`) com que ele ainda cabe e recalcula
// quando o quadro muda de tamanho. O quadro precisa ter altura própria (ex.: `flex-1` com altura mínima): o texto fica por cima dele
// (position absolute), então não empurra o tamanho do cartão. Se nem na letra mínima couber, corta com reticências.
'use client'

import { useLayoutEffect, useRef, useState } from 'react'

const LINE = 1.25

export default function FitText({ text, min = 14, max = 30, className = '', style, title }: {
    text: string
    min?: number
    max?: number
    className?: string
    style?: React.CSSProperties
    title?: string
}) {
    const box = useRef<HTMLDivElement>(null)
    const p = useRef<HTMLParagraphElement>(null)
    const [fit, setFit] = useState<{ size: number; lines: number }>({ size: min, lines: 99 })

    useLayoutEffect(() => {
        const el = box.current
        const t = p.current
        if (!el || !t) return
        const run = () => {
            const h = el.clientHeight
            if (h <= 0) return
            // maior tamanho inteiro em que o texto inteiro cabe na altura do quadro
            // mede sem o corte de linhas (display block); o corte final é aplicado pelo React com o número de linhas que cabem
            t.style.display = 'block'
            t.style.height = 'auto'
            t.style.overflowWrap = 'normal' // palavra comprida não pode ser partida ao meio: a letra diminui até ela caber na largura
            let lo = min, hi = max
            while (lo < hi) {
                const mid = Math.ceil((lo + hi) / 2)
                t.style.fontSize = `${mid}px`
                if (t.scrollHeight <= h && t.scrollWidth <= t.clientWidth) lo = mid; else hi = mid - 1
            }
            t.style.fontSize = `${lo}px`
            t.style.display = '-webkit-box'
            t.style.overflowWrap = 'break-word'
            const lines = Math.max(1, Math.floor(h / (lo * LINE)))
            t.style.height = `${lines * lo * LINE}px`
            setFit((prev) => (prev.size === lo && prev.lines === lines ? prev : { size: lo, lines }))
        }
        run()
        const ro = new ResizeObserver(run)
        ro.observe(el)
        return () => ro.disconnect()
    }, [text, min, max])

    return (
        <div ref={box} className="relative flex-1 min-h-0 w-full">
            <p
                ref={p}
                title={title}
                className={`absolute inset-x-0 top-0 font-black overflow-hidden ${className}`}
                style={{ ...style, overflowWrap: 'break-word', hyphens: 'auto', fontSize: fit.size, lineHeight: LINE, height: fit.lines * fit.size * LINE, display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: fit.lines }}
            >
                {text}
            </p>
        </div>
    )
}
