// app/(main)/modoprestador/page.tsx
//
// Modo prestador: os serviços que a própria pessoa publicou (products.listing_type = 'service_offer'). Usa a mesma
// casca de topo/menu do /modeloinicial (ModeShell), então o cabeçalho e o menu lateral continuam iguais.
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, Plus, Wrench } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { Spinner } from '@/components/Spinner'
import { getServiceIcon, getServiceLabel } from '@/lib/serviceTypes'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

interface MyService {
    id: string
    name: string
    slug: string | null
    image: string | null
    price: number | null
    active: boolean
    views: number
    createdAt: string
    serviceType: string | null
}

const money = (v: number | null) => (v != null && v > 0 ? `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : null)

export default function ModoPrestadorPage() {
    const router = useRouter()
    const { colors } = useTheme()
    const { userId, profileSlug, loading: profileLoading } = useProfile()
    const [services, setServices] = useState<MyService[] | null>(null)

    useEffect(() => {
        if (profileLoading) return
        if (!userId) { setServices([]); return }
        let cancelled = false
        supabase
            .from('products')
            .select('id, name, slug, image_url, price, is_active, view_count, created_at, service_type')
            .eq('owner_id', userId)
            .eq('listing_type', 'service_offer')
            .order('created_at', { ascending: false })
            .then(({ data }) => {
                if (cancelled) return
                setServices((data || []).map((r: any) => ({
                    id: r.id,
                    name: r.name,
                    slug: r.slug,
                    image: r.image_url ? (r.image_url.startsWith('http') ? r.image_url : supabase.storage.from('product-images').getPublicUrl(r.image_url).data.publicUrl) : null,
                    price: r.price != null ? Number(r.price) : null,
                    active: r.is_active !== false,
                    views: r.view_count || 0,
                    createdAt: r.created_at,
                    serviceType: r.service_type || null,
                })))
            })
        return () => { cancelled = true }
    }, [userId, profileLoading])

    const open = (s: MyService) => router.push(`/${profileSlug}/${s.slug || s.id}`)

    return (
        <>
            <section className="mt-6">
                <div className="flex items-center gap-3 mb-3">
                    <div className="min-w-0 flex-1">
                        <h1 className="text-xl font-black leading-tight" style={{ color: colors.textPrimary }}>Meus serviços</h1>
                        <p className="text-xs" style={{ color: colors.textSecondary }}>Os serviços que você publicou</p>
                    </div>
                    {userId && (
                        <button
                            onClick={() => router.push('/meus-servicos')}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-black text-white flex-shrink-0 transition hover:scale-105 active:scale-95"
                            style={{ background: GRADIENT }}
                        >
                            <Plus size={16} /> Publicar
                        </button>
                    )}
                </div>

                {profileLoading || services === null ? (
                    <div className="flex justify-center py-12"><Spinner size={28} color={colors.accent} /></div>
                ) : !userId ? (
                    <div className="rounded-3xl border p-6 text-center" style={{ background: colors.surface, borderColor: colors.border }}>
                        <p className="text-sm font-bold mb-3" style={{ color: colors.textPrimary }}>Entre na sua conta para ver os serviços que você publicou.</p>
                        <button onClick={() => router.push('/login')} className="px-5 py-2.5 rounded-full text-sm font-black text-white" style={{ background: GRADIENT }}>Entrar</button>
                    </div>
                ) : services.length === 0 ? (
                    <div className="rounded-3xl border p-6 text-center" style={{ background: colors.surface, borderColor: colors.border }}>
                        <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>Você ainda não publicou nenhum serviço.</p>
                        <p className="text-xs mt-1 mb-3" style={{ color: colors.textSecondary }}>Divulgue o que você faz e seja encontrado por quem está perto.</p>
                        <button onClick={() => router.push('/meus-servicos')} className="px-5 py-2.5 rounded-full text-sm font-black text-white" style={{ background: GRADIENT }}>Publicar serviço</button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        {services.map((s) => {
                            const Icon = getServiceIcon(s.serviceType || 'outro')
                            return (
                                <button
                                    key={s.id}
                                    onClick={() => open(s)}
                                    className="text-left rounded-3xl overflow-hidden border flex flex-col transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316]"
                                    style={{ background: colors.surface, borderColor: colors.border, boxShadow: colors.shadow }}
                                >
                                    <span className="relative block w-full h-36 overflow-hidden" style={{ background: '#7c3aed22' }}>
                                        {s.image
                                            ? <img src={s.image} alt="" className="w-full h-full object-cover" loading="lazy" />
                                            : <span className="w-full h-full flex items-center justify-center" style={{ color: '#7c3aed' }}><Icon size={40} /></span>}
                                        <span
                                            className="absolute left-2 top-2 text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full text-white"
                                            style={{ background: s.active ? '#16a34a' : '#6b7280' }}
                                        >
                                            {s.active ? 'Ativo' : 'Pausado'}
                                        </span>
                                    </span>
                                    <span className="block p-3.5">
                                        <span className="block text-sm font-black leading-snug line-clamp-2" style={{ color: colors.textPrimary }}>{s.name}</span>
                                        {s.serviceType && <span className="block text-[11px] mt-0.5" style={{ color: colors.textSecondary }}>{getServiceLabel(s.serviceType)}</span>}
                                        {money(s.price) && <span className="block text-sm font-black mt-1.5" style={{ color: '#7c3aed' }}>{money(s.price)}</span>}
                                        <span className="flex items-center gap-3 mt-2 text-[11px]" style={{ color: colors.textSecondary }}>
                                            <span className="flex items-center gap-1"><Eye size={12} /> {s.views}</span>
                                            <span>publicado {formatDistanceToNow(new Date(s.createdAt), { addSuffix: true, locale: ptBR })}</span>
                                        </span>
                                    </span>
                                </button>
                            )
                        })}
                    </div>
                )}
            </section>
        </>
    )
}
