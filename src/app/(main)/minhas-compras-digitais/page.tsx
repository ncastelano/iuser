// app/(main)/minhas-compras-digitais/page.tsx — a biblioteca de quem comprou produto digital (vídeo-aula, curso, e-book...): só aparece o que a loja já liberou.
'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, GraduationCap } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { Spinner } from '@/components/Spinner'
import { supabase } from '@/lib/supabase/client'
import { fetchLibrary, type LibraryItem } from '@/modules/digital'

export default function MinhasComprasDigitaisPage() {
    const { colors } = useTheme()
    const router = useRouter()
    const { userId, loading } = useProfile()
    const [items, setItems] = useState<LibraryItem[] | null>(null)

    useEffect(() => { if (!loading && !userId) router.replace('/login') }, [loading, userId, router])
    useEffect(() => { if (userId) fetchLibrary().then(setItems).catch(() => setItems([])) }, [userId])

    if (loading || !userId || !items) {
        return <div className="min-h-dvh flex items-center justify-center" style={{ background: colors.background }}><Spinner size={32} color={colors.accent} /></div>
    }
    return (
        <div className="min-h-dvh px-4 py-6 pb-28" style={{ background: colors.background, paddingTop: 'max(1.5rem, var(--shell-top, 0px))' }}>
            <div className="max-w-2xl mx-auto flex flex-col gap-4">
                <div className="flex items-center gap-3">
                    <button type="button" onClick={() => router.back()} aria-label="Voltar" className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: `${colors.border}40`, color: colors.textPrimary }}><ArrowLeft size={18} /></button>
                    <div>
                        <h1 className="text-xl font-black" style={{ color: colors.textPrimary }}>Minhas compras digitais</h1>
                        <p className="text-[12px]" style={{ color: colors.textSecondary }}>Cursos, aulas e arquivos que você já pode abrir.</p>
                    </div>
                </div>
                {items.length === 0 ? (
                    <div className="rounded-3xl p-6 text-center flex flex-col items-center gap-2" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                        <GraduationCap size={28} style={{ color: colors.textSecondary }} />
                        <p className="text-sm font-black" style={{ color: colors.textPrimary }}>Nada liberado ainda</p>
                        <p className="text-[12px]" style={{ color: colors.textSecondary }}>Depois que a loja confirma o seu pagamento, o conteúdo aparece aqui.</p>
                    </div>
                ) : items.map((it) => (
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
        </div>
    )
}
