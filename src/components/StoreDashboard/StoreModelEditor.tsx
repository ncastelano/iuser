// src/components/StoreDashboard/StoreModelEditor.tsx
//
// Trocar o modelo da loja no painel (produtos, atendimento ou mista). Carrega e salva sozinho (`stores.store_model`).
// Escolher atendimento ou mista sem a agenda ligada não liga nada sozinho: a agenda continua sendo ativada no botão "Ativar agenda".
'use client'

import { useEffect, useState } from 'react'
import { toast } from '@/lib/toast'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import StoreModelPicker from '@/components/v3/StoreModelPicker'
import { parseStoreModel, type StoreModel } from '@/lib/storeModel'

export default function StoreModelEditor({ storeId }: { storeId: string }) {
    const { colors } = useTheme()
    const [saved, setSaved] = useState<StoreModel | null>(null)
    const [model, setModel] = useState<StoreModel>('mixed')
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        let alive = true
        supabase.from('stores').select('store_model').eq('id', storeId).maybeSingle().then(({ data }) => {
            if (!alive) return
            const m = parseStoreModel((data as any)?.store_model)
            setSaved(m); setModel(m)
        })
        return () => { alive = false }
    }, [storeId])

    if (saved === null) return null
    const save = async () => {
        setSaving(true)
        const { error } = await supabase.from('stores').update({ store_model: model }).eq('id', storeId)
        setSaving(false)
        if (error) { toast.error('Erro ao salvar o modelo: ' + error.message); return }
        setSaved(model)
        toast.success('Modelo da loja salvo')
    }
    return (
        <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>Modelo da loja</label>
            <p className="text-[11px]" style={{ color: colors.textSecondary }}>Muda o botão central e a ordem da página da loja.</p>
            <StoreModelPicker value={model} onChange={setModel} colors={colors} />
            {model !== saved && (
                <button type="button" onClick={save} disabled={saving} className="h-10 px-6 rounded-full text-[13px] font-black text-white disabled:opacity-50" style={{ background: '#f97316' }}>
                    {saving ? 'Salvando...' : 'Salvar modelo'}
                </button>
            )}
        </div>
    )
}
