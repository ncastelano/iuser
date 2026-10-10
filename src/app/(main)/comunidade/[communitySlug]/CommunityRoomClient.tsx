// app/(main)/comunidade/[communitySlug]/CommunityRoomClient.tsx
'use client'

import LinkPreviewCard from '@/components/communities/LinkPreviewCard'
import { extractFirstUrl, linkify } from '@/lib/linkify'
import { profileLabel } from '@/lib/profileDisplay'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { Spinner } from '@/components/Spinner'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import Header from '@/components/Header'
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
    Lock,
    MoreHorizontal,
    Pencil,
    Trash2,
    X,
} from 'lucide-react'
import PlanAvatarRing from '@/components/PlanAvatarRing'
import CommunityPhotoCampaign from '@/components/communities/CommunityPhotoCampaign'
import { fetchCommunitiesActivity, type CommunityActivity } from '@/lib/communityActivity'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

interface Community {
    id: string
    slug: string
    name: string
    city: string
    description: string | null
    creator_id: string
    image_url: string | null
    kind: 'place' | 'custom'
    requires_password: boolean
}

interface CommunityMessage {
    id: string
    content: string
    created_at: string
    edited_at?: string | null
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
    const { userId: currentUserId, avatarUrl, bgMode, customBgUrl, profileSlug, loading: profileLoading } = useProfile()
    const bottomRef = useRef<HTMLDivElement>(null)

