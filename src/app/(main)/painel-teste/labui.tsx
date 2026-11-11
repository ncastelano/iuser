// src/app/(main)/painel-teste/labui.tsx — as molduras comuns das páginas e folhas do laboratório do painel (só teste).
// PaginaCasca = tela cheia com ← (como uma página do app); FolhaCasca = folha que sobe de baixo (dialog). Ambas ficam acima da barra e
// da faixa "AMBIENTE DE TESTE".
'use client'

import { ReactNode, useState } from 'react'
import { ArrowLeft, X } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { ORANGE } from './dados'

export function PaginaCasca({ titulo, sub, cor = ORANGE, icone, onClose, children, rodape, z = 80 }: { titulo: string; sub?: string; cor?: string; icone?: ReactNode; onClose: () => void; children: ReactNode; rodape?: ReactNode; z?: number }) {
    const { colors } = useTheme()
    return (
        <div className="fixed inset-x-0 top-0 flex justify-center" style={{ background: colors.surface, bottom: 'var(--staging-banner-h, 0px)', zIndex: z }}>
            <div className="w-full max-w-md h-full flex flex-col" style={{ background: colors.background, boxShadow: '0 0 0 1px ' + colors.border }}>
                <div className="flex items-center gap-2.5 px-3 pt-[calc(10px+env(safe-area-inset-top))] pb-2.5 flex-shrink-0" style={{ borderBottom: `1px solid ${colors.border}` }}>
                    <button onClick={onClose} aria-label="Voltar" className="w-10 h-10 rounded-full flex items-center justify-center active:scale-90" style={{ border: `1px solid ${colors.border}` }}><ArrowLeft size={18} /></button>
                    {icone && <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${cor}26`, color: cor }}>{icone}</span>}
                    <div className="min-w-0"><p className="text-[16px] font-black leading-tight truncate">{titulo}</p>{sub && <p className="text-[11px] truncate" style={{ color: colors.textSecondary }}>{sub}</p>}</div>
                </div>
                <div className="flex-1 overflow-y-auto px-4 pt-4" style={{ paddingBottom: rodape ? 150 : 40 }}>{children}</div>
                {rodape && <div className="absolute inset-x-0 bottom-0 flex justify-center pointer-events-none"><div className="w-full max-w-md pointer-events-auto px-4 pt-3 pb-[calc(14px+env(safe-area-inset-bottom))]" style={{ background: colors.background, borderTop: `1px solid ${colors.border}` }}>{rodape}</div></div>}
            </div>
        </div>
    )
}

export function FolhaCasca({ titulo, sub, cor = ORANGE, icone, onClose, children, rodape, z = 90 }: { titulo: string; sub?: string; cor?: string; icone?: ReactNode; onClose: () => void; children: ReactNode; rodape?: ReactNode; z?: number }) {
    const { colors } = useTheme()
    return (
        <div className="fixed inset-x-0 top-0 flex items-end justify-center" style={{ bottom: 'var(--staging-banner-h, 0px)', zIndex: z }}>
            <button aria-label="Fechar" onClick={onClose} className="absolute inset-0" style={{ background: 'rgba(0,0,0,.5)' }} />
            <div className="relative w-full max-w-md max-h-[90dvh] flex flex-col rounded-t-[28px]" style={{ background: colors.background, border: `1px solid ${colors.border}`, boxShadow: '0 -20px 50px rgba(0,0,0,.35)' }}>
                <div className="pt-2.5 flex justify-center"><span className="w-10 h-1.5 rounded-full" style={{ background: colors.border }} /></div>
                <div className="flex items-center gap-2.5 px-4 pt-2 pb-3">
                    {icone && <span className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: `${cor}26`, color: cor }}>{icone}</span>}
                    <div className="min-w-0 flex-1"><p className="text-[17px] font-black leading-tight">{titulo}</p>{sub && <p className="text-[11.5px]" style={{ color: colors.textSecondary }}>{sub}</p>}</div>
                    <button onClick={onClose} aria-label="Fechar" className="w-9 h-9 rounded-full flex items-center justify-center" style={{ border: `1px solid ${colors.border}` }}><X size={16} /></button>
                </div>
                <div className="overflow-y-auto px-4 pb-3">{children}</div>
                {rodape && <div className="px-4 pt-3 pb-[calc(14px+env(safe-area-inset-bottom))]" style={{ borderTop: `1px solid ${colors.border}` }}>{rodape}</div>}
            </div>
        </div>
    )
}

/** Um "aviso rápido" do laboratório (no lugar do toast/ilha): aparece uns segundos no alto da tela */
export function useAviso() {
    const [msg, setMsg] = useState<string | null>(null)
    const mostrar = (m: string) => { setMsg(m); setTimeout(() => setMsg((x) => (x === m ? null : x)), 2600) }
    const node = msg ? <div className="fixed left-1/2 -translate-x-1/2 top-[calc(14px+env(safe-area-inset-top))] z-[200] px-4 h-10 rounded-full flex items-center text-[12.5px] font-black text-white shadow-xl" style={{ background: '#16a34a' }}>{msg}</div> : null
    return { mostrar, node }
}

export function Switch({ on, set, cor = ORANGE }: { on: boolean; set: (v: boolean) => void; cor?: string }) {
    return (
        <button onClick={() => set(!on)} role="switch" aria-checked={on} className="relative w-14 h-8 rounded-full flex-shrink-0 transition active:scale-95" style={{ background: on ? cor : '#9ca3af66' }}>
            <span className="absolute top-1 w-6 h-6 rounded-full bg-white shadow transition-all" style={{ left: on ? 28 : 4 }} />
        </button>
    )
}

export function Vazio({ titulo, texto }: { titulo: string; texto: string }) {
    const { colors } = useTheme()
    return <div className="rounded-3xl p-6 text-center" style={{ border: `1.5px dashed ${colors.border}` }}><p className="text-[14px] font-black">{titulo}</p><p className="text-[12px] mt-1 leading-snug" style={{ color: colors.textSecondary }}>{texto}</p></div>
}
