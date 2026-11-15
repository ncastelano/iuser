// app/(main)/comunidade/[communitySlug]/CommunityRoomClient.tsx
'use client'

import ReportButton from '@/components/moderation/ReportButton'
import { useInsideShell } from '@/components/InsideShell'
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
import { toast } from '@/lib/toast'
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
import ShareCardView from '@/components/chat/ShareCardView'
import ShareSheet from '@/components/chat/ShareSheet'
import ChatLinkPreviews from '@/components/chat/ChatLinkPreviews'
import { firstDisallowedLink, isAllowedChatLink, urlsIn, withoutPreviewedUrls, withoutUrls } from '@/lib/chatLinks'
import { SHARE_DEFAULT_TEXT, cardKeyOf, fetchShareCards, isDefaultShareText, refColumns, type ShareCard } from '@/lib/shareCards'
import CommunityPhotoCampaign from '@/components/communities/CommunityPhotoCampaign'
import { fetchCommunitiesActivity, type CommunityActivity } from '@/lib/communityActivity'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'
const MESSAGE_SELECT = 'id, content, created_at, edited_at, profile_id, ref_product_id, ref_store_id, ref_profile_id, reply_to_id, profiles!profile_id(name, avatar_url, "profileSlug")'
// Conversa ao vivo: quem está na sala avisa as mensagens na hora (broadcast) e, por garantia, a sala confere as novas a cada
// POLL_MS e refaz a lista inteira a cada RESYNC_MS (pega edições e exclusões).
const POLL_MS = 1500
const RESYNC_MS = 20000
const TYPING_IDLE_MS = 3000
const normalizeMessage = (m: any): CommunityMessage => ({ ...m, profiles: Array.isArray(m.profiles) ? m.profiles[0] : m.profiles })

