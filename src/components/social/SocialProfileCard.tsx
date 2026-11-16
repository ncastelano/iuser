// Cartão de perfil do /social (Social): foto com borda (e a foto da loja, se a pessoa tiver uma), nome, pontos, o que a pessoa faz,
// e os dois botões que importam — Seguir e Conversar. Clicar no resto do cartão abre o perfil.
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MessageCircle, Star } from 'lucide-react'
import { toast } from '@/lib/toast'
import { supabase } from '@/lib/supabase/client'
import PlanAvatarRing from '@/components/PlanAvatarRing'
import { Spinner } from '@/components/Spinner'
import { lastSeenLabel, type PresenceInfo } from '@/lib/lastSeen'
import { trackProfileVisit } from '@/lib/trackProfileVisit'

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
    const [followBusy, setFollowBusy] = useState(false)
    const [chatBusy, setChatBusy] = useState(false)
    const seen = lastSeenLabel(seenAt)
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
