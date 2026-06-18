// components/ProfileDashboard.tsx
'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/theme'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { toast } from 'sonner'
import {
    Eye,
    Users,
    Store,
    Calendar,
    MessageSquare,
    TrendingUp,
    Settings,
    Plus,
    RefreshCw,
    ArrowRight,
    User,
    MapPin,
    Clock,
    Star,
    PackageOpen,
    Image,
} from 'lucide-react'

interface ProfileDashboardProps {
    profileSlug: string | null
    onBack?: () => void
}

// Helpers de data (os mesmos do StoreDashboard)
function daysAgo(n: number): string {
    const d = new Date()
    d.setDate(d.getDate() - n)
    d.setHours(0, 0, 0, 0)
    return d.toISOString()
}

function startOfDay(date: Date = new Date()): string {
    date.setHours(0, 0, 0, 0)
    return date.toISOString()
}

function startOfWeek(): string {
    const d = new Date()
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    d.setDate(diff)
    d.setHours(0, 0, 0, 0)
    return d.toISOString()
}

function startOfMonth(): string {
    const d = new Date()
    d.setDate(1)
    d.setHours(0, 0, 0, 0)
    return d.toISOString()
}

function startOfYear(): string {
    const d = new Date()
    d.setMonth(0, 1)
    d.setHours(0, 0, 0, 0)
    return d.toISOString()
}

