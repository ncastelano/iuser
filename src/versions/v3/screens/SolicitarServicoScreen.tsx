// src/versions/v3/screens/SolicitarServicoScreen.tsx
//
// /solicitar-servico na interface 3.0: "Contratar serviço" — o centro de quem CONTRATA. Os serviços que a pessoa está
// buscando (com quem quer fazer), os que já contratou (contato e "serviço feito") e os concluídos (avaliação), num
// lugar só, e o botão pra pedir um serviço novo (inclusive um que não está na lista). Tocar num pedido abre o diálogo
// de detalhes (candidatos, escolher, editar, contato, avaliar). Ver o que existe ao redor é o /radar.
// A regra (etapas, envio, rascunho, geocodificação) mora em modules/service-requests.
// A 2.0 segue com a página antiga (app/(main)/solicitar-servico).
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, Check, CheckCircle2, ChevronRight, Clock, Eye, MapPin, Plus, Radar, Star, Users, X } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { getCurrentPosition as getNativeCurrentPosition } from '@/lib/nativeGeolocation'
import { askedAgo, shortAddress, notifyServiceRequestsChanged, SERVICE_REQUESTS_CHANGED } from '@/lib/serviceBoard'
import { notifyServiceDecision } from '@/lib/notifyRideStatus'
import { SERVICE_TYPES, getServiceIcon, type ServiceType } from '@/lib/serviceTypes'
import ServiceRequestDetailsDialog from '@/components/ServiceRequestDetailsDialog'
import ChatContactButton from '@/components/ChatContactButton'
import { Spinner } from '@/components/Spinner'
import { loadMyRequests, loadDraft, reverseGeocode, type MyRequest, type RequestStage } from '@/modules/service-requests'
import RequestSheet, { type Place } from './solicitar-servico/RequestSheet'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

const STAGES: { id: RequestStage; label: string; empty: string }[] = [
    { id: 'buscando', label: 'Buscando', empty: 'Nenhum pedido aberto no momento.' },
    { id: 'contratado', label: 'Contratados', empty: 'Quando você escolher um profissional, ele aparece aqui pra combinar e marcar como feito.' },
    { id: 'concluido', label: 'Concluídos', empty: 'Os serviços que terminarem ficam guardados aqui, com a avaliação.' },
]

