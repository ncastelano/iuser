// src/components/digital/DigitalLibrary.tsx — "Minhas compras digitais": os cursos, aulas e arquivos que a pessoa comprou e a loja já liberou. Usado na aba Digital do /carrinho
// (as duas versões da interface) e na página /minhas-compras-digitais.
'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { GraduationCap } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { Spinner } from '@/components/Spinner'
import { supabase } from '@/lib/supabase/client'
import { fetchLibrary, type LibraryItem } from '@/modules/digital'

export default function DigitalLibrary({ userId }: { userId: string }) {
    const { colors } = useTheme()
    const [items, setItems] = useState<LibraryItem[] | null>(null)
    useEffect(() => { fetchLibrary().then(setItems).catch(() => setItems([])) }, [userId])

    if (!items) return <div className="flex justify-center py-10"><Spinner size={28} color={colors.accent} /></div>
    if (items.length === 0) {
        return (
            <div className="rounded-3xl p-6 text-center flex flex-col items-center gap-2" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                <GraduationCap size={28} style={{ color: colors.textSecondary }} />
                <p className="text-sm font-black" style={{ color: colors.textPrimary }}>Nada liberado ainda</p>
                <p className="text-[12px]" style={{ color: colors.textSecondary }}>Cursos, aulas e arquivos que você compra aparecem aqui quando a loja confirma o seu pagamento.</p>
            </div>
        )
    }
    return (
        <div className="flex flex-col gap-3">
            {items.map((it) => (
                <Link key={it.product_id} href={`/minhas-compras-digitais/${it.product_id}`} className="flex items-center gap-3 rounded-3xl p-3 active:scale-[0.99] transition" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                    {it.image_url ? <img src={supabase.storage.from('product-images').getPublicUrl(it.image_url).data.publicUrl} alt="" className="w-20 h-20 rounded-2xl object-cover flex-shrink-0" /> : <div className="w-20 h-20 rounded-2xl flex-shrink-0" style={{ background: '#f97316' }} />}
                    <div className="min-w-0">
                        <p className="text-sm font-black" style={{ color: colors.textPrimary }}>{it.product_name}</p>
                        <p className="text-[12px]" style={{ color: colors.textSecondary }}>{it.store_name || 'Loja'} · {it.items_count} {it.items_count === 1 ? 'item' : 'itens'}</p>
                        <p className="text-[11px] font-black mt-1" style={{ color: '#f97316' }}>Abrir conteúdo →</p>
                    </div>
                </Link>
            ))}
        </div>
    )
}
