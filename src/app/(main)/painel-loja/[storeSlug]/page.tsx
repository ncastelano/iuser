// app/(main)/painel-loja/[storeSlug]/page.tsx
//
// Painel de UMA loja (modo loja): cada loja tem o seu próprio endereço, /painel-loja/<storeSlug>. Mostra o StoreDashboard
// completo (pedidos, venda presencial, horários, catálogo, entrega, pagamento, funcionários, agenda, publicações, clube,
// visitantes) dentro da casca de modos (topo + menu lateral), com um cabeçalho no desenho do /modeloinicial.
'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ExternalLink, Store as StoreIcon } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import ModeShell from '@/components/ModeShell'
import { Spinner } from '@/components/Spinner'
import StoreDashboard from '@/components/StoreDashboard/StoreDashboard'
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
        <ModeShell>
            {loading || store === undefined ? (
                <div className="flex justify-center py-16"><Spinner size={28} color={colors.accent} /></div>
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
                    {/* Cabeçalho do painel: a loja + "Ver loja" */}
                    <section className="mt-6 rounded-3xl border p-4 flex items-center gap-3" style={{ background: colors.surface, borderColor: colors.border, boxShadow: colors.shadow }}>
                        <span className="w-14 h-14 rounded-2xl overflow-hidden flex items-center justify-center flex-shrink-0" style={{ background: '#2563eb22', color: '#2563eb' }}>
                            {store.logo ? <img src={store.logo} alt="" className="w-full h-full object-cover" /> : <StoreIcon size={26} />}
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="text-xs flex items-center gap-1.5" style={{ color: colors.textSecondary }}>
                                Painel da loja
                                <span className="inline-flex items-center gap-1 font-bold" style={{ color: store.open ? '#16a34a' : '#dc2626' }}>
                                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: store.open ? '#16a34a' : '#dc2626' }} />
                                    {store.open ? 'Aberta agora' : 'Fechada agora'}
                                </span>
                            </p>
                            <h1 className="text-lg font-black leading-tight truncate" style={{ color: colors.textPrimary }}>{store.name}</h1>
                        </div>
                        <button
                            onClick={() => router.push(`/${storeSlug}`)}
                            className="flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-black text-white flex-shrink-0 transition hover:scale-105 active:scale-95"
                            style={{ background: GRADIENT, boxShadow: '0 4px 12px #f9731640' }}
                        >
                            <ExternalLink size={15} /> Ver loja
                        </button>
                    </section>

                    <div className="-mx-4 mt-2">
                        <StoreDashboard profileSlug={profileSlug || ''} storeSlug={storeSlug} />
                    </div>
                </>
            )}
        </ModeShell>
    )
}