    const communitySlug = Array.isArray(params.communitySlug) ? params.communitySlug[0] : params.communitySlug

    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [community, setCommunity] = useState<Community | null>(null)
    const [memberCount, setMemberCount] = useState(0)
    const [isMember, setIsMember] = useState(false)
    const [joining, setJoining] = useState(false)
    const [messages, setMessages] = useState<CommunityMessage[]>([])
    const [messageInput, setMessageInput] = useState('')
    const [sending, setSending] = useState(false)
    // Foto da comunidade: tocar nela abre a campanha de troca (votação) no lugar do texto do cartão
    const [showCampaign, setShowCampaign] = useState(false)
    const [password, setPassword] = useState('')
    const photoInputRef = useRef<HTMLInputElement>(null)
    const [activity, setActivity] = useState<CommunityActivity | null>(null)
    // Menu "mais" da minha mensagem: editar ou excluir
    const [menuId, setMenuId] = useState<string | null>(null)
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editText, setEditText] = useState('')
    const [savingEdit, setSavingEdit] = useState(false)

    const loadRoom = useCallback(async () => {
        if (!communitySlug) return
        setLoading(true)
        setError(null)
        try {
            const { data: communityData, error: communityErr } = await supabase
                .from('communities')
                .select('id, slug, name, city, description, creator_id, image_url, kind, requires_password')
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

            if (currentUserId) {
                const { data: membership } = await supabase
                    .from('community_members')
                    .select('id')
                    .eq('community_id', communityData.id)
                    .eq('profile_id', currentUserId)
                    .maybeSingle()
                setIsMember(!!membership)
            }

            const { data: messagesData, error: messagesErr } = await supabase
                .from('community_messages')
                .select('id, content, created_at, edited_at, profile_id, profiles(name, avatar_url, "profileSlug")')
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
    }, [communitySlug, currentUserId])

    useEffect(() => {
        loadRoom()
    }, [loadRoom])

    // Tem votação de foto acontecendo? (aparece pra todo mundo, inclusive visitante)
    useEffect(() => {
        if (!community?.id || community.kind !== 'place') return
        let cancelled = false
        fetchCommunitiesActivity([community.id]).then((r) => { if (!cancelled) setActivity(r[community.id] || null) })
        return () => { cancelled = true }
    }, [community?.id, community?.kind, showCampaign])

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
            const { error } = await supabase.rpc('join_community', { p_community: community.id, p_password: community.requires_password ? password : null })

            if (error) throw error

            setPassword('')
            setIsMember(true)
            setMemberCount((prev) => prev + 1)
            toast.success(`Você entrou em ${community.name}!`)
        } catch (err: any) {
            toast.error('Erro ao entrar na comunidade: ' + (err.message || 'tente novamente'))
        } finally {
            setJoining(false)
        }
    }

    // Comunidade criada por alguém: o criador troca a foto direto (as de lugar mudam pela votação)
    const changeOwnPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        e.target.value = ''
        if (!file || !community || !currentUserId) return
        if (!file.type.startsWith('image/')) { toast.error('Escolha uma imagem'); return }
        if (file.size > 6 * 1024 * 1024) { toast.error('A imagem pode ter até 6 MB'); return }
        try {
            const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
            const path = `${currentUserId}/${community.id}-${Date.now()}.${ext}`
            const { error: upErr } = await supabase.storage.from('community-photos').upload(path, file, { contentType: file.type })
            if (upErr) throw upErr
            const url = supabase.storage.from('community-photos').getPublicUrl(path).data.publicUrl
            const { error } = await supabase.rpc('set_community_image', { p_community: community.id, p_image_url: url })
            if (error) throw error
            setCommunity({ ...community, image_url: url })
            toast.success('Foto da comunidade atualizada')
        } catch (err: any) {
            toast.error(err.message || 'Não foi possível trocar a foto')
        }
    }

    // Editar a própria mensagem (o banco só deixa editar o texto das suas)
    const saveEdit = async () => {
        const id = editingId
        const text = editText.trim()
        if (!id || !text) return
        setSavingEdit(true)
        const { data, error } = await supabase
            .from('community_messages')
            .update({ content: text })
            .eq('id', id)
            .select('content, edited_at')
            .single()
        setSavingEdit(false)
        if (error) { toast.error('Não foi possível editar: ' + error.message); return }
        setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, content: data.content, edited_at: data.edited_at } : m)))
        setEditingId(null)
        toast.success('Mensagem editada')
    }

    // Apagar a própria mensagem (o banco só deixa apagar as suas)
    const deleteMessage = async (messageId: string) => {
        const { error } = await supabase.from('community_messages').delete().eq('id', messageId)
        if (error) { toast.error('Não foi possível excluir: ' + error.message); return }
        setMessages((prev) => prev.filter((m) => m.id !== messageId))
        toast.success('Mensagem excluída')
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
                .select('id, content, created_at, edited_at, profile_id, profiles(name, avatar_url, "profileSlug")')
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
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ background: colors.background }}>
                <div className="text-center">
                    <Spinner size={48} color={colors.accent} className="mx-auto mb-4" />
                    <p className="text-sm font-bold" style={{ color: colors.textSecondary }}>Carregando comunidade...</p>
                </div>
            </div>
        )
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
                        {/* Foto da comunidade, do lado esquerdo. Tocar nela abre a campanha de troca (nada muda na hora) */}
                        {(() => {
                            const canChange = community.kind === 'place' || community.creator_id === currentUserId
                            const thumb = (
                                <span className="relative block w-16 h-16 rounded-2xl overflow-hidden flex-shrink-0" style={{ background: GRADIENT }}>
                                    {community.image_url ? (
                                        <img src={community.image_url} alt={community.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="w-full h-full flex items-center justify-center text-white"><MapPin size={26} /></span>
                                    )}
                                </span>
                            )
                            if (!canChange) return thumb
                            if (community.kind === 'custom') {
                                return (
                                    <>
                                        <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={changeOwnPhoto} />
                                        <button onClick={() => photoInputRef.current?.click()} aria-label="Trocar a foto da comunidade" title="Trocar a foto" className="flex-shrink-0 transition hover:scale-105">
                                            {thumb}
                                        </button>
                                    </>
                                )
                            }
                            return (
                                <button onClick={() => setShowCampaign((v) => !v)} aria-label="Trocar a foto da comunidade" title="Trocar a foto" className="flex-shrink-0 transition hover:scale-105">
                                    {thumb}
                                </button>
                            )
                        })()}

                        {showCampaign && community.kind === 'place' ? (
                            <CommunityPhotoCampaign
                                communityId={community.id}
                                userId={currentUserId}
                                onClose={async () => {
                                    setShowCampaign(false)
                                    // A foto pode ter mudado à meia-noite: atualiza só ela
                                    const { data } = await supabase.from('communities').select('image_url').eq('id', community.id).maybeSingle()
                                    if (data) setCommunity((prev) => (prev ? { ...prev, image_url: data.image_url } : prev))
                                }}
                                onLoginNeeded={() => router.push('/login?redirect=' + encodeURIComponent(`/comunidade/${community.slug}`))}
                            />
                        ) : (
                            <>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs flex items-center gap-1" style={{ color: colors.accent }}>
                                        <MapPin size={12} /> {community.city}
                                        {community.requires_password && <Lock size={11} className="ml-1" />}
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
                                {!(community.requires_password && !isMember) && (
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
                                )}
                            </>
                        )}
                    </div>

                    {/* Evento: votação da foto da comunidade acontecendo (visível pra todos) */}
                    {community.kind === 'place' && activity?.photoVoteActive && !showCampaign && (
                        <button
                            onClick={() => setShowCampaign(true)}
                            className="mt-3 w-full flex items-center gap-3 rounded-2xl px-3 py-2.5 border text-left transition hover:scale-[1.01]"
                            style={{ background: '#f9731612', borderColor: '#f97316' }}
                        >
                            <span className="flex -space-x-2 flex-shrink-0">
                                {activity.photoThumbs.map((u, i) => (
                                    <img key={u + i} src={u} alt="" className="w-9 h-9 rounded-lg object-cover border-2" style={{ borderColor: colors.surface }} />
                                ))}
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-sm font-black" style={{ color: colors.textPrimary }}>Votação da foto da comunidade acontecendo</span>
                                <span className="block text-[11px]" style={{ color: colors.textSecondary }}>
                                    {activity.photoCandidates} {activity.photoCandidates === 1 ? 'foto' : 'fotos'} concorrendo hoje · toque pra ver
                                </span>
                            </span>
                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 animate-pulse" style={{ background: '#f97316' }} />
                        </button>
                    )}

                    {/* Comunidade com senha: só entra quem sabe a senha (e só membro lê as mensagens) */}
                    {community.requires_password && !isMember && (
                        <div className="mt-3 rounded-2xl p-4 border flex flex-col gap-2" style={{ background: colors.surface, borderColor: colors.border }}>
                            <p className="text-sm font-black flex items-center gap-1.5" style={{ color: colors.textPrimary }}>
                                <Lock size={14} /> Esta comunidade tem senha
                            </p>
                            <div className="flex gap-2">
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleJoin() }}
                                    placeholder="Senha da comunidade"
                                    className="flex-1 min-w-0 px-4 py-2.5 rounded-xl text-sm focus:outline-none"
                                    style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                                />
                                <button
                                    onClick={handleJoin}
                                    disabled={joining || !password}
                                    className="px-4 py-2.5 rounded-xl text-sm font-black text-white disabled:opacity-60"
                                    style={{ background: GRADIENT }}
                                >
                                    {joining ? <Spinner size={14} /> : 'Entrar'}
                                </button>
                            </div>
                        </div>
                    )}
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
                                    <PlanAvatarRing userId={message.profile_id}>
                                    <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0" style={{ background: `${colors.border}60` }}>
                                        {senderAvatar ? (
                                            <img src={senderAvatar} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-xs font-bold" style={{ color: colors.textSecondary }}>
                                                {(message.profiles?.profileSlug || message.profiles?.name)?.charAt(0).toUpperCase() || '?'}
                                            </div>
                                        )}
                                    </div>
                                    </PlanAvatarRing>
                                    <div className={`max-w-[75%] ${isMine ? 'items-end' : 'items-start'} flex flex-col`}>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold" style={{ color: colors.textPrimary }}>
                                                {profileLabel(message.profiles)}
                                            </span>
                                            <span className="text-[10px]" style={{ color: colors.textSecondary }}>
                                                {formatDistanceToNow(new Date(message.created_at), { addSuffix: true, locale: ptBR })}
                                            </span>
                                            {isMine && (
                                                <div className="relative">
                                                    <button
                                                        onClick={() => { setMenuId(menuId === message.id ? null : message.id); setConfirmDeleteId(null) }}
                                                        aria-label="Mais opções da mensagem"
                                                        title="Mais opções"
                                                        className="w-7 h-7 rounded-full flex items-center justify-center transition hover:scale-110"
                                                        style={{ background: `${colors.border}50`, color: colors.textSecondary }}
                                                    >
                                                        <MoreHorizontal size={15} />
                                                    </button>
                                                    {menuId === message.id && (
                                                        <>
                                                            <div className="fixed inset-0 z-30" onClick={() => { setMenuId(null); setConfirmDeleteId(null) }} />
                                                            <div
                                                                className="absolute z-40 top-8 right-0 min-w-[170px] rounded-xl p-1.5 shadow-xl"
                                                                style={{ background: colors.surface, border: `1px solid ${colors.border}` }}
                                                            >
                                                                {confirmDeleteId === message.id ? (
                                                                    <div className="p-1.5 flex flex-col gap-1.5">
                                                                        <p className="text-xs font-bold" style={{ color: colors.textPrimary }}>Excluir esta mensagem?</p>
                                                                        <div className="flex gap-1.5">
                                                                            <button
                                                                                onClick={() => { setMenuId(null); setConfirmDeleteId(null); deleteMessage(message.id) }}
                                                                                className="flex-1 px-3 py-1.5 rounded-full text-xs font-black text-white"
                                                                                style={{ background: '#ef4444' }}
                                                                            >
                                                                                Excluir
                                                                            </button>
                                                                            <button
                                                                                onClick={() => setConfirmDeleteId(null)}
                                                                                className="flex-1 px-3 py-1.5 rounded-full text-xs font-bold"
                                                                                style={{ color: colors.textSecondary, border: `1px solid ${colors.border}` }}
                                                                            >
                                                                                Voltar
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <>
                                                                        <button
                                                                            onClick={() => { setEditingId(message.id); setEditText(message.content); setMenuId(null) }}
                                                                            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold text-left hover:bg-black/5"
                                                                            style={{ color: colors.textPrimary }}
                                                                        >
                                                                            <Pencil size={14} /> Editar
                                                                        </button>
                                                                        <button
                                                                            onClick={() => setConfirmDeleteId(message.id)}
                                                                            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold text-left hover:bg-red-500/10"
                                                                            style={{ color: '#ef4444' }}
                                                                        >
                                                                            <Trash2 size={14} /> Excluir
                                                                        </button>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        {editingId === message.id ? (
                                            <div className="mt-1 w-full min-w-[220px] rounded-2xl p-2 flex flex-col gap-2" style={{ background: colors.surface, border: `1px solid ${colors.accent}` }}>
                                                <textarea
                                                    value={editText}
                                                    onChange={(e) => setEditText(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit() }
                                                        if (e.key === 'Escape') setEditingId(null)
                                                    }}
                                                    rows={2}
                                                    maxLength={1000}
                                                    autoFocus
                                                    disabled={savingEdit}
                                                    className="w-full resize-none rounded-xl px-3 py-2 text-sm focus:outline-none"
                                                    style={{ background: `${colors.border}25`, color: colors.textPrimary }}
                                                />
                                                <div className="flex justify-end gap-2">
                                                    <button onClick={() => setEditingId(null)} disabled={savingEdit} className="px-3 py-1.5 rounded-full text-xs font-bold" style={{ color: colors.textSecondary, border: `1px solid ${colors.border}` }}>
                                                        Cancelar
                                                    </button>
                                                    <button onClick={saveEdit} disabled={savingEdit || !editText.trim()} className="px-3 py-1.5 rounded-full text-xs font-black text-white disabled:opacity-60" style={{ background: GRADIENT }}>
                                                        {savingEdit ? '...' : 'Salvar'}
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className={`flex flex-col gap-1.5 mt-1 ${isMine ? 'items-end' : 'items-start'}`}>
                                                <div
                                                    className="rounded-2xl px-3 py-2 text-sm break-words whitespace-pre-wrap max-w-full"
                                                    style={
                                                        isMine
                                                            ? { background: GRADIENT, color: '#fff' }
                                                            : { background: colors.surface, color: colors.textPrimary, border: `1px solid ${colors.border}` }
                                                    }
                                                >
                                                    {linkify(message.content, { color: isMine ? '#fff' : colors.accent })}
                                                    {message.edited_at && (
                                                        <span className="ml-1.5 text-[10px] opacity-70">(editada)</span>
                                                    )}
                                                </div>
                                                {(() => {
                                                    const url = extractFirstUrl(message.content)
                                                    return url ? (
                                                        <div className="w-full max-w-[320px]"><LinkPreviewCard url={url} /></div>
                                                    ) : null
                                                })()}
                                            </div>
                                        )}
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
                        /* Visitante lê a conversa à vontade; na hora de escrever é que pede o login (e volta pra cá) */
                        <div className="flex gap-2">
                            <input
                                type="text"
                                readOnly
                                onFocus={() => router.push(`/login?redirect=${encodeURIComponent(window.location.pathname)}`)}
                                onClick={() => router.push(`/login?redirect=${encodeURIComponent(window.location.pathname)}`)}
                                placeholder="Entre para escrever uma mensagem..."
                                className="flex-1 rounded-xl py-2.5 px-4 text-sm focus:outline-none cursor-pointer"
                                style={{ background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                            />
                            <button
                                onClick={() => router.push(`/login?redirect=${encodeURIComponent(window.location.pathname)}`)}
                                className="px-4 py-2.5 rounded-xl transition-all hover:scale-105 flex items-center justify-center gap-1.5 text-sm font-black"
                                style={{ background: GRADIENT, color: '#fff' }}
                            >
                                <LogIn size={16} /> Entrar
                            </button>
                        </div>
                    ) : !isMember ? (
                        <div className="rounded-xl p-3 text-center text-sm" style={{ background: colors.surface, border: `1px dashed ${colors.border}`, color: colors.textSecondary }}>
                            Entre na comunidade pra poder mandar mensagem
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {/* Colou um link: o cartão aparece antes de enviar, como no WhatsApp */}
                            {extractFirstUrl(messageInput) && (
                                <div className="max-w-[360px]"><LinkPreviewCard url={extractFirstUrl(messageInput)!} compact /></div>
                            )}
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
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
