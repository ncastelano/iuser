// src/versions/v3/screens/ImovelScreen.tsx
//
// /imoveis/<slug> na interface 3.0: a página de UM imóvel. Fotos, o que se paga de verdade (aluguel + condomínio + IPTU e o que entra no
// primeiro mês com a caução; ou as diárias na temporada), a ficha, as regras, quem anuncia COM o selo de confiança calculado pelo banco,
// as avaliações dos visitantes e "Agendar visita" (o agendamento do iUser, ligado ao imóvel). O endereço completo só aparece para o
// dono e para quem tem visita confirmada (get_rental_address); antes disso só o bairro.
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, BadgeCheck, Building2, CalendarCheck, Check, Home, Lock, MapPin, PawPrint, Pencil, Share2, Sofa, Star } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { handleShareLink } from '@/lib/share'
import { Spinner } from '@/components/Spinner'
import ProfileScheduleModal from '@/components/ProfileScheduleModal'
import Stars from '@/components/appointments/Stars'
import { brl, monthlyTotal, moveInCost, priceLabel, propertyLabel, shareText, specsLine, stayTotal, trustBadge } from '@/modules/rentals/domain'
import { loadRentalExtras, loadRentalListing, type RentalCard, type RentalExtras } from '@/modules/rentals/load'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