interface Typer { key: string; name: string; avatar: string | null }

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
    ref_product_id?: string | null
    ref_store_id?: string | null
    ref_profile_id?: string | null
    reply_to_id?: string | null
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
    // v3: a sala ocupa a área abaixo da navbar e não rola; voltar, nome, cidade e info ficam parados e só as mensagens rolam
    const v3 = useInsideShell()

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
    // Loja, serviço, produto, publicação e perfil compartilhados na conversa viram cartões
    const [shareCards, setShareCards] = useState<Record<string, ShareCard>>({})
    const [shareOpen, setShareOpen] = useState(false)
    const [pending, setPending] = useState<ShareCard | null>(null)
    // Responder a outra mensagem da comunidade (a citação aparece em cima da resposta)
    const [replyTo, setReplyTo] = useState<CommunityMessage | null>(null)
    const [flashId, setFlashId] = useState<string | null>(null)
    // Ao vivo: quem está escrevendo agora, o canal da sala e a rolagem (a conversa só desce sozinha se a pessoa já está no fim)
    const [typers, setTypers] = useState<Typer[]>([])
    const channelRef = useRef<any>(null)
    const channelReadyRef = useRef(false)
    const typingRef = useRef(false)
    const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const messagesRef = useRef<CommunityMessage[]>([])
    const scrollRef = useRef<HTMLDivElement>(null)
    const contentRef = useRef<HTMLDivElement>(null)
    const atBottomRef = useRef(true)
    const [newBelow, setNewBelow] = useState(false)

    // Só a PRIMEIRA carga mostra o "carregando" (que desmonta a conversa): quando a conta termina de carregar, `currentUserId` muda e a sala é
    // recarregada por baixo — sem desmontar a lista, senão a conversa voltava para o começo sozinha depois de alguns segundos.
    const firstLoadRef = useRef(true)
    const loadRoom = useCallback(async () => {
        if (!communitySlug) return
        if (firstLoadRef.current) setLoading(true)
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
                .select(MESSAGE_SELECT)
                .eq('community_id', communityData.id)
                .order('created_at', { ascending: true })

            if (messagesErr) throw messagesErr

            const loaded = (messagesData || []).map((m: any) => ({
                ...m,
                profiles: Array.isArray(m.profiles) ? m.profiles[0] : m.profiles,
            }))
            setMessages(loaded)
            fetchShareCards(loaded).then((c) => setShareCards((prev) => ({ ...prev, ...c })))
        } catch (err: any) {
            console.error('[CommunityRoom] Erro ao carregar sala:', err)
            setError(err.message || 'Comunidade não encontrada')
        } finally {
            firstLoadRef.current = false
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

    useEffect(() => { messagesRef.current = messages }, [messages])

    // Na 2.0 a sala não tem altura fixa: quem rola é a PÁGINA, não a lista (só na 3.0 a lista é a própria área de rolagem)
    const pageScrolls = () => {
        const el = scrollRef.current
        return !!el && el.scrollHeight - el.clientHeight < 4
    }
    const scrollToBottom = useCallback((smooth = true) => {
        const el = scrollRef.current
        if (!el) return
        if (el.scrollHeight - el.clientHeight < 4) window.scrollTo({ top: document.documentElement.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
        else el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
        atBottomRef.current = true
        setNewBelow(false)
    }, [])
    const onScrollList = () => {
        const el = scrollRef.current
        if (!el) return
        if (openedRef.current && el.scrollHeight - el.scrollTop - el.clientHeight > 200) userScrolledRef.current = true
        atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
        if (atBottomRef.current) setNewBelow(false)
    }

    // 2.0: a página rola (não a lista) — acompanha se a pessoa está no fim da página
    useEffect(() => {
        const onWin = () => {
            if (!pageScrolls()) return
            const dist = document.documentElement.scrollHeight - window.scrollY - window.innerHeight
            if (openedRef.current && dist > 200) userScrolledRef.current = true
            atBottomRef.current = dist < 120
            if (atBottomRef.current) setNewBelow(false)
        }
        window.addEventListener('scroll', onWin, { passive: true })
        return () => window.removeEventListener('scroll', onWin)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Fotos e cartões carregam depois das mensagens e esticam a conversa: quem está no fim continua no fim
    useEffect(() => {
        const content = contentRef.current
        if (!content || typeof ResizeObserver === 'undefined') return
        const ro = new ResizeObserver(() => {
            const el = scrollRef.current
            if (!el || !atBottomRef.current) return
            if (pageScrolls()) window.scrollTo(0, document.documentElement.scrollHeight)
            else el.scrollTop = el.scrollHeight
        })
        ro.observe(content)
        return () => ro.disconnect()
    }, [loading])

    // Chegou mensagem (ou alguém começou a escrever): se a pessoa está no fim, a conversa desce junto; senão avisa "novas mensagens"
    const lastCountRef = useRef(0)
    useEffect(() => {
        const before = lastCountRef.current
        const grew = messages.length > before
        const lastMine = messages[messages.length - 1]?.profile_id === currentUserId
        lastCountRef.current = messages.length
        if (messages.length === 0) return
        // primeira carga: vai direto ao fim; depois, desce suave
        if (atBottomRef.current || lastMine) scrollToBottom(before > 0 && grew)
        else if (grew) setNewBelow(true)
    }, [messages, currentUserId, scrollToBottom])
    useEffect(() => { if (typers.length > 0 && atBottomRef.current) scrollToBottom() }, [typers.length, scrollToBottom])

    // Ao ENTRAR na conversa: abre na última mensagem. As mensagens chegam antes de a lista existir na tela (ela só aparece quando `loading`
    // acaba), então o efeito acima não achava a lista para rolar e a sala abria no começo; aqui rola assim que a lista aparece e de novo quando
    // as fotos e cartões esticam a conversa (a pessoa ainda não mexeu no scroll).
    const openedRef = useRef(false)
    const userScrolledRef = useRef(false)
    useEffect(() => {
        if (loading || openedRef.current || messages.length === 0) return
        openedRef.current = true
        atBottomRef.current = true
        const go = () => { if (!userScrolledRef.current) scrollToBottom(false) }
        go()
        const timers = [60, 250, 800, 1800].map((ms) => setTimeout(go, ms))
        return () => timers.forEach(clearTimeout)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loading, messages.length, scrollToBottom])

    // ----- ao vivo: mensagens novas, edições/exclusões e "escrevendo..." -----
    const readable = !!community && (!community.requires_password || isMember)
    const fetchNewMessages = useCallback(async () => {
        const cid = community?.id
        if (!cid || document.hidden) return
        const last = messagesRef.current[messagesRef.current.length - 1]?.created_at
        let q = supabase.from('community_messages').select(MESSAGE_SELECT).eq('community_id', cid).order('created_at', { ascending: true })
        if (last) q = q.gt('created_at', last)
        const { data } = await q
        if (!data || data.length === 0) return
        const fresh = data.map(normalizeMessage)
        setMessages((prev) => {
            const ids = new Set(prev.map((m) => m.id))
            const add = fresh.filter((m) => !ids.has(m.id))
            return add.length ? [...prev, ...add] : prev
        })
        fetchShareCards(fresh).then((c) => setShareCards((prev) => ({ ...prev, ...c })))
    }, [community?.id])

    const resyncMessages = useCallback(async () => {
        const cid = community?.id
        if (!cid || document.hidden) return
        const { data } = await supabase.from('community_messages').select(MESSAGE_SELECT).eq('community_id', cid).order('created_at', { ascending: true })
        if (!data) return
        const all = data.map(normalizeMessage)
        // só troca a lista se algo mudou (texto, edição, exclusão ou mensagem nova), para não mexer na tela à toa
        const sig = (l: CommunityMessage[]) => l.map((m) => `${m.id}:${m.edited_at || ''}:${m.content.length}`).join('|')
        setMessages((prev) => (sig(prev) === sig(all) ? prev : all))
        fetchShareCards(all).then((c) => setShareCards((prev) => ({ ...prev, ...c })))
    }, [community?.id])

    useEffect(() => {
        if (!readable) return
        const a = setInterval(fetchNewMessages, POLL_MS)
        const b = setInterval(resyncMessages, RESYNC_MS)
        const onVisible = () => { if (!document.hidden) fetchNewMessages() }
        document.addEventListener('visibilitychange', onVisible)
        return () => { clearInterval(a); clearInterval(b); document.removeEventListener('visibilitychange', onVisible) }
    }, [readable, fetchNewMessages, resyncMessages])

    const myName = profileSlug ? `@${profileSlug}` : 'Alguém'
    useEffect(() => {
        const cid = community?.id
        if (!cid || !readable) return
        const presenceKey = currentUserId || `visitante-${Math.random().toString(36).slice(2)}`
        const channel = supabase.channel(`community-room:${cid}`, { config: { presence: { key: presenceKey }, broadcast: { self: false } } })
        channelRef.current = channel
        channelReadyRef.current = false
        channel
            .on('presence', { event: 'sync' }, () => {
                const state = channel.presenceState() as Record<string, { typing?: boolean; name?: string; avatar?: string | null }[]>
                setTypers(
                    Object.entries(state)
                        .filter(([key]) => key !== presenceKey)
                        .map(([key, metas]) => ({ key, meta: metas[metas.length - 1] }))
                        .filter((x) => x.meta?.typing)
                        .map((x) => ({ key: x.key, name: x.meta?.name || 'Alguém', avatar: x.meta?.avatar || null })),
                )
            })
            .on('broadcast', { event: 'msg' }, () => { fetchNewMessages() })
            .on('broadcast', { event: 'sync' }, () => { resyncMessages() })
            .subscribe((status: string) => {
                if (status !== 'SUBSCRIBED') return
                channelReadyRef.current = true
                if (currentUserId && isMember) channel.track({ typing: false, name: myName, avatar: avatarUrl || null })
            })
        return () => {
            channelReadyRef.current = false
            channelRef.current = null
            if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
            typingRef.current = false
            setTypers([])
            supabase.removeChannel(channel)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [community?.id, readable, currentUserId, isMember])

    const setTyping = useCallback((on: boolean) => {
        if (typingTimerRef.current) { clearTimeout(typingTimerRef.current); typingTimerRef.current = null }
        if (on) typingTimerRef.current = setTimeout(() => setTyping(false), TYPING_IDLE_MS)
        if (typingRef.current === on) return
        typingRef.current = on
        if (channelReadyRef.current && currentUserId && isMember) channelRef.current?.track({ typing: on, name: myName, avatar: avatarUrl || null })
    }, [currentUserId, isMember, myName, avatarUrl])
    const tellRoom = (event: 'msg' | 'sync') => { if (channelReadyRef.current) channelRef.current?.send({ type: 'broadcast', event, payload: {} }) }

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
        if (firstDisallowedLink(text)) { toast.error('Só dá para enviar link de imagem ou link do iUser.'); return }
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
        tellRoom('sync')
        setEditingId(null)
        toast.success('Mensagem editada')
    }

    // Apagar a própria mensagem (o banco só deixa apagar as suas)
    const deleteMessage = async (messageId: string) => {
        const { error } = await supabase.from('community_messages').delete().eq('id', messageId)
        if (error) { toast.error('Não foi possível excluir: ' + error.message); return }
        setMessages((prev) => prev.filter((m) => m.id !== messageId))
        tellRoom('sync')
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
        if ((!messageInput.trim() && !pending) || !community) return
        if (firstDisallowedLink(messageInput)) { toast.error('Só dá para enviar link de imagem ou link do iUser.'); return }

        setSending(true)
        try {
            const { data, error } = await supabase
                .from('community_messages')
                .insert({
                    community_id: community.id,
                    profile_id: currentUserId,
                    content: messageInput.trim() || (pending ? SHARE_DEFAULT_TEXT[pending.kind] : ''),
                    ...(pending ? refColumns(pending) : {}),
                    ...(replyTo ? { reply_to_id: replyTo.id } : {}),
                })
                .select(MESSAGE_SELECT)
                .single()

            if (error) throw error

            setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, normalizeMessage(data)]))
            setTyping(false)
            tellRoom('msg')
            if (pending) setShareCards((prev) => ({ ...prev, [`${pending.kind === 'store' ? 'store' : pending.kind === 'profile' ? 'profile' : 'product'}:${pending.id}`]: pending }))
            setPending(null)
            setReplyTo(null)
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
        <div className={v3 ? 'fixed inset-x-0 bottom-[var(--staging-banner-h,0px)] top-[var(--shell-top,0px)] rounded-t-[28px] overflow-hidden flex flex-col' : 'relative min-h-dvh flex flex-col'} style={{ background: colors.background }}>
            {!v3 && (
                <div className="fixed inset-0 z-0">
                    <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
                </div>
            )}

            <div className={v3 ? 'relative z-10 flex flex-col h-full min-h-0 w-full max-w-3xl mx-auto' : 'relative z-10 flex flex-col min-h-dvh'}>
                <div className={v3 ? 'flex-shrink-0 max-h-[55%] overflow-y-auto pt-4 px-0' : ''}>
                <div className={v3 ? 'px-4' : ''}>
                <Header
                    title={community.name}
                    showBack={true}
                    onBack={() => router.push('/comunidade')}
                    greeting={`Olá, ${profileLoading ? '...' : profileSlug ? `@${profileSlug}` : 'Visitante'}`}
                    avatarUrl={avatarUrl}
                    loading={profileLoading}
                />
                </div>

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

                </div>

                {/* Mensagens */}
                <div className="relative flex-1 min-h-0 flex flex-col">
                <div ref={scrollRef} onScroll={onScrollList} className="flex-1 min-h-0 overflow-y-auto px-4 md:px-6 py-4">
                <div ref={contentRef} className="space-y-3">
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
                                <div key={message.id} id={`msg-${message.id}`} className={`flex gap-2 rounded-2xl transition-colors duration-700 ${isMine ? 'flex-row-reverse' : ''}`} style={flashId === message.id ? { background: `${colors.accent}22` } : undefined}>
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
                                            {!isMine && <ReportButton type="community_message" id={message.id} authorId={message.profile_id} size={12} className="opacity-70" />}
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
                                                {(() => {
                                                    const quoted = message.reply_to_id ? messages.find((x) => x.id === message.reply_to_id) : null
                                                    if (!quoted) return null
                                                    const quotedCardKey = cardKeyOf(quoted)
                                                    const snippet = withoutUrls(quoted.content) || (urlsIn(quoted.content).some((u) => isAllowedChatLink(u)) ? 'Imagem ou link' : quoted.content)
                                                    return (
                                                        <button
                                                            onClick={() => { const el = document.getElementById(`msg-${quoted.id}`); el?.scrollIntoView({ block: 'center', behavior: 'smooth' }); setFlashId(quoted.id); setTimeout(() => setFlashId(null), 1800) }}
                                                            className="w-full max-w-[320px] text-left rounded-xl px-3 py-1.5 border-l-4"
                                                            style={{ background: `${colors.border}30`, borderColor: colors.accent, color: colors.textPrimary }}
                                                        >
                                                            <span className="block text-[11px] font-black" style={{ color: colors.accent }}>{profileLabel(quoted.profiles)}</span>
                                                            <span className="block text-xs line-clamp-2" style={{ color: colors.textSecondary }}>{quotedCardKey && isDefaultShareText(quoted.content) ? quoted.content : snippet}</span>
                                                        </button>
                                                    )
                                                })()}
                                                {(() => {
                                                    const key = cardKeyOf(message)
                                                    const card = key ? shareCards[key] : null
                                                    return card ? (
                                                        <div className="w-full max-w-[320px] rounded-2xl overflow-hidden pt-2 pl-0 pr-0 pb-0" style={{ background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }}>
                                                            <ShareCardView card={card} colors={colors} />
                                                        </div>
                                                    ) : null
                                                })()}
                                                <div
                                                    className="rounded-2xl px-3 py-2 text-sm break-words whitespace-pre-wrap max-w-full"
                                                    hidden={(() => {
                                                        const k = cardKeyOf(message)
                                                        if (k && shareCards[k] && isDefaultShareText(message.content)) return true
                                                        return urlsIn(message.content).length > 0 && withoutPreviewedUrls(message.content) === ''
                                                    })()}
                                                    style={
                                                        isMine
                                                            ? { background: GRADIENT, color: '#fff' }
                                                            : { background: colors.surface, color: colors.textPrimary, border: `1px solid ${colors.border}` }
                                                    }
                                                >
                                                    {linkify(withoutPreviewedUrls(message.content) || message.content, { color: isMine ? '#fff' : colors.accent })}
                                                    {message.edited_at && (
                                                        <span className="ml-1.5 text-[10px] opacity-70">(editada)</span>
                                                    )}
                                                </div>
                                                <ChatLinkPreviews content={message.content} colors={colors} />
                                                {!!currentUserId && isMember && (
                                                    <button onClick={() => setReplyTo(message)} className="text-[11px] font-bold px-1 hover:underline" style={{ color: colors.accent }}>Responder</button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )
                        })
                    )}
                    {typers.length > 0 && (
                        <div className="flex items-center gap-2" aria-live="polite">
                            <span className="flex -space-x-2 flex-shrink-0">
                                {typers.slice(0, 3).map((t) => (
                                    <span key={t.key} className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center text-xs font-bold" style={{ background: `${colors.border}80`, color: colors.textSecondary, border: `2px solid ${colors.background}` }}>
                                        {t.avatar ? <img src={t.avatar} alt="" className="w-full h-full object-cover" /> : t.name.replace('@', '').charAt(0).toUpperCase()}
                                    </span>
                                ))}
                            </span>
                            <span className="rounded-2xl px-3 py-2.5 flex items-center gap-1" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                                <span className="typing-dot" /><span className="typing-dot" style={{ animationDelay: '.18s' }} /><span className="typing-dot" style={{ animationDelay: '.36s' }} />
                            </span>
                            <span className="text-[11px] font-bold truncate" style={{ color: colors.textSecondary }}>
                                {typers.length === 1 ? `${typers[0].name} está escrevendo...` : typers.length === 2 ? `${typers[0].name} e ${typers[1].name} estão escrevendo...` : `${typers.length} pessoas estão escrevendo...`}
                            </span>
                        </div>
                    )}
                    <div ref={bottomRef} />
                </div>
                </div>
                {newBelow && (
                    <button onClick={() => scrollToBottom()} className="absolute left-1/2 -translate-x-1/2 bottom-2 h-9 px-4 rounded-full text-xs font-black text-white shadow-lg transition active:scale-95" style={{ background: '#f97316' }}>
                        Novas mensagens ↓
                    </button>
                )}
                <style>{`
                    .typing-dot { width: 6px; height: 6px; border-radius: 9999px; background: ${colors.textSecondary}; display: inline-block; animation: typingDot 1s infinite ease-in-out; }
                    @keyframes typingDot { 0%, 60%, 100% { transform: translateY(0); opacity: .45; } 30% { transform: translateY(-4px); opacity: 1; } }
                    @media (prefers-reduced-motion: reduce) { .typing-dot { animation: none; } }
                `}</style>
                </div>

                {/* Composer */}
                <div className={v3 ? 'px-4 pb-3 pt-2 flex-shrink-0' : 'px-4 md:px-6 pb-24 pt-2 sticky bottom-0'} style={{ background: `${colors.background}dd`, backdropFilter: 'blur(8px)' }}>
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
                            {replyTo && (
                                <div className="flex items-start gap-2 rounded-xl px-3 py-2 border-l-4" style={{ background: `${colors.border}30`, borderColor: colors.accent }}>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[11px] font-black" style={{ color: colors.accent }}>Respondendo a {profileLabel(replyTo.profiles)}</p>
                                        <p className="text-xs line-clamp-1" style={{ color: colors.textSecondary }}>{withoutUrls(replyTo.content) || 'Imagem ou link'}</p>
                                    </div>
                                    <button onClick={() => setReplyTo(null)} aria-label="Cancelar resposta" className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${colors.border}50`, color: colors.textPrimary }}>×</button>
                                </div>
                            )}
                            {urlsIn(messageInput).length > 0 && (
                                firstDisallowedLink(messageInput)
                                    ? <p className="text-[11px] font-bold" style={{ color: '#ef4444' }}>Só dá para enviar link de imagem ou link do iUser.</p>
                                    : <ChatLinkPreviews content={messageInput} colors={colors} compact />
                            )}
                            {pending && (
                                <div className="flex items-start gap-2">
                                    <div className="flex-1 min-w-0 max-w-[360px] rounded-xl overflow-hidden" style={{ background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }}>
                                        <ShareCardView card={{ ...pending, href: '#' }} colors={colors} compact />
                                    </div>
                                    <button onClick={() => setPending(null)} aria-label="Tirar o item" className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${colors.border}50`, color: colors.textPrimary }}>×</button>
                                </div>
                            )}
                        <div className="flex gap-2">
                            <button onClick={() => setShareOpen(true)} aria-label="Compartilhar loja, serviço, publicação ou perfil" className="w-11 rounded-xl flex items-center justify-center text-lg font-black transition active:scale-95" style={{ background: colors.surface, border: `1px solid ${colors.border}`, color: '#f97316' }}>+</button>
                            <input
                                type="text"
                                value={messageInput}
                                onChange={(e) => { setMessageInput(e.target.value); setTyping(e.target.value.trim().length > 0) }}
                                onBlur={() => setTyping(false)}
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
                                disabled={(!messageInput.trim() && !pending) || sending || !!firstDisallowedLink(messageInput)}
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
            <ShareSheet open={shareOpen} onClose={() => setShareOpen(false)} onPick={setPending} colors={colors} />
        </div>
    )
}
