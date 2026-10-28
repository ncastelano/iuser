// src/components/IslandToastFallback.tsx — onde NÃO existe a ilha (2.0 e páginas fora da casca) os avisos de `lib/toast` aparecem como uma pílula no topo, do mesmo jeito (cor + ícone do tipo).
'use client'

import { useEffect } from 'react'
import { toast, useHasIsland, useIslandMessage } from '@/lib/toast'
import { toastStyle } from '@/lib/toastStyle'

export function IslandToastFallback() {
    const hasIsland = useHasIsland()
    const { msg } = useIslandMessage()
    useEffect(() => {
        if (hasIsland || !msg) return
        const t = setTimeout(() => toast.dismiss(msg.id), msg.duration)
        return () => clearTimeout(t)
    }, [hasIsland, msg?.id])   // eslint-disable-line react-hooks/exhaustive-deps
    if (hasIsland || !msg) return null
    const st = toastStyle(msg.kind)
    return (
        <div className="fixed left-0 right-0 z-[200] flex flex-col items-center gap-2 px-3 pointer-events-none" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 10px)' }}>
            {msg.custom ? <div className="pointer-events-auto w-full max-w-md">{msg.custom(msg.id)}</div> : (
                <div className="pointer-events-auto max-w-md w-full flex items-center gap-2.5 rounded-full pl-2 pr-2.5 py-2 text-left shadow-xl" style={{ background: '#fff', color: '#0f172a', border: `1.5px solid ${st.color}` }}>
                    <button onClick={() => toast.dismiss(msg.id)} className="flex items-center gap-2.5 min-w-0 flex-1 text-left" aria-label="Dispensar aviso">
                        <span className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-black flex-shrink-0" style={{ background: st.color }}>{msg.icon || st.glyph}</span>
                        <span className="min-w-0"><span className="block text-sm font-black leading-tight">{msg.text}</span>{msg.description && <span className="block text-xs opacity-70 leading-snug">{msg.description}</span>}</span>
                    </button>
                    {msg.action && <button onClick={() => { msg.action!.onClick(); toast.dismiss(msg.id) }} className="flex-shrink-0 text-[12px] font-black px-3 py-1.5 rounded-full text-white" style={{ background: st.color }}>{msg.action.label}</button>}
                </div>
            )}
        </div>
    )
}
