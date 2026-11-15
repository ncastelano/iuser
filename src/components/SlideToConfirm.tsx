// src/components/SlideToConfirm.tsx — botão de DESLIZAR para confirmar (uma ação que não pode sair sem querer, ex.: se candidatar a uma corrida).
// Arrasta a bolinha até o fim para confirmar; soltar antes do fim volta ao começo. Sem arrastar: Enter/Espaço na bolinha confirma
// (teclado e leitor de tela) — o `aria-label` diz a ação. `busy` mostra o envio; `blocked` explica por que não dá (texto no lugar do rótulo).
'use client'

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { ChevronsRight, Loader2 } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'

const GRADIENT = 'linear-gradient(90deg, #f97316, #ef4444)'
const THUMB = 44
const PAD = 4
/** a partir de quanto do caminho percorrido soltar já confirma */
const CONFIRM_AT = 0.82

interface SlideToConfirmProps {
    label: string
    onConfirm: () => void | Promise<void>
    busy?: boolean
    /** motivo de não poder agora: aparece no lugar do rótulo e desliga o arrasto */
    blocked?: string | null
    ariaLabel?: string
    style?: CSSProperties
    /** avisa quando a pessoa começa/termina de arrastar (quem usa pode travar o que está em volta enquanto o dedo está no botão) */
    onDragChange?: (active: boolean) => void
}

export default function SlideToConfirm({ label, onConfirm, busy = false, blocked = null, ariaLabel, style, onDragChange }: SlideToConfirmProps) {
    const { colors } = useTheme()
    const trackRef = useRef<HTMLDivElement>(null)
    const drag = useRef<{ startX: number; startPos: number } | null>(null)
    const [pos, setPos] = useState(0)          // px, 0..max
    const [dragging, setDragging] = useState(false)
    const [done, setDone] = useState(false)
    const mounted = useRef(true)
    useEffect(() => () => { mounted.current = false }, [])
    useEffect(() => () => { if (drag.current) onDragChange?.(false) }, [])   // eslint-disable-line react-hooks/exhaustive-deps

    const max = () => Math.max(0, (trackRef.current?.clientWidth ?? 0) - THUMB - PAD * 2)
    const off = busy || !!blocked || done

    const fire = async () => {
        if (off) return
        setDone(true)
        setPos(max())
        try { await onConfirm() } finally {
            if (mounted.current) { setDone(false); setPos(0) }
        }
    }

    const down = (e: PointerEvent<HTMLButtonElement>) => {
        if (off) return
        drag.current = { startX: e.clientX, startPos: pos }
        setDragging(true)
        onDragChange?.(true)
        e.currentTarget.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent<HTMLButtonElement>) => {
        const d = drag.current
        if (!d) return
        setPos(Math.min(max(), Math.max(0, d.startPos + e.clientX - d.startX)))
    }
    const up = () => {
        if (!drag.current) return
        drag.current = null
        setDragging(false)
        onDragChange?.(false)
        if (max() > 0 && pos / max() >= CONFIRM_AT) void fire()
        else setPos(0)
    }
    const key = (e: KeyboardEvent<HTMLButtonElement>) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void fire() }
    }

    const ratio = max() > 0 ? pos / max() : 0
    const text = blocked ? blocked : busy || done ? 'Enviando…' : label

    return (
        <div
            ref={trackRef}
            className="relative w-full select-none overflow-hidden"
            style={{ height: THUMB + PAD * 2, borderRadius: 999, background: blocked ? `${colors.border}55` : `${colors.border}40`, border: `1px solid ${colors.border}`, ...style }}
        >
            {!blocked && <div className="absolute inset-y-0 left-0" style={{ width: pos + THUMB + PAD * 2, background: GRADIENT, opacity: 0.22 + ratio * 0.5, borderRadius: 999, transition: dragging ? 'none' : 'width 220ms ease-out, opacity 220ms' }} />}
            <span
                className="absolute inset-0 flex items-center justify-center px-14 text-center text-[13px] font-black leading-tight pointer-events-none"
                style={{ color: blocked ? colors.textSecondary : colors.textPrimary, opacity: blocked ? 1 : Math.max(0.15, 1 - ratio * 1.1) }}
            >
                {text}
            </span>
            <button
                type="button"
                aria-label={ariaLabel || label}
                disabled={!!blocked}
                onPointerDown={down}
                onPointerMove={move}
                onPointerUp={up}
                onPointerCancel={up}
                onKeyDown={key}
                className="absolute flex items-center justify-center rounded-full text-white disabled:opacity-40"
                style={{
                    left: PAD, top: PAD, width: THUMB, height: THUMB,
                    background: GRADIENT, boxShadow: '0 4px 12px rgba(249,115,22,0.45)',
                    transform: `translateX(${pos}px)`,
                    transition: dragging ? 'none' : 'transform 220ms ease-out',
                    touchAction: 'none', cursor: off ? 'default' : 'grab',
                }}
            >
                {busy || done ? <Loader2 size={20} className="animate-spin" /> : <ChevronsRight size={22} />}
            </button>
        </div>
    )
}
