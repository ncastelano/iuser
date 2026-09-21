// src/components/StoreDashboard/CategorySuggestions.tsx
//
// Categorias que a loja já usou em outros itens, como atalhos embaixo do
// campo de categoria — tocar preenche o campo, sem digitar de novo.
'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

interface CategorySuggestionsProps {
    storeId: string | null | undefined
    value: string
    onPick: (category: string) => void
    colors: any
}

export default function CategorySuggestions({ storeId, value, onPick, colors }: CategorySuggestionsProps) {
    const [categories, setCategories] = useState<string[]>([])

    useEffect(() => {
        if (!storeId) return
        let cancelled = false
        supabase
            .from('products')
            .select('category')
            .eq('store_id', storeId)
            .not('category', 'is', null)
            .then(({ data }) => {
                if (cancelled) return
                // Uma vez cada (ignorando maiúsculas), ordem alfabética.
                const seen = new Map<string, string>()
                for (const row of data || []) {
                    const name = String(row.category || '').trim()
                    if (name && !seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), name)
                }
                setCategories([...seen.values()].sort((a, b) => a.localeCompare(b, 'pt-BR')))
            })
        return () => { cancelled = true }
    }, [storeId])

    if (categories.length === 0) return null

    return (
        <div className="space-y-1.5">
            <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                Suas categorias
            </p>
            <div className="flex flex-wrap gap-2">
                {categories.map((cat) => {
                    const selected = cat.toLowerCase() === value.trim().toLowerCase()
                    return (
                        <button
                            key={cat}
                            type="button"
                            onClick={() => onPick(cat)}
                            className="px-3 py-1.5 rounded-full text-xs font-bold transition-all hover:scale-105"
                            style={selected
                                ? { background: 'linear-gradient(135deg, #f97316, #dc2626)', color: '#ffffff' }
                                : { background: 'rgba(255,255,255,0.05)', color: colors.textPrimary, border: `1px solid ${colors.border}` }}
                        >
                            {cat}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
