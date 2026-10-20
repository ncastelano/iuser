// src/components/v3/LinkListInput.tsx
//
// Lista de links da loja: cada linha tem o TEXTO que vai aparecer e o ENDEREÇO. "Adicionar link" abre outra linha (até 8).
// Só apresentação e estado local da lista: quem usa guarda as linhas e valida com `linksFromRows` (lib/storeLinks).
'use client'

import { Plus, X } from 'lucide-react'
import { MAX_LABEL, MAX_STORE_LINKS } from '@/lib/storeLinks'

export interface LinkRow { label: string; url: string }

export default function LinkListInput({ rows, onChange, colors }: { rows: LinkRow[]; onChange: (rows: LinkRow[]) => void; colors: any }) {
    const soft = `${colors.border}30`
    const field = 'w-full h-11 rounded-2xl px-4 text-sm outline-none transition focus:ring-2'
    const style = { background: soft, color: colors.textPrimary, ['--tw-ring-color' as any]: '#f97316' } as React.CSSProperties
    const set = (i: number, patch: Partial<LinkRow>) => onChange(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)))
    return (
        <div className="space-y-3">
            {rows.map((r, i) => (
                <div key={i} className="flex items-start gap-2">
                    <div className="flex-1 min-w-0 space-y-2">
                        <input value={r.label} onChange={(e) => set(i, { label: e.target.value })} maxLength={MAX_LABEL} placeholder="O que vai ficar escrito (ex.: Cardápio completo)" aria-label={`Texto do link ${i + 1}`} className={field} style={style} />
                        <input value={r.url} onChange={(e) => set(i, { url: e.target.value })} inputMode="url" autoCapitalize="none" autoCorrect="off" placeholder="Endereço (ex.: meusite.com.br/cardapio)" aria-label={`Endereço do link ${i + 1}`} className={field} style={style} />
                    </div>
                    <button type="button" onClick={() => onChange(rows.filter((_, k) => k !== i))} aria-label={`Remover o link ${i + 1}`} className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 transition active:scale-95" style={{ background: soft, color: colors.textSecondary }}>
                        <X size={16} />
                    </button>
                </div>
            ))}
            {rows.length < MAX_STORE_LINKS && (
                <button type="button" onClick={() => onChange([...rows, { label: '', url: '' }])} className="h-11 px-5 rounded-full flex items-center gap-2 text-[13px] font-black transition active:scale-95" style={{ background: soft, color: colors.textPrimary }}>
                    <Plus size={16} style={{ color: '#f97316' }} /> Adicionar link
                </button>
            )}
        </div>
    )
}
