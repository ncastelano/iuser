'use client'

// Folha "Ordenar categorias" (Editar loja → Catálogo, 3.0): sobe/desce cada categoria e grava em stores.category_order. É a ordem em que o
// cliente vê as categorias no catálogo e na página da loja (src/lib/categoryOrder.ts). A ordem dos outros ambientes (ex.: Digitais) é mantida.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { toast } from '@/lib/toast'
import { useTheme } from '@/app/contexts/theme'
import { lockBodyScroll } from '@/lib/bodyScrollLock'
import { mergeCategoryOrder } from '@/lib/categoryOrder'

export default function CategoryOrderSheet({ storeId, cor, titulo, cats, conta, fullOrder, onClose, onSaved }: {
    storeId: string; cor: string; titulo: string; cats: string[]; conta: (k: string) => number
    fullOrder: string[] | null; onClose: () => void; onSaved: (order: string[]) => void
}) {
    const { colors: c } = useTheme()
    const [lista, setLista] = useState(cats)
    const [saving, setSaving] = useState(false)
    useEffect(() => lockBodyScroll(), [])
    const troca = (a: number, b: number) => setLista((m) => { const x = [...m]; [x[a], x[b]] = [x[b], x[a]]; return x })
    const salvar = async () => {
        setSaving(true)
        const order = mergeCategoryOrder(fullOrder, lista.filter((k) => k !== 'Sem categoria'))
        const { error } = await supabase.from('stores').update({ category_order: order }).eq('id', storeId)
        setSaving(false)
        if (error) { toast.error('Não deu para salvar a ordem', { description: error.message }); return }
        toast.success('Ordem salva', { description: 'É assim que o cliente vê as categorias.' })
        onSaved(order)
    }
    return createPortal(
        <div className="fixed inset-x-0 top-0 z-[95] flex items-end justify-center" style={{ bottom: 'var(--staging-banner-h, 0px)' }}>
            <button aria-label="Fechar" onClick={onClose} className="absolute inset-0" style={{ background: 'rgba(0,0,0,.5)' }} />
            <div role="dialog" aria-modal="true" aria-label="Ordenar categorias" className="relative w-full max-w-md max-h-[88dvh] flex flex-col rounded-t-[28px]" style={{ background: c.background, border: `1px solid ${c.border}` }}>
                <div className="flex items-center gap-2 px-4 pt-4 pb-3">
                    <div className="flex-1 min-w-0"><p className="text-[17px] font-black" style={{ color: c.textPrimary }}>Ordenar categorias</p><p className="text-[11.5px]" style={{ color: c.textSecondary }}>Ordem em que aparecem para o cliente ({titulo})</p></div>
                    <button onClick={onClose} aria-label="Fechar" className="w-9 h-9 rounded-full flex items-center justify-center" style={{ border: `1px solid ${c.border}`, color: c.textPrimary }}><X size={16} /></button>
                </div>
                <div className="overflow-y-auto px-4 pb-3 min-h-0">
                    <div className="rounded-3xl overflow-hidden mb-3" style={{ background: c.surface, border: `1px solid ${c.border}` }}>
                        {lista.map((k, n) => (
                            <div key={k} className="flex items-center gap-2 px-3.5 py-2.5" style={{ borderTop: n ? `1px solid ${c.border}` : undefined }}>
                                <span className="w-6 text-[12px] font-black text-center" style={{ color: c.textSecondary }}>{n + 1}</span>
                                <div className="min-w-0 flex-1"><p className="text-[13.5px] font-black truncate" style={{ color: c.textPrimary }}>{k}</p><p className="text-[11px]" style={{ color: c.textSecondary }}>{conta(k)} {conta(k) === 1 ? 'item' : 'itens'}</p></div>
                                <button disabled={n === 0} onClick={() => troca(n - 1, n)} aria-label={`Subir ${k}`} className="w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-30" style={{ border: `1px solid ${c.border}`, color: c.textPrimary }}><ChevronUp size={16} /></button>
                                <button disabled={n === lista.length - 1} onClick={() => troca(n, n + 1)} aria-label={`Descer ${k}`} className="w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-30" style={{ border: `1px solid ${c.border}`, color: c.textPrimary }}><ChevronDown size={16} /></button>
                            </div>
                        ))}
                    </div>
                    <p className="text-[11.5px] leading-snug" style={{ color: c.textSecondary }}>Para renomear ou mudar um item de categoria, abra o item. Categoria sem itens some sozinha; categoria nova entra no fim.</p>
                </div>
                <div className="px-4 pt-3 pb-[calc(14px+env(safe-area-inset-bottom))]" style={{ borderTop: `1px solid ${c.border}` }}>
                    <button disabled={saving} onClick={salvar} className="w-full h-12 rounded-full text-[14px] font-black text-white disabled:opacity-50" style={{ background: cor }}>{saving ? 'Salvando…' : 'Salvar ordem'}</button>
                </div>
            </div>
        </div>,
        document.body,
    )
}
