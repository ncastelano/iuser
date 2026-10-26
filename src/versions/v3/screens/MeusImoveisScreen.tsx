// src/versions/v3/screens/MeusImoveisScreen.tsx
//
// /meus-imoveis na interface 3.0: os imóveis que a pessoa anunciou, com o que importa para quem aluga: quantas visitas o anúncio teve,
// pausar/reativar, marcar como alugado (isso conta no selo de "Anunciante confiável"), editar e apagar. Quem pediu visita aparece em
// Compromissos → "Quem agendou comigo" (o Convite de serviço, com o histórico de cada interessado).
'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, CalendarCheck, Check, Eye, Pause, Pencil, Play, Plus, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { Spinner } from '@/components/Spinner'
import RentalCardView from '@/components/rentals/RentalCardView'
import { loadMyRentalListings, type RentalCard } from '@/modules/rentals/load'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

export default function MeusImoveisScreen() {
    const { colors } = useTheme()
    const router = useRouter()
    const { userId, profileSlug, loading: profileLoading } = useProfile()
    const [items, setItems] = useState<RentalCard[] | null>(null)
    const soft = `${colors.border}40`

    const load = useCallback(() => { if (userId) loadMyRentalListings(supabase, userId).then(setItems).catch(() => setItems([])) }, [userId])
    useEffect(() => {
        if (profileLoading) return
        if (!userId) { router.replace(`/login?redirect=${encodeURIComponent('/meus-imoveis')}`); return }
        load()
    }, [userId, profileLoading, load, router])

    const setStatus = async (l: RentalCard, status: 'active' | 'paused' | 'rented') => {
        const { error } = await supabase.from('rental_listings').update({ status }).eq('id', l.id)
        if (error) { toast.error(error.message); return }
        toast.success(status === 'rented' ? 'Marcado como alugado' : status === 'paused' ? 'Anúncio pausado' : 'Anúncio reativado')
        load()
    }
    const remove = async (l: RentalCard) => {
        if (!confirm(`Apagar o anúncio "${l.title}"? Isso não dá para desfazer.`)) return
        const { error } = await supabase.from('rental_listings').delete().eq('id', l.id)
        if (error) { toast.error(error.message); return }
        toast.success('Anúncio apagado')
        load()
    }
    const btn = 'flex-1 h-10 rounded-full text-[12px] font-black flex items-center justify-center gap-1.5 transition active:scale-95'

    return (
        <div className="pb-28">
            <div className="flex items-center gap-2">
                <button onClick={() => router.push('/imoveis')} aria-label="Voltar" className="flex-shrink-0 rounded-full flex items-center justify-center" style={{ width: 46, height: 46, background: soft, color: colors.textPrimary }}><ArrowLeft size={20} /></button>
                <h1 className="text-xl font-black flex-1" style={{ color: colors.textPrimary }}>Meus imóveis</h1>
                <button onClick={() => router.push('/anunciar-imovel')} className="h-11 px-4 rounded-full flex items-center gap-1.5 text-white text-[13px] font-black" style={{ background: GRADIENT }}><Plus size={16} /> Anunciar</button>
            </div>
            {profileSlug && (
                <button onClick={() => router.push(`/compromissos/${profileSlug}?aba=clientes&secao=pendentes`)} className="mt-3 w-full h-12 rounded-2xl flex items-center justify-center gap-2 text-[13px] font-black" style={{ background: soft, color: colors.textPrimary }}>
                    <CalendarCheck size={16} style={{ color: '#f97316' }} /> Ver quem pediu visita
                </button>
            )}

            {items === null ? (
                <div className="flex justify-center py-16"><Spinner size={26} color={colors.accent} /></div>
            ) : items.length === 0 ? (
                <div className="mt-6 rounded-3xl p-8 text-center" style={{ background: soft }}>
                    <p className="text-sm font-black" style={{ color: colors.textPrimary }}>Você ainda não anunciou nenhum imóvel</p>
                    <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>Anunciar leva poucos minutos e o interessado já agenda a visita pelo iUser.</p>
                    <button onClick={() => router.push('/anunciar-imovel')} className="mt-3 h-11 px-6 rounded-full text-sm font-black text-white" style={{ background: GRADIENT }}>Anunciar meu primeiro imóvel</button>
                </div>
            ) : (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    {items.map((l) => (
                        <RentalCardView
                            key={l.id}
                            l={l}
                            onOpen={() => router.push(`/imoveis/${l.slug}`)}
                            trailing={(
                                <div className="mt-2 flex flex-col gap-2">
                                    <p className="flex items-center gap-1.5 text-[11px]" style={{ color: colors.textSecondary }}><Eye size={12} /> {l.viewCount} {l.viewCount === 1 ? 'visualização' : 'visualizações'}</p>
                                    <div className="flex gap-2">
                                        {l.status === 'active' && <button onClick={() => setStatus(l, 'paused')} className={btn} style={{ background: soft, color: colors.textPrimary }}><Pause size={13} /> Pausar</button>}
                                        {l.status !== 'active' && <button onClick={() => setStatus(l, 'active')} className={btn} style={{ background: soft, color: colors.textPrimary }}><Play size={13} /> Reativar</button>}
                                        {l.status !== 'rented' && <button onClick={() => setStatus(l, 'rented')} className={btn} style={{ background: '#16a34a', color: '#fff' }}><Check size={13} /> Alugado</button>}
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => router.push(`/anunciar-imovel?editar=${l.id}`)} className={btn} style={{ background: soft, color: colors.textPrimary }}><Pencil size={13} /> Editar</button>
                                        <button onClick={() => remove(l)} className={btn} style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}><Trash2 size={13} /> Apagar</button>
                                    </div>
                                </div>
                            )}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}