export default function ProfileDashboard({ profileSlug, onBack }: ProfileDashboardProps) {
    const router = useRouter()
    const { colors } = useTheme()

    if (!profileSlug) return null

    const [profile, setProfile] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)

    // Estatísticas
    const [profileViews, setProfileViews] = useState<Record<string, number>>({})
    const [followersCount, setFollowersCount] = useState(0)
    const [followingCount, setFollowingCount] = useState(0)
    const [stores, setStores] = useState<any[]>([])
    const [appointments, setAppointments] = useState<any[]>([])
    const [reviews, setReviews] = useState<any[]>([])
    const [postsCount, setPostsCount] = useState(0) // placeholder para futuras postagens

    const loadDashboard = useCallback(async () => {
        if (!profileSlug) return
        setLoading(true)

        // 1. Buscar perfil
        const { data: profileData } = await supabase
            .from('profiles')
            .select('*')
            .eq('profileSlug', profileSlug)
            .single()

        if (!profileData) {
            toast.error('Perfil não encontrado')
            setLoading(false)
            return
        }

        const avatarUrl = profileData.avatar_url
            ? supabase.storage.from('avatars').getPublicUrl(profileData.avatar_url).data.publicUrl
            : null
        setProfile({ ...profileData, avatar_url: avatarUrl })
        const profileId = profileData.id

        // 2. Visitas ao perfil por período
        const nowISO = new Date().toISOString()
        const periods: Record<string, { gte?: string; lte?: string }> = {
            today: { gte: startOfDay(), lte: nowISO },
            yesterday: { gte: daysAgo(1), lte: daysAgo(1).replace('T00:00:00.000Z', 'T23:59:59.999Z') },
            week: { gte: startOfWeek(), lte: nowISO },
            month: { gte: startOfMonth(), lte: nowISO },
            year: { gte: startOfYear(), lte: nowISO },
            all: {},
        }

        const viewsData: Record<string, number> = {}
        for (const [key, range] of Object.entries(periods)) {
            let query = supabase
                .from('profile_views')
                .select('*', { count: 'exact', head: true })
                .eq('profile_id', profileId)
            if (range.gte) query = query.gte('created_at', range.gte)
            if (range.lte) query = query.lte('created_at', range.lte)
            const { count } = await query
            viewsData[key] = count || 0
        }
        setProfileViews(viewsData)

        // 3. Seguidores / seguindo
        const { count: followers } = await supabase
            .from('follows')
            .select('*', { count: 'exact', head: true })
            .eq('following_id', profileId)
        setFollowersCount(followers || 0)

        const { count: following } = await supabase
            .from('follows')
            .select('*', { count: 'exact', head: true })
            .eq('follower_id', profileId)
        setFollowingCount(following || 0)

        // 4. Lojas
        const { data: storesData } = await supabase
            .from('stores')
            .select('id, name, storeSlug, logo_url')
            .eq('owner_id', profileId)
        if (storesData) {
            const mapped = storesData.map((s: any) => ({
                ...s,
                logo_url: s.logo_url
                    ? supabase.storage.from('store-logos').getPublicUrl(s.logo_url).data.publicUrl
                    : null,
            }))
            setStores(mapped)
        }

        // 5. Agendamentos (como dono)
        const todayStr = new Date().toISOString().split('T')[0]
        const { data: appts } = await supabase
            .from('appointments')
            .select('*, profiles:customer_id(name, avatar_url, profileSlug)')
            .eq('provider_profile_id', profileId)
            .gte('date', todayStr)
            .neq('status', 'declined')
            .order('date', { ascending: true })
            .order('time', { ascending: true })
        setAppointments(appts || [])

        // 6. Avaliações / comentários recebidos
        const { data: reviewsData } = await supabase
            .from('product_reviews')
            .select('*, profiles!inner(name, avatar_url, profileSlug), products(name)')
            .eq('store.owner_id', profileId)
            .order('created_at', { ascending: false })
            .limit(5)
        setReviews(reviewsData || [])

        // 7. Postagens (placeholder)
        setPostsCount(0)

        setLoading(false)
        setRefreshing(false)
    }, [profileSlug])

    useEffect(() => { loadDashboard() }, [loadDashboard])

    const handleRefresh = () => {
        setRefreshing(true)
        loadDashboard()
    }

    if (loading && !profile) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <LoadingSpinner message="Carregando seu painel..." />
            </div>
        )
    }

    if (!profile) return null

    // Estilos temáticos
    const cardStyle = {
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        backdropFilter: 'blur(10px)',
        borderRadius: '1rem',
        padding: '1.5rem',
    }

    const sectionTitle = {
        color: colors.textPrimary,
        fontSize: '0.875rem',
        fontWeight: 700,
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        marginBottom: '1rem',
    }

    return (
        <div className="px-4 pb-28 max-w-2xl mx-auto w-full">
            {/* Cabeçalho do perfil */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div
                        className="w-12 h-12 rounded-full p-[2px] shadow-md"
                        style={{ background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})` }}
                    >
                        <div className="w-full h-full rounded-full overflow-hidden" style={{ background: colors.surface }}>
                            {profile.avatar_url ? (
                                <img src={profile.avatar_url} alt={profile.name} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-xl font-black" style={{ color: colors.accent }}>
                                    {profile.name?.charAt(0) || '?'}
                                </div>
                            )}
                        </div>
                    </div>
                    <div>
                        <h2 className="text-2xl font-black" style={{ color: colors.textPrimary }}>
                            {profile.name}
                        </h2>
                        <div className="flex items-center gap-2 text-xs mt-1" style={{ color: colors.textSecondary }}>
                            <span className="font-black">@{profile.profileSlug}</span>
                            {profile.location && (
                                <>
                                    <span>·</span>
                                    <MapPin size={10} />
                                    <span className="text-[10px]">{profile.location}</span>
                                </>
                            )}
                        </div>
                    </div>
                </div>
                <button
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="p-2 rounded-full transition-colors"
                    style={{ background: `${colors.surface}88`, color: colors.accent }}
                >
                    <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
                </button>
            </div>

            {/* Cards rápidos */}
            <div className="grid grid-cols-2 gap-3 mb-6">
                <DashboardCard
                    title="Visitas hoje"
                    value={profileViews.today || 0}
                    icon={<Eye size={20} />}
                    color={colors.accent}
                />
                <DashboardCard
                    title="Seguidores"
                    value={followersCount}
                    icon={<Users size={20} />}
                    color="#ec4899"
                />
                <DashboardCard
                    title="Seguindo"
                    value={followingCount}
                    icon={<User size={20} />}
                    color="#3b82f6"
                />
                <DashboardCard
                    title="Lojas"
                    value={stores.length}
                    icon={<Store size={20} />}
                    color={colors.accentLight}
                />
            </div>

            {/* Minhas Lojas */}
            {stores.length > 0 && (
                <div className="mb-6 rounded-2xl p-6 border shadow-sm backdrop-blur-md" style={cardStyle}>
                    <div style={sectionTitle}>
                        <Store size={16} /> Minhas Lojas
                    </div>
                    <div className="space-y-2">
                        {stores.map((store) => (
                            <button
                                key={store.id}
                                onClick={() => router.push(`/${profileSlug}/${store.storeSlug}`)}
                                className="w-full flex items-center justify-between p-3 rounded-xl transition-all"
                                style={{ background: `${colors.background}88`, border: `1px solid ${colors.border}` }}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full overflow-hidden bg-black/20 flex items-center justify-center">
                                        {store.logo_url ? (
                                            <img src={store.logo_url} alt={store.name} className="w-full h-full object-cover" />
                                        ) : (
                                            <Store size={14} style={{ color: colors.accent }} />
                                        )}
                                    </div>
                                    <span className="text-sm font-bold" style={{ color: colors.textPrimary }}>
                                        {store.name}
                                    </span>
                                </div>
                                <ArrowRight size={14} style={{ color: colors.textSecondary }} />
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Agendamentos (como dono) */}
            {appointments.length > 0 && (
                <div className="mb-6 rounded-2xl p-6 border shadow-sm backdrop-blur-md" style={cardStyle}>
                    <div style={sectionTitle}>
                        <Calendar size={16} /> Próximos Agendamentos
                    </div>
                    <div className="space-y-2">
                        {appointments.slice(0, 3).map((apt) => (
                            <div
                                key={apt.id}
                                className="flex items-center gap-3 p-3 rounded-xl"
                                style={{ background: colors.background }}
                            >
                                <div className="w-10 h-10 rounded-full bg-black/20 flex items-center justify-center text-xs font-bold overflow-hidden">
                                    {apt.profiles?.avatar_url ? (
                                        <img
                                            src={supabase.storage.from('avatars').getPublicUrl(apt.profiles.avatar_url).data.publicUrl}
                                            className="w-full h-full object-cover"
                                            alt=""
                                        />
                                    ) : (
                                        apt.profiles?.name?.charAt(0) || '?'
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold" style={{ color: colors.textPrimary }}>
                                        {apt.profiles?.name || 'Cliente'}
                                    </p>
                                    <p className="text-[10px]" style={{ color: colors.textSecondary }}>
                                        {apt.date} às {apt.time} – {apt.service_name}
                                    </p>
                                </div>
                                <Clock size={14} style={{ color: colors.textSecondary }} />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Avaliações / Comentários */}
            {reviews.length > 0 && (
                <div className="mb-6 rounded-2xl p-6 border shadow-sm backdrop-blur-md" style={cardStyle}>
                    <div style={sectionTitle}>
                        <MessageSquare size={16} /> Últimas Avaliações
                    </div>
                    <div className="space-y-3">
                        {reviews.map((review) => (
                            <div
                                key={review.id}
                                className="p-3 rounded-xl"
                                style={{ background: colors.background }}
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    <div className="w-5 h-5 rounded-full overflow-hidden bg-black/20">
                                        {review.profiles?.avatar_url ? (
                                            <img
                                                src={supabase.storage.from('avatars').getPublicUrl(review.profiles.avatar_url).data.publicUrl}
                                                className="w-full h-full object-cover"
                                                alt=""
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-[8px] font-bold">
                                                {review.profiles?.name?.charAt(0) || '?'}
                                            </div>
                                        )}
                                    </div>
                                    <span className="text-xs font-bold" style={{ color: colors.textPrimary }}>
                                        {review.profiles?.name || 'Anônimo'}
                                    </span>
                                    <div className="flex items-center gap-0.5 ml-auto">
                                        {[...Array(5)].map((_, i) => (
                                            <Star
                                                key={i}
                                                size={10}
                                                fill={i < review.rating ? '#f59e0b' : 'none'}
                                                color={i < review.rating ? '#f59e0b' : colors.textSecondary}
                                            />
                                        ))}
                                    </div>
                                </div>
                                <p className="text-xs" style={{ color: colors.textSecondary }}>
                                    {review.comment || 'Sem comentário.'}
                                </p>
                                <p className="text-[9px] mt-1 opacity-60" style={{ color: colors.textSecondary }}>
                                    Produto: {review.products?.name || 'N/A'}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Estatísticas de Visitas ao Perfil */}
            <div className="mb-6 rounded-2xl p-6 border shadow-sm backdrop-blur-md" style={cardStyle}>
                <h3 className="text-sm font-bold mb-4 flex items-center gap-2" style={{ color: colors.textPrimary }}>
                    <TrendingUp size={16} /> Visitas ao seu perfil
                </h3>
                <div className="grid grid-cols-3 gap-3">
                    <StatItem label="Hoje" value={profileViews.today || 0} />
                    <StatItem label="Ontem" value={profileViews.yesterday || 0} />
                    <StatItem label="Semana" value={profileViews.week || 0} />
                    <StatItem label="Mês" value={profileViews.month || 0} />
                    <StatItem label="Ano" value={profileViews.year || 0} />
                    <StatItem label="Total" value={profileViews.all || 0} highlight />
                </div>
            </div>

            {/* Postagens (placeholder) */}
            <div className="mb-6 rounded-2xl p-6 border shadow-sm backdrop-blur-md" style={cardStyle}>
                <div style={sectionTitle}>
                    <Image size={16} /> Postagens
                </div>
                <p className="text-xs" style={{ color: colors.textSecondary }}>
                    Em breve você poderá publicar fotos e novidades para seus seguidores.
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="h-24 rounded-xl bg-black/10 flex items-center justify-center">
                        <p className="text-[10px] font-bold opacity-40" style={{ color: colors.textSecondary }}>
                            Nenhuma postagem ainda
                        </p>
                    </div>
                    <div className="h-24 rounded-xl bg-black/10 flex items-center justify-center">
                        <p className="text-[10px] font-bold opacity-40" style={{ color: colors.textSecondary }}>
                            Nenhuma postagem ainda
                        </p>
                    </div>
                </div>
            </div>

            {/* Ações rápidas */}
            <div className="grid grid-cols-2 gap-3">
                <QuickActionButton
                    icon={<Settings size={18} />}
                    label="Editar perfil"
                    onClick={() => router.push(`/${profileSlug}/editar-perfil`)}
                />
                <QuickActionButton
                    icon={<Plus size={18} />}
                    label="Criar loja"
                    onClick={() => router.push('/criar-loja')}
                />
                <QuickActionButton
                    icon={<Calendar size={18} />}
                    label="Agendamentos"
                    onClick={() => router.push(`/${profileSlug}?tab=agenda`)}
                />
                <QuickActionButton
                    icon={<Eye size={18} />}
                    label="Ver perfil público"
                    onClick={() => router.push(`/${profileSlug}`)}
                />
            </div>
        </div>
    )
}

// Componentes auxiliares (idênticos aos do StoreDashboard)
function DashboardCard({ title, value, icon, color, subtext }: any) {
    const { colors } = useTheme()
    return (
        <div
            className="p-4 rounded-2xl backdrop-blur-md flex flex-col"
            style={{ background: `${color}15`, border: `1px solid ${color}20` }}
        >
            <div className="flex items-center gap-2 mb-2">
                <span style={{ color }}>{icon}</span>
                <span className="text-xs font-bold" style={{ color: colors.textPrimary }}>{title}</span>
            </div>
            <span className="text-2xl font-black" style={{ color }}>{value}</span>
            {subtext && <span className="text-[10px] mt-1 opacity-60" style={{ color }}>{subtext}</span>}
        </div>
    )
}

function StatItem({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
    const { colors } = useTheme()
    return (
        <div className="text-center">
            <p className="text-[10px] font-medium uppercase tracking-wide" style={{ color: colors.textSecondary }}>
                {label}
            </p>
            <p className="text-lg font-black mt-1" style={{ color: highlight ? colors.accent : colors.textPrimary }}>
                {value}
            </p>
        </div>
    )
}

function QuickActionButton({ icon, label, onClick }: any) {
    const { colors } = useTheme()
    return (
        <button
            onClick={onClick}
            className="flex items-center justify-center gap-2 p-3 rounded-2xl backdrop-blur-md transition-colors hover:bg-opacity-80"
            style={{ background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
        >
            {icon}
            <span className="text-xs font-bold">{label}</span>
        </button>
    )
}