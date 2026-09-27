// app/(main)/procurar-servico/page.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useProfile } from '@/app/contexts/ProfileContext'
import { useTheme } from '@/app/contexts/theme'
import Header from '@/components/Header'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import LoginAndRegister from '@/components/LoginAndRegister/LoginAndRegister'
import { toast } from 'sonner'
import { Briefcase, MapPin, Plus, Building2, Eye, Trash2 } from 'lucide-react'
import { Spinner } from '@/components/Spinner'
import { useActivePlans } from '@/hooks/useActivePlans'
import DriverDebtBanner from '@/components/DriverDebtBanner'
import { notifyServiceApplication } from '@/lib/notifyRideStatus'
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
} from '@/lib/serviceBoard'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

export default function SerParceiroPage() {
    const router = useRouter()
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

    // Conta visita só quando os cards de fato aparecem na tela (precisa do
    // plano Prestador) e só pra quem não é o dono do pedido.
    useEffect(() => {
        if (loading || plansLoading || !hasProvider || jobs.length === 0) return
        for (const job of jobs) {
            if (job.requester_id !== userId) {
                supabase.rpc('increment_service_request_view_count', { p_request_id: job.id }).then(
                    () => { },
                    () => { }
                )
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [jobs, loading, plansLoading, hasProvider])

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

        const key = itemKey(item)
        setApplyingKey(key)
        try {
            const { error } = await supabase.from('service_applications').insert({ service_request_id: item.id, applicant_id: user.id })
            if (error) throw error
            setAppliedKeys((prev) => new Set(prev).add(key))
            notifyServiceApplication(item.id)
            toast.success('Candidatura enviada!')
        } catch (err: any) {
            if ((err.code === '42501' || err.code === 'PGRST301') && !hasProvider) {
                toast.error('Assine o plano Prestador ou o Combo pra se candidatar.')
            } else {
                toast.error('Erro ao se candidatar: ' + (err.message || 'tente novamente'))
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

    const filteredJobs = useMemo(() => {
        const query = searchQuery.trim().toLowerCase()
        if (!query) return jobs
        return jobs.filter((job) => getItemSearchHaystack(job).includes(query))
    }, [jobs, searchQuery])

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

                    {!loading && !showLogin && !plansLoading && !hasProvider && (
                        <div
                            className="rounded-2xl p-6 text-center flex flex-col items-center gap-3"
                            style={{ background: colors.surface, border: `1px solid ${colors.border}`, boxShadow: colors.shadow }}
                        >
                            <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: GRADIENT, color: '#fff' }}>
                                <Briefcase size={28} />
                            </div>
                            <div>
                                <h2 className="text-lg font-black" style={{ color: colors.textPrimary }}>Assine pra se candidatar</h2>
                                <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>
                                    Pra ver e se candidatar aos pedidos de serviço disponíveis, você precisa do plano Prestador ou do Combo.
                                </p>
                            </div>
                            <button
                                onClick={() => router.push('/planos?plan=prestador')}
                                className="w-full py-3.5 rounded-full font-black uppercase text-xs tracking-wider"
                                style={{ background: GRADIENT, color: '#fff' }}
                            >
                                Ver planos
                            </button>
                        </div>
                    )}

                    {!loading && !showLogin && !plansLoading && hasProvider && (
                    <>
                    <DriverDebtBanner userId={userId} />
                    {jobs.length === 0 && (
                        <div
                            className="rounded-2xl p-6 text-center"
                            style={{ background: colors.surface, border: `1px solid ${colors.border}`, boxShadow: colors.shadow }}
                        >
                            <p className="text-sm" style={{ color: colors.textSecondary }}>
                                Nenhum pedido aberto no momento.
                            </p>
                        </div>
                    )}

                    {!loading && !showLogin && jobs.length > 0 && filteredJobs.length === 0 && (
                        <div
                            className="rounded-2xl p-6 text-center"
                            style={{ background: colors.surface, border: `1px solid ${colors.border}`, boxShadow: colors.shadow }}
                        >
                            <p className="text-sm" style={{ color: colors.textSecondary }}>
                                Nenhum pedido encontrado para "{searchQuery}".
                            </p>
                        </div>
                    )}

                    {!loading && !showLogin && filteredJobs.length > 0 && (
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
                                        className="rounded-2xl p-4"
                                        style={{ background: colors.surface, border: `1px solid ${colors.border}`, boxShadow: colors.shadow }}
                                    >
                                        {/* Quem está pedindo */}
                                        <div className="flex items-center gap-2 mb-3">
                                            {job.requester?.avatarUrl ? (
                                                <img src={job.requester.avatarUrl} className="w-7 h-7 rounded-full object-cover flex-shrink-0" alt="" />
                                            ) : (
                                                <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-black" style={{ background: GRADIENT, color: '#fff' }}>
                                                    {(job.requester?.name || '?').charAt(0).toUpperCase()}
                                                </div>
                                            )}
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
                                                disabled={applied || applyingKey === key}
                                                className="w-full mt-3 py-2.5 rounded-full text-xs font-black uppercase tracking-wider transition-all disabled:opacity-70 flex items-center justify-center gap-2"
                                                style={
                                                    applied
                                                        ? { background: `${colors.border}30`, color: colors.textSecondary, border: `1px solid ${colors.border}` }
                                                        : { background: GRADIENT, color: '#fff' }
                                                }
                                            >
                                                {applyingKey === key ? (
                                                    <Spinner size={14} />
                                                ) : applied ? (
                                                    'Candidatura enviada'
                                                ) : (
                                                    <>
                                                        <Briefcase size={14} />
                                                        Candidatar-se
                                                    </>
                                                )}
                                            </button>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                    </>
                    )}
                </section>

                {/* ===== BOTAO FLUTUANTE - SOLICITAR SERVICO ===== */}
                <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 998 }}>
                    <button
                        onClick={() => router.push('/solicitar-servico')}
                        className="flex items-center gap-2 px-5 h-14 rounded-full shadow-2xl transition-transform duration-200 hover:scale-110 active:scale-95"
                        style={{
                            background: GRADIENT,
                            color: '#ffffff',
                            boxShadow: `0 8px 24px #f9731660`,
                        }}
                        aria-label="Solicitar serviço"
                    >
                        <Plus size={22} />
                        <span className="font-semibold text-sm">Solicitar serviço</span>
                    </button>
                </div>
            </main>
        </div>
    )
}
