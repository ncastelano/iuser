// src/components/chat/ShareSheet.tsx
//
// Seletor de "compartilhar" do chat (conversas e comunidades): abas Loja / Serviço / Produto / Publicação / Perfil, busca por nome
// e lista de cartões; o que é seu aparece primeiro. Escolher devolve o cartão ao compositor, que mostra uma prévia antes de enviar.
'use client'

import { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { Spinner } from '@/components/Spinner'
import ShareCardView from './ShareCardView'
import { SHARE_KINDS, searchShareTargets, type ShareCard, type ShareKind } from '@/lib/shareCards'

export default function ShareSheet({ open, onClose, onPick, colors }: { open: boolean; onClose: () => void; onPick: (c: ShareCard) => void; colors: any }) {
    const [kind, setKind] = useState<ShareKind>('store')
    const [q, setQ] = useState('')
    const [items, setItems] = useState<ShareCard[] | null>(null)
    const seq = useRef(0)

    useEffect(() => {
        if (!open) return
        const my = ++seq.current
        setItems(null)
        const t = setTimeout(() => {
            searchShareTargets(kind, q).then((r) => { if (seq.current === my) setItems(r) }).catch(() => { if (seq.current === my) setItems([]) })
        }, q ? 250 : 0)
        return () => clearTimeout(t)
    }, [open, kind, q])

    if (!open) return null
    return (
        <div className="fixed inset-0 z-[60] flex items-end justify-center" role="dialog" aria-label="Compartilhar" onClick={onClose} style={{ background: 'rgba(0,0,0,0.45)' }}>
            <div className="w-full max-w-lg rounded-t-3xl flex flex-col max-h-[82vh]" style={{ background: colors.background }} onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 pt-4 pb-2">
                    <p className="text-base font-black" style={{ color: colors.textPrimary }}>Compartilhar</p>
                    <button onClick={onClose} aria-label="Fechar" className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: `${colors.border}40`, color: colors.textPrimary }}><X size={18} /></button>
                </div>
                <div className="flex gap-1.5 px-4 overflow-x-auto no-scrollbar pb-2">
                    {SHARE_KINDS.map((k) => (
                        <button key={k.kind} onClick={() => setKind(k.kind)} className="h-9 px-4 rounded-full text-[13px] font-black flex-shrink-0 transition active:scale-95"
                            style={kind === k.kind ? { background: '#f97316', color: '#fff' } : { background: `${colors.border}40`, color: colors.textPrimary }}>{k.label}</button>
                    ))}
                </div>
                <div className="px-4 pb-2">
                    <div className="flex items-center gap-2 h-11 px-3 rounded-full" style={{ background: `${colors.border}30` }}>
                        <Search size={16} style={{ color: colors.textSecondary }} />
                        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar pelo nome" className="flex-1 bg-transparent text-sm focus:outline-none" style={{ color: colors.textPrimary }} />
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto px-4 pb-6">
                    {items === null ? <div className="flex justify-center py-10"><Spinner size={24} color={colors.accent} /></div>
                        : items.length === 0 ? <p className="text-center text-sm py-10" style={{ color: colors.textSecondary }}>Nada encontrado.</p>
                            : items.map((c) => (
                                <button key={c.id} onClick={() => { onPick(c); onClose() }} className="w-full text-left block" aria-label={`Compartilhar ${c.title}`}>
                                    <span className="pointer-events-none block"><ShareCardView card={{ ...c, href: '#' }} colors={colors} compact /></span>
                                </button>
                            ))}
                </div>
            </div>
        </div>
    )
}
