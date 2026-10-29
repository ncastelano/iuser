// src/components/digital/DigitalCard.tsx — o cartão de apresentação do produto digital (vitrine da home 2.0/3.0 e /digitais): capa 16:9 que ganha vida com a PRÉVIA em vídeo.
//   • destaque automático: um cartão por vez, a cada 3 s (useSpotlight);
//   • mouse em cima (ou foco do teclado) ou dedo SEGURADO (350 ms): toca a prévia por até 15 s e pausa o destaque automático;
//   • só tem prévia se o curso permitir (vídeo curto marcado pelo vendedor ou a 1ª aula grátis); sem prévia é só a capa.
// Só o cartão ativo monta um <video> (mudo, sem som); o link da prévia vem do servidor e fica guardado por um tempo.
'use client'

import { useEffect, useRef, useState } from 'react'
import { Eye, GraduationCap, Play } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { HOLD_MS, PRODUCT_KIND_LABEL, SPOTLIGHT_MS, previewUrl, type ShowcaseItem } from '@/modules/digital'

const brl = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)
const ORANGE = '#f97316'

interface Props {
    p: ShowcaseItem
    spotlight: boolean           // é o cartão da vez no destaque automático
    upNext: boolean              // é o próximo: já baixa o vídeo
    onVisible: (id: string, visible: boolean) => void
    onInteract: (id: string | null) => void
    onOpen: () => void
    className?: string
}