export default function ImovelScreen({ slug }: { slug: string }) {
    const { colors } = useTheme()
    const router = useRouter()
    const { userId, loading: profileLoading } = useProfile()
    const [l, setL] = useState<RentalCard | null | undefined>(undefined)
    const [extras, setExtras] = useState<RentalExtras | null>(null)
    const [photo, setPhoto] = useState(0)
    const [scheduling, setScheduling] = useState(false)
    const soft = `${colors.border}40`

    useEffect(() => {
        let alive = true
        loadRentalListing(supabase, slug).then((r) => { if (alive) setL(r) }).catch(() => { if (alive) setL(null) })
        return () => { alive = false }
    }, [slug])
    // endereço/avaliações dependem de quem está olhando: recarrega quando o login chega
    useEffect(() => {
        if (!l || profileLoading) return
        let alive = true
        loadRentalExtras(supabase, l).then((e) => { if (alive) setExtras(e) }).catch(() => {})
        return () => { alive = false }
    }, [l, userId, profileLoading])
    useEffect(() => { if (l && l.status === 'active') void supabase.rpc('track_rental_view', { p_listing: l.id }) }, [l?.id]) // eslint-disable-line react-hooks/exhaustive-deps

    if (l === undefined) return <div className="flex justify-center py-24"><Spinner size={28} color={colors.accent} /></div>
    if (l === null) {
        return (
            <div className="py-20 text-center flex flex-col items-center gap-3">
                <Home size={40} style={{ color: colors.textSecondary }} />
                <p className="text-base font-black" style={{ color: colors.textPrimary }}>Esse imóvel não está mais disponível</p>
                <button onClick={() => router.push('/imoveis')} className="h-11 px-6 rounded-full text-sm font-black text-white" style={{ background: GRADIENT }}>Ver outros imóveis</button>
            </div>
        )
    }

    const mine = userId === l.ownerId
    const total = monthlyTotal(l)
    const entry = moveInCost(l)
    const stay = stayTotal(l)
    const trust = trustBadge(extras?.trust)
    const hostName = l.storeName || l.ownerName || (l.ownerSlug ? `@${l.ownerSlug}` : 'Anunciante')
    const hostImage = l.storeLogo || l.ownerAvatar
    const reviews = extras?.reviews || []
    const avg = reviews.length ? reviews.reduce((a, r) => a + r.rating, 0) / reviews.length : 0
    const row = (label: string, value: string, bold = false) => (
        <div className="flex items-center justify-between gap-3 text-sm py-1.5">
            <span style={{ color: bold ? colors.textPrimary : colors.textSecondary, fontWeight: bold ? 900 : 600 }}>{label}</span>
            <span style={{ color: colors.textPrimary, fontWeight: bold ? 900 : 700 }}>{value}</span>
        </div>
    )

    return (
        <div className="pb-32">
            {/* Fotos */}
            <div className="relative -mx-4 sm:mx-0 sm:rounded-3xl overflow-hidden aspect-[16/11]" style={{ background: GRADIENT }}>
                {l.photos[photo] ? <img src={l.photos[photo]} alt="" className="absolute inset-0 w-full h-full object-cover" /> : <span className="absolute inset-0 flex items-center justify-center text-white/90"><Home size={52} /></span>}
                <button onClick={() => (window.history.length > 1 ? router.back() : router.push('/imoveis'))} aria-label="Voltar" className="absolute left-3 top-3 w-10 h-10 rounded-full flex items-center justify-center text-white" style={{ background: 'rgba(0,0,0,0.55)' }}><ArrowLeft size={19} /></button>
                <button onClick={() => void handleShareLink({ title: l.title, text: shareText(l), url: `${window.location.origin}/imoveis/${l.slug}`, imageUrl: l.photos[0] || null })} aria-label="Compartilhar imóvel" className="absolute right-3 top-3 w-10 h-10 rounded-full flex items-center justify-center text-white" style={{ background: 'rgba(0,0,0,0.55)' }}><Share2 size={17} /></button>
                {l.photos.length > 1 && <span className="absolute right-3 bottom-3 text-[11px] font-black px-2.5 py-1 rounded-full text-white" style={{ background: 'rgba(0,0,0,0.62)' }}>{photo + 1}/{l.photos.length}</span>}
            </div>
            {l.photos.length > 1 && (
                <div className="mt-2 flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4">
                    {l.photos.map((p, i) => (
                        <button key={p + i} onClick={() => setPhoto(i)} aria-label={`Foto ${i + 1}`} className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0" style={{ border: `2px solid ${i === photo ? '#f97316' : 'transparent'}`, opacity: i === photo ? 1 : 0.7 }}>
                            <img src={p} alt="" className="w-full h-full object-cover" />
                        </button>
                    ))}
                </div>
            )}

            {/* Título e preço */}
            <div className="mt-4 flex flex-wrap gap-1.5">
                <span className="text-[11px] font-black uppercase px-2.5 py-1 rounded-full" style={{ background: soft, color: colors.textPrimary }}>{propertyLabel(l.propertyType)}</span>
                {l.rentalKind === 'temporada' && <span className="text-[11px] font-black uppercase px-2.5 py-1 rounded-full text-white" style={{ background: '#7c3aed' }}>Temporada</span>}
                {l.status === 'rented' && <span className="text-[11px] font-black uppercase px-2.5 py-1 rounded-full text-white" style={{ background: '#16a34a' }}>Alugado</span>}
                {l.status === 'paused' && <span className="text-[11px] font-black uppercase px-2.5 py-1 rounded-full text-white" style={{ background: '#6b7280' }}>Pausado</span>}
            </div>
            <h1 className="mt-2 text-2xl font-black leading-tight" style={{ color: colors.textPrimary }}>{l.title}</h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm" style={{ color: colors.textSecondary }}><MapPin size={14} />{l.neighborhood}, {l.city}{l.state ? ` - ${l.state}` : ''}</p>
            <p className="mt-3 text-3xl font-black" style={{ color: colors.textPrimary }}>{priceLabel(l)}</p>
            {specsLine(l) && <p className="mt-1 text-sm font-bold" style={{ color: colors.textSecondary }}>{specsLine(l)}</p>}
            <div className="mt-2 flex gap-2 flex-wrap">
                {l.petsAllowed && <span className="text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1" style={{ background: soft, color: colors.textPrimary }}><PawPrint size={12} /> Aceita pet</span>}
                {l.furnished && <span className="text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1" style={{ background: soft, color: colors.textPrimary }}><Sofa size={12} /> Mobiliado</span>}
                {l.availableFrom && <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: soft, color: colors.textPrimary }}>Disponível a partir de {new Date(`${l.availableFrom}T12:00:00`).toLocaleDateString('pt-BR')}</span>}
            </div>

            {/* Quanto custa de verdade */}
            <section className="mt-5 rounded-3xl p-4" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                <h2 className="text-sm font-black mb-1" style={{ color: colors.textPrimary }}>Quanto custa de verdade</h2>
                {l.rentalKind === 'mensal' ? (
                    <>
                        {row('Aluguel', brl(l.price))}
                        {l.condoFee > 0 && row('Condomínio', brl(l.condoFee))}
                        {l.iptuFee > 0 && row('IPTU', brl(l.iptuFee))}
                        <div className="my-1 h-px" style={{ background: colors.border }} />
                        {row('Total todo mês', total != null ? brl(total) : '', true)}
                        {l.depositAmount > 0 && row('Caução (garantia)', brl(l.depositAmount))}
                        {entry != null && l.depositAmount > 0 && row('Para entrar (1º mês + caução)', brl(entry), true)}
                    </>
                ) : (
                    <>
                        {row('Diária', brl(l.price))}
                        {l.minStayDays != null && row('Mínimo', `${l.minStayDays} ${l.minStayDays === 1 ? 'diária' : 'diárias'}`)}
                        {stay != null && row(`Total de ${l.minStayDays ?? 1} ${(l.minStayDays ?? 1) === 1 ? 'diária' : 'diárias'}`, brl(stay), true)}
                        {l.maxGuests != null && row('Hóspedes', `até ${l.maxGuests}`)}
                        {l.depositAmount > 0 && row('Caução (devolvida na saída)', brl(l.depositAmount))}
                    </>
                )}
                <p className="text-[11px] mt-2" style={{ color: colors.textSecondary }}>O valor é combinado direto com quem anuncia. O iUser não recebe nem repassa o aluguel.</p>
            </section>

            {l.description && (
                <section className="mt-5">
                    <h2 className="text-sm font-black mb-1.5" style={{ color: colors.textPrimary }}>Sobre o imóvel</h2>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: colors.textPrimary }}>{l.description}</p>
                </section>
            )}
            {l.amenities.length > 0 && (
                <section className="mt-5">
                    <h2 className="text-sm font-black mb-2" style={{ color: colors.textPrimary }}>O que tem</h2>
                    <div className="flex flex-wrap gap-2">{l.amenities.map((a) => <span key={a} className="text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1" style={{ background: soft, color: colors.textPrimary }}><Check size={12} style={{ color: '#16a34a' }} />{a}</span>)}</div>
                </section>
            )}
            {l.rules && (
                <section className="mt-5">
                    <h2 className="text-sm font-black mb-1.5" style={{ color: colors.textPrimary }}>Regras da casa</h2>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: colors.textSecondary }}>{l.rules}</p>
                </section>
            )}

            {/* Onde fica */}
            <section className="mt-5 rounded-3xl p-4" style={{ background: soft }}>
                <h2 className="text-sm font-black mb-1" style={{ color: colors.textPrimary }}>Onde fica</h2>
                {extras?.address ? (
                    <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>{extras.address.address}{extras.address.number ? `, ${extras.address.number}` : ''}{extras.address.complement ? ` — ${extras.address.complement}` : ''} · {l.neighborhood}, {l.city}</p>
                ) : (
                    <p className="flex items-start gap-2 text-sm" style={{ color: colors.textSecondary }}><Lock size={15} className="mt-0.5 flex-shrink-0" /> {l.neighborhood}, {l.city}. O endereço completo aparece depois que o anunciante confirmar a sua visita.</p>
                )}
            </section>

            {/* Quem anuncia */}
            <section className="mt-5 rounded-3xl p-4" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                <h2 className="text-sm font-black mb-2" style={{ color: colors.textPrimary }}>Quem anuncia</h2>
                <button onClick={() => router.push(`/${l.storeSlug || l.ownerSlug}`)} className="w-full flex items-center gap-3 text-left">
                    <span className="w-12 h-12 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 text-white font-black" style={{ background: GRADIENT }}>
                        {hostImage ? <img src={hostImage} alt="" className="w-full h-full object-cover" /> : (l.storeId ? <Building2 size={20} /> : hostName.replace('@', '').charAt(0).toUpperCase())}
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="block text-sm font-black truncate" style={{ color: colors.textPrimary }}>{hostName}</span>
                        {l.storeId && l.ownerName && <span className="block text-[11px] truncate" style={{ color: colors.textSecondary }}>por {l.ownerName}</span>}
                    </span>
                </button>
                <div className="mt-3 flex flex-wrap gap-2">
                    {trust && <span title={trust.hint} className="text-xs font-black px-3 py-1.5 rounded-full flex items-center gap-1.5 text-white" style={{ background: trust.label === 'Imobiliária' ? '#2563eb' : '#16a34a' }}><BadgeCheck size={13} /> {trust.label}</span>}
                    {extras?.trust && extras.trust.rented_count > 0 && <span className="text-xs font-bold px-3 py-1.5 rounded-full" style={{ background: soft, color: colors.textPrimary }}>{extras.trust.rented_count} {extras.trust.rented_count === 1 ? 'imóvel alugado' : 'imóveis alugados'}</span>}
                    {extras?.trust && extras.trust.reviews_count > 0 && <span className="text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1" style={{ background: soft, color: colors.textPrimary }}><Star size={12} className="fill-yellow-400 text-yellow-400" />{String(extras.trust.avg_rating).replace('.', ',')} ({extras.trust.reviews_count})</span>}
                    {extras?.trust && !trust && extras.trust.reviews_count === 0 && <span className="text-xs" style={{ color: colors.textSecondary }}>Anunciante novo: ainda sem avaliações de visitantes.</span>}
                </div>
                {trust && <p className="text-[11px] mt-2" style={{ color: colors.textSecondary }}>{trust.hint}</p>}
            </section>

            {/* Avaliações */}
            {reviews.length > 0 && (
                <section className="mt-5">
                    <h2 className="text-sm font-black mb-2 flex items-center gap-2" style={{ color: colors.textPrimary }}>Avaliações das visitas <Stars value={avg} size={14} /> <span className="font-bold text-xs" style={{ color: colors.textSecondary }}>{String(Math.round(avg * 10) / 10).replace('.', ',')} · {reviews.length}</span></h2>
                    <div className="flex flex-col gap-2">
                        {reviews.slice(0, 8).map((r, i) => (
                            <div key={i} className="rounded-2xl p-3" style={{ background: soft }}>
                                <div className="flex items-center justify-between gap-2"><span className="text-[13px] font-black truncate" style={{ color: colors.textPrimary }}>{r.reviewer_name || (r.reviewer_slug ? `@${r.reviewer_slug}` : 'Visitante')}</span><Stars value={r.rating} size={13} /></div>
                                {r.comment && <p className="text-[13px] mt-1" style={{ color: colors.textPrimary }}>“{r.comment}”</p>}
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* Ação fixa */}
            <div className="fixed inset-x-0 z-30 px-4 pb-4 pt-6 pointer-events-none" style={{ bottom: 'var(--staging-banner-h, 0px)', background: `linear-gradient(to top, ${colors.background} 55%, transparent)` }}>
                <div className="max-w-lg mx-auto pointer-events-auto">
                    {mine ? (
                        <button onClick={() => router.push(`/anunciar-imovel?editar=${l.id}`)} className="w-full h-14 rounded-full flex items-center justify-center gap-2 text-white font-black text-sm" style={{ background: GRADIENT }}><Pencil size={17} /> Editar o meu anúncio</button>
                    ) : l.status !== 'active' ? (
                        <div className="w-full h-14 rounded-full flex items-center justify-center text-sm font-black" style={{ background: soft, color: colors.textSecondary }}>{l.status === 'rented' ? 'Esse imóvel já foi alugado' : 'Anúncio pausado'}</div>
                    ) : (
                        <button
                            onClick={() => { if (!userId) { router.push(`/login?redirect=${encodeURIComponent(`/imoveis/${l.slug}`)}`); return } setScheduling(true) }}
                            className="w-full h-14 rounded-full flex items-center justify-center gap-2 text-white font-black text-sm transition active:scale-[0.98]"
                            style={{ background: GRADIENT, boxShadow: '0 8px 24px #f9731655' }}
                        >
                            <CalendarCheck size={18} /> Agendar visita
                        </button>
                    )}
                </div>
            </div>

            {scheduling && l.ownerSlug && (
                <ProfileScheduleModal
                    profileId={l.ownerId}
                    profileName={l.ownerName || hostName}
                    profileSlug={l.ownerSlug}
                    rentalListingId={l.id}
                    serviceTitle={`Visita: ${l.title}`.slice(0, 100)}
                    onClose={() => setScheduling(false)}
                />
            )}
        </div>
    )
}
