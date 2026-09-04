// app/(main)/comunidade/[communitySlug]/CommunityRoomClient.tsx
'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import Header from '@/app/Header'
import { getAvatarUrl } from '@/lib/avatar'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import {
    ArrowLeft,
    MapPin,
    Users,
    Send,
    UserPlus,
    UserCheck,
    LogIn,
    MessageCircle,
} from 'lucide-react'
import { Spinner } from '@/components/Spinner'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

interface Community {
    id: string
    slug: string
    name: string
    city: string
    description: string | null
    creator_id: string
}

interface CommunityMessage {
    id: string
    content: string
    created_at: string
    profile_id: string
    profiles?: {
        name: string | null
        avatar_url: string | null
        profileSlug: string | null
    } | null
}

export default function CommunityRoomClient() {
    const params = useParams()
    const router = useRouter()
    const { colors } = useTheme()
    const { avatarUrl, bgMode, customBgUrl, profileSlug, loading: profileLoading } = useProfile()
    const bottomRef = useRef<HTMLDivElement>(null)

    const communitySlug = Array.isArray(params.communitySlug) ? params.communitySlug[0] : params.communitySlug

    const [currentUserId, setCurrentUserId] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [community, setCommunity] = useState<Community | null>(null)
    const [memberCount, setMemberCount] = useState(0)
    const [isMember, setIsMember] = useState(false)
    const [joining, setJoining] = useState(false)
    const [messages, setMessages] = useState<CommunityMessage[]>([])
    const [messageInput, setMessageInput] = useState('')
    const [sending, setSending] = useState(false)

    useEffect(() => {
        const getUser = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            setCurrentUserId(user?.id || null)
        }
        getUser()
    }, [])

    const loadRoom = useCallback(async () => {
        if (!communitySlug) return
        setLoading(true)
        setError(null)
        try {
            const { data: communityData, error: communityErr } = await supabase
                .from('communities')
                .select('id, slug, name, city, description, creator_id')
                .eq('slug', communitySlug)
                .maybeSingle()

            if (communityErr || !communityData) {
                throw new Error('Comunidade não encontrada')
            }

            setCommunity(communityData)

            const { count } = await supabase
                .from('community_members')
                .select('*', { count: 'exact', head: true })
                .eq('community_id', communityData.id)
            setMemberCount(count || 0)

            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                const { data: membership } = await supabase
                    .from('community_members')
                    .select('id')
                    .eq('community_id', communityData.id)
                    .eq('profile_id', user.id)
                    .maybeSingle()
                setIsMember(!!membership)
            }

            const { data: messagesData, error: messagesErr } = await supabase
                .from('community_messages')
                .select('id, content, created_at, profile_id, profiles(name, avatar_url, "profileSlug")')
                .eq('community_id', communityData.id)
                .order('created_at', { ascending: true })

            if (messagesErr) throw messagesErr

            setMessages(
                (messagesData || []).map((m: any) => ({
                    ...m,
                    profiles: Array.isArray(m.profiles) ? m.profiles[0] : m.profiles,
                }))
            )
        } catch (err: any) {
            console.error('[CommunityRoom] Erro ao carregar sala:', err)
            setError(err.message || 'Comunidade não encontrada')
        } finally {
            setLoading(false)
        }
    }, [communitySlug])

    useEffect(() => {
        loadRoom()
    }, [loadRoom])

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ block: 'end' })
    }, [messages.length])

    const handleJoin = async () => {
        if (!currentUserId) {
            router.push('/login')
            return
        }
        if (!community) return

        setJoining(true)
        try {
            const { error } = await supabase
                .from('community_members')
                .insert({ community_id: community.id, profile_id: currentUserId })

            if (error) throw error

            setIsMember(true)
            setMemberCount((prev) => prev + 1)
            toast.success(`Você entrou em ${community.name}!`)
        } catch (err: any) {
            toast.error('Erro ao entrar na comunidade: ' + (err.message || 'tente novamente'))
        } finally {
            setJoining(false)
        }
    }

    const handleSend = async () => {
        if (!currentUserId) {
            toast.error('Faça login para conversar')
            return
        }
        if (!isMember) {
            toast.error('Entre na comunidade primeiro')
            return
        }
        if (!messageInput.trim() || !community) return

        setSending(true)
        try {
            const { data, error } = await supabase
                .from('community_messages')
                .insert({
                    community_id: community.id,
                    profile_id: currentUserId,
                    content: messageInput.trim(),
                })
                .select('id, content, created_at, profile_id, profiles(name, avatar_url, "profileSlug")')
                .single()

            if (error) throw error

            setMessages((prev) => [
                ...prev,
                { ...data, profiles: Array.isArray(data.profiles) ? data.profiles[0] : data.profiles } as CommunityMessage,
            ])
            setMessageInput('')
        } catch (err: any) {
            toast.error('Erro ao enviar mensagem: ' + (err.message || 'tente novamente'))
        } finally {
            setSending(false)
        }
    }

    if (loading) {
        return <LoadingSpinner message="Carregando comunidade..." background={colors.background} />
    }

    if (error || !community) {
        return (
            <div className="min-h-screen flex items-center justify-center px-4" style={{ background: colors.background }}>
                <div className="flex flex-col items-center gap-4 max-w-sm text-center">
                    <MessageCircle className="w-12 h-12" style={{ color: colors.accent }} />
                    <h2 className="text-2xl font-black" style={{ color: colors.textPrimary }}>
                        {error || 'Comunidade não encontrada'}
                    </h2>
                    <button
                        onClick={() => router.push('/comunidade')}
                        className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition hover:scale-105"
                        style={{ background: colors.accent, color: '#fff' }}
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Ver comunidades
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="relative min-h-dvh flex flex-col" style={{ background: colors.background }}>
            <div className="fixed inset-0 z-0">
                <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
            </div>

            <div className="relative z-10 flex flex-col min-h-dvh">
                <Header
                    title={community.name}
                    showBack={true}
                    onBack={() => router.push('/comunidade')}
                    greeting={`Olá, ${profileLoading ? '...' : profileSlug ? `@${profileSlug}` : 'Visitante'}`}
                    avatarUrl={avatarUrl}
                    loading={profileLoading}
                />

                {/* Info da comunidade */}
                <div className="px-4 md:px-6 mt-2">
                    <div
                        className="rounded-2xl p-4 border flex items-center gap-3"
                        style={{ background: colors.surface, borderColor: colors.border, boxShadow: colors.shadow }}
                    >
                        <div className="flex-1 min-w-0">
                            <p className="text-xs flex items-center gap-1" style={{ color: colors.accent }}>
                                <MapPin size={12} /> {community.city}
                            </p>
                            {community.description && (
                                <p className="text-xs mt-1 line-clamp-2" style={{ color: colors.textSecondary }}>
                                    {community.description}
                                </p>
                            )}
                            <p className="text-[10px] font-bold flex items-center gap-1 mt-1" style={{ color: colors.textSecondary }}>
                                <Users size={12} /> {memberCount} membro{memberCount !== 1 ? 's' : ''}
                            </p>
                        </div>
                        <button
                            onClick={handleJoin}
                            disabled={joining || isMember}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold flex-shrink-0 transition-all hover:scale-105 disabled:hover:scale-100"
                            style={
                                isMember
                                    ? { background: `${colors.accent}20`, color: colors.accent }
                                    : { background: GRADIENT, color: '#fff' }
                            }
                        >
                            {joining ? (
                                <Spinner size={14} />
                            ) : isMember ? (
                                <UserCheck size={14} />
                            ) : (
                                <UserPlus size={14} />
                            )}
                            {isMember ? 'Você é membro' : 'Entrar'}
                        </button>
                    </div>
                </div>

                {/* Mensagens */}
                <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 space-y-3">
                    {messages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-2 py-16 opacity-60">
                            <MessageCircle size={32} style={{ color: colors.textSecondary }} />
                            <p className="text-sm" style={{ color: colors.textSecondary }}>
                                Nenhuma mensagem ainda. Seja o primeiro a falar!
                            </p>
                        </div>
                    ) : (
                        messages.map((message) => {
                            const isMine = message.profile_id === currentUserId
                            const senderAvatar = message.profiles?.avatar_url ? getAvatarUrl(supabase, message.profiles.avatar_url) : null
                            return (
                                <div key={message.id} className={`flex gap-2 ${isMine ? 'flex-row-reverse' : ''}`}>
                                    <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0" style={{ background: `${colors.border}60` }}>
                                        {senderAvatar ? (
                                            <img src={senderAvatar} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-xs font-bold" style={{ color: colors.textSecondary }}>
                                                {message.profiles?.name?.charAt(0).toUpperCase() || '?'}
                                            </div>
                                        )}
                                    </div>
                                    <div className={`max-w-[75%] ${isMine ? 'items-end' : 'items-start'} flex flex-col`}>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold" style={{ color: colors.textPrimary }}>
                                                {message.profiles?.name || 'Usuário'}
                                            </span>
                                            <span className="text-[10px]" style={{ color: colors.textSecondary }}>
                                                {formatDistanceToNow(new Date(message.created_at), { addSuffix: true, locale: ptBR })}
                                            </span>
                                        </div>
                                        <div
                                            className="rounded-2xl px-3 py-2 mt-1 text-sm"
                                            style={
                                                isMine
                                                    ? { background: GRADIENT, color: '#fff' }
                                                    : { background: colors.surface, color: colors.textPrimary, border: `1px solid ${colors.border}` }
                                            }
                                        >
                                            {message.content}
                                        </div>
                                    </div>
                                </div>
                            )
                        })
                    )}
                    <div ref={bottomRef} />
                </div>

                {/* Composer */}
                <div className="px-4 md:px-6 pb-24 pt-2 sticky bottom-0" style={{ background: `${colors.background}dd`, backdropFilter: 'blur(8px)' }}>
                    {!currentUserId ? (
                        <div className="rounded-xl p-3 text-center" style={{ background: colors.surface, border: `1px dashed ${colors.border}` }}>
                            <button
                                onClick={() => router.push('/login')}
                                className="text-sm font-bold hover:underline inline-flex items-center gap-1"
                                style={{ color: colors.accent }}
                            >
                                <LogIn size={16} /> Faça login para conversar
                            </button>
                        </div>
                    ) : !isMember ? (
                        <div className="rounded-xl p-3 text-center text-sm" style={{ background: colors.surface, border: `1px dashed ${colors.border}`, color: colors.textSecondary }}>
                            Entre na comunidade pra poder mandar mensagem
                        </div>
                    ) : (
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={messageInput}
                                onChange={(e) => setMessageInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault()
                                        handleSend()
                                    }
                                }}
                                placeholder="Escreva uma mensagem..."
                                disabled={sending}
                                className="flex-1 rounded-xl py-2.5 px-4 text-sm focus:outline-none"
                                style={{ background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                            />
                            <button
                                onClick={handleSend}
                                disabled={!messageInput.trim() || sending}
                                className="px-4 py-2.5 rounded-xl transition-all hover:scale-105 disabled:opacity-50 flex items-center justify-center"
                                style={{ background: GRADIENT, color: '#fff' }}
                            >
                                {sending ? <Spinner size={18} /> : <Send size={18} />}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
