// app/(main)/procurar-servico/page.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useProfile } from '@/app/contexts/ProfileContext'
import { useTheme } from '@/app/theme'
import Header from '@/app/Header'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import LoginAndRegister from '../LoginAndRegister'
import { toast } from 'sonner'
import { getServiceIcon, getServiceLabel } from '@/lib/serviceTypes'
import { Briefcase, Car, MapPin, Loader2, Plus, LucideIcon } from 'lucide-react'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

function shortAddress(address: string): string {
    const firstPart = address.split(',')[0].trim()
    return firstPart.length > 40 ? firstPart.substring(0, 38) + '...' : firstPart
}

function relativeTime(iso: string): string {
    const diffMs = Date.now() - new Date(iso).getTime()
    const minutes = Math.floor(diffMs / 60000)
    if (minutes < 1) return 'agora'
    if (minutes < 60) return `${minutes} min atrás`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h atrás`
    const days = Math.floor(hours / 24)
    return `${days}d atrás`
}

interface ServiceRequestRow {
    id: string
    requester_id: string
    service_type: string
    custom_service: string | null
    location_address: string
    description: string
    created_at: string
}

interface RideRequestRow {
    id: string
    requester_id: string
    ride_type: 'pessoa' | 'objeto'
    origin_address: string
    destination_address: string
    passenger_count: number
    notes: string | null
    object_description: string | null
    created_at: string
}

type BoardItem =
    | ({ kind: 'service' } & ServiceRequestRow)
    | ({ kind: 'ride' } & RideRequestRow)

function itemKey(item: BoardItem): string {
    return `${item.kind}:${item.id}`
}

function getItemIcon(item: BoardItem): LucideIcon {
    return item.kind === 'ride' ? Car : getServiceIcon(item.service_type)
}

function getItemLabel(item: BoardItem): string {
    if (item.kind === 'ride') {
        return item.ride_type === 'objeto' ? 'Motorista · Entrega de objeto' : 'Motorista particular'
    }
    return getServiceLabel(item.service_type, item.custom_service)
}

function getItemAddress(item: BoardItem): string {
    if (item.kind === 'ride') {
        return `${shortAddress(item.origin_address)} → ${shortAddress(item.destination_address)}`
    }
    return shortAddress(item.location_address)
}

function getItemDetail(item: BoardItem): string | null {
    if (item.kind === 'ride') {
        if (item.ride_type === 'objeto') return item.object_description || item.notes
        if (item.notes) return item.notes
        return item.passenger_count > 1 ? `${item.passenger_count} passageiros` : null
    }
    return item.description || null
}

function getItemSearchHaystack(item: BoardItem): string {
    const parts =
        item.kind === 'ride'
            ? [getItemLabel(item), item.origin_address, item.destination_address, item.notes, item.object_description]
            : [getItemLabel(item), item.description, item.location_address]
    return parts.filter(Boolean).join(' ').toLowerCase()
}

export default function SerParceiroPage() {
    const router = useRouter()
    const { avatarUrl, bgMode, customBgUrl, profileSlug, loading: profileLoading } = useProfile()
    const { colors } = useTheme()

    const [loading, setLoading] = useState(true)
    const [loggedIn, setLoggedIn] = useState(false)
    const [showLogin, setShowLogin] = useState(false)
    const [myUserId, setMyUserId] = useState<string | null>(null)
    const [jobs, setJobs] = useState<BoardItem[]>([])
    const [appliedKeys, setAppliedKeys] = useState<Set<string>>(new Set())
    const [applyingKey, setApplyingKey] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState('')

    const load = async () => {
        setLoading(true)
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            setLoggedIn(false)
            setLoading(false)
            return
        }
        setLoggedIn(true)
        setMyUserId(user.id)

        const [{ data: serviceRequests }, { data: rideRequests }] = await Promise.all([
            supabase
                .from('service_requests')
                .select('id, requester_id, service_type, custom_service, location_address, description, created_at')
                .eq('status', 'pending'),
            supabase
                .from('ride_requests')
                .select('id, requester_id, ride_type, origin_address, destination_address, passenger_count, notes, object_description, created_at')
                .eq('status', 'pending'),
        ])

        const combined: BoardItem[] = [
            ...(serviceRequests || []).map((row) => ({ kind: 'service' as const, ...row })),
            ...(rideRequests || []).map((row) => ({ kind: 'ride' as const, ...row })),
        ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

        setJobs(combined)

        const [{ data: myServiceApplications }, { data: myRideApplications }] = await Promise.all([
            supabase.from('service_applications').select('service_request_id').eq('applicant_id', user.id),
            supabase.from('ride_applications').select('ride_request_id').eq('applicant_id', user.id),
        ])

        const applied = new Set<string>()
        for (const a of myServiceApplications || []) applied.add(`service:${a.service_request_id}`)
        for (const a of myRideApplications || []) applied.add(`ride:${a.ride_request_id}`)
        setAppliedKeys(applied)

        setLoading(false)
    }

    useEffect(() => {
        load()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

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
            const { error } =
                item.kind === 'ride'
                    ? await supabase.from('ride_applications').insert({ ride_request_id: item.id, applicant_id: user.id })
                    : await supabase.from('service_applications').insert({ service_request_id: item.id, applicant_id: user.id })
            if (error) throw error
            setAppliedKeys((prev) => new Set(prev).add(key))
            toast.success('Candidatura enviada!')
        } catch (err: any) {
            toast.error('Erro ao se candidatar: ' + (err.message || 'tente novamente'))
        } finally {
            setApplyingKey(null)
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
                    showSearch={!loading && loggedIn}
                    searchPlaceholder="Procurar serviço, motorista, pintor..."
                    searchValue={searchQuery}
                    onSearch={setSearchQuery}
                />

                <section className="px-4 md:px-6 mt-4 pb-24 max-w-lg mx-auto">
                    {loading && (
                        <div className="flex justify-center py-10">
                            <Loader2 className="animate-spin" size={24} style={{ color: colors.textSecondary }} />
                        </div>
                    )}

                    {!loading && !loggedIn && !showLogin && (
                        <div
                            className="rounded-2xl p-6 flex flex-col items-center gap-3 text-center"
                            style={{ background: colors.surface, border: `1px solid ${colors.border}`, boxShadow: colors.shadow }}
                        >
                            <p className="text-sm" style={{ color: colors.textSecondary }}>
                                Entre na sua conta pra ver os pedidos disponíveis.
                            </p>
                            <button
                                onClick={() => setShowLogin(true)}
                                className="px-6 py-3 rounded-full font-bold text-sm"
                                style={{ background: GRADIENT, color: '#fff' }}
                            >
                                Entrar
                            </button>
                        </div>
                    )}

                    {!loading && !loggedIn && showLogin && (
                        <LoginAndRegister onLoginSuccess={handleLoginSuccess} />
                    )}

                    {!loading && loggedIn && jobs.length === 0 && (
                        <div
                            className="rounded-2xl p-6 text-center"
                            style={{ background: colors.surface, border: `1px solid ${colors.border}`, boxShadow: colors.shadow }}
                        >
                            <p className="text-sm" style={{ color: colors.textSecondary }}>
                                Nenhum pedido aberto no momento.
                            </p>
                        </div>
                    )}

                    {!loading && loggedIn && jobs.length > 0 && filteredJobs.length === 0 && (
                        <div
                            className="rounded-2xl p-6 text-center"
                            style={{ background: colors.surface, border: `1px solid ${colors.border}`, boxShadow: colors.shadow }}
                        >
                            <p className="text-sm" style={{ color: colors.textSecondary }}>
                                Nenhum pedido encontrado para "{searchQuery}".
                            </p>
                        </div>
                    )}

                    {!loading && loggedIn && filteredJobs.length > 0 && (
                        <div className="flex flex-col gap-3">
                            {filteredJobs.map((job) => {
                                const Icon = getItemIcon(job)
                                const label = getItemLabel(job)
                                const detail = getItemDetail(job)
                                const key = itemKey(job)
                                const applied = appliedKeys.has(key)
                                const isMine = job.requester_id === myUserId
                                return (
                                    <div
                                        key={key}
                                        className="rounded-2xl p-4"
                                        style={{ background: colors.surface, border: `1px solid ${colors.border}`, boxShadow: colors.shadow }}
                                    >
                                        <div className="flex items-start gap-3">
                                            <div
                                                className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
                                                style={{ background: GRADIENT, color: '#fff' }}
                                            >
                                                <Icon size={20} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-sm font-black" style={{ color: colors.textPrimary }}>{label}</span>
                                                    <span className="text-[10px] flex-shrink-0" style={{ color: colors.textSecondary }}>{relativeTime(job.created_at)}</span>
                                                </div>
                                                <span className="flex items-center gap-1 text-xs mt-0.5" style={{ color: colors.textSecondary }}>
                                                    <MapPin size={11} className="flex-shrink-0" />
                                                    {getItemAddress(job)}
                                                </span>
                                                {detail && (
                                                    <p className="text-xs mt-1.5" style={{ color: colors.textSecondary }}>{detail}</p>
                                                )}
                                            </div>
                                        </div>
                                        {isMine ? (
                                            <div
                                                className="w-full mt-3 py-2.5 rounded-full text-xs font-black uppercase tracking-wider text-center"
                                                style={{ background: `${colors.accent}15`, color: colors.accent, border: `1px solid ${colors.border}` }}
                                            >
                                                Seu pedido
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
                                                    <Loader2 size={14} className="animate-spin" />
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
                </section>

                {/* ===== BOTAO FLUTUANTE - PEDIR SERVICO ===== */}
                <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 998 }}>
                    <button
                        onClick={() => router.push('/pedir-servico')}
                        className="flex items-center gap-2 px-5 h-14 rounded-full shadow-2xl transition-transform duration-200 hover:scale-110 active:scale-95"
                        style={{
                            background: GRADIENT,
                            color: '#ffffff',
                            boxShadow: `0 8px 24px #f9731660`,
                        }}
                        aria-label="Pedir serviço"
                    >
                        <Plus size={22} />
                        <span className="font-semibold text-sm">Pedir serviço</span>
                    </button>
                </div>
            </main>
        </div>
    )
}
