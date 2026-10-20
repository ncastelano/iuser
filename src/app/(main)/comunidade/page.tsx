// app/(main)/comunidade/page.tsx
'use client'

import { useInsideShell } from '@/components/InsideShell'
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
import { fetchCommunitiesActivity, type CommunityActivity } from '@/lib/communityActivity'
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
    Lock,
    MoreHorizontal,
    Pin,
    PinOff,
    Bookmark,
    Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Spinner } from '@/components/Spinner'
import { saveOwnProfile } from '@/lib/saveOwnProfile'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

interface CommunityMessagePreview { id: string; content: string; created_at: string; name: string; avatar: string | null }

interface CommunityCard {
    id: string
    slug: string
    name: string
    city: string
    scope: 'city' | 'state' | 'country'
    description: string | null
    image_url: string | null
    requires_password: boolean
    /** Criei ou sou membro (continua aparecendo na minha lista) */
    mine: boolean
    creatorId: string | null
    memberCount: number
    recent: CommunityMessagePreview[]
    activity: CommunityActivity | null
}

export default function ComunidadePage() {
    const v3 = useInsideShell()   // v3: lista corrida, sem cartões; só as 3 últimas conversas na prévia
    const router = useRouter()
    const { userId, avatarUrl, bgMode, customBgUrl, profileSlug, loading: profileLoading } = useProfile()
    const { colors } = useTheme()
    const searchInputRef = useRef<HTMLInputElement>(null)

    const [communities, setCommunities] = useState<CommunityCard[]>([])
    const [loadingData, setLoadingData] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState('')
    const [showCreateModal, setShowCreateModal] = useState(false)
    // Lista pessoal: comunidades achadas na busca e guardadas (pinned = no topo)
    const [saved, setSaved] = useState<Map<string, { pinned: boolean; pinnedAt: string | null }>>(new Map())
    const [menuFor, setMenuFor] = useState<string | null>(null)

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
            .from('my_profile')
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

            const { error } = await saveOwnProfile(supabase, user.id, {
                address: location.address,
                address_number: location.addressNumber || null,
                address_complement: location.addressComplement || null,
                store_lat: location.lat,
                store_lng: location.lng,
            })

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
                .select('id, slug, name, city, description, scope, image_url, is_listed, requires_password, creator_id')
                .order('created_at', { ascending: false })

            if (error) throw error

            // Comunidade fora da lista (só por link): aparece só pra quem criou ou já é membro
            let mine = new Set<string>()
            if (userId) {
                const { data: mem } = await supabase.from('community_members').select('community_id').eq('profile_id', userId)
                mine = new Set((mem || []).map((m: any) => m.community_id))
            }
            const visible = (data || []).filter((c: any) => c.is_listed !== false || c.creator_id === userId || mine.has(c.id))

            // Contagem de membros e as últimas 10 mensagens de cada comunidade
            const base = await Promise.all(
                visible.map(async (c: any) => {
                    const [{ count }, { data: msgs }] = await Promise.all([
                        supabase.from('community_members').select('*', { count: 'exact', head: true }).eq('community_id', c.id),
                        supabase.from('community_messages').select('id, profile_id, content, created_at').eq('community_id', c.id).order('created_at', { ascending: false }).limit(10),
                    ])
                    return { c, count: count || 0, msgs: (msgs || []).slice().reverse() }
                })
            )
            const activityById = await fetchCommunitiesActivity(visible.map((c: any) => c.id))
            const authorIds = [...new Set(base.flatMap((b) => b.msgs.map((m) => m.profile_id)))]
            const { data: authors } = authorIds.length
                ? await supabase.from('profiles').select('id, name, profileSlug, avatar_url').in('id', authorIds)
                : { data: [] as any[] }
            const authorMap = new Map((authors || []).map((a: any) => [a.id, a]))

            if (userId) {
                const { data: sv } = await supabase.from('community_saved').select('community_id, pinned, pinned_at').eq('profile_id', userId)
                setSaved(new Map((sv || []).map((r: any) => [r.community_id, { pinned: !!r.pinned, pinnedAt: r.pinned_at }])))
            } else {
                setSaved(new Map())
            }

            const withCounts: CommunityCard[] = base.map(({ c, count, msgs }) => ({
                ...c,
                mine: !!userId && (c.creator_id === userId || mine.has(c.id)),
                creatorId: c.creator_id || null,
                scope: (c.scope || 'city') as CommunityCard['scope'],
                memberCount: count,
                activity: activityById[c.id] || null,
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
    }, [userId])

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
                .insert({
                    slug, name, city: name, description, creator_id: userId, scope, kind: 'place',
                    tz: /porto velho|rond[ôo]nia/i.test(name) ? 'America/Porto_Velho' : 'America/Sao_Paulo',
                })
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

    // ===== FILTRO + ORDENAÇÃO =====
    // Sem busca: só o que é da pessoa — a cidade, o estado e o país dela, o que ela criou/participa e o que guardou da
    // busca. Com busca: tudo que bate. Quem guardou "no topo" vai à frente de tudo.
    const same = (a: string | null, b: string) => !!a && a.toLowerCase() === b.toLowerCase()
    const isOwnPlace = useCallback((c: CommunityCard) =>
        (c.scope === 'city' && same(userCity, c.city)) || (c.scope === 'state' && same(userState, c.city)) || c.scope === 'country',
    [userCity, userState])

    const filteredCommunities = useMemo(() => {
        const q = searchQuery.trim().toLowerCase()
        const placeKnown = !!(userCity || userState)
        const base = q
            ? communities.filter(
                (c) =>
                    c.name.toLowerCase().includes(q) ||
                    c.city.toLowerCase().includes(q) ||
                    c.description?.toLowerCase().includes(q)
            )
            // Sem localização definida não dá pra saber "o que é dela": mostra tudo, como antes
            : placeKnown ? communities.filter((c) => isOwnPlace(c) || c.mine || saved.has(c.id)) : communities

        // Cidade da pessoa, depois o estado, depois o Brasil, depois as outras
        const rank = (c: CommunityCard) =>
            c.scope === 'city' && same(userCity, c.city) ? 0
                : c.scope === 'state' && same(userState, c.city) ? 1
                    : c.scope === 'country' ? 2 : 3
        const pinnedAt = (c: CommunityCard) => {
            const sv = saved.get(c.id)
            return sv?.pinned ? new Date(sv.pinnedAt || 0).getTime() || 1 : 0
        }
        // Fixadas primeiro (a mais recente na frente); depois quem teve novidade; depois a ordem por lugar
        const act = (c: CommunityCard) => c.activity?.activityAt || 0
        return base.map((c, i) => ({ c, i }))
            .sort((x, y) => (pinnedAt(y.c) - pinnedAt(x.c)) || (act(y.c) - act(x.c)) || (rank(x.c) - rank(y.c)) || (x.i - y.i))
            .map((x) => x.c)
    }, [communities, searchQuery, userCity, userState, saved, isOwnPlace])

    // ===== LISTA PESSOAL: guardar, fixar no topo, tirar =====
    const saveCommunity = async (c: CommunityCard, pinned: boolean) => {
        if (!userId) { router.push('/login'); return }
        // Cidade/estado/país já aparecem sempre: tirar do topo só apaga a marca, não precisa de linha guardada
        if (!pinned && isOwnPlace(c)) { await removeSaved(c, 'Saiu do topo'); return }
        const pinnedAt = pinned ? new Date().toISOString() : null
        const { error: err } = await supabase
            .from('community_saved')
            .upsert({ profile_id: userId, community_id: c.id, pinned, pinned_at: pinnedAt }, { onConflict: 'profile_id,community_id' })
        if (err) {
            console.error('[Comunidade] Erro ao guardar:', err)
            toast.error(`Não foi possível salvar agora (${err.message})`)
            return
        }
        setSaved((prev) => new Map(prev).set(c.id, { pinned, pinnedAt }))
        toast.success(pinned ? 'Colocada no topo da sua lista' : 'Guardada na sua lista')
    }

    const removeSaved = async (c: CommunityCard, okMessage = 'Tirada da sua lista') => {
        if (!userId) return
        const { error: err } = await supabase.from('community_saved').delete().eq('profile_id', userId).eq('community_id', c.id)
        if (err) {
            console.error('[Comunidade] Erro ao remover:', err)
            toast.error(`Não foi possível remover agora (${err.message})`)
            return
        }
        setSaved((prev) => { const m = new Map(prev); m.delete(c.id); return m })
        toast.success(okMessage)
    }

    // Por que esta sala está na lista: é da cidade/estado/país da pessoa, ela criou, participa ou guardou
    const reasonsFor = (c: CommunityCard): string[] => {
        const out: string[] = []
        if (c.scope === 'city' && same(userCity, c.city)) out.push('Sua cidade')
        else if (c.scope === 'state' && same(userState, c.city)) out.push('Seu estado')
        else if (c.scope === 'country') out.push('Seu país')
        else if (c.creatorId === userId && userId) out.push('Criada por você')
        else if (c.mine) out.push('Você participa')
        if (saved.get(c.id)?.pinned) out.push('No topo')
        else if (saved.has(c.id)) out.push('Na sua lista')
        return out
    }

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
                            {filteredCommunities.map((community) => {
                                const sv = saved.get(community.id)
                                const canManage = !!userId
                                const ownPlace = isOwnPlace(community)
                                const reasons = reasonsFor(community)
                                return (
                                <div key={community.id} className="relative">
                                {/* ⋯ : colocar no topo / tirar do topo em todos; guardar e deletar da lista nos que vieram da busca */}
                                {canManage && (
                                    <>
                                        <button
                                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuFor(menuFor === community.id ? null : community.id) }}
                                            aria-label="Opções da comunidade"
                                            className="absolute top-2.5 right-2.5 z-20 w-8 h-8 rounded-full flex items-center justify-center transition hover:scale-110"
                                            style={{ background: `${colors.border}55`, color: colors.textPrimary }}
                                        >
                                            <MoreHorizontal size={18} />
                                        </button>
                                        {menuFor === community.id && (
                                            <>
                                                <div className="fixed inset-0 z-30" onClick={() => setMenuFor(null)} />
                                                <div
                                                    className="absolute top-12 right-2.5 z-40 min-w-[210px] rounded-2xl p-1.5 border shadow-2xl"
                                                    style={{ background: colors.surface, borderColor: colors.border }}
                                                >
                                                    {sv?.pinned ? (
                                                        <button
                                                            onClick={() => { setMenuFor(null); saveCommunity(community, false) }}
                                                            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-bold text-left hover:opacity-80"
                                                            style={{ color: colors.textPrimary }}
                                                        >
                                                            <PinOff size={16} /> Tirar do topo
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={() => { setMenuFor(null); saveCommunity(community, true) }}
                                                            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-bold text-left hover:opacity-80"
                                                            style={{ color: colors.textPrimary }}
                                                        >
                                                            <Pin size={16} /> Colocar no topo
                                                        </button>
                                                    )}
                                                    {ownPlace ? null : sv ? (
                                                        <button
                                                            onClick={() => { setMenuFor(null); removeSaved(community) }}
                                                            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-bold text-left hover:opacity-80"
                                                            style={{ color: '#ef4444' }}
                                                        >
                                                            <Trash2 size={16} /> Deletar da minha lista
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={() => { setMenuFor(null); saveCommunity(community, false) }}
                                                            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-bold text-left hover:opacity-80"
                                                            style={{ color: colors.textPrimary }}
                                                        >
                                                            <Bookmark size={16} /> Guardar na minha lista
                                                        </button>
                                                    )}
                                                </div>
                                            </>
                                        )}
                                    </>
                                )}
                                <Link href={`/comunidade/${community.slug}`} className="block group">
                                    <div
                                        className={v3 ? 'py-4 transition-opacity active:opacity-80' : 'rounded-2xl p-4 border transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5'}
                                        style={v3 ? { borderBottom: `1px solid ${colors.border}50` } : { background: cardBg, backdropFilter: 'blur(12px)', borderColor: sv?.pinned ? `${colors.accent}80` : colors.border, boxShadow: colors.shadow }}
                                    >
                                        <div className="flex gap-4 items-center">
                                            <div
                                                className={`${v3 ? 'w-14 h-14' : 'w-16 h-16'} rounded-2xl overflow-hidden flex items-center justify-center flex-shrink-0`}
                                                style={{ background: v3 ? '#f97316' : GRADIENT, color: '#fff' }}
                                            >
                                                {community.image_url
                                                    ? <img src={community.image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                                                    : <MessageCircle size={26} />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h3 className={`${v3 ? 'text-base' : 'text-lg truncate'} font-black flex items-center gap-1.5`} style={{ color: colors.textPrimary }}>
                                                    <span className={v3 ? 'line-clamp-2' : 'truncate'}>{community.name}</span>
                                                    {sv?.pinned && <Pin size={13} className="flex-shrink-0" style={{ color: colors.accent }} />}
                                                    {community.requires_password && <Lock size={14} className="flex-shrink-0" style={{ color: colors.textSecondary }} />}
                                                </h3>
                                                <p className="text-xs flex items-center gap-1 mt-0.5" style={{ color: colors.accent }}>
                                                    <MapPin size={12} /> {community.scope === 'country' ? 'Todo o país' : community.scope === 'state' ? 'Estado' : community.city}
                                                </p>
                                                {reasons.length > 0 && (
                                                    <p className="flex flex-wrap gap-1 mt-1.5">
                                                        {reasons.map((r) => (
                                                            <span
                                                                key={r}
                                                                className="text-[10px] font-black px-2 py-0.5 rounded-full"
                                                                style={r === 'No topo'
                                                                    ? { background: `${colors.accent}22`, color: colors.accent }
                                                                    : { background: `${colors.border}55`, color: colors.textSecondary }}
                                                            >
                                                                {r}
                                                            </span>
                                                        ))}
                                                    </p>
                                                )}
                                                {community.description && (
                                                    <p className="text-xs line-clamp-2 mt-1" style={{ color: colors.textSecondary }}>
                                                        {community.description}
                                                    </p>
                                                )}
                                                <p className="text-[10px] font-bold flex items-center gap-1 mt-2" style={{ color: colors.textSecondary }}>
                                                    <Users size={12} /> {community.memberCount} membro{community.memberCount !== 1 ? 's' : ''}
                                                </p>
                                            </div>
                                            {canManage ? <span className="w-8 flex-shrink-0" /> : <ChevronRight size={18} style={{ color: colors.textSecondary }} />}
                                        </div>

                                        {/* Evento: votação da foto da comunidade acontecendo */}
                                        {community.activity?.photoVoteActive && (
                                            <div className="mt-3 flex items-center gap-2.5 rounded-2xl px-3 py-2" style={{ background: '#f9731614', border: '1px solid #f9731660' }}>
                                                <span className="flex -space-x-2 flex-shrink-0">
                                                    {community.activity.photoThumbs.map((u, i) => (
                                                        <img key={u + i} src={u} alt="" className="w-8 h-8 rounded-lg object-cover border-2" style={{ borderColor: colors.surface }} loading="lazy" />
                                                    ))}
                                                </span>
                                                <span className="min-w-0 flex-1">
                                                    <span className="block text-xs font-black" style={{ color: colors.textPrimary }}>Votação da foto da comunidade acontecendo</span>
                                                    <span className="block text-[10px]" style={{ color: colors.textSecondary }}>
                                                        {community.activity.photoCandidates} {community.activity.photoCandidates === 1 ? 'foto' : 'fotos'} concorrendo hoje
                                                    </span>
                                                </span>
                                                <span className="w-2 h-2 rounded-full flex-shrink-0 animate-pulse" style={{ background: '#f97316' }} />
                                            </div>
                                        )}

                                        {/* Últimas conversas (até 10) */}
                                        {community.recent.length > 0 && (
                                            <div className={v3 ? 'mt-3 flex flex-col gap-2' : 'mt-3 pt-3 border-t flex flex-col gap-2'} style={v3 ? undefined : { borderColor: colors.border }}>
                                                <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                                                    Últimas conversas
                                                </p>
                                                {(v3 ? community.recent.slice(-3) : community.recent).map((m) => (
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
                                </div>
                                )
                            })}
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
                    className={`${menuFor ? 'hidden' : ''} fixed bottom-24 right-6 z-40 flex items-center gap-2 px-5 py-3.5 rounded-full font-black text-xs uppercase tracking-wider shadow-2xl transition-transform hover:scale-105 active:scale-95`}
                    style={v3 ? { background: '#f97316', color: '#fff' } : { background: GRADIENT, color: '#fff', boxShadow: `0 8px 24px #14b8a660` }}
                >
                    <Plus size={16} /> {v3 ? 'Criar comunidade' : 'Criar Comunidade'}
                </button>

                {showCreateModal && userId && (
                    <CreateCommunityModal
                        userId={userId}
                        place={{ city: userCity, state: userState }}
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
