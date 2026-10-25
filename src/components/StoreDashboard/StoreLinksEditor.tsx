// src/components/StoreDashboard/StoreLinksEditor.tsx
//
// Editor dos links da loja no painel do dono (texto + endereço, até 8; aparecem sob a descrição da página da loja).
// Carrega e salva sozinho (`stores.links`): o dono só pode gravar na própria loja (RLS) e o banco confere o formato de novo.
'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import LinkListInput, { type LinkRow } from '@/components/v3/LinkListInput'
import { linksFromRows, sanitizeStoreLinks } from '@/lib/storeLinks'

export default function StoreLinksEditor({ storeId }: { storeId: string }) {
    const { colors } = useTheme()
    const [rows, setRows] = useState<LinkRow[] | null>(null)
    const [saved, setSaved] = useState('')
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        let alive = true
        supabase.from('stores').select('links').eq('id', storeId).maybeSingle().then(({ data }) => {
            if (!alive) return
            const links = sanitizeStoreLinks((data as any)?.links)
            setRows(links.map((l) => ({ label: l.label, url: l.url })))
            setSaved(JSON.stringify(links))
        })
        return () => { alive = false }
    }, [storeId])

    if (rows === null) return null
    const parsed = linksFromRows(rows)
    const dirty = parsed.ok && JSON.stringify(parsed.links) !== saved

    const save = async () => {
        if (!parsed.ok) { toast.error(parsed.error); return }
        setSaving(true)
        const { error } = await supabase.from('stores').update({ links: parsed.links }).eq('id', storeId)
        setSaving(false)
        if (error) { toast.error('Erro ao salvar os links: ' + error.message); return }
        setSaved(JSON.stringify(parsed.links))
        toast.success('Links salvos')
    }

    return (
        <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>Links da loja</label>
            <p className="text-[11px]" style={{ color: colors.textSecondary }}>Escreva o texto e o endereço. Eles aparecem embaixo da descrição, na página da loja.</p>
            <LinkListInput rows={rows} onChange={setRows} colors={colors} />
            {(dirty || !parsed.ok) && (
                <div className="flex items-center gap-3 pt-1">
                    <button type="button" onClick={save} disabled={saving || !parsed.ok} className="h-10 px-6 rounded-full text-[13px] font-black text-white disabled:opacity-50" style={{ background: '#f97316' }}>
                        {saving ? 'Salvando...' : 'Salvar links'}
                    </button>
                    {!parsed.ok && <span className="text-[11px] font-bold" style={{ color: '#ef4444' }}>{parsed.error}</span>}
                </div>
            )}
        </div>
    )
}
