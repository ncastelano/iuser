// app/(main)/procurar-servico/page.tsx
'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useProfile } from '@/app/contexts/ProfileContext'
import { useTheme } from '@/app/contexts/theme'
import Header, { type Tab } from '@/components/Header'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import LoginAndRegister from '@/components/LoginAndRegister/LoginAndRegister'
import { toast } from 'sonner'
import { Briefcase, MapPin, Plus, Building2, Eye, Trash2, Pencil, X, ClipboardCheck, CheckCircle2, Clock, HeartCrack } from 'lucide-react'
import { Spinner } from '@/components/Spinner'
import { useActivePlans } from '@/hooks/useActivePlans'
import DriverDebtBanner from '@/components/DriverDebtBanner'
import { notifyServiceApplication } from '@/lib/notifyRideStatus'
import { trackServiceRequestView } from '@/lib/trackServiceRequestView'
import { getServiceIcon } from '@/lib/serviceTypes'
import { useMyServiceApplications } from '@/hooks/useMyServiceApplications'
import PlanAvatarRing from '@/components/PlanAvatarRing'
import {
    BoardItem,
    fetchOpenBoardItems,
    getItemAddress,
    getItemDetail,
    getItemIcon,
    getItemLabel,
    getItemSearchHaystack,
    itemKey,
    relativeTime,
    notifyServiceRequestsChanged,
} from '@/lib/serviceBoard'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

// useSearchParams (?pedido=) exige Suspense no App Router.
export default function SerParceiroPage() {
    return (
        <Suspense fallback={null}>
            <SerParceiroContent />
        </Suspense>
    )
}

function SerParceiroContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    // Vem de "Quero fazer esse serviço" na home: foca o card desse pedido e
    // se inscreve sozinho 1s depois.
    const focusId = searchParams.get('pedido')
    const focusHandledRef = useRef(false)
    // Vem de tocar no card do pedido na home: só desliza até ele (sem se inscrever)
    const viewId = searchParams.get('ver')
    const viewHandledRef = useRef(false)
    // Abas, no mesmo molde de /aceitar-corridas: Serviços disponíveis | Me inscrevi
    const [activeTab, setActiveTab] = useState<'disponiveis' | 'inscrevi'>(searchParams.get('aba') === 'inscrevi' ? 'inscrevi' : 'disponiveis')
    const { items: myApplications } = useMyServiceApplications()
    const [cancelingId, setCancelingId] = useState<string | null>(null)
    const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null)
    const [autoApplyingId, setAutoApplyingId] = useState<string | null>(null)
    const [editingJob, setEditingJob] = useState<BoardItem | null>(null)
    const [editDescription, setEditDescription] = useState('')
    const [editNeedsAccess, setEditNeedsAccess] = useState(false)
    const [editAccessNotes, setEditAccessNotes] = useState('')
    const [savingEdit, setSavingEdit] = useState(false)
    const { userId, avatarUrl, bgMode, customBgUrl, profileSlug, loading: profileLoading } = useProfile()
    const { colors } = useTheme()
    const { loading: plansLoading, hasProvider } = useActivePlans(userId)

    const [loading, setLoading] = useState(true)
    const [showLogin, setShowLogin] = useState(false)
    const [jobs, setJobs] = useState<BoardItem[]>([])
    const [appliedKeys, setAppliedKeys] = useState<Set<string>>(new Set())
    const [applyingKey, setApplyingKey] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState('')
    const [deletingKey, setDeletingKey] = useState<string | null>(null)

    const load = async () => {
        setLoading(true)

        // A lista em si é pública no banco, mas a tela só mostra os cards pra
        // quem tem o plano Prestador (abaixo) — contar visita é feito só
        // quando os cards realmente aparecem, num efeito separado.
        const openJobs = await fetchOpenBoardItems()
        setJobs(openJobs)

        if (!userId) {
            setAppliedKeys(new Set())
            setLoading(false)
            return
        }

        const { data: myServiceApplications } = await supabase
            .from('service_applications')
            .select('service_request_id')
            .eq('applicant_id', userId)

        const applied = new Set<string>()
        for (const a of myServiceApplications || []) applied.add(`service:${a.service_request_id}`)
        setAppliedKeys(applied)

        setLoading(false)
    }

    useEffect(() => {
        if (profileLoading) return
        load()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [profileLoading, userId])

    // Conta visita quando os cards aparecem na tela (qualquer pessoa vê a lista, com ou sem
    // plano) e só pra quem não é o dono do pedido.
    useEffect(() => {
        if (loading || profileLoading || jobs.length === 0) return
        for (const job of jobs) {
            if (job.requester_id !== userId) {
                trackServiceRequestView(job.id)
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [jobs, loading, profileLoading])

    const handleLoginSuccess = () => {
        setShowLogin(false)
        load()
    }

    const handleApply = async (item: BoardItem) => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            setShowLogin(true)
            return
        }

        // A lista é aberta a todos; só se inscrever exige o plano Prestador (ou Combo)
        if (!plansLoading && !hasProvider) {
            toast.error('Assine o plano Prestador ou o Combo pra se inscrever.', {
                action: { label: 'Ver planos', onClick: () => router.push('/planos?plan=prestador') },
            })
            return
        }

        const key = itemKey(item)
        setApplyingKey(key)
        try {
            const { error } = await supabase.from('service_applications').insert({ service_request_id: item.id, applicant_id: user.id })
            if (error) throw error
            setAppliedKeys((prev) => new Set(prev).add(key))
            notifyServiceApplication(item.id)
            toast.success('Inscrição enviada! Acompanhe em "Me inscrevi".')
            notifyServiceRequestsChanged()
            setActiveTab('inscrevi')
        } catch (err: any) {
            if ((err.code === '42501' || err.code === 'PGRST301') && !hasProvider) {
                toast.error('Assine o plano Prestador ou o Combo pra se inscrever.')
            } else {
                toast.error('Erro ao se inscrever: ' + (err.message || 'tente novamente'))
            }
        } finally {
            setApplyingKey(null)
        }
    }

    const handleDelete = async (item: BoardItem) => {
        if (!confirm('Tem certeza que deseja excluir este pedido? Esta ação não pode ser desfeita.')) return
        const key = itemKey(item)
        setDeletingKey(key)
        try {
            const { error } = await supabase.from('service_requests').delete().eq('id', item.id)
            if (error) throw error
            setJobs((prev) => prev.filter((j) => j.id !== item.id))
            toast.success('Pedido excluído')
        } catch (err: any) {
            toast.error('Erro ao excluir: ' + (err.message || 'tente novamente'))
        } finally {
            setDeletingKey(null)
        }
    }

    // ===== VER O PEDIDO (?ver=<id>): movimento suave até o card, sem inscrição =====
    useEffect(() => {
        if (!viewId || viewHandledRef.current || loading) return
        const el = document.getElementById(`job-card-${viewId}`)
        if (!el) { if (jobs.length > 0) viewHandledRef.current = true; return }
        viewHandledRef.current = true
        // O cartão acabou de entrar na tela: começa do topo e desliza até ele
        window.scrollTo({ top: 0 })
        setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 250)
    }, [viewId, loading, jobs])

    // ===== FOCO + INSCRIÇÃO AUTOMÁTICA (?pedido=<id>) =====
    useEffect(() => {
        if (!focusId || focusHandledRef.current || loading || profileLoading || plansLoading) return
        if (!userId) {
            // Inscrever-se exige conta: pede login e, ao entrar, o efeito roda de novo.
            if (!showLogin) {
                toast.info('Entre na sua conta para se inscrever nesse serviço.')
                setShowLogin(true)
            }
            return
        }
        const job = jobs.find((j) => j.id === focusId)
        focusHandledRef.current = true
        if (!job) {
            toast.info('Esse pedido não está mais disponível.')
            return
        }
        // Espera o card entrar no DOM antes de rolar até ele.
        setTimeout(() => {
            document.getElementById(`job-card-${job.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 50)
        if (job.requester_id === userId) {
            toast.info('Esse pedido é seu.')
            return
        }
        if (appliedKeys.has(itemKey(job))) {
            toast.info('Você já se inscreveu nesse serviço.')
            setActiveTab('inscrevi')
            setTimeout(() => {
                document.getElementById(`application-card-${job.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }, 200)
            return
        }
        if (!hasProvider) {
            // Vê o pedido, mas pra se inscrever precisa do plano
            toast.info('Assine o plano Prestador ou o Combo pra se inscrever nesse serviço.', {
                action: { label: 'Ver planos', onClick: () => router.push('/planos?plan=prestador') },
            })
            return
        }
        setAutoApplyingId(job.id)
        // Sem cleanup de propósito: o efeito já foi "consumido" (focusHandledRef),
        // então se as dependências mudarem no meio do segundo a inscrição
        // não pode ser cancelada.
        setTimeout(async () => {
            await handleApply(job)
            setAutoApplyingId(null)
        }, 1000)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [focusId, loading, profileLoading, plansLoading, hasProvider, userId, jobs])

    const openEdit = (item: BoardItem) => {
        setEditingJob(item)
        setEditDescription(item.description || '')
        setEditNeedsAccess(item.location_needs_access)
        setEditAccessNotes(item.location_access_notes || '')
    }

    const handleSaveEdit = async () => {
        if (!editingJob) return
        if (!editDescription.trim()) {
            toast.error('Descreva o que você precisa')
            return
        }
        setSavingEdit(true)
        try {
            const patch = {
                description: editDescription.trim(),
                location_needs_access: editNeedsAccess,
                location_access_notes: editNeedsAccess ? (editAccessNotes.trim() || null) : null,
            }
            // .select() pra perceber quando o RLS bloqueia (0 linhas, sem erro).
            const { data, error } = await supabase.from('service_requests').update(patch).eq('id', editingJob.id).select('id')
            if (error) throw error
            if (!data || data.length === 0) {
                toast.error('Não foi possível salvar: sem permissão para editar esse pedido.')
                return
            }
            setJobs((prev) => prev.map((j) => (j.id === editingJob.id ? { ...j, ...patch } : j)))
            toast.success('Pedido atualizado')
            setEditingJob(null)
        } catch (err: any) {
            toast.error('Erro ao salvar: ' + (err.message || 'tente novamente'))
        } finally {
            setSavingEdit(false)
        }
    }

    // Quem já se inscreveu sai da lista e passa pra aba "Me inscrevi"
    const availableJobs = useMemo(() => jobs.filter((j) => !appliedKeys.has(itemKey(j))), [jobs, appliedKeys])

    const filteredJobs = useMemo(() => {
        const query = searchQuery.trim().toLowerCase()
        if (!query) return availableJobs
        return availableJobs.filter((job) => getItemSearchHaystack(job).includes(query))
    }, [availableJobs, searchQuery])

    const activeApplications = myApplications.filter((a) => a.status !== 'rejected')

    const headerTabs: Tab[] = [
        {
            id: 'disponiveis',
            label: 'Serviços disponíveis',
            icon: Briefcase,
            onClick: () => setActiveTab('disponiveis'),
            isActive: activeTab === 'disponiveis',
            badge: availableJobs.length > 0 ? { count: availableJobs.length } : null,
        },
        {
            id: 'inscrevi',
            label: 'Me inscrevi',
            icon: ClipboardCheck,
            onClick: () => setActiveTab('inscrevi'),
            isActive: activeTab === 'inscrevi',
            badge: activeApplications.length > 0 ? { count: activeApplications.length } : null,
        },
    ]

    const cancelApplication = async (applicationId: string) => {
        setCancelingId(applicationId)
        try {
            const { data, error } = await supabase.from('service_applications').delete().eq('id', applicationId).select('id')
            if (error) throw error
            if (!data || data.length === 0) {
                toast.error('Não foi possível cancelar a inscrição.')
                return
            }
            toast.success('Inscrição cancelada')
            setConfirmCancelId(null)
            load()
            notifyServiceRequestsChanged()
        } catch (err: any) {
            toast.error('Erro ao cancelar: ' + (err.message || 'tente novamente'))
        } finally {
            setCancelingId(null)
        }
    }

    return (
        <div className="relative min-h-dvh" style={{ background: colors.background }}>
            <div className="fixed inset-0 z-0">
                <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
            </div>

            <main className="relative z-10 min-h-dvh">
                <Header
                    title="Serviços disponíveis"
                    showBack={true}
                    onBack={() => router.push('/')}
                    greeting={`Olá, ${profileLoading ? '...' : profileSlug ? `@${profileSlug}` : 'Visitante'}`}
                    avatarUrl={avatarUrl}
                    loading={profileLoading}
                    showSearch={!loading && !showLogin}
                    searchPlaceholder="Procurar serviço, motorista, pintor..."
                    searchValue={searchQuery}
                    onSearch={setSearchQuery}
                    tabs={headerTabs}
                />

                <section className="px-4 md:px-6 mt-4 pb-24 max-w-lg mx-auto">
                    {loading && (
                        <div className="flex justify-center py-10">
                            <Spinner size={24} color={colors.textSecondary} />
                        </div>
                    )}

                    {!loading && showLogin && (
                        <LoginAndRegister onLoginSuccess={handleLoginSuccess} />
                    )}

                    {/* A lista de pedidos é aberta a todos; o plano só vale pra se inscrever */}
                    {!loading && !showLogin && !plansLoading && !hasProvider && (
                        <div
                            className="rounded-2xl p-3.5 mb-3 flex items-center gap-3"
                            style={{ background: colors.surface, border: `1px solid ${colors.border}`, boxShadow: colors.shadow }}
                        >
                            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: GRADIENT, color: '#fff' }}>
                                <Briefcase size={18} />
                            </div>
                            <p className="flex-1 min-w-0 text-xs" style={{ color: colors.textSecondary }}>
                                {userId
                                    ? <>Você pode ver todos os pedidos. Pra se inscrever, assine o plano <strong style={{ color: colors.textPrimary }}>Prestador</strong> ou o <strong style={{ color: colors.textPrimary }}>Combo</strong>.</>
                                    : <>Você pode ver todos os pedidos. Pra se inscrever, entre na sua conta e assine o plano <strong style={{ color: colors.textPrimary }}>Prestador</strong>.</>}
                            </p>
                            <button
                                onClick={() => (userId ? router.push('/planos?plan=prestador') : setShowLogin(true))}
                                className="px-3.5 py-2 rounded-full font-black text-[11px] flex-shrink-0"
                                style={{ background: GRADIENT, color: '#fff' }}
                            >
                                {userId ? 'Ver planos' : 'Entrar'}
                            </button>
                        </div>
                    )}

                    {!loading && !showLogin && (
                    <>
                    {hasProvider && <DriverDebtBanner userId={userId} />}
                    {activeTab === 'disponiveis' && availableJobs.length === 0 && (
                        <div
                            className="rounded-2xl p-6 text-center"
                            style={{ background: colors.surface, border: `1px solid ${colors.border}`, boxShadow: colors.shadow }}
                        >
                            <p className="text-sm" style={{ color: colors.textSecondary }}>
                                {jobs.length > 0 ? 'Você já se inscreveu em todos os pedidos abertos. Veja em "Me inscrevi".' : 'Nenhum pedido aberto no momento.'}
                            </p>
                        </div>
                    )}

                    {activeTab === 'disponiveis' && !loading && !showLogin && availableJobs.length > 0 && filteredJobs.length === 0 && (
                        <div
                            className="rounded-2xl p-6 text-center"
                            style={{ background: colors.surface, border: `1px solid ${colors.border}`, boxShadow: colors.shadow }}
                        >
                            <p className="text-sm" style={{ color: colors.textSecondary }}>
                                Nenhum pedido encontrado para "{searchQuery}".
                            </p>
                        </div>
                    )}

                    {activeTab === 'disponiveis' && !loading && !showLogin && filteredJobs.length > 0 && (
                        <div className="flex flex-col gap-3">
                            {filteredJobs.map((job) => {
                                const Icon = getItemIcon(job)
                                const label = getItemLabel(job)
                                const detail = getItemDetail(job)
                                const key = itemKey(job)
                                const applied = appliedKeys.has(key)
                                const isMine = job.requester_id === userId
                                return (
                                    <div
                                        key={key}
                                        id={`job-card-${job.id}`}
                                        className="rounded-2xl p-4 scroll-mt-32"
                                        style={{
                                            background: colors.surface,
                                            border: `1px solid ${focusId === job.id ? colors.accent : colors.border}`,
                                            boxShadow: focusId === job.id ? `0 0 0 3px ${colors.accent}40` : colors.shadow,
                                        }}
                                    >
                                        {/* Quem está pedindo */}
                                        <div className="flex items-center gap-2 mb-3">
                                            <PlanAvatarRing userId={job.requester_id}>
                                                {job.requester?.avatarUrl ? (
                                                    <img src={job.requester.avatarUrl} className="w-7 h-7 rounded-full object-cover flex-shrink-0" alt="" />
                                                ) : (
                                                    <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-black" style={{ background: GRADIENT, color: '#fff' }}>
                                                        {(job.requester?.name || '?').charAt(0).toUpperCase()}
                                                    </div>
                                                )}
                                            </PlanAvatarRing>
                                            <span className="text-xs font-bold truncate" style={{ color: colors.textPrimary }}>
                                                {job.requester?.name || (job.requester?.profileSlug ? `@${job.requester.profileSlug}` : 'Alguém')}
                                            </span>
                                            <span className="flex items-center gap-2 flex-shrink-0 ml-auto">
                                                <span className="flex items-center gap-1 text-[10px]" style={{ color: colors.textSecondary }}>
                                                    <Eye size={11} />
                                                    {job.view_count}
                                                </span>
                                                <span className="text-[10px]" style={{ color: colors.textSecondary }}>{relativeTime(job.created_at)}</span>
                                            </span>
                                        </div>

                                        <div className="flex items-start gap-3">
                                            <div
                                                className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
                                                style={{ background: GRADIENT, color: '#fff' }}
                                            >
                                                <Icon size={20} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <span className="text-sm font-black" style={{ color: colors.textPrimary }}>{label}</span>
                                                <span className="flex items-center gap-1 text-xs mt-0.5" style={{ color: colors.textSecondary }}>
                                                    <MapPin size={11} className="flex-shrink-0" />
                                                    {getItemAddress(job)}
                                                </span>
                                                {job.location_needs_access && (
                                                    <span className="flex items-center gap-1 text-xs mt-0.5" style={{ color: colors.textSecondary }}>
                                                        <Building2 size={11} className="flex-shrink-0" />
                                                        Condomínio fechado{job.location_access_notes ? ` — ${job.location_access_notes}` : ''}
                                                    </span>
                                                )}
                                                {detail && (
                                                    <p className="text-xs mt-1.5" style={{ color: colors.textSecondary }}>{detail}</p>
                                                )}
                                            </div>
                                        </div>

                                        {job.photo_urls.length > 0 && (
                                            <div className="flex gap-2 overflow-x-auto mt-3 pb-0.5">
                                                {job.photo_urls.map((url) => (
                                                    <img key={url} src={url} className="w-16 h-16 rounded-xl object-cover flex-shrink-0" style={{ border: `1px solid ${colors.border}` }} alt="" />
                                                ))}
                                            </div>
                                        )}

                                        {isMine ? (
                                            <div className="flex items-center gap-2 mt-3">
                                                <div
                                                    className="flex-1 py-2.5 rounded-full text-xs font-black uppercase tracking-wider text-center"
                                                    style={{ background: `${colors.accent}15`, color: colors.accent, border: `1px solid ${colors.border}` }}
                                                >
                                                    Seu pedido
                                                </div>
                                                <button
                                                    onClick={() => openEdit(job)}
                                                    aria-label="Editar pedido"
                                                    className="h-9 px-3 rounded-full flex items-center justify-center gap-1.5 flex-shrink-0 text-[11px] font-black uppercase"
                                                    style={{ background: `${colors.accent}15`, color: colors.accent }}
                                                >
                                                    <Pencil size={13} />
                                                    Editar
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(job)}
                                                    disabled={deletingKey === key}
                                                    aria-label="Excluir pedido"
                                                    className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-50"
                                                    style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}
                                                >
                                                    {deletingKey === key ? <Spinner size={14} /> : <Trash2 size={14} />}
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => handleApply(job)}
                                                disabled={applied || applyingKey === key || autoApplyingId === job.id}
                                                className="w-full mt-3 py-2.5 rounded-full text-xs font-black uppercase tracking-wider transition-all disabled:opacity-70 flex items-center justify-center gap-2"
                                                style={
                                                    applied
                                                        ? { background: `${colors.border}30`, color: colors.textSecondary, border: `1px solid ${colors.border}` }
                                                        : { background: GRADIENT, color: '#fff' }
                                                }
                                            >
                                                {autoApplyingId === job.id && !applied ? (
                                                    <>
                                                        <Spinner size={14} />
                                                        Inscrevendo você...
                                                    </>
                                                ) : applyingKey === key ? (
                                                    <Spinner size={14} />
                                                ) : applied ? (
                                                    'Inscrição enviada'
                                                ) : (
                                                    <>
                                                        <Briefcase size={14} />
                                                        Inscrever-se
                                                    </>
                                                )}
                                            </button>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}

                    {/* ===== ABA: ME INSCREVI ===== */}
                    {activeTab === 'inscrevi' && myApplications.length === 0 && (
                        <div className="rounded-2xl p-6 text-center" style={{ background: colors.surface, border: `1px solid ${colors.border}`, boxShadow: colors.shadow }}>
                            <p className="text-sm" style={{ color: colors.textSecondary }}>
                                Você ainda não se inscreveu em nenhum serviço. Veja os pedidos em "Serviços disponíveis".
                            </p>
                        </div>
                    )}

                    {activeTab === 'inscrevi' && myApplications.length > 0 && (
                        <div className="flex flex-col gap-3">
                            {myApplications.map((app) => {
                                const AppIcon = getServiceIcon(app.serviceType)
                                return (
                                    <div
                                        key={app.applicationId}
                                        id={`application-card-${app.requestId}`}
                                        className="rounded-2xl p-4 scroll-mt-32"
                                        style={{
                                            background: colors.surface,
                                            border: `1px solid ${app.status === 'accepted' ? '#22c55e' : focusId === app.requestId ? colors.accent : colors.border}`,
                                            boxShadow: colors.shadow,
                                            opacity: app.status === 'rejected' ? 0.75 : 1,
                                        }}
                                    >
                                        <div className="flex items-center gap-2 mb-3">
                                            <PlanAvatarRing userId={app.requesterId}>
                                                {app.requesterAvatarUrl ? (
                                                    <img src={app.requesterAvatarUrl} className="w-7 h-7 rounded-full object-cover flex-shrink-0" alt="" />
                                                ) : (
                                                    <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-black" style={{ background: GRADIENT, color: '#fff' }}>
                                                        {(app.requesterName || '?').charAt(0).toUpperCase()}
                                                    </div>
                                                )}
                                            </PlanAvatarRing>
                                            <span className="text-xs font-bold truncate" style={{ color: colors.textPrimary }}>
                                                {app.requesterName ? `${app.requesterName.split(' ')[0]} procura` : 'Alguém procura'}
                                            </span>
                                            <span className="text-[10px] ml-auto flex-shrink-0" style={{ color: colors.textSecondary }}>
                                                inscrito {relativeTime(app.appliedAt)}
                                            </span>
                                        </div>

                                        <div className="flex items-start gap-3">
                                            <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ background: app.photoUrl ? colors.border : GRADIENT, color: '#fff' }}>
                                                {app.photoUrl ? <img src={app.photoUrl} alt="" className="w-full h-full object-cover" /> : <AppIcon size={22} />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <span className="text-sm font-black" style={{ color: colors.textPrimary }}>{app.serviceLabel}</span>
                                                <span className="flex items-center gap-1 text-xs mt-0.5" style={{ color: colors.textSecondary }}>
                                                    <MapPin size={11} className="flex-shrink-0" />
                                                    {app.locationAddress.split(',')[0]}
                                                </span>
                                                {app.description && <p className="text-xs mt-1.5 line-clamp-2" style={{ color: colors.textSecondary }}>{app.description}</p>}
                                            </div>
                                        </div>

                                        <div className="mt-3">
                                            {app.status === 'accepted' ? (
                                                <div className="flex items-center gap-2 rounded-xl px-3 py-2.5" style={{ background: '#22c55e18' }}>
                                                    <CheckCircle2 size={16} color="#22c55e" className="flex-shrink-0" />
                                                    <span className="text-sm font-bold" style={{ color: '#16a34a' }}>Você foi escolhido! Combine os detalhes com {app.requesterName?.split(' ')[0] || 'quem pediu'}.</span>
                                                </div>
                                            ) : app.status === 'rejected' ? (
                                                <div className="flex items-center gap-2 rounded-xl px-3 py-2.5" style={{ background: `${colors.border}30` }}>
                                                    <HeartCrack size={16} className="flex-shrink-0" style={{ color: colors.textSecondary }} />
                                                    <span className="text-sm font-bold" style={{ color: colors.textSecondary }}>Não foi dessa vez</span>
                                                </div>
                                            ) : confirmCancelId === app.applicationId ? (
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs flex-1" style={{ color: colors.textSecondary }}>Cancelar sua inscrição?</span>
                                                    <button onClick={() => setConfirmCancelId(null)} className="px-3 py-2 rounded-full text-[11px] font-black uppercase" style={{ background: `${colors.border}30`, color: colors.textPrimary }}>Voltar</button>
                                                    <button onClick={() => cancelApplication(app.applicationId)} disabled={cancelingId === app.applicationId} className="px-3 py-2 rounded-full text-[11px] font-black uppercase flex items-center gap-1.5 disabled:opacity-60" style={{ background: '#ef4444', color: '#fff' }}>
                                                        {cancelingId === app.applicationId && <Spinner size={12} />}
                                                        Cancelar
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-2">
                                                    <div className="flex items-center gap-2 rounded-xl px-3 py-2.5 flex-1" style={{ background: `${colors.accent}15` }}>
                                                        <Clock size={15} className="flex-shrink-0" style={{ color: colors.accent }} />
                                                        <span className="text-xs font-bold leading-tight" style={{ color: colors.accent }}>Inscrição enviada. Esperando a resposta.</span>
                                                    </div>
                                                    <button onClick={() => setConfirmCancelId(app.applicationId)} aria-label="Cancelar inscrição" className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                    </>
                    )}
                </section>

                {/* ===== EDITAR O PRÓPRIO PEDIDO ===== */}
                {editingJob && (
                    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
                        <div className="w-full max-w-sm rounded-2xl p-5" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-base font-black" style={{ color: colors.textPrimary }}>
                                    Editar pedido de {getItemLabel(editingJob).toLowerCase()}
                                </h3>
                                <button onClick={() => setEditingJob(null)} aria-label="Fechar" style={{ color: colors.textSecondary }}>
                                    <X size={18} />
                                </button>
                            </div>

                            <label className="text-xs font-bold block mb-1.5" style={{ color: colors.textSecondary }}>O que você precisa</label>
                            <textarea
                                value={editDescription}
                                onChange={(e) => setEditDescription(e.target.value)}
                                rows={4}
                                className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none resize-none"
                                style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                            />

                            <div className="flex items-center justify-between gap-2 mt-3">
                                <span className="flex items-center gap-1.5 text-xs font-bold" style={{ color: colors.textPrimary }}>
                                    <Building2 size={13} style={{ color: '#ef4444' }} />
                                    É um condomínio fechado?
                                </span>
                                <div className="flex items-center gap-1.5">
                                    {[true, false].map((v) => (
                                        <button
                                            key={String(v)}
                                            onClick={() => setEditNeedsAccess(v)}
                                            className="px-3 py-1 rounded-full text-[11px] font-black"
                                            style={editNeedsAccess === v ? { background: GRADIENT, color: '#fff' } : { background: colors.surface, color: colors.textSecondary, border: `1px solid ${colors.border}` }}
                                        >
                                            {v ? 'SIM' : 'NÃO'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {editNeedsAccess && (
                                <input
                                    type="text"
                                    value={editAccessNotes}
                                    onChange={(e) => setEditAccessNotes(e.target.value)}
                                    placeholder="Número da rua, apartamento ou quadra..."
                                    className="w-full mt-2 px-3 py-2 rounded-lg text-sm focus:outline-none"
                                    style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                                />
                            )}

                            <div className="flex gap-2 mt-4">
                                <button
                                    onClick={() => setEditingJob(null)}
                                    className="px-5 py-3 rounded-xl font-black uppercase text-xs tracking-wider"
                                    style={{ background: `${colors.border}30`, color: colors.textPrimary, border: `1px solid ${colors.border}` }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleSaveEdit}
                                    disabled={savingEdit}
                                    className="flex-1 py-3 rounded-xl font-black uppercase text-xs tracking-wider disabled:opacity-60 flex items-center justify-center gap-2"
                                    style={{ background: GRADIENT, color: '#fff' }}
                                >
                                    {savingEdit && <Spinner size={14} />}
                                    Salvar
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    )
}
