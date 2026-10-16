// app/(main)/painel-loja/[storeSlug]/page.tsx
//
// Painel de UMA loja (modo loja): cada loja tem o seu próprio endereço, /painel-loja/<storeSlug>. Mostra o StoreDashboard
// completo (pedidos, venda presencial, horários, catálogo, entrega, pagamento, funcionários, agenda, publicações, clube,
// visitantes) dentro da casca de modos (topo + menu lateral), com um cabeçalho no desenho do /modeloinicial.
'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { Spinner } from '@/components/Spinner'
import StoreDashboard from '@/components/StoreDashboard/StoreDashboard'
import StoreDashboardSkeleton from '@/components/StoreDashboard/StoreDashboardSkeleton'
import { isStoreOpenNow, type BusinessHours } from '@/lib/storeHours'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

interface MyStore { id: string; name: string; logo: string | null; open: boolean }

export default function PainelLojaPage() {
    const router = useRouter()
    const params = useParams()
    const storeSlug = (Array.isArray(params.storeSlug) ? params.storeSlug[0] : params.storeSlug) || ''
    const { colors } = useTheme()
    const { userId, profileSlug, loading } = useProfile()
    const [store, setStore] = useState<MyStore | null | undefined>(undefined) // undefined = carregando, null = não é sua

    useEffect(() => {
        if (loading) return
        if (!userId) { setStore(null); return }
        let cancelled = false
        supabase
            .from('stores')
            .select('id, name, logo_url, business_hours')
            .eq('storeSlug', storeSlug)
            .eq('owner_id', userId)
            .maybeSingle()
            .then(({ data }) => {
                if (cancelled) return
                if (!data) { setStore(null); return }
                const logo = data.logo_url
                    ? (data.logo_url.startsWith('http') ? data.logo_url : supabase.storage.from('store-logos').getPublicUrl(data.logo_url).data.publicUrl)
                    : null
                setStore({ id: data.id, name: data.name, logo, open: isStoreOpenNow(data.business_hours as BusinessHours | null) })
            })
        return () => { cancelled = true }
    }, [userId, loading, storeSlug])

    return (
        <>
            {loading || store === undefined ? (
                <div className="-mx-4"><StoreDashboardSkeleton slug={storeSlug} /></div>
            ) : !userId ? (
                <div className="mt-6 rounded-3xl border p-6 text-center" style={{ background: colors.surface, borderColor: colors.border }}>
                    <p className="text-sm font-bold mb-3" style={{ color: colors.textPrimary }}>Entre na sua conta para ver o painel da loja.</p>
                    <button onClick={() => router.push('/login')} className="px-5 py-2.5 rounded-full text-sm font-black text-white" style={{ background: GRADIENT }}>Entrar</button>
                </div>
            ) : store === null ? (
                <div className="mt-6 rounded-3xl border p-6 text-center" style={{ background: colors.surface, borderColor: colors.border }}>
                    <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>Esta loja não foi encontrada na sua conta.</p>
                    <p className="text-xs mt-1 mb-3" style={{ color: colors.textSecondary }}>Escolha uma das suas lojas no menu.</p>
                    <button onClick={() => router.push('/modeloinicial')} className="px-5 py-2.5 rounded-full text-sm font-black text-white" style={{ background: GRADIENT }}>Voltar</button>
                </div>
            ) : (
                <>
                    <div className="-mx-4">
                        <StoreDashboard profileSlug={profileSlug || ''} storeSlug={storeSlug} infoFirst showDebtBanner={false} previewLogo={store.logo} previewName={store.name} />
                    </div>
                </>
            )}
        </>
    )
}
