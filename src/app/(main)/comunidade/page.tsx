// app/(main)/comunidade/page.tsx
'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { useProfile } from '@/app/contexts/ProfileContext'
import { useTheme } from '@/app/contexts/theme'
import Header from '@/components/Header'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import { useUserPlace } from '@/hooks/useUserPlace'
import { getAvatarUrl } from '@/lib/avatar'
import CreateCommunityModal, { generateUniqueCommunitySlug } from './CreateCommunityModal'
import LocationPicker from '@/components/LocationPicker'
import { hexToRgb } from '@/lib/color'
import {
    MessageCircle,
    MapPin,
    Users,
    AlertCircle,
    ChevronRight,
    Plus,
    Compass,
} from 'lucide-react'
import { Spinner } from '@/components/Spinner'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

interface CommunityMessagePreview { id: string; content: string; created_at: string; name: string; avatar: string | null }

interface CommunityCard {
    id: string
    slug: string
    name: string
    city: string
    scope: 'city' | 'state' | 'country'
    description: string | null
    memberCount: number
    recent: CommunityMessagePreview[]
}

export default function ComunidadePage() {
    const router = useRouter()
    const { userId, avatarUrl, bgMode, customBgUrl, profileSlug, loading: profileLoading } = useProfile()
    const { colors } = useTheme()
    const searchInputRef = useRef<HTMLInputElement>(null)

    const [communities, setCommunities] = useState<CommunityCard[]>([])
    const [loadingData, setLoadingData] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState('')
    const [showCreateModal, setShowCreateModal] = useState(false)

    // ===== LOCALIZAÇÃO SALVA (mesmo LocationPicker do header/radar/homepage) =====
    const [savedLocation, setSavedLocation] = useState<{
        lat: number
        lng: number
        address: string
        addressNumber: string
        addressComplement: string
    } | null>(null)
    const [showLocationDialog, setShowLocationDialog] = useState(false)
    const [isSavingLocation, setIsSavingLocation] = useState(false)
    const { place, resolving: resolvingCity } = useUserPlace(savedLocation)
    const userCity = place?.city ?? null
    const userState = place?.state ?? null

    // ===== USUÁRIO + LOCALIZAÇÃO SALVA NO PERFIL =====
    const fetchProfileLocation = useCallback(async (uid: string) => {
        const { data: profile } = await supabase
            .from('profiles')
            .select('address, address_number, address_complement, store_lat, store_lng')
            .eq('id', uid)
            .maybeSingle()

        if (profile?.store_lat && profile?.store_lng) {
            setSavedLocation({
                lat: profile.store_lat,
                lng: profile.store_lng,
                address: profile.address || 'Local salvo',
                addressNumber: profile.address_number || '',
                addressComplement: profile.address_complement || '',
            })
        } else {
            setSavedLocation(null)
        }
    }, [])

    useEffect(() => {
        if (!userId) return
        fetchProfileLocation(userId)
    }, [userId, fetchProfileLocation])

    // Reativo: qualquer alteração na localização salva do perfil (feita aqui,
    // no header do radar, do homepage etc.) atualiza a cidade aqui também.
    useEffect(() => {
        if (!userId) return

        const channel = supabase
            .channel('profile-location-comunidade')
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
                (payload) => {
                    const p = payload.new as any
                    if (p.store_lat && p.store_lng) {
                        setSavedLocation({
                            lat: p.store_lat,
                            lng: p.store_lng,
                            address: p.address || 'Local salvo',
                            addressNumber: p.address_number || '',
                            addressComplement: p.address_complement || '',
                        })
                    } else {
                        setSavedLocation(null)
                    }
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [userId])

    const handleLocationSave = async (location: {
        lat: number
        lng: number
        address: string
        addressNumber?: string
        addressComplement?: string
    }) => {
        setIsSavingLocation(true)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                setShowLocationDialog(false)
                setIsSavingLocation(false)
                return
            }

            const { error } = await supabase
                .from('profiles')
                .upsert({
                    id: user.id,
                    address: location.address,
                    address_number: location.addressNumber || null,
                    address_complement: location.addressComplement || null,
                    store_lat: location.lat,
                    store_lng: location.lng,
                }, { onConflict: 'id' })

            if (error) {
                console.error('[Comunidade] Erro ao salvar localização:', error)
            } else {
                setSavedLocation({
                    lat: location.lat,
                    lng: location.lng,
                    address: location.address,
                    addressNumber: location.addressNumber || '',
                    addressComplement: location.addressComplement || '',
                })
            }
        } finally {
            setShowLocationDialog(false)
            setIsSavingLocation(false)
        }
    }

    // ===== CARREGAR COMUNIDADES =====
    const loadCommunities = useCallback(async () => {
        setLoadingData(true)
        setError(null)
        try {
            const { data, error } = await supabase
                .from('communities')
                .select('id, slug, name, city, description, scope')
                .order('created_at', { ascending: false })

            if (error) throw error

            // Contagem de membros e as últimas 10 mensagens de cada comunidade
            const base = await Promise.all(
                (data || []).map(async (c) => {
                    const [{ count }, { data: msgs }] = await Promise.all([
                        supabase.from('community_members').select('*', { count: 'exact', head: true }).eq('community_id', c.id),
                        supabase.from('community_messages').select('id, profile_id, content, created_at').eq('community_id', c.id).order('created_at', { ascending: false }).limit(10),
                    ])
                    return { c, count: count || 0, msgs: (msgs || []).slice().reverse() }
                })
            )
            const authorIds = [...new Set(base.flatMap((b) => b.msgs.map((m) => m.profile_id)))]
            const { data: authors } = authorIds.length
                ? await supabase.from('profiles').select('id, name, profileSlug, avatar_url').in('id', authorIds)
                : { data: [] as any[] }
            const authorMap = new Map((authors || []).map((a: any) => [a.id, a]))

            const withCounts: CommunityCard[] = base.map(({ c, count, msgs }) => ({
                ...c,
                scope: (c.scope || 'city') as CommunityCard['scope'],
                memberCount: count,
                recent: msgs.map((m) => {
                    const a: any = authorMap.get(m.profile_id)
                    return {
                        id: m.id, content: m.content, created_at: m.created_at,
                        name: a?.name?.split(' ')[0] || (a?.profileSlug ? `@${a.profileSlug}` : 'Alguém'),
                        avatar: getAvatarUrl(supabase, a?.avatar_url) || null,
                    }
                }),
            }))

            setCommunities(withCounts)
            return withCounts
        } catch (err) {
            console.error('[Comunidade] Erro ao carregar comunidades:', err)
            setError('Erro ao carregar comunidades')
            return []
        } finally {
            setLoadingData(false)
        }
    }, [])

    useEffect(() => {
        loadCommunities()
    }, [loadCommunities])

    // ===== GARANTIR O CHAT DA CIDADE E DO ESTADO (auto-cria se ainda não existir) =====
    // Reativo à localização salva: assim que a cidade/estado da pessoa é conhecido, a comunidade daquele lugar
    // aparece - criando-a automaticamente na primeira vez que alguém de lá abre a página, sem precisar que
    // ninguém clique em "Criar Comunidade" manualmente. (O Brasil já nasce pronto, pela migration.)
    useEffect(() => {
        if (!userId || loadingData) return
        let cancelled = false

        const ensure = async (name: string, scope: 'city' | 'state', description: string) => {
            const lower = name.toLowerCase()
            if (communities.some((c) => c.scope === scope && c.city.toLowerCase() === lower)) return false
            const { data: existing } = await supabase
                .from('communities').select('id').eq('scope', scope).ilike('city', name).limit(1).maybeSingle()
            if (existing || cancelled) return false

            const slug = await generateUniqueCommunitySlug(name)
            const { data: created, error: createError } = await supabase
                .from('communities')
                .insert({ slug, name, city: name, description, creator_id: userId, scope })
                .select('id')
                .single()
            if (createError) {
                // Corrida com outra aba/usuário criando ao mesmo tempo - ignora, o próximo load traz a que foi criada.
                console.warn('[Comunidade] Não foi possível criar o chat:', createError.message)
                return false
            }
            if (created) await supabase.from('community_members').insert({ community_id: created.id, profile_id: userId })
            return true
        }

        const run = async () => {
            try {
                let changed = false
                if (userCity) changed = (await ensure(userCity, 'city', `Chat da cidade de ${userCity}. Converse com quem está por perto!`)) || changed
                if (userState) changed = (await ensure(userState, 'state', `Chat de ${userState}. Converse com o estado todo!`)) || changed
                if (changed && !cancelled) await loadCommunities()
            } catch (err) {
                console.error('[Comunidade] Erro ao garantir os chats:', err)
            }
        }
        run()

        return () => { cancelled = true }
    }, [userId, userCity, userState, communities, loadingData, loadCommunities])

    // ===== FILTRO + ORDENAÇÃO (cidade do usuário primeiro) =====
    const filteredCommunities = useMemo(() => {
        const q = searchQuery.trim().toLowerCase()
        const base = q
            ? communities.filter(
                (c) =>
                    c.name.toLowerCase().includes(q) ||
                    c.city.toLowerCase().includes(q) ||
                    c.description?.toLowerCase().includes(q)
            )
            : communities

        // Cidade da pessoa, depois o estado, depois o Brasil, depois as outras
        const same = (a: string | null, b: string) => !!a && a.toLowerCase() === b.toLowerCase()
        const rank = (c: CommunityCard) =>
            c.scope === 'city' && same(userCity, c.city) ? 0
                : c.scope === 'state' && same(userState, c.city) ? 1
                    : c.scope === 'country' ? 2 : 3
        return base.map((c, i) => ({ c, i })).sort((x, y) => (rank(x.c) - rank(y.c)) || (x.i - y.i)).map((x) => x.c)
    }, [communities, searchQuery, userCity, userState])

    // ===== ESTILOS =====
    const surfaceRgb = hexToRgb(colors.surface)
    const cardBg = `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`

    return (
        <div className="relative min-h-dvh" style={{ background: colors.background }}>
            <div className="fixed inset-0 z-0">
                <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
            </div>

            <main className="relative z-10 min-h-dvh" style={{ overscrollBehavior: 'none' }}>
                <Header
                    title="Comunidades"
                    showBack={true}
                    onBack={() => router.push('/')}
                    greeting={`Olá, ${profileLoading ? '...' : profileSlug ? `@${profileSlug}` : 'Visitante'}`}
                    avatarUrl={avatarUrl}
                    loading={profileLoading}
                    showSearch={true}
                    searchPlaceholder="Buscar comunidade ou cidade..."
                    onSearch={setSearchQuery}
                    searchValue={searchQuery}
                    searchRef={searchInputRef}
                    locationElement={
                        <button
                            onClick={() => userId ? setShowLocationDialog(true) : router.push('/login')}
                            disabled={isSavingLocation}
                            className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full transition disabled:opacity-50"
                            style={{ background: `${colors.textPrimary}15`, color: colors.textPrimary }}
                        >
                            <MapPin size={14} />
                            {isSavingLocation
                                ? 'Salvando...'
                                : savedLocation
                                    ? savedLocation.address.split(',').slice(0, 2).join(',')
                                    : 'Definir local'
                            }
                        </button>
                    }
                />

                <section className="px-4 md:px-6 mt-2 pb-28">
                    {/* Banner de localização - reativo ao LocationPicker: a cidade vem
                        da localização salva no perfil (mesma usada no radar e no
                        homepage), não de uma permissão de geolocalização separada. */}
                    <div
                        className="rounded-2xl p-4 mb-4 border flex items-center gap-3"
                        style={{ background: cardBg, backdropFilter: 'blur(12px)', borderColor: colors.border, boxShadow: colors.shadow }}
                    >
                        <div
                            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ background: GRADIENT, color: '#fff' }}
                        >
                            <Compass size={18} />
                        </div>
                        <div className="flex-1 min-w-0">
                            {resolvingCity ? (
                                <p className="text-xs font-bold" style={{ color: colors.textSecondary }}>Detectando sua cidade...</p>
                            ) : userCity ? (
                                <p className="text-xs font-bold" style={{ color: colors.textPrimary }}>
                                    Mostrando primeiro o chat de <span style={{ color: colors.accent }}>{[userCity, userState].filter(Boolean).join(', ')}</span> e do Brasil
                                </p>
                            ) : (
                                <p className="text-xs font-bold" style={{ color: colors.textSecondary }}>
                                    Defina sua localização para ver o chat da sua cidade
                                </p>
                            )}
                        </div>
                        {!resolvingCity && (
                            <button
                                onClick={() => userId ? setShowLocationDialog(true) : router.push('/login')}
                                className="text-[10px] font-bold uppercase px-3 py-1.5 rounded-full flex-shrink-0"
                                style={{ background: `${colors.accent}20`, color: colors.accent }}
                            >
                                {userCity ? 'Alterar' : 'Definir local'}
                            </button>
                        )}
                    </div>

                    {/* Loading */}
                    {loadingData && (
                        <div className="flex justify-center py-12">
                            <Spinner size={28} color={colors.accent} />
                        </div>
                    )}

                    {/* Erro */}
                    {!loadingData && error && (
                        <div
                            className="rounded-2xl p-6 flex flex-col items-center gap-3"
                            style={{ background: cardBg, backdropFilter: 'blur(12px)', border: `1px solid ${colors.border}` }}
                        >
                            <AlertCircle size={28} style={{ color: '#ef4444' }} />
                            <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>{error}</p>
                            <button
                                onClick={loadCommunities}
                                className="px-4 py-2 rounded-full text-xs font-bold"
                                style={{ background: GRADIENT, color: '#fff' }}
                            >
                                Tentar de novo
                            </button>
                        </div>
                    )}

                    {/* Vazio */}
                    {!loadingData && !error && filteredCommunities.length === 0 && (
                        <div
                            className="rounded-2xl p-6 flex flex-col items-center gap-3"
                            style={{ background: cardBg, backdropFilter: 'blur(12px)', border: `1px solid ${colors.border}` }}
                        >
                            <MessageCircle className="w-8 h-8 opacity-40" style={{ color: colors.textSecondary }} />
                            <p className="text-sm font-medium" style={{ color: colors.textSecondary }}>
                                {searchQuery ? 'Nenhuma comunidade encontrada para esta busca.' : 'Nenhuma comunidade ainda.'}
                            </p>
                            {!searchQuery && (
                                <p className="text-xs opacity-60 text-center" style={{ color: colors.textSecondary }}>
                                    Seja o primeiro a criar a comunidade da sua cidade!
                                </p>
                            )}
                        </div>
                    )}

                    {/* Lista */}
                    {!loadingData && !error && filteredCommunities.length > 0 && (
                        <div className="space-y-4">
                            {filteredCommunities.map((community) => (
                                <Link key={community.id} href={`/comunidade/${community.slug}`} className="block group">
                                    <div
                                        className="rounded-2xl p-4 border transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5"
                                        style={{ background: cardBg, backdropFilter: 'blur(12px)', borderColor: colors.border, boxShadow: colors.shadow }}
                                    >
                                        <div className="flex gap-4 items-center">
                                            <div
                                                className="w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0"
                                                style={{ background: GRADIENT, color: '#fff' }}
                                            >
                                                <MessageCircle size={26} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="text-lg font-black truncate" style={{ color: colors.textPrimary }}>
                                                    {community.name}
                                                </h3>
                                                <p className="text-xs flex items-center gap-1 mt-0.5" style={{ color: colors.accent }}>
                                                    <MapPin size={12} /> {community.scope === 'country' ? 'Todo o país' : community.scope === 'state' ? 'Estado' : community.city}
                                                </p>
                                                {community.description && (
                                                    <p className="text-xs line-clamp-2 mt-1" style={{ color: colors.textSecondary }}>
                                                        {community.description}
                                                    </p>
                                                )}
                                                <p className="text-[10px] font-bold flex items-center gap-1 mt-2" style={{ color: colors.textSecondary }}>
                                                    <Users size={12} /> {community.memberCount} membro{community.memberCount !== 1 ? 's' : ''}
                                                </p>
                                            </div>
                                            <ChevronRight size={18} style={{ color: colors.textSecondary }} />
                                        </div>

                                        {/* Últimas conversas (até 10) */}
                                        {community.recent.length > 0 && (
                                            <div className="mt-3 pt-3 border-t flex flex-col gap-2" style={{ borderColor: colors.border }}>
                                                <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                                                    Últimas conversas
                                                </p>
                                                {community.recent.map((m) => (
                                                    <div key={m.id} className="flex items-start gap-2">
                                                        {m.avatar ? (
                                                            <img src={m.avatar} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" loading="lazy" />
                                                        ) : (
                                                            <span className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-black flex-shrink-0" style={{ background: GRADIENT }}>
                                                                {m.name.charAt(0).toUpperCase()}
                                                            </span>
                                                        )}
                                                        <div className="min-w-0 rounded-2xl rounded-tl-md px-3 py-1.5" style={{ background: `${colors.border}30` }}>
                                                            <p className="text-[11px] font-black" style={{ color: colors.textPrimary }}>
                                                                {m.name}{' '}
                                                                <span className="font-medium" style={{ color: colors.textSecondary }}>
                                                                    · {new Date(m.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}{' '}
                                                                    {new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                                                </span>
                                                            </p>
                                                            <p className="text-xs line-clamp-2 break-words" style={{ color: colors.textPrimary }}>{m.content}</p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </section>

                {/* Botão flutuante Criar Comunidade */}
                <button
                    onClick={() => {
                        if (!userId) {
                            router.push('/login')
                            return
                        }
                        setShowCreateModal(true)
                    }}
                    className="fixed bottom-24 right-6 z-40 flex items-center gap-2 px-5 py-3.5 rounded-full font-black text-xs uppercase tracking-wider shadow-2xl transition-transform hover:scale-105 active:scale-95"
                    style={{ background: GRADIENT, color: '#fff', boxShadow: `0 8px 24px #14b8a660` }}
                >
                    <Plus size={16} /> Criar Comunidade
                </button>

                {showCreateModal && userId && (
                    <CreateCommunityModal
                        userId={userId}
                        defaultCity={userCity}
                        onClose={() => setShowCreateModal(false)}
                        onCreated={(slug) => {
                            setShowCreateModal(false)
                            router.push(`/comunidade/${slug}`)
                        }}
                    />
                )}

                {/* Location Picker - mesmo componente compartilhado do header/radar/homepage */}
                {showLocationDialog && (
                    <LocationPicker
                        initialLocation={savedLocation}
                        onSave={handleLocationSave}
                        onClose={() => setShowLocationDialog(false)}
                    />
                )}
            </main>
        </div>
    )
}
