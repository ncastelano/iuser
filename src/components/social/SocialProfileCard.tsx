// Cartão de perfil do /social (Social): foto com borda (e a foto da loja, se a pessoa tiver uma), nome, pontos, o que a pessoa faz,
// e os dois botões que importam — Seguir e Conversar. Clicar no resto do cartão abre o perfil.
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, MapPin, MessageCircle, Star, Store as StoreIcon, UserPlus } from 'lucide-react'
import { toast } from '@/lib/toast'
import { supabase } from '@/lib/supabase/client'
import PlanAvatarRing from '@/components/PlanAvatarRing'
import { Spinner } from '@/components/Spinner'
import { lastSeenLabel, type PresenceInfo } from '@/lib/lastSeen'
import { trackProfileVisit } from '@/lib/trackProfileVisit'
import { useInsideShell } from '@/components/InsideShell'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

// Colocação: 1º dourado, 2º prata, 3º bronze (letra preta); o resto, o degradê laranja → vermelho (letra branca)
export const rankStyle = (rank: number): React.CSSProperties =>
    rank === 0 ? { background: 'linear-gradient(135deg, #fde047, #eab308)', color: '#000', boxShadow: '0 2px 8px #eab30866' }
        : rank === 1 ? { background: 'linear-gradient(135deg, #e5e7eb, #9ca3af)', color: '#000', boxShadow: '0 2px 8px #6b728066', border: '1px solid #9ca3af' }
            : rank === 2 ? { background: 'linear-gradient(135deg, #e0a56b, #c77b30)', color: '#000', boxShadow: '0 2px 8px #c77b3066' }
                : { background: GRADIENT, color: '#fff' }

export interface SocialCardProfile {
    id: string
    name: string
    profileSlug: string
    avatar_url: string | null
    bio?: string | null
    description?: string | null
    address?: string | null
    category?: string | null
    ratings_avg?: number | null
    ratings_count?: number | null
    points?: number
    chat_enabled?: boolean
    // Privacidade da localização: some do cartão se a pessoa não quer no perfil nem no Social
    show_location?: boolean | null
    show_in_social?: boolean | null
}

export interface SocialCardStore { name: string; storeSlug: string; logoUrl: string | null }

interface Props {
    profile: SocialCardProfile
    store?: SocialCardStore | null
    rank?: number                      // posição (0 = primeiro) — só na aba Melhores perfis
    isMe: boolean
    userId: string | null
    following: boolean
    followers?: number
    onFollowChange: (profileId: string, following: boolean) => void
    seenAt?: PresenceInfo | null
    colors: any
    cardBg: string
    onOpen: () => void
}

