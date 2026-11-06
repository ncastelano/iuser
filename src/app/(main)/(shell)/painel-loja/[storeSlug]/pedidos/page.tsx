// app/(main)/(shell)/painel-loja/[storeSlug]/pedidos/page.tsx
//
// PEDIDOS DA LOJA (3.0): a lista completa dos pedidos de UMA loja, só do dono. O cartão "Pedidos na loja" do painel é só o resumo (contadores + os pedidos
// NOVOS + o atalho para cá); aqui ficam todas as situações (Novos, Preparando, Prontos, Finalizados) em linhas compactas, com a ação rápida
// (Aceitar, Pronto, Finalizar) e os Prontos que esperam motorista numa fileira horizontal. Os pedidos de serviços ficam na aba Serviços.
'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import Header from '@/components/Header'
import StoreOrders from '@/components/StoreDashboard/StoreOrders'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

interface MyStore { id: string; name: string }

export default function PedidosDaLojaPage() {
    const router = useRouter()
    const params = useParams()
    const storeSlug = (Array.isArray(params.storeSlug) ? params.storeSlug[0] : params.storeSlug) || ''
    const { colors } = useTheme()
    const { userId, loading } = useProfile()
    const [store, setStore] = useState<MyStore | null | undefined>(undefined) // undefined = carregando, null = não é sua

    useEffect(() => {
        if (loading) return
        if (!userId) { setStore(null); return }
        let cancelled = false
        supabase.from('stores').select('id, name').eq('storeSlug', storeSlug).eq('owner_id', userId).maybeSingle()
            .then(({ data }) => { if (!cancelled) setStore(data ? { id: data.id, name: data.name } : null) })
        return () => { cancelled = true }
    }, [userId, loading, storeSlug])

    const back = () => router.push(`/painel-loja/${encodeURIComponent(storeSlug)}`)

    return (
        <div className="pb-28">
            <Header title="Pedidos da loja" showBack onBack={back} />
            {loading || store === undefined ? (
                <div className="mt-4 flex flex-col gap-2">{[0, 1, 2, 3].map((i) => <span key={i} className="block h-14 rounded-2xl animate-pulse" style={{ background: `${colors.border}40` }} />)}</div>
            ) : !userId ? (
                <div className="mt-6 rounded-3xl border p-6 text-center" style={{ background: colors.surface, borderColor: colors.border }}>
                    <p className="text-sm font-bold mb-3" style={{ color: colors.textPrimary }}>Entre na sua conta para ver os pedidos da loja.</p>
                    <button onClick={() => router.push('/login')} className="px-5 py-2.5 rounded-full text-sm font-black text-white" style={{ background: GRADIENT }}>Entrar</button>
                </div>
            ) : store === null ? (
                <div className="mt-6 rounded-3xl border p-6 text-center" style={{ background: colors.surface, borderColor: colors.border }}>
                    <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>Esta loja não foi encontrada na sua conta.</p>
                    <button onClick={() => router.push('/')} className="mt-3 px-5 py-2.5 rounded-full text-sm font-black text-white" style={{ background: GRADIENT }}>Voltar</button>
                </div>
            ) : (
                <div className="mt-3">
                    <p className="text-[12px] font-bold mb-3" style={{ color: colors.textSecondary }}>{store.name}</p>
                    <StoreOrders variant="page" storeId={store.id} storeName={store.name} storeSlug={storeSlug} />
                </div>
            )}
        </div>
    )
}