export default function DigitalCard({ p, spotlight, upNext, onVisible, onInteract, onOpen, className = '' }: Props) {
    const { colors } = useTheme()
    const root = useRef<HTMLDivElement>(null)
    const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const suppressClick = useRef(false)
    const [hover, setHover] = useState(false)
    const [held, setHeld] = useState(false)
    const [finished, setFinished] = useState(false)     // a prévia pedida pela pessoa já tocou os 15 s
    const [url, setUrl] = useState<string | null>(null)
    const [ready, setReady] = useState(false)
    const [progress, setProgress] = useState(0)
    const canPreview = !!p.previewItemId
    const userPreview = hover || held
    const previewing = canPreview && !!url && (userPreview ? !finished : spotlight)

    // quem está à vista pode receber o destaque
    useEffect(() => {
        const el = root.current
        if (!el || !canPreview || typeof IntersectionObserver === 'undefined') { onVisible(p.id, false); return }
        const io = new IntersectionObserver(([e]) => onVisible(p.id, e.isIntersecting && e.intersectionRatio >= 0.6), { threshold: [0, 0.6, 1] })
        io.observe(el)
        return () => { io.disconnect(); onVisible(p.id, false) }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [p.id, canPreview])

    // baixa o link da prévia quando o cartão vai precisar dele
    useEffect(() => {
        if (!canPreview || !(spotlight || upNext || userPreview)) return
        let alive = true
        previewUrl(p.previewItemId!).then((u) => { if (alive) setUrl(u) })
        return () => { alive = false }
    }, [canPreview, spotlight, upNext, userPreview, p.previewItemId])

    useEffect(() => { if (!previewing) { setReady(false); setProgress(0) } }, [previewing])
    useEffect(() => { if (!userPreview) setFinished(false) }, [userPreview])

    const startHold = (e: React.PointerEvent) => {
        if (e.pointerType === 'mouse' || !canPreview) return
        holdTimer.current = setTimeout(() => { suppressClick.current = true; setHeld(true); onInteract(p.id) }, HOLD_MS)
    }
    const endHold = () => {
        if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null }
        if (held) { setHeld(false); onInteract(null); setTimeout(() => { suppressClick.current = false }, 60) }
    }

    const glow = previewing || userPreview
    return (
        <div
            ref={root}
            data-digital-id={p.id}
            role="button"
            tabIndex={0}
            onClick={(e) => { if (suppressClick.current) { e.preventDefault(); return } onOpen() }}
            onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen() } }}
            onPointerEnter={(e) => { if (e.pointerType === 'mouse' && canPreview) { setHover(true); onInteract(p.id) } }}
            onPointerLeave={(e) => { if (e.pointerType === 'mouse') { setHover(false); onInteract(null) } }}
            onFocus={() => { if (canPreview) { setHover(true); onInteract(p.id) } }}
            onBlur={() => { setHover(false); onInteract(null) }}
            onPointerDown={startHold}
            onPointerUp={endHold}
            onPointerCancel={endHold}
            onContextMenu={(e) => { if (canPreview) e.preventDefault() }}
            className={`text-left rounded-3xl overflow-hidden border flex flex-col cursor-pointer select-none transition-all duration-300 ${className}`}
            style={{
                background: colors.surface, borderColor: glow ? ORANGE : colors.border, WebkitTouchCallout: 'none', touchAction: 'pan-x pan-y',
                boxShadow: glow ? '0 14px 38px rgba(249,115,22,.32)' : colors.shadow, transform: glow ? 'translateY(-2px) scale(1.015)' : 'none',
            }}
        >
            {/* capa 16:9 + prévia */}
            <div className="relative w-full overflow-hidden flex-shrink-0" style={{ aspectRatio: '16 / 9', background: `${ORANGE}22` }}>
                {p.imageUrl ? <img src={p.imageUrl} alt="" draggable={false} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                    : <span className="absolute inset-0 flex items-center justify-center" style={{ color: ORANGE }}><GraduationCap size={38} /></span>}
                {previewing && url && (
                    <video key={`${p.id}-${userPreview ? 'u' : 's'}`} src={url} muted playsInline autoPlay preload="auto" disablePictureInPicture
                        className="absolute inset-0 w-full h-full object-cover pointer-events-none" style={{ opacity: ready ? 1 : 0, transition: 'opacity .3s' }}
                        onLoadedData={() => setReady(true)}
                        onTimeUpdate={(e) => {
                            const v = e.currentTarget
                            const total = userPreview ? p.previewSeconds : SPOTLIGHT_MS / 1000
                            setProgress(Math.min(1, v.currentTime / total))
                            if (userPreview && v.currentTime >= p.previewSeconds) { v.pause(); setFinished(true) }
                        }}
                        onEnded={() => { if (userPreview) setFinished(true) }} />
                )}
                <span className="absolute left-2.5 top-2.5 text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full text-white" style={{ background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(4px)' }}>{PRODUCT_KIND_LABEL[p.kind]}</span>
                {p.freeItems > 0 && <span className="absolute right-2.5 top-2.5 text-[10px] font-black px-2 py-0.5 rounded-full text-white" style={{ background: '#16a34a' }}>Aula grátis</span>}
                {canPreview && (previewing ? (
                    <span className="absolute left-2.5 bottom-3 flex items-center gap-1.5 text-[10px] font-black px-2 py-0.5 rounded-full text-white" style={{ background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(4px)' }}>
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> Prévia
                    </span>
                ) : (
                    <span className="absolute left-2.5 bottom-3 flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full text-white" style={{ background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(4px)' }}>
                        <Play size={9} fill="white" /> {finished ? 'Rever prévia' : 'Prévia'}
                    </span>
                ))}
                {previewing && <span className="absolute inset-x-0 bottom-0 h-[3px]" style={{ background: 'rgba(255,255,255,.28)' }}><span className="block h-full" style={{ width: `${progress * 100}%`, background: ORANGE }} /></span>}
            </div>

            <div className="p-3 flex flex-col gap-1 flex-1">
                <p className="text-[14px] font-black leading-snug line-clamp-2" style={{ color: colors.textPrimary }}>{p.name}</p>
                <p className="text-[11.5px] leading-snug line-clamp-2" style={{ color: colors.textSecondary }}>{p.summary}</p>
                <div className="mt-auto pt-1.5 flex items-center gap-2">
                    <span className="text-base font-black" style={{ color: ORANGE }}>{brl(p.price)}</span>
                    {p.viewCount > 0 && <span className="flex items-center gap-0.5 text-[11px]" style={{ color: colors.textSecondary }}><Eye size={11} />{p.viewCount}</span>}
                    <span className="ml-auto flex items-center gap-1.5 min-w-0">
                        {p.storeLogo && <img src={p.storeLogo} alt="" className="w-4 h-4 rounded-full object-cover flex-shrink-0" loading="lazy" />}
                        <span className="text-[11px] font-bold truncate" style={{ color: colors.textSecondary }}>{p.storeName}</span>
                    </span>
                </div>
            </div>
        </div>
    )
}