export default function SocialProfileCard({ profile, store, rank, isMe, userId, following, followers = 0, onFollowChange, seenAt, colors, cardBg, onOpen }: Props) {
    const router = useRouter()
    const v3 = useInsideShell()
    const [followBusy, setFollowBusy] = useState(false)
    const [chatBusy, setChatBusy] = useState(false)
    const seen = lastSeenLabel(seenAt)
    const about = profile.bio || profile.description
    const showAddress = !!profile.address && profile.show_location !== false && profile.show_in_social !== false

    const goLogin = () => router.push('/login?redirect=/social')

    const toggleFollow = async (e: React.MouseEvent) => {
        e.stopPropagation()
        if (!userId) { goLogin(); return }
        setFollowBusy(true)
        const { error } = following
            ? await supabase.from('follows').delete().eq('follower_id', userId).eq('following_id', profile.id)
            : await supabase.from('follows').insert({ follower_id: userId, following_id: profile.id })
        setFollowBusy(false)
        if (error) { toast.error('Não foi possível atualizar: ' + error.message); return }
        onFollowChange(profile.id, !following)
    }

    const openChat = async (e: React.MouseEvent) => {
        e.stopPropagation()
        if (!userId) { goLogin(); return }
        setChatBusy(true)
        const { data, error } = await supabase.rpc('start_conversation', { p_owner_profile: profile.id, p_store: null })
        setChatBusy(false)
        if (error || !data) { toast.error(error?.message || 'Não foi possível abrir a conversa'); return }
        router.push(`/conversas?c=${data}`)
    }

    // v3: linha compacta (sem cartão): foto, @ e nome, números e o Seguir à direita; tocar na linha abre o perfil
    if (v3) {
        const place = showAddress ? (profile.address?.split(',')[0]?.trim() || profile.address) : null
        const flat: Record<number, React.CSSProperties> = {
            0: { background: '#fde047', color: '#000' },
            1: { background: '#e5e7eb', color: '#000' },
            2: { background: '#e8b27a', color: '#000' },
        }
        return (
            <div
                onClick={onOpen}
                onMouseEnter={() => { if (!isMe) trackProfileVisit(profile.id, userId) }}
                className="flex items-center gap-3 py-3 cursor-pointer"
                style={{ borderBottom: `1px solid ${colors.border}50` }}
            >
                <div className="relative flex-shrink-0">
                    <PlanAvatarRing userId={profile.id} width={2}>
                        <div className="w-12 h-12 rounded-full overflow-hidden flex items-center justify-center" style={{ background: `${colors.border}60` }}>
                            {profile.avatar_url
                                ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                                : <span className="text-lg font-black" style={{ color: colors.textSecondary }}>{profile.name?.charAt(0).toUpperCase() || '?'}</span>}
                        </div>
                    </PlanAvatarRing>
                    {seen && <span className="absolute bottom-0 right-0 z-10 w-3.5 h-3.5 rounded-full" style={{ background: seen.online ? '#16a34a' : '#94a3b8', border: '2px solid #fff' }} title={seen.text} />}
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-black leading-tight truncate" style={{ color: colors.textPrimary }}>@{profile.profileSlug}</p>
                    <p className="text-[12px] truncate" style={{ color: colors.textSecondary }}>
                        {[profile.name, place].filter(Boolean).join(' · ')}
                    </p>
                    <div className="mt-1 flex items-center gap-1.5 flex-wrap text-[11px] font-black">
                        {rank !== undefined && (
                            <span className="px-2 py-0.5 rounded-full" style={flat[rank] ?? { background: `${colors.border}50`, color: colors.textPrimary }}>#{rank + 1}</span>
                        )}
                        {(profile.points ?? 0) > 0 && <span style={{ color: '#ea580c' }}>{profile.points} pts</span>}
                        {followers > 0 && <span style={{ color: colors.textSecondary }}>{followers} {followers === 1 ? 'seguidor' : 'seguidores'}</span>}
                        {!!profile.ratings_avg && profile.ratings_avg > 0 && (
                            <span className="flex items-center gap-0.5" style={{ color: colors.textPrimary }}><Star size={11} className="text-yellow-400 fill-yellow-400" />{Number(profile.ratings_avg).toFixed(1)}</span>
                        )}
                    </div>
                    {store && (
                        <button onClick={(e) => { e.stopPropagation(); router.push(`/${store.storeSlug}`) }} className="mt-1 text-[12px] font-bold underline underline-offset-2 truncate max-w-full text-left" style={{ color: colors.textSecondary }}>
                            Loja {store.name}
                        </button>
                    )}
                </div>
                {!isMe && (!!userId || profile.chat_enabled) && (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                        {profile.chat_enabled && (
                            <button onClick={openChat} disabled={chatBusy} aria-label="Conversar" className="w-9 h-9 rounded-full flex items-center justify-center transition active:scale-95 disabled:opacity-70" style={{ background: `${colors.border}40` }}>
                                {chatBusy ? <Spinner size={14} color="#f97316" /> : <MessageCircle size={16} style={{ color: '#f97316' }} />}
                            </button>
                        )}
                        {!!userId && (
                            <button
                                onClick={toggleFollow}
                                disabled={followBusy}
                                className="h-9 px-4 rounded-full text-[13px] font-black transition active:scale-95 disabled:opacity-70"
                                style={following ? { background: `${colors.border}40`, color: colors.textPrimary } : { background: '#f97316', color: '#fff' }}
                            >
                                {followBusy ? <Spinner size={14} color={following ? '#f97316' : '#fff'} /> : following ? 'Seguindo' : 'Seguir'}
                            </button>
                        )}
                    </div>
                )}
            </div>
        )
    }

    return (
        <div
            onClick={onOpen}
            // Passar o mouse por cima do cartão conta como visita no perfil
            onMouseEnter={() => { if (!isMe) trackProfileVisit(profile.id, userId) }}
            className="group relative rounded-3xl p-4 border cursor-pointer flex flex-col items-center text-center gap-3 transition-all duration-300 hover:shadow-2xl hover:-translate-y-1"
            style={{ background: cardBg, backdropFilter: 'blur(12px)', borderColor: colors.border, boxShadow: colors.shadow }}
        >
            {/* Foto com borda e, do lado, nome e @; a bolinha no canto da foto mostra online (verde) ou visto (cinza) */}
            <div className="flex items-center justify-center gap-3 w-full">
                <div className="relative flex-shrink-0">
                    <PlanAvatarRing userId={profile.id} width={3}>
                        <div className="w-16 h-16 rounded-full overflow-hidden" style={{ background: colors.surface }}>
                            {profile.avatar_url ? (
                                <img src={profile.avatar_url} alt={profile.name} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" />
                            ) : (
                                <span className="w-full h-full flex items-center justify-center text-2xl font-black" style={{ color: colors.textSecondary }}>
                                    {profile.name?.charAt(0).toUpperCase() || '?'}
                                </span>
                            )}
                        </div>
                    </PlanAvatarRing>
                    {seen && (
                        <span
                            className="absolute bottom-0 right-0 z-10 w-4 h-4 rounded-full"
                            style={{ background: seen.online ? '#16a34a' : '#64748b', border: '2.5px solid #ffffff', boxShadow: '0 1px 4px rgba(0,0,0,0.35)' }}
                            title={seen.text}
                        />
                    )}
                </div>
                <div className="min-w-0 text-left">
                    {/* O @ identifica a pessoa (nome pode ser enorme): @ em cima, nome embaixo */}
                    <h3 className="text-base font-black leading-tight truncate" style={{ color: colors.textPrimary }}>@{profile.profileSlug}</h3>
                    {profile.name && <p className="text-xs font-semibold truncate" style={{ color: colors.textSecondary }}>{profile.name}</p>}
                </div>
            </div>

            {/* Colocação e pontuação, um do lado do outro */}
            {(rank !== undefined || (profile.points ?? 0) > 0 || followers > 0) && (
                <div className="flex items-center justify-center gap-2 flex-wrap">
                    {rank !== undefined && (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-black" style={rankStyle(rank)} title={`${rank + 1}º lugar em Melhores perfis`}>
                            #{rank + 1}
                        </span>
                    )}
                    {(profile.points ?? 0) > 0 && (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-black" style={{ background: '#f9731620', color: '#ea580c' }} title="Pontuação do perfil">
                            ⭐ {profile.points} pts
                        </span>
                    )}
                    {followers > 0 && (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-black" style={{ background: `${colors.border}55`, color: colors.textPrimary }} title="Seguidores">
                            👥 {followers} {followers === 1 ? 'seguidor' : 'seguidores'}
                        </span>
                    )}
                </div>
            )}

            {seen && (
                <p className="text-[11px] font-bold -mt-1" style={{ color: seen.online ? '#16a34a' : colors.textSecondary }}>{seen.text}</p>
            )}

            {about && <p className="text-xs leading-snug line-clamp-2 max-w-full" style={{ color: colors.textSecondary }}>{about}</p>}

            <div className="flex items-center justify-center gap-2 flex-wrap text-[11px]" style={{ color: colors.textSecondary }}>
                {showAddress && (
                    <span className="flex items-center gap-1 min-w-0 max-w-full">
                        <MapPin size={12} className="flex-shrink-0" />
                        <span className="truncate">{profile.address?.split(',')[0]?.trim() || profile.address}</span>
                    </span>
                )}
                {profile.category && (
                    <span className="px-2 py-0.5 rounded-full font-bold" style={{ background: '#f9731618', color: '#ea580c' }}>{profile.category}</span>
                )}
                {!!profile.ratings_avg && profile.ratings_avg > 0 && (
                    <span className="flex items-center gap-0.5 font-bold" style={{ color: colors.textPrimary }}>
                        <Star size={12} className="text-yellow-400 fill-yellow-400" />
                        {Number(profile.ratings_avg).toFixed(1)} <span style={{ color: colors.textSecondary, fontWeight: 400 }}>({profile.ratings_count || 0})</span>
                    </span>
                )}
            </div>

            {store && (
                <button
                    onClick={(e) => { e.stopPropagation(); router.push(`/${store.storeSlug}`) }}
                    className="flex items-center justify-center gap-2 px-3 py-1.5 rounded-2xl max-w-full transition-colors hover:bg-black/5"
                    style={{ border: `1px solid ${colors.border}` }}
                >
                    <span className="w-6 h-6 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0" style={{ background: GRADIENT }}>
                        {store.logoUrl ? <img src={store.logoUrl} alt="" className="w-full h-full object-cover" loading="lazy" /> : <StoreIcon size={12} color="#fff" />}
                    </span>
                    <span className="text-xs font-bold truncate" style={{ color: colors.textPrimary }}>Loja {store.name}</span>
                </button>
            )}

            {!isMe && (!!userId || profile.chat_enabled) && (
                <div className="flex items-center gap-2 mt-auto pt-1 w-full">
                    {/* Visitante (sem conta) não vê o Seguir */}
                    {!!userId && <button
                        onClick={toggleFollow}
                        disabled={followBusy}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-full text-sm font-black transition-all active:scale-95 disabled:opacity-70"
                        style={following
                            ? { background: 'transparent', color: colors.textPrimary, border: `2px solid ${colors.border}` }
                            : { background: GRADIENT, color: '#fff', boxShadow: '0 4px 12px #f9731640', border: '2px solid transparent' }}
                    >
                        {followBusy ? <Spinner size={14} color={following ? colors.accent : '#fff'} /> : following ? <><Check size={15} /> Seguindo</> : <><UserPlus size={15} /> Seguir</>}
                    </button>}
                    {profile.chat_enabled && (
                        <button
                            onClick={openChat}
                            disabled={chatBusy}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-full text-sm font-black transition-all active:scale-95 disabled:opacity-70"
                            style={{ background: 'transparent', color: colors.accent, border: `2px solid ${colors.accent}` }}
                        >
                            {chatBusy ? <Spinner size={14} color={colors.accent} /> : <><MessageCircle size={15} /> Conversar</>}
                        </button>
                    )}
                </div>
            )}
        </div>
    )
}
