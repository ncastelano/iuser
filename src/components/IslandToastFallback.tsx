// src/components/IslandToastFallback.tsx — onde NÃO existe a ilha (2.0 e páginas fora da casca) os avisos de `lib/toast` aparecem como uma pílula no topo, do mesmo jeito (cor + ícone do tipo).
// Os avisos com CARTÃO (`toast.custom`, ex.: "Nova corrida disponível!" com as tarifas e os botões) NÃO ficam em cima: abrem como uma FOLHA EMBAIXO, colada ao fundo da tela (acima da faixa
// "AMBIENTE DE TESTE" quando existe), que se expande de baixo para cima; o app ganha espaço embaixo enquanto ela está aberta (`body` com padding e a variável `--toast-sheet-h`).
'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { toast, useHasIsland, useIslandMessage } from '@/lib/toast'
import { toastStyle } from '@/lib/toastStyle'

function BottomSheet({ children }: { children: ReactNode }) {
    const [open, setOpen] = useState(false)
    const content = useRef<HTMLDivElement>(null)
    // monta fechada e abre no quadro seguinte: é isso que faz a folha CRESCER de baixo para cima
    useEffect(() => {
        const r = requestAnimationFrame(() => requestAnimationFrame(() => setOpen(true)))
        return () => cancelAnimationFrame(r)
    }, [])
    // o app "sobe": reserva embaixo a altura da folha (suave, junto com a animação) e avisa por variável CSS para quem tem layout fixo
    useEffect(() => {
        const el = content.current
        if (!el) return
        const body = document.body
        const prevPad = body.style.paddingBottom
        const prevTr = body.style.transition
        body.style.transition = 'padding-bottom 480ms cubic-bezier(0.2, 0.8, 0.2, 1)'
        const apply = () => {
            const h = open ? Math.round(el.getBoundingClientRect().height) : 0
            body.style.paddingBottom = h ? `${h + 12}px` : prevPad
            document.documentElement.style.setProperty('--toast-sheet-h', `${h}px`)
        }
        const ro = new ResizeObserver(apply)
        ro.observe(el)
        apply()
        return () => {
            ro.disconnect()
            body.style.paddingBottom = prevPad
            body.style.transition = prevTr
            document.documentElement.style.removeProperty('--toast-sheet-h')
        }
    }, [open])
    return (
        <div
            className="fixed left-0 right-0 z-[200] flex justify-center px-3 pointer-events-none"
            style={{ bottom: 'calc(var(--staging-banner-h, 0px) + env(safe-area-inset-bottom, 0px))' }}
        >
            <div
                className="w-full max-w-md grid"
                style={{ gridTemplateRows: open ? '1fr' : '0fr', transition: 'grid-template-rows 480ms cubic-bezier(0.2, 0.8, 0.2, 1)' }}
            >
                <div className="min-h-0 overflow-hidden">
                    <div ref={content} className="pointer-events-auto pb-2 pt-1">{children}</div>
                </div>
            </div>
        </div>
    )
}

export function IslandToastFallback() {
    const hasIsland = useHasIsland()
    const { msg } = useIslandMessage()
    useEffect(() => {
        if (hasIsland || !msg) return
        const t = setTimeout(() => toast.dismiss(msg.id), msg.duration)
        return () => clearTimeout(t)
    }, [hasIsland, msg?.id])   // eslint-disable-line react-hooks/exhaustive-deps
    if (hasIsland || !msg) return null
    if (msg.custom) return <BottomSheet key={String(msg.id)}>{msg.custom(msg.id)}</BottomSheet>
    const st = toastStyle(msg.kind)
    return (
        <div className="fixed left-0 right-0 z-[200] flex flex-col items-center gap-2 px-3 pointer-events-none" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 10px)' }}>
            <div className="pointer-events-auto max-w-md w-full flex items-center gap-2.5 rounded-full pl-2 pr-2.5 py-2 text-left shadow-xl" style={{ background: '#fff', color: '#0f172a', border: `1.5px solid ${st.color}` }}>
                <button onClick={() => toast.dismiss(msg.id)} className="flex items-center gap-2.5 min-w-0 flex-1 text-left" aria-label="Dispensar aviso">
                    <span className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-black flex-shrink-0" style={{ background: st.color }}>{msg.icon || st.glyph}</span>
                    <span className="min-w-0"><span className="block text-sm font-black leading-tight">{msg.text}</span>{msg.description && <span className="block text-xs opacity-70 leading-snug">{msg.description}</span>}</span>
                </button>
                {msg.action && <button onClick={() => { msg.action!.onClick(); toast.dismiss(msg.id) }} className="flex-shrink-0 text-[12px] font-black px-3 py-1.5 rounded-full text-white" style={{ background: st.color }}>{msg.action.label}</button>}
            </div>
        </div>
    )
}
