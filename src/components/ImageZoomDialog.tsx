// Foto em tela cheia com zoom: roda do mouse, pinça no celular, toque duplo (ou botões +/−) e arrastar pra mexer na foto
// quando ampliada. Esc, ✕ ou um toque no fundo fecham.
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Minus, Plus, X } from 'lucide-react'

const MIN = 1
const MAX = 6

export default function ImageZoomDialog({ src, alt = '', onClose }: { src: string; alt?: string; onClose: () => void }) {
    const [scale, setScale] = useState(1)
    const [offset, setOffset] = useState({ x: 0, y: 0 })
    const [mounted, setMounted] = useState(false)
    const pointers = useRef(new Map<number, { x: number; y: number }>())
    const pinchStart = useRef<{ dist: number; scale: number } | null>(null)
    const dragStart = useRef<{ x: number; y: number; ox: number; oy: number; moved: boolean } | null>(null)
    const lastTap = useRef(0)

    useEffect(() => {
        setMounted(true)
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        const prev = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
    }, [onClose])

    const applyScale = useCallback((next: number) => {
        const s = Math.min(MAX, Math.max(MIN, next))
        setScale(s)
        if (s === MIN) setOffset({ x: 0, y: 0 })
    }, [])

    const onWheel = (e: React.WheelEvent) => {
        e.preventDefault()
        applyScale(scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15))
    }

    const onPointerDown = (e: React.PointerEvent) => {
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
        if (pointers.current.size === 2) {
            const [a, b] = Array.from(pointers.current.values())
            pinchStart.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale }
            dragStart.current = null
        } else {
            dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y, moved: false }
        }
    }

    const onPointerMove = (e: React.PointerEvent) => {
        if (!pointers.current.has(e.pointerId)) return
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
        if (pointers.current.size === 2 && pinchStart.current) {
            const [a, b] = Array.from(pointers.current.values())
            const dist = Math.hypot(a.x - b.x, a.y - b.y)
            applyScale(pinchStart.current.scale * (dist / pinchStart.current.dist))
            return
        }
        const d = dragStart.current
        if (!d) return
        const dx = e.clientX - d.x
        const dy = e.clientY - d.y
        if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true
        if (scale > 1) setOffset({ x: d.ox + dx, y: d.oy + dy })
    }

    const onPointerUp = (e: React.PointerEvent) => {
        pointers.current.delete(e.pointerId)
        if (pointers.current.size < 2) pinchStart.current = null
        const d = dragStart.current
        dragStart.current = null
        if (!d || d.moved) return
        // Toque sem arrastar: duas vezes seguidas amplia/volta; uma vez só no fundo fecha (tratado no fundo)
        const now = Date.now()
        if (now - lastTap.current < 300) {
            applyScale(scale > 1 ? 1 : 2.5)
            lastTap.current = 0
        } else {
            lastTap.current = now
        }
    }

    if (!mounted) return null

    return createPortal(
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.92)', touchAction: 'none' }}
            onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
            onWheel={onWheel}
            role="dialog"
            aria-label="Foto ampliada"
        >
            <img
                src={src}
                alt={alt}
                draggable={false}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                className="max-w-[94vw] max-h-[86vh] object-contain select-none"
                style={{
                    transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                    transition: pointers.current.size ? 'none' : 'transform 0.2s ease-out',
                    cursor: scale > 1 ? 'grab' : 'zoom-in',
                    touchAction: 'none',
                }}
            />

            <button
                onClick={onClose}
                aria-label="Fechar"
                className="absolute top-4 right-4 w-11 h-11 rounded-full flex items-center justify-center text-white"
                style={{ background: 'rgba(255,255,255,0.18)', top: 'calc(env(safe-area-inset-top) + 16px)' }}
            >
                <X size={22} />
            </button>

            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-2 py-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.18)', bottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}>
                <button onClick={() => applyScale(scale / 1.5)} disabled={scale <= MIN} aria-label="Diminuir" className="w-10 h-10 rounded-full flex items-center justify-center text-white disabled:opacity-40">
                    <Minus size={20} />
                </button>
                <span className="text-xs font-bold text-white w-12 text-center">{Math.round(scale * 100)}%</span>
                <button onClick={() => applyScale(scale * 1.5)} disabled={scale >= MAX} aria-label="Ampliar" className="w-10 h-10 rounded-full flex items-center justify-center text-white disabled:opacity-40">
                    <Plus size={20} />
                </button>
            </div>
        </div>,
        document.body
    )
}