export default function SolicitarServicoScreen() {
    const router = useRouter()
    const { colors } = useTheme()
    const { userId, loading: profileLoading } = useProfile()
    const soft = `${colors.border}40`

    const [requests, setRequests] = useState<MyRequest[] | null>(null)
    const [stage, setStage] = useState<RequestStage>('buscando')
    const [openId, setOpenId] = useState<string | null>(null)
    // A candidatura que está sendo decidida agora
    const [decidingId, setDecidingId] = useState<string | null>(null)

    // ----- pedido novo -----
    const [composerOpen, setComposerOpen] = useState(false)
    const [composerType, setComposerType] = useState<ServiceType | null>(null)
    const [place, setPlace] = useState<Place | null>(null)
    const [locating, setLocating] = useState(false)

    const reload = useCallback(async () => {
        if (!userId) { setRequests([]); return }
        setRequests(await loadMyRequests(supabase, userId))
    }, [userId])

    useEffect(() => {
        if (profileLoading) return
        reload()
        window.addEventListener(SERVICE_REQUESTS_CHANGED, reload)
        return () => window.removeEventListener(SERVICE_REQUESTS_CHANGED, reload)
    }, [profileLoading, reload])

    // Atalhos: ?pedido=<id> abre o pedido (vem das notificações); ?tipo= / ?local= e o rascunho (volta do login) abrem o pedido novo
    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const pedido = params.get('pedido')
        if (pedido) setOpenId(pedido)
        const tipo = params.get('tipo')
        const local = params.get('local')
        const lat = params.get('lat')
        const lng = params.get('lng')
        let open = false
        if (SERVICE_TYPES.some((t) => t.id === tipo)) { setComposerType(tipo as ServiceType); open = true }
        if (local) { setPlace({ address: local, coords: lat && lng ? [parseFloat(lng), parseFloat(lat)] : null }); open = true }
        if (loadDraft()) open = true
        if (open) setComposerOpen(true)
    }, [])

    const byStage = useMemo(() => {
        const map: Record<RequestStage, MyRequest[]> = { buscando: [], contratado: [], concluido: [] }
        ;(requests || []).forEach((r) => map[r.stage].push(r))
        // com candidatos esperando escolha vem primeiro
        map.buscando.sort((a, b) => b.candidates.filter((c) => c.status === 'pending').length - a.candidates.filter((c) => c.status === 'pending').length)
        // concluídos que faltam avaliar vêm primeiro
        map.concluido.sort((a, b) => Number(b.needsReview) - Number(a.needsReview))
        return map
    }, [requests])

    // A aba que abre sozinha é a primeira que tem algo (uma vez só, quando os pedidos chegam)
    const [stagePicked, setStagePicked] = useState(false)
    useEffect(() => {
        if (!requests || stagePicked) return
        setStagePicked(true)
        if (byStage.buscando.length === 0) setStage(byStage.contratado.length > 0 ? 'contratado' : byStage.concluido.length > 0 ? 'concluido' : 'buscando')
    }, [requests, byStage, stagePicked])

    // ----- localização (só quando o pedido abre) -----
    const locate = useCallback(() => {
        setLocating(true)
        getNativeCurrentPosition(
            async (pos) => {
                const coords: [number, number] = [pos.coords.longitude, pos.coords.latitude]
                const address = await reverseGeocode(coords[0], coords[1])
                setPlace({ address: address || `${coords[1].toFixed(4)}, ${coords[0].toFixed(4)}`, coords })
                setLocating(false)
            },
            () => {
                setLocating(false)
                toast.error('Não conseguimos acessar sua localização', { description: 'Escreva o endereço do serviço.', duration: 5000 })
            },
            { enableHighAccuracy: true, timeout: 10000 },
        )
    }, [])

    const openComposer = (type: ServiceType | null = null) => {
        setComposerType(type)
        setComposerOpen(true)
        if (!place) locate()
    }

    const back = () => (window.history.length > 1 ? router.back() : router.push('/'))
    const list = byStage[stage]
    const totalCount = requests?.length ?? 0
    const needsAttention = (r: MyRequest) =>
        (r.stage === 'buscando' && r.candidates.some((c) => c.status === 'pending')) || r.needsReview

    const decide = async (applicationId: string, status: 'accepted' | 'rejected') => {
        setDecidingId(applicationId)
        try {
            const { error } = await supabase.from('service_applications').update({ status }).eq('id', applicationId)
            if (error) throw error
            toast.success(status === 'accepted' ? 'Profissional escolhido!' : 'Profissional recusado.')
            if (status === 'accepted') {
                notifyServiceDecision(applicationId, 'selected')
                setStage('contratado')
            }
            notifyServiceRequestsChanged() // recarrega a lista (o evento volta pra cá)
        } catch (err: any) {
            toast.error('Erro ao atualizar: ' + (err?.message || 'tente novamente'))
        } finally {
            setDecidingId(null)
        }
    }

    const renderCard = (r: MyRequest) => {
        const Icon = getServiceIcon(r.serviceType, r.customIcon)
        const waiting = r.candidates.filter((c) => c.status === 'pending')
        const firstHired = r.candidates.find((c) => c.status === 'accepted')
        const highlight = needsAttention(r)

        return (
            <div
                key={r.id}
                className="w-full rounded-3xl overflow-hidden text-left"
                style={{ background: colors.surface, border: `1.5px solid ${highlight ? '#f97316' : colors.border}`, boxShadow: highlight ? '0 4px 16px #f9731630' : colors.shadow }}
            >
                <button onClick={() => setOpenId(r.id)} className="w-full p-3 flex gap-3 text-left transition active:opacity-80">
                    <span className="w-16 h-16 rounded-2xl overflow-hidden flex-shrink-0 flex items-center justify-center text-white" style={{ background: GRADIENT }}>
                        {r.photoUrl ? <img src={r.photoUrl} alt="" className="w-full h-full object-cover" /> : <Icon size={26} />}
                    </span>
                    <span className="flex-1 min-w-0">
                        <span className="block text-sm font-black leading-snug" style={{ color: colors.textPrimary, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.title}</span>
                        <span className="mt-1 flex items-center gap-1 text-[11px] font-bold" style={{ color: colors.accent }}><Icon size={11} /> {r.serviceLabel}</span>
                        <span className="mt-0.5 flex items-center gap-2 text-[11px]" style={{ color: colors.textSecondary }}>
                            <span className="flex items-center gap-1 min-w-0"><MapPin size={10} className="flex-shrink-0" /><span className="truncate">{shortAddress(r.address)}</span></span>
                            <span className="flex items-center gap-1 flex-shrink-0"><Clock size={10} />{askedAgo(r.createdAt).replace('pediu ', '')}</span>
                        </span>
                    </span>
                </button>

                {/* Como está, em palavras */}
                <div className="px-3 pb-3">
                    {r.stage === 'buscando' && (waiting.length > 0 ? (
                        <div>
                            <p className="px-1 mb-2 text-xs font-black" style={{ color: colors.accent }}>
                                {waiting.length} {waiting.length === 1 ? 'profissional quer' : 'profissionais querem'} fazer · escolha quem vai
                            </p>
                            <div className="flex flex-col gap-2.5">
                                {waiting.map((c) => {
                                    const busy = decidingId === c.applicationId
                                    const who = c.name || (c.slug ? `@${c.slug}` : 'Profissional')
                                    return (
                                        <div key={c.applicationId} className="rounded-2xl p-3" style={{ background: soft }}>
                                            <button onClick={() => c.slug && router.push(`/${c.slug}`)} disabled={!c.slug} className="w-full flex items-start gap-3 text-left">
                                                {c.avatarUrl
                                                    ? <img src={c.avatarUrl} alt="" className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
                                                    : <span className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: GRADIENT }}><Users size={18} color="#fff" /></span>}
                                                <span className="min-w-0 flex-1">
                                                    <span className="block text-[15px] font-black leading-tight truncate" style={{ color: colors.textPrimary }}>{who}</span>
                                                    <span className="mt-0.5 flex items-center gap-1.5 text-[11px] font-bold" style={{ color: colors.textSecondary }}>
                                                        {c.rating != null
                                                            ? <span className="flex items-center gap-0.5" style={{ color: colors.textPrimary }}><Star size={11} className="text-amber-500 fill-amber-400" />{c.rating.toFixed(1).replace('.', ',')} <span style={{ color: colors.textSecondary }}>({c.ratingCount})</span></span>
                                                            : <span>Novo no iUser</span>}
                                                        {c.slug && <span className="truncate">· @{c.slug}</span>}
                                                    </span>
                                                    {c.bio && <span className="mt-1 block text-xs leading-snug line-clamp-2" style={{ color: colors.textSecondary }}>{c.bio}</span>}
                                                    {c.slug && <span className="mt-1 block text-[11px] font-black underline" style={{ color: colors.textSecondary }}>Ver perfil</span>}
                                                </span>
                                            </button>
                                            <div className="mt-3 flex items-center gap-2">
                                                <button
                                                    onClick={() => decide(c.applicationId, 'accepted')}
                                                    disabled={busy}
                                                    className="flex-1 h-11 rounded-full flex items-center justify-center gap-1.5 text-sm font-black text-white transition active:scale-95 disabled:opacity-60"
                                                    style={{ background: '#f97316' }}
                                                >
                                                    {busy ? <Spinner size={15} color="#fff" /> : <><Check size={16} strokeWidth={3} /> Escolher</>}
                                                </button>
                                                <div className="[&>button]:!py-0 [&>button]:h-11 [&>button]:px-4 [&>button]:text-[13px] [&>button]:gap-1 [&>button]:hover:!scale-100">
                                                    <ChatContactButton profileId={c.applicantId} requestApplicationId={c.applicationId} colors={colors} variant="v3quiet" label="Conversar" />
                                                </div>
                                                <button
                                                    onClick={() => decide(c.applicationId, 'rejected')}
                                                    disabled={busy}
                                                    aria-label={`Recusar ${who}`}
                                                    className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 transition active:scale-95 disabled:opacity-60"
                                                    style={{ background: '#ef44441a', color: '#ef4444' }}
                                                >
                                                    <X size={17} strokeWidth={3} />
                                                </button>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    ) : (
                        <button onClick={() => setOpenId(r.id)} className="w-full flex items-center gap-2 rounded-2xl px-3 py-2 text-xs text-left" style={{ background: soft, color: colors.textSecondary }}>
                            <Eye size={13} className="flex-shrink-0" />
                            Esperando profissionais{r.viewCount > 0 ? ` · ${r.viewCount} ${r.viewCount === 1 ? 'viu' : 'viram'}` : ''}. Avisamos quando alguém quiser.
                        </button>
                    ))}

                    {r.stage === 'contratado' && (
                        <button onClick={() => setOpenId(r.id)} className="w-full flex items-center gap-2 rounded-2xl px-3 py-2 text-left" style={{ background: '#22c55e18' }}>
                            {firstHired?.avatarUrl
                                ? <img src={firstHired.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                                : <CheckCircle2 size={16} color="#22c55e" className="flex-shrink-0" />}
                            <span className="flex-1 text-xs font-black leading-tight" style={{ color: '#16a34a' }}>
                                {firstHired?.name ? `${firstHired.name.split(' ')[0]} vai fazer` : 'Profissional contratado'} · combine e marque como feito
                            </span>
                            <ChevronRight size={16} style={{ color: '#16a34a' }} />
                        </button>
                    )}

                    {r.stage === 'concluido' && (
                        <button onClick={() => setOpenId(r.id)} className="w-full flex items-center gap-2 rounded-2xl px-3 py-2 text-left" style={r.needsReview ? { background: '#f59e0b22' } : { background: soft }}>
                            {r.needsReview ? <Star size={15} className="flex-shrink-0 text-amber-500 fill-amber-400" /> : <CheckCircle2 size={15} color="#22c55e" className="flex-shrink-0" />}
                            <span className="flex-1 text-xs font-black leading-tight" style={{ color: r.needsReview ? '#b45309' : colors.textSecondary }}>
                                {r.needsReview
                                    ? `Avalie o serviço${firstHired?.name ? ` de ${firstHired.name.split(' ')[0]}` : ''}`
                                    : `Feito${firstHired?.name ? ` por ${firstHired.name.split(' ')[0]}` : ''}`}
                            </span>
                            <ChevronRight size={16} style={{ color: colors.textSecondary }} />
                        </button>
                    )}
                </div>
            </div>
        )
    }

    return (
        <div className="max-w-lg mx-auto pb-10">
            {/* Cabeçalho */}
            <div className="flex items-center gap-3">
                <button onClick={back} aria-label="Voltar" className="flex-shrink-0 rounded-full flex items-center justify-center transition active:scale-95" style={{ width: 46, height: 46, background: soft, color: colors.textPrimary }}>
                    <ArrowLeft size={20} />
                </button>
                <div className="min-w-0 flex-1">
                    <h1 className="text-xl font-black leading-tight" style={{ color: colors.textPrimary }}>Contratar serviço</h1>
                    <p className="text-xs" style={{ color: colors.textSecondary }}>O que você procura, contratou e já fez</p>
                </div>
            </div>

            <button
                onClick={() => openComposer()}
                className="mt-4 w-full h-12 rounded-full font-black text-sm text-white flex items-center justify-center gap-2 transition active:scale-[0.98]"
                style={{ background: GRADIENT, boxShadow: '0 6px 18px #f9731655' }}
            >
                <Plus size={18} strokeWidth={3} /> Pedir um serviço
            </button>

            {/* Etapas */}
            <div className="mt-4 grid grid-cols-3 gap-2">
                {STAGES.map((s) => {
                    const active = stage === s.id
                    const n = byStage[s.id].length
                    const attention = byStage[s.id].some(needsAttention)
                    return (
                        <button
                            key={s.id}
                            onClick={() => setStage(s.id)}
                            className="relative h-10 px-2 rounded-full text-xs font-black whitespace-nowrap truncate transition active:scale-95"
                            style={active ? { background: GRADIENT, color: '#fff', boxShadow: '0 4px 12px #f9731640' } : { background: soft, color: colors.textPrimary }}
                        >
                            {s.label}{n > 0 ? ` · ${n}` : ''}
                            {attention && !active && <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-red-500 border-2" style={{ borderColor: colors.background }} />}
                        </button>
                    )
                })}
            </div>

            {/* Lista */}
            <div className="mt-4">
                {profileLoading || requests === null ? (
                    <div className="flex justify-center py-12"><Spinner size={24} color={colors.accent} /></div>
                ) : !userId ? (
                    <div className="rounded-3xl p-6 text-center" style={{ background: soft }}>
                        <p className="text-sm font-black" style={{ color: colors.textPrimary }}>Entre na sua conta pra acompanhar seus pedidos</p>
                        <button onClick={() => router.push(`/login?redirect=${encodeURIComponent('/solicitar-servico')}`)} className="mt-3 h-11 px-6 rounded-full text-sm font-black text-white" style={{ background: GRADIENT }}>Entrar</button>
                    </div>
                ) : list.length === 0 ? (
                    <div className="rounded-3xl p-5 text-center flex flex-col items-center gap-3" style={{ background: soft }}>
                        <p className="text-sm" style={{ color: colors.textSecondary }}>{totalCount === 0 ? 'Você ainda não pediu nenhum serviço.' : STAGES.find((s) => s.id === stage)!.empty}</p>
                        {totalCount === 0 && (
                            <>
                                <p className="text-xs font-black" style={{ color: colors.textPrimary }}>Comece por um destes:</p>
                                <div className="flex flex-wrap justify-center gap-2">
                                    {SERVICE_TYPES.filter((t) => ['eletricista', 'encanador', 'pintor', 'diarista', 'jardineiro', 'montador'].includes(t.id)).map((t) => {
                                        const Icon = t.icon
                                        return (
                                            <button key={t.id} onClick={() => openComposer(t.id)} className="h-10 pl-2 pr-3.5 rounded-full flex items-center gap-2 text-[13px] font-black transition active:scale-95" style={{ background: colors.surface, color: colors.textPrimary }}>
                                                <span className="w-6 h-6 rounded-full flex items-center justify-center text-white" style={{ background: GRADIENT }}><Icon size={13} /></span>
                                                {t.label}
                                            </button>
                                        )
                                    })}
                                    <button onClick={() => openComposer('outro')} className="h-10 px-3.5 rounded-full text-[13px] font-black transition active:scale-95" style={{ background: colors.surface, color: colors.textPrimary }}>Outro…</button>
                                </div>
                            </>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col gap-3">{list.map(renderCard)}</div>
                )}
            </div>

            {/* O que existe ao redor é o /radar */}
            <button
                onClick={() => router.push('/radar')}
                className="mt-6 w-full rounded-3xl p-3.5 flex items-center gap-3 text-left transition active:scale-[0.99]"
                style={{ background: soft }}
            >
                <span className="w-10 h-10 rounded-full flex items-center justify-center text-white flex-shrink-0" style={{ background: '#0891b2' }}><Radar size={19} /></span>
                <span className="flex-1 min-w-0">
                    <span className="block text-sm font-black" style={{ color: colors.textPrimary }}>Ver serviços ao redor</span>
                    <span className="block text-[11px]" style={{ color: colors.textSecondary }}>Profissionais e lojas perto de você, no mapa</span>
                </span>
                <ChevronRight size={18} style={{ color: colors.textSecondary }} />
            </button>

            {openId && <ServiceRequestDetailsDialog requestId={openId} onClose={() => { setOpenId(null); reload() }} />}

            {composerOpen && (
                <RequestSheet
                    initialType={composerType}
                    initialPlace={place}
                    locating={locating}
                    onLocate={locate}
                    onClose={() => setComposerOpen(false)}
                    onSent={() => { setComposerOpen(false); setStage('buscando'); reload() }}
                />
            )}
        </div>
    )
}
