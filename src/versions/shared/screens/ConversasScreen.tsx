// app/(main)/conversas/page.tsx
//
// Sala de conversas. Duas "salas" no cabeçalho: a da PESSOA (aba do perfil, abre primeiro) e uma por LOJA que a pessoa
// tem. A da pessoa mostra todas as conversas dela (as que puxou e as que pessoas puxaram com ela); a da loja só as
// conversas daquela loja. Quem decide o que cada um pode ver é o banco (policies + get_my_conversations).
'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Camera, Eye, Film, Image as ImageIcon, MapPin, MessageCircle, Mic, Plus, Search, Send, Share2, Store as StoreIcon, User, Users, Video, Video as VideoIcon, X } from 'lucide-react'
import { canEdit as canEditMsg, canDeleteForAll, quotePreview, tickOf, reactionChips, matchesSearch, type ReactionRow } from '@/modules/chat/messageActions'
import { MessageMenu, QuoteBlock, ReactionChips, TickIcon } from '@/components/chat/MessageActions'
import { supabase } from '@/lib/supabase/client'
import { toast } from '@/lib/toast'
import { useProfile } from '@/app/contexts/ProfileContext'
import { useTheme } from '@/app/contexts/theme'
import PageTabs from '@/components/PageTabs'
import Header from '@/components/Header'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import GroupAvatar from '@/modules/chat/ui/GroupAvatar'
import NewConversationSheet from '@/modules/chat/ui/NewConversationSheet'
import GroupInfoSheet from '@/modules/chat/ui/GroupInfoSheet'
import { getMyGroupInvites, respondGroupInvite, type GroupInvite } from '@/modules/chat/api'
import PlanAvatarRing, { PlanRingInset } from '@/components/PlanAvatarRing'
import { Spinner } from '@/components/Spinner'
import { getAvatarUrl } from '@/lib/avatar'
import { notifyChatMessage } from '@/lib/notifyRideStatus'
import RequestCard, { type RequestRef } from '@/components/RequestCard'
import ShareCardView from '@/components/chat/ShareCardView'
import ShareSheet from '@/components/chat/ShareSheet'
import { SHARE_DEFAULT_TEXT, cardKeyOf, fetchShareCards, isDefaultShareText, refColumns, type ShareCard } from '@/lib/shareCards'
import { usePageLoadBar } from '@/hooks/usePageLoadBar'
import ChatLinkPreviews from '@/components/chat/ChatLinkPreviews'
import LinkPreviewCard from '@/components/communities/LinkPreviewCard'
import { urlsIn, iuserPath, isImageUrl } from '@/lib/chatLinks'
import { uploadToR2, r2Availability } from '@/lib/r2Upload'
import { PhotoBubble, VideoBubble, NormalAudio, OnceBubble, LocationBubble, LocationDurationSheet, useSenderLocation, useLocationRefresh, useVoiceRecorder, type MediaMessage } from '@/components/chat/DirectMediaParts'
import { CHAT_LIMITS, CHAT_UPLOAD_KIND, VIDEO_ACCEPT, PHOTO_ACCEPT, baseMime, mediaSeconds, fmtTime, type ChatMediaKind } from '@/lib/chatMedia'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

interface ConversationRow {
    id: string
    role: 'customer' | 'profile_owner' | 'store_owner'
    store_id: string | null
    last_message: string | null
    last_message_at: string | null
    last_sender_id: string | null
    unread: number
    other_id: string
    other_name: string | null
    other_slug: string | null
    other_avatar: string | null
    other_is_store: boolean
    /** Grupo: other_name é o nome do grupo e member_count quantas pessoas estão nele */
    is_group?: boolean
    member_count?: number
}

function otherLabel(r: { other_name: string | null; other_slug: string | null; other_is_store: boolean }, fallback = 'Conversa') {
    if (!r.other_is_store && r.other_slug) return `@${r.other_slug}`
    return r.other_name || fallback
}

interface MyStore { id: string; name: string; storeSlug: string; logoUrl: string | null }

interface Message { id: string; conversation_id: string; sender_id: string; content: string; created_at: string; ref_product_id?: string | null; ref_request_id?: string | null; ref_store_id?: string | null; ref_profile_id?: string | null; kind?: string; viewed_at?: string | null; loc_lat?: number | null; loc_lng?: number | null; loc_updated_at?: string | null; loc_expires_at?: string | null; loc_stopped?: boolean; view_once?: boolean; media_seconds?: number | null; reply_to_id?: string | null; edited_at?: string | null; deleted_at?: string | null }
// texto que o banco grava quando a foto/localização não tem legenda: não repete no balão
const MEDIA_DEFAULT_TEXT = ['Foto', 'Vídeo', 'Áudio', 'Localização ao vivo']
const MSG_COLS = 'id, conversation_id, sender_id, content, created_at, ref_product_id, ref_request_id, ref_store_id, ref_profile_id, kind, viewed_at, loc_lat, loc_lng, loc_updated_at, loc_expires_at, loc_stopped, view_once, media_seconds, reply_to_id, edited_at, deleted_at'

interface ProductRef { id: string; name: string; slug: string | null; image_url: string | null; owner_slug: string | null }

function timeLabel(iso: string | null) {
    if (!iso) return ''
    const d = new Date(iso)
    const now = new Date()
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1)
    if (d.toDateString() === yesterday.toDateString()) return 'ontem'
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function otherAvatarUrl(row: { other_avatar: string | null; other_is_store: boolean }) {
    if (!row.other_avatar) return null
    if (row.other_is_store) {
        return row.other_avatar.startsWith('http') ? row.other_avatar : supabase.storage.from('store-logos').getPublicUrl(row.other_avatar).data.publicUrl
    }
    return getAvatarUrl(supabase, row.other_avatar) || null
}


// ====================== FIO DE MENSAGENS ======================
function Thread({ conversation, userId, onBack, onRead, colors, modern = false, onOpenInfo, infoVersion = 0 }: {
    conversation: ConversationRow
    userId: string
    onBack: () => void
    onRead: () => void
    colors: any
    /** 3.0: sem bordas, avatares redondos, balões e campo em pílula */
    modern?: boolean
    /** Grupo: abre os dados do grupo (membros, convidar, sair) */
    onOpenInfo?: () => void
    /** Sobe quando os dados do grupo mudam (nome de quem escreve é recarregado) */
    infoVersion?: number
}) {
    const [messages, setMessages] = useState<Message[]>([])
    // Postagens (serviços) citadas nas mensagens: viram um cartão que abre a página do serviço
    const [refs, setRefs] = useState<Record<string, ProductRef>>({})
    // Pedidos de serviço citados: viram um cartão próprio (outro desenho do que o da postagem)
    const [requestRefs, setRequestRefs] = useState<Record<string, RequestRef>>({})
    // Cartões de loja, serviço, produto, publicação e perfil citados nas mensagens (dado público, uma chamada só)
    const [shareCards, setShareCards] = useState<Record<string, ShareCard>>({})
    const [shareOpen, setShareOpen] = useState(false)
    const [pending, setPending] = useState<ShareCard | null>(null)
    const [loading, setLoading] = useState(true)
    usePageLoadBar(loading)
    // Grupo: nome de quem escreveu cada mensagem
    const [senderNames, setSenderNames] = useState<Record<string, string>>({})
    const [text, setText] = useState('')
    const [sending, setSending] = useState(false)
    const [attachOpen, setAttachOpen] = useState(false)
    const [locOpen, setLocOpen] = useState(false)
    const [uploading, setUploading] = useState(false)
    const fileRef = useRef<HTMLInputElement>(null)
    const fileVideoRef = useRef<HTMLInputElement>(null)
    const fileCamRef = useRef<HTMLInputElement>(null)
    const fileCamVideoRef = useRef<HTMLInputElement>(null)
    const [onceMode, setOnceMode] = useState(false)
    // ações de mensagem: reações, apagadas para mim, resposta, edição, folha aberta, visto, digitando e busca
    const [reactions, setReactions] = useState<Record<string, ReactionRow[]>>({})
    const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set())
    const [replyTo, setReplyTo] = useState<Message | null>(null)
    const [editing, setEditing] = useState<Message | null>(null)
    const [menuMsg, setMenuMsg] = useState<Message | null>(null)
    const [otherReadAt, setOtherReadAt] = useState<string | null>(null)
    const [typingNow, setTypingNow] = useState(false)
    const [searchOpen, setSearchOpen] = useState(false)
    const [q, setQ] = useState('')
    const channelRef = useRef<any>(null)
    const lastTypingSent = useRef(0)
    const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const rec = useVoiceRecorder()
    const endRef = useRef<HTMLDivElement>(null)
    const convId = conversation.id

    // onRead muda a cada render do pai: fica numa ref pra não refazer a busca/assinatura em loop
    const onReadRef = useRef(onRead)
    useEffect(() => { onReadRef.current = onRead }, [onRead])

    const markRead = useCallback(async () => {
        await supabase.rpc('mark_conversation_read', { p_conv: convId })
        onReadRef.current()
    }, [convId])

    const loadRefs = useCallback(async () => {
        const { data } = await supabase.rpc('get_conversation_refs', { p_conv: convId })
        setRefs(Object.fromEntries(((data as ProductRef[]) || []).map((r) => [r.id, r])))
        const { data: reqs } = await supabase.rpc('get_conversation_request_refs', { p_conv: convId })
        setRequestRefs(Object.fromEntries(((reqs as RequestRef[]) || []).map((r) => [r.id, r])))
    }, [convId])

    // cartões compartilhados: refaz quando chega mensagem nova com referência
    const messagesRef = useRef<Message[]>([])
    useEffect(() => { messagesRef.current = messages }, [messages])
    const loadShareCards = useCallback(async (list?: Message[]) => {
        const cards = await fetchShareCards(list ?? messagesRef.current)
        setShareCards((prev) => ({ ...prev, ...cards }))
    }, [])

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        supabase
            .from('direct_messages')
            .select(MSG_COLS)
            .eq('conversation_id', convId)
            .order('created_at', { ascending: true })
            .limit(300)
            .then(({ data }) => {
                if (cancelled) return
                setMessages((data as Message[]) || [])
                setLoading(false)
                markRead()
                loadRefs()
                loadShareCards((data as Message[]) || [])
            })
        // apagadas para mim (só as minhas) e reações da conversa
        supabase.from('direct_message_hidden').select('message_id').eq('profile_id', userId).then(({ data }) => {
            if (cancelled) return
            setHiddenIds(new Set(((data as { message_id: string }[]) || []).map((r) => r.message_id)))
        })
        supabase.from('message_reactions').select('message_id, profile_id, emoji').eq('conversation_id', convId).then(({ data }) => {
            if (cancelled) return
            const grouped: Record<string, ReactionRow[]> = {}
            for (const r of (data as ReactionRow[]) || []) (grouped[r.message_id] ??= []).push(r)
            setReactions(grouped)
        })

        const channel = supabase
            .channel(`dm-${convId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `conversation_id=eq.${convId}` }, (payload) => {
                const m = payload.new as Message
                setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))
                if (m.ref_product_id || m.ref_request_id) loadRefs()
                if (m.ref_product_id || m.ref_store_id || m.ref_profile_id) loadShareCards([m])
                if (m.sender_id !== userId) markRead()
            })
            // edição e "apagada para todos" da outra pessoa chegam aqui
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'direct_messages', filter: `conversation_id=eq.${convId}` }, (payload) => {
                const m = payload.new as Message
                setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, ...m } : x)))
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions', filter: `conversation_id=eq.${convId}` }, (payload) => {
                if (payload.eventType === 'DELETE') {
                    const o = payload.old as ReactionRow
                    setReactions((prev) => ({ ...prev, [o.message_id]: (prev[o.message_id] || []).filter((r) => r.profile_id !== o.profile_id) }))
                    return
                }
                const r = payload.new as ReactionRow
                setReactions((prev) => ({ ...prev, [r.message_id]: [...(prev[r.message_id] || []).filter((x) => x.profile_id !== r.profile_id), r] }))
            })
            // "digitando…": só um aviso efêmero entre os dois, sem gravar nada no banco
            .on('broadcast', { event: 'typing' }, ({ payload }) => {
                if (payload?.id === userId) return
                setTypingNow(true)
                if (typingTimer.current) clearTimeout(typingTimer.current)
                typingTimer.current = setTimeout(() => setTypingNow(false), 3500)
            })
            .subscribe()
        channelRef.current = channel
        return () => {
            cancelled = true
            if (typingTimer.current) clearTimeout(typingTimer.current)
            channelRef.current = null
            supabase.removeChannel(channel)
        }
    }, [convId, userId, markRead, loadRefs, loadShareCards])

    useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [messages])

    // localização: quem envia atualiza a posição; quem recebe relê o mapa a cada 5 s
    useSenderLocation(messages as MediaMessage[], userId)
    useLocationRefresh(messages as MediaMessage[], (rows) => setMessages((prev) => prev.map((x) => { const r = rows.find((y) => y.id === x.id); return r ? { ...x, ...r } : x })))
    const patchViewed = useCallback((id: string) => setMessages((prev) => prev.map((x) => (x.id === id ? { ...x, viewed_at: new Date().toISOString() } : x))), [])

    const appendRow = async (id: string) => {
        const { data: row } = await supabase.from('direct_messages').select(MSG_COLS).eq('id', id).single()
        if (row) setMessages((prev) => (prev.some((x) => x.id === row.id) ? prev : [...prev, row as Message]))
        onReadRef.current()
    }

    // Envio de foto, vídeo ou áudio: o limite de tamanho e de duração é conferido aqui (cedo) e no banco (de verdade)
    const sendingRef = useRef(false)
    const sendMedia = async (kind: ChatMediaKind, file: Blob, seconds: number | null, once: boolean) => {
        if (uploading || sendingRef.current) return
        sendingRef.current = true
        try { await sendMediaOnce(kind, file, seconds, once) } finally { sendingRef.current = false }
    }
    const sendMediaOnce = async (kind: ChatMediaKind, file: Blob, seconds: number | null, once: boolean) => {
        const lim = CHAT_LIMITS[kind]
        if (file.size > lim.bytes) { toast.error('Arquivo grande demais', { description: `Envie um ${lim.label}.` }); return }
        if (lim.seconds != null && (seconds == null || seconds > lim.seconds)) { toast.error('Muito longo', { description: `Envie um ${lim.label}.` }); return }
        setUploading(true)
        const uploadKind = CHAT_UPLOAD_KIND[kind]
        const av = await r2Availability(uploadKind)
        if (!av.available) { setUploading(false); toast.info('O envio desse tipo ainda não está ligado.'); return }
        const named = file instanceof File ? file : new File([file], `${kind}`, { type: baseMime(file.type) })
        const up = await uploadToR2(named, uploadKind)
        if (!up.ok) { setUploading(false); toast.error('Não foi possível enviar', { description: up.message }); return }
        const caption = kind === 'audio' ? '' : text.trim()
        const { data, error } = await supabase.rpc('chat_send_media', { p_conv: convId, p_kind: kind, p_key: up.key, p_caption: caption, p_once: once, p_seconds: seconds })
        setUploading(false)
        if (error || !data) { toast.error('Não foi possível enviar', { description: (error as any)?.hint === 'chat_media_limit' ? (error as any).message : undefined }); return }
        if (kind !== 'audio') setText('')
        setOnceMode(false)
        await appendRow(data as string)
    }

    const stopAndSendAudio = async () => {
        const r = await rec.stop()
        if (r) await sendMedia('audio', r.blob, r.seconds, onceMode)
    }
    const micPress = async () => {
        if (rec.recording) return stopAndSendAudio()
        const ok = await rec.start()
        if (!ok) toast.error('Permita o microfone', { description: 'Ative o microfone do navegador para gravar um áudio.' })
    }

    const startLocation = async (minutes: number) => {
        setLocOpen(false)
        const pos = await new Promise<GeolocationPosition | null>((resolve) => {
            if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null)
            navigator.geolocation.getCurrentPosition((p) => resolve(p), () => resolve(null), { enableHighAccuracy: true, timeout: 10000 })
        })
        if (!pos) { toast.error('Permita a localização para compartilhar', { description: 'Ative a localização do navegador e tente de novo.' }); return }
        const { data, error } = await supabase.rpc('chat_start_location', { p_conv: convId, p_minutes: minutes, p_lat: pos.coords.latitude, p_lng: pos.coords.longitude })
        if (error || !data) { toast.error('Não foi possível compartilhar a localização'); return }
        await appendRow(data as string)
    }

    const stopLocation = async (id: string) => {
        await supabase.rpc('chat_stop_location', { p_msg: id })
        setMessages((prev) => prev.map((x) => (x.id === id ? { ...x, loc_stopped: true } : x)))
    }

    // Grupo: busca o nome de quem escreveu (inclusive de quem já saiu do grupo)
    useEffect(() => {
        if (!conversation.is_group) return
        const ids = Array.from(new Set(messages.map((m) => m.sender_id))).filter((id) => id !== userId && !senderNames[id])
        if (ids.length === 0) return
        supabase.from('profiles').select('id, name, "profileSlug"').in('id', ids).then(({ data }) => {
            setSenderNames((prev) => {
                const next = { ...prev }
                for (const p of (data || []) as any[]) next[p.id] = p.profileSlug ? `@${p.profileSlug}` : p.name || 'Alguém'
                return next
            })
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [messages, conversation.is_group, userId, infoVersion])

    // visto (✓✓ azul): quando a outra pessoa leu a conversa. Só 1 a 1 (no grupo não há marca de leitura).
    useEffect(() => {
        if (conversation.is_group) return
        let live = true
        const pull = async () => {
            const { data } = await supabase.rpc('chat_other_read_at', { p_conv: convId })
            if (live) setOtherReadAt((data as string | null) ?? null)
        }
        pull()
        const t = setInterval(pull, 15000)
        return () => { live = false; clearInterval(t) }
    }, [convId, conversation.is_group])

    // "digitando…" para a outra pessoa, no máximo a cada 2,5 s
    const sendTyping = () => {
        const now = Date.now()
        if (now - lastTypingSent.current < 2500) return
        lastTypingSent.current = now
        channelRef.current?.send({ type: 'broadcast', event: 'typing', payload: { id: userId } })
    }

    const reactTo = async (msgId: string, emoji: string) => {
        const { data, error } = await supabase.rpc('chat_react', { p_msg: msgId, p_emoji: emoji })
        if (error) { toast.error('Não foi possível reagir'); return }
        setReactions((prev) => {
            const rest = (prev[msgId] || []).filter((r) => r.profile_id !== userId)
            return { ...prev, [msgId]: data ? [...rest, { message_id: msgId, profile_id: userId, emoji: data as string }] : rest }
        })
    }

    const deleteMine = async (m: Message) => {
        const { error } = await supabase.rpc('chat_delete_message', { p_msg: m.id, p_for_all: false })
        if (error) { toast.error('Não foi possível apagar'); return }
        setHiddenIds((prev) => new Set(prev).add(m.id))
    }

    const deleteForAll = async (m: Message) => {
        const { error } = await supabase.rpc('chat_delete_message', { p_msg: m.id, p_for_all: true })
        if (error) {
            toast.error('Não foi possível apagar para todos', { description: (error as any)?.hint === 'delete_too_old' ? 'Passou o prazo de 48 horas.' : undefined })
            return
        }
        setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, deleted_at: new Date().toISOString(), content: '' } : x)))
        setReactions((prev) => { const n = { ...prev }; delete n[m.id]; return n })
    }

    const editSave = async (m: Message, content: string): Promise<boolean> => {
        const { error } = await supabase.rpc('chat_edit_message', { p_msg: m.id, p_content: content })
        if (error) {
            toast.error('Não foi possível editar', { description: (error as any)?.hint === 'edit_too_old' ? 'Passou o prazo de 15 minutos.' : undefined })
            return false
        }
        setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, content, edited_at: new Date().toISOString() } : x)))
        return true
    }

    // toque longo abre as ações (o celular cancela se a pessoa rolar a tela)
    const startPress = (m: Message) => {
        if (m.deleted_at) return
        if (pressTimer.current) clearTimeout(pressTimer.current)
        pressTimer.current = setTimeout(() => setMenuMsg(m), 450)
    }
    const cancelPress = () => { if (pressTimer.current) clearTimeout(pressTimer.current) }

    const send = async () => {
        if (editing) {
            const content = text.trim()
            if (!content || sending) return
            setSending(true)
            const ok = await editSave(editing, content)
            setSending(false)
            if (ok) { setEditing(null); setText('') }
            return
        }
        const content = text.trim() || (pending ? SHARE_DEFAULT_TEXT[pending.kind] : '')
        if (!content || sending) return
        setSending(true)
        const { data, error } = await supabase
            .from('direct_messages')
            .insert({ conversation_id: convId, sender_id: userId, content, reply_to_id: replyTo?.id ?? null, ...(pending ? refColumns(pending) : {}) })
            .select(MSG_COLS)
            .single()
        setSending(false)
        if (error) return
        if (pending) setShareCards((prev) => ({ ...prev, [`${pending.kind === 'store' ? 'store' : pending.kind === 'profile' ? 'profile' : 'product'}:${pending.id}`]: pending }))
        setPending(null)
        setReplyTo(null)
        setText('')
        setMessages((prev) => (prev.some((x) => x.id === data.id) ? prev : [...prev, data as Message]))
        onReadRef.current()
        notifyChatMessage(convId)
    }

    // o que aparece: tudo menos o que eu apaguei para mim; com busca aberta, só o que bate com o termo
    const visibleMessages = messages.filter((m) => !hiddenIds.has(m.id) && (!q.trim() || matchesSearch(m, q)))
    const avatar = otherAvatarUrl(conversation)
    const profileHref = conversation.other_slug ? `/${conversation.other_slug}` : null

    return (
        <div className="flex flex-col h-full min-h-0">
            <div className={`flex items-center gap-3 px-3 py-3 flex-shrink-0 ${modern ? '' : 'border-b'}`} style={modern ? { background: `${colors.border}30` } : { borderColor: colors.border }}>
                <button onClick={onBack} className="md:hidden w-9 h-9 rounded-full flex items-center justify-center" style={{ color: colors.textPrimary }} aria-label="Voltar para as conversas">
                    <ArrowLeft size={20} />
                </button>
                {conversation.is_group ? (
                    <button onClick={onOpenInfo} className="flex items-center gap-3 min-w-0 flex-1 text-left">
                        <GroupAvatar size={40} />
                        <div className="min-w-0">
                            <p className="text-sm font-black truncate" style={{ color: colors.textPrimary }}>{conversation.other_name}</p>
                            <p className="text-[11px] truncate" style={{ color: colors.textSecondary }}>{conversation.member_count || 0} pessoas · toque para ver o grupo</p>
                        </div>
                    </button>
                ) : profileHref ? (
                    <Link href={profileHref} className="flex items-center gap-3 min-w-0 flex-1">
                        <Avatar url={avatar} name={conversation.other_name} isStore={conversation.other_is_store} userId={conversation.other_is_store ? undefined : conversation.other_id} size={40} round={modern} />
                        <div className="min-w-0">
                            <p className="text-sm font-black truncate" style={{ color: colors.textPrimary }}>{otherLabel(conversation)}</p>
                            <p className="text-[11px] truncate font-bold" style={{ color: typingNow ? colors.accent : colors.textSecondary }}>{typingNow ? 'digitando…' : (conversation.other_is_store ? `@${conversation.other_slug} · ver loja` : 'ver perfil')}</p>
                        </div>
                    </Link>
                ) : (
                    <p className="text-sm font-black truncate" style={{ color: colors.textPrimary }}>{otherLabel(conversation)}</p>
                )}
                <button onClick={() => { setSearchOpen((o) => !o); setQ('') }} aria-label="Buscar nesta conversa" aria-pressed={searchOpen}
                    className="ml-auto w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ color: searchOpen ? colors.accent : colors.textPrimary, background: searchOpen ? `${colors.accent}20` : 'transparent' }}>
                    <Search size={18} />
                </button>
            </div>
            {searchOpen && (
                <div className="px-3 pt-2 flex items-center gap-2 flex-shrink-0">
                    <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nesta conversa"
                        className="flex-1 rounded-3xl px-4 py-2 text-sm outline-none" style={{ background: `${colors.border}40`, color: colors.textPrimary }} />
                    <span className="text-[11px] font-bold tabular-nums" style={{ color: colors.textSecondary }}>
                        {q.trim() ? `${messages.filter((m) => !hiddenIds.has(m.id) && matchesSearch(m, q)).length} achadas` : ''}
                    </span>
                </div>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto px-3 py-4 flex flex-col gap-2">
                {loading ? (
                    <div className="flex justify-center py-10"><Spinner size={22} color={colors.accent} /></div>
                ) : messages.length === 0 ? (
                    <p className="text-center text-sm py-10" style={{ color: colors.textSecondary }}>Nenhuma mensagem ainda. Diga um oi 👋</p>
                ) : visibleMessages.map((m, i) => {
                    const mine = m.sender_id === userId
                    const prev = visibleMessages[i - 1]
                    const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString()
                    return (
                        <div key={m.id} id={`msg-${m.id}`} className="flex flex-col">
                            {newDay && (
                                <p className="text-center text-[11px] font-bold my-2" style={{ color: colors.textSecondary }}>
                                    {new Date(m.created_at).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
                                </p>
                            )}
                            <div className={`max-w-[80%] px-3.5 py-2 rounded-2xl text-sm break-words whitespace-pre-wrap ${mine ? 'self-end rounded-br-md text-white' : 'self-start rounded-bl-md'}`}
                                onPointerDown={() => startPress(m)} onPointerUp={cancelPress} onPointerLeave={cancelPress} onPointerCancel={cancelPress}
                                onContextMenu={(e) => { if (!m.deleted_at) { e.preventDefault(); setMenuMsg(m) } }}
                                style={mine
                                    ? { background: GRADIENT }
                                    : modern
                                        ? { background: `${colors.border}55`, color: colors.textPrimary }
                                        : { background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }}>
                                {m.deleted_at ? (
                                    <span className="italic text-sm opacity-80">🚫 Mensagem apagada</span>
                                ) : (<>
                                {conversation.is_group && !mine && (
                                    <span className="block text-[11px] font-black mb-0.5" style={{ color: colors.accent }}>{senderNames[m.sender_id] || 'Alguém'}</span>
                                )}
                                {m.reply_to_id && (() => {
                                    const o = messages.find((x) => x.id === m.reply_to_id)
                                    return (
                                        <QuoteBlock
                                            name={o ? (o.sender_id === userId ? 'Você' : (senderNames[o.sender_id] || otherLabel(conversation))) : 'Mensagem'}
                                            text={o ? quotePreview(o) : 'Mensagem não carregada'}
                                            mine={mine} colors={colors}
                                            onClick={() => document.getElementById(`msg-${m.reply_to_id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })}
                                        />
                                    )
                                })()}
                                {(() => {
                                    const key = cardKeyOf(m)
                                    const card = key ? shareCards[key] : null
                                    return card ? <ShareCardView card={card} mine={mine} colors={colors} /> : null
                                })()}
                                {m.ref_product_id && !shareCards[`product:${m.ref_product_id}`] && refs[m.ref_product_id] && (() => {
                                    const r = refs[m.ref_product_id!]
                                    const img = r.image_url ? (r.image_url.startsWith('http') ? r.image_url : supabase.storage.from('product-images').getPublicUrl(r.image_url).data.publicUrl) : null
                                    const href = r.owner_slug ? `/${r.owner_slug}/${r.slug || r.id}` : null
                                    const card = (
                                        <span className="flex items-center gap-2.5 mb-2 p-1.5 rounded-xl" style={{ background: mine ? 'rgba(255,255,255,0.18)' : `${colors.border}40` }}>
                                            <span className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.15)' }}>
                                                {img ? <img src={img} alt="" className="w-full h-full object-cover" /> : <MessageCircle size={18} />}
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block text-[10px] font-black uppercase tracking-wide opacity-75">Serviço</span>
                                                <span className="block text-sm font-black leading-tight line-clamp-2">{r.name}</span>
                                                {href && <span className="block text-[11px] underline opacity-80 mt-0.5">Ver postagem</span>}
                                            </span>
                                        </span>
                                    )
                                    return href ? <Link href={href} className="block">{card}</Link> : card
                                })()}
                                {m.ref_request_id && requestRefs[m.ref_request_id] && (
                                    <RequestCard r={requestRefs[m.ref_request_id]} mine={mine} colors={colors} />
                                )}
                                {(m.kind === 'photo' || m.kind === 'video' || m.kind === 'audio') && m.view_once && <OnceBubble m={m as MediaMessage} mine={mine} colors={colors} onOpened={patchViewed} />}
                                {m.kind === 'photo' && !m.view_once && <PhotoBubble id={m.id} colors={colors} />}
                                {m.kind === 'video' && !m.view_once && <VideoBubble id={m.id} colors={colors} />}
                                {m.kind === 'audio' && !m.view_once && <NormalAudio id={m.id} mine={mine} colors={colors} seconds={m.media_seconds} />}
                                {m.kind === 'location' && <LocationBubble m={m as MediaMessage} mine={mine} colors={colors} onStop={() => stopLocation(m.id)} />}
                                {(() => { const k = cardKeyOf(m); if (m.kind && m.kind !== 'text' && MEDIA_DEFAULT_TEXT.includes(m.content)) return null; return k && shareCards[k] && isDefaultShareText(m.content) ? null : m.content })()}
                                {(!m.kind || m.kind === 'text') && <ChatLinkPreviews content={m.content} colors={colors} compact />}
                                {(!m.kind || m.kind === 'text') && urlsIn(m.content).filter((u) => !iuserPath(u) && !isImageUrl(u)).slice(0, 2).map((u) => (
                                    <div key={u} className="mt-2"><LinkPreviewCard url={u} compact /></div>
                                ))}
                                </>)}
                                <span className="flex items-center justify-end gap-1 text-[10px] mt-0.5" style={{ opacity: 0.7 }}>
                                    {m.edited_at && !m.deleted_at && <span>editada ·</span>}
                                    <span>{new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                                    {mine && <TickIcon state={tickOf(m, userId, conversation.is_group ? null : otherReadAt)} />}
                                </span>
                            </div>
                            {!m.deleted_at && (
                                <ReactionChips chips={reactionChips(reactions[m.id] || [], userId)} onToggle={(e) => reactTo(m.id, e)} mine={mine} colors={colors} />
                            )}
                        </div>
                    )
                })}
                <div ref={endRef} />
            </div>

            {pending && (
                <div className="px-3 pt-2 flex items-start gap-2 flex-shrink-0">
                    <div className="flex-1 min-w-0 rounded-xl overflow-hidden" style={{ background: `${colors.border}30`, color: colors.textPrimary }}>
                        <ShareCardView card={{ ...pending, href: '#' }} colors={colors} compact />
                    </div>
                    <button onClick={() => setPending(null)} aria-label="Tirar o item" className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-1" style={{ background: `${colors.border}50`, color: colors.textPrimary }}>×</button>
                </div>
            )}
            {(attachOpen || uploading) && (
                <div className="fixed inset-0 z-[90] flex flex-col justify-end" onClick={() => { if (!uploading) setAttachOpen(false) }}>
                    <div className="absolute inset-0" style={{ background: 'rgba(8,8,10,0.45)', backdropFilter: 'blur(3px)' }} />
                    <div className="relative rounded-t-[24px] px-3 pt-2 shadow-2xl" style={{ background: colors.background, color: colors.textPrimary, borderTop: `1px solid ${colors.border}`, paddingBottom: 'max(20px, env(safe-area-inset-bottom, 0px))' }} onClick={(e) => e.stopPropagation()}>
                        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full" style={{ background: `${colors.border}` }} />
                        {uploading ? (
                            <p className="py-8 text-center text-sm font-black">Enviando…</p>
                        ) : (
                            <>
                                <div className="mb-3 flex items-center justify-between">
                                    <button onClick={() => setAttachOpen(false)} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-black" style={{ background: `${colors.border}40`, color: colors.textPrimary }}>
                                        <ArrowLeft size={15} /> Voltar
                                    </button>
                                    <p className="text-[11px] font-black uppercase tracking-wider opacity-60">Enviar</p>
                                </div>
                                <div className="grid grid-cols-4 gap-1.5">
                                    {([
                                        { key: 'gal', label: 'Foto da galeria', icon: ImageIcon, color: '#3b82f6', onPick: () => { setAttachOpen(false); fileRef.current?.click() } },
                                        { key: 'cam', label: 'Tirar foto', icon: Camera, color: '#8b5cf6', onPick: () => { setAttachOpen(false); fileCamRef.current?.click() } },
                                        { key: 'vgal', label: 'Vídeo da galeria', hint: 'até 1 min', icon: Film, color: '#ef4444', onPick: () => { setAttachOpen(false); fileVideoRef.current?.click() } },
                                        { key: 'vcam', label: 'Gravar vídeo', hint: 'até 1 min', icon: Video, color: '#dc2626', onPick: () => { setAttachOpen(false); fileCamVideoRef.current?.click() } },
                                        { key: 'mic', label: 'Gravar áudio', hint: 'até 5 min', icon: Mic, color: '#f97316', onPick: () => { setAttachOpen(false); void micPress() } },
                                        { key: 'loc', label: 'Localização', hint: 'ao vivo', icon: MapPin, color: '#10b981', onPick: () => { setAttachOpen(false); setLocOpen(true) } },
                                    ] as const).map((t) => {
                                        const Icon = t.icon
                                        return (
                                            <button key={t.key} onClick={t.onPick} className="flex flex-col items-center gap-1 rounded-xl px-1 py-2 transition active:scale-95" style={{ background: `${t.color}1a` }}>
                                                <span className="flex h-9 w-9 items-center justify-center rounded-full text-white" style={{ background: t.color }}><Icon size={17} /></span>
                                                <span className="text-center text-[10.5px] font-black leading-tight">{t.label}</span>
                                                {'hint' in t && t.hint && <span className="text-[9px] font-bold opacity-60">{t.hint}</span>}
                                            </button>
                                        )
                                    })}
                                    <button onClick={() => setOnceMode((o) => !o)} aria-pressed={onceMode} className="flex flex-col items-center gap-1 rounded-xl px-1 py-2 transition active:scale-95" style={{ background: onceMode ? '#ec4899' : '#ec48991a', color: onceMode ? '#fff' : colors.textPrimary }}>
                                        <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: '#ec4899', color: '#fff' }}><Eye size={17} /></span>
                                        <span className="text-center text-[10.5px] font-black leading-tight">Ver uma vez</span>
                                        <span className="text-[9px] font-bold opacity-70">{onceMode ? 'ligado' : 'desligado'}</span>
                                    </button>
                                </div>
                                <p className="mb-1.5 mt-3 text-[10px] font-black uppercase tracking-wider opacity-60">Do iUser</p>
                                <button onClick={() => { setAttachOpen(false); setShareOpen(true) }} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition active:scale-[0.99]" style={{ background: '#14b8a61a' }}>
                                    <span className="flex h-8 w-8 items-center justify-center rounded-full text-white" style={{ background: '#14b8a6' }}><Share2 size={15} /></span>
                                    <span className="text-[12px] font-black">Compartilhar loja, serviço ou perfil</span>
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}
            <input ref={fileRef} type="file" accept={PHOTO_ACCEPT} className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void sendMedia('photo', f, null, onceMode) }} />
            <input ref={fileVideoRef} type="file" accept={VIDEO_ACCEPT} className="hidden"
                onChange={async (e) => {
                    const f = e.target.files?.[0]; e.target.value = ''
                    if (!f) return
                    const secs = await mediaSeconds(f, 'video')
                    if (!secs) { toast.error('Não foi possível ler o vídeo', { description: 'Tente outro arquivo (MP4 ou WebM).' }); return }
                    void sendMedia('video', f, Math.round(secs), onceMode)
                }} />
            <input ref={fileCamRef} type="file" accept={PHOTO_ACCEPT} capture="environment" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void sendMedia('photo', f, null, onceMode) }} />
            <input ref={fileCamVideoRef} type="file" accept={VIDEO_ACCEPT} capture="environment" className="hidden"
                onChange={async (e) => {
                    const f = e.target.files?.[0]; e.target.value = ''
                    if (!f) return
                    const secs = await mediaSeconds(f, 'video')
                    if (!secs) { toast.error('Não foi possível ler o vídeo', { description: 'Tente gravar de novo.' }); return }
                    void sendMedia('video', f, Math.round(secs), onceMode)
                }} />
            {onceMode && !attachOpen && !rec.recording && (
                <div className="px-3 pt-2 flex-shrink-0">
                    <button onClick={() => setOnceMode(false)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-black" style={{ background: '#f97316', color: '#fff' }}>
                        <Eye size={13} /> Ver uma vez ligado · toque para desligar
                    </button>
                </div>
            )}
            {(replyTo || editing) && (() => {
                const ref = (editing || replyTo) as Message
                const who = editing ? '' : (replyTo!.sender_id === userId ? 'você' : (senderNames[replyTo!.sender_id] || otherLabel(conversation)))
                return (
                    <div className="px-3 pt-2 flex items-center gap-2 flex-shrink-0">
                        <div className="flex-1 min-w-0 rounded-xl px-3 py-2 border-l-4" style={{ background: `${colors.border}30`, borderColor: colors.accent, color: colors.textPrimary }}>
                            <span className="block text-[11px] font-black" style={{ color: colors.accent }}>{editing ? 'Editando mensagem' : `Respondendo a ${who}`}</span>
                            <span className="block text-xs truncate opacity-85">{quotePreview(ref)}</span>
                        </div>
                        <button onClick={() => { setReplyTo(null); if (editing) { setEditing(null); setText('') } }} aria-label="Cancelar"
                            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${colors.border}50`, color: colors.textPrimary }}>
                            <X size={16} />
                        </button>
                    </div>
                )
            })()}
            <div className={`flex items-end gap-2 px-3 py-3 flex-shrink-0 ${modern ? '' : 'border-t'}`} style={modern ? undefined : { borderColor: colors.border }}>
                <button onClick={() => setAttachOpen((o) => !o)} disabled={uploading} aria-label="Enviar foto, vídeo, áudio, localização ou compartilhar do iUser" aria-expanded={attachOpen} className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 text-lg font-black transition active:scale-95" style={{ background: attachOpen ? '#f97316' : `${colors.border}40`, color: attachOpen ? '#fff' : '#f97316' }}>
                    {attachOpen ? '×' : '+'}
                </button>
                {rec.recording ? (
                    <div className="flex-1 flex items-center gap-2 rounded-3xl px-3 py-2.5" style={{ background: `${colors.border}40`, color: colors.textPrimary }}>
                        <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                        <span className="text-sm font-black tabular-nums">{fmtTime(rec.seconds)}</span>
                        <span className="text-xs opacity-70 flex-1">Gravando áudio · máx. 5 min</span>
                        <button onClick={() => rec.cancel()} aria-label="Cancelar gravação" className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: `${colors.border}60` }}><X size={16} /></button>
                    </div>
                ) : (
                    <textarea
                        value={text}
                        onChange={(e) => { setText(e.target.value); if (e.target.value.trim()) sendTyping() }}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                        rows={1}
                        maxLength={2000}
                        placeholder="Escreva uma mensagem..."
                        className="flex-1 resize-none rounded-3xl px-4 py-2.5 text-sm outline-none max-h-32"
                        style={modern
                            ? { background: `${colors.border}40`, color: colors.textPrimary }
                            : { background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                    />
                )}
                {!rec.recording && !text.trim() && !pending ? (
                    <button onClick={micPress} disabled={uploading} aria-label="Gravar áudio" className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 text-white disabled:opacity-40 transition-transform active:scale-95" style={{ background: GRADIENT, boxShadow: '0 4px 12px #f9731640' }}>
                        <Mic size={18} />
                    </button>
                ) : (
                    <button
                        onClick={rec.recording ? stopAndSendAudio : send}
                        disabled={(!rec.recording && !text.trim() && !pending) || sending || uploading}
                        className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 text-white disabled:opacity-40 transition-transform active:scale-95"
                        style={{ background: GRADIENT, boxShadow: '0 4px 12px #f9731640' }}
                        aria-label="Enviar"
                    >
                        <Send size={18} />
                    </button>
                )}
            </div>
            <ShareSheet open={shareOpen} onClose={() => setShareOpen(false)} onPick={setPending} colors={colors} />
            <LocationDurationSheet open={locOpen} onClose={() => setLocOpen(false)} onPick={startLocation} colors={colors} />
            <MessageMenu
                open={!!menuMsg}
                onClose={() => setMenuMsg(null)}
                canEdit={!!menuMsg && canEditMsg(menuMsg, userId, Date.now())}
                canDeleteAll={!!menuMsg && canDeleteForAll(menuMsg, userId, Date.now())}
                canCopy={!!menuMsg && !menuMsg.deleted_at && (!menuMsg.kind || menuMsg.kind === 'text')}
                myReaction={menuMsg ? (reactions[menuMsg.id] || []).find((r) => r.profile_id === userId)?.emoji ?? null : null}
                onReact={(e) => { if (menuMsg) reactTo(menuMsg.id, e) }}
                onReply={() => { if (menuMsg) { setReplyTo(menuMsg); setEditing(null) } }}
                onCopy={() => { if (menuMsg) void navigator.clipboard?.writeText(menuMsg.content) }}
                onEdit={() => { if (menuMsg) { setEditing(menuMsg); setReplyTo(null); setText(menuMsg.content) } }}
                onDeleteMe={() => { if (menuMsg) void deleteMine(menuMsg) }}
                onDeleteAll={() => { if (menuMsg) void deleteForAll(menuMsg) }}
                colors={colors}
            />
        </div>
    )
}

function Avatar({ url, name, isStore, userId, size, round = false }: { url: string | null; name: string | null; isStore: boolean; userId?: string; size: number; round?: boolean }) {
    const inner = url ? (
        <img src={url} alt="" className="object-cover" style={{ width: size, height: size }} />
    ) : (
        <span className="flex items-center justify-center text-white font-black" style={{ width: size, height: size, background: GRADIENT }}>
            {isStore ? <StoreIcon size={size * 0.45} /> : (name || '?').charAt(0).toUpperCase() || <User size={size * 0.45} />}
        </span>
    )
    if (round) {
        const circle = <span className="block rounded-full overflow-hidden" style={{ width: size, height: size }}>{inner}</span>
        return <span className="flex-shrink-0">{userId ? <PlanAvatarRing userId={userId} width={2}>{circle}</PlanAvatarRing> : circle}</span>
    }
    return <span className="flex-shrink-0">{userId ? <PlanAvatarRing userId={userId} radius="0px">{inner}</PlanAvatarRing> : inner}</span>
}

// ====================== PÁGINA ======================
/** As CAIXAS de conversa (a da pessoa e a de cada loja): um seletor próprio, menor e escuro, de propósito diferente das pílulas laranja das subabas */
function RoomSwitch({ tabs, colors }: { tabs: any[]; colors: any }) {
    return (
        <div className="mt-3">
            <p className="px-1 mb-1.5 text-[10.5px] font-black uppercase tracking-widest" style={{ color: colors.textSecondary }}>Caixa de entrada</p>
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1" style={{ WebkitOverflowScrolling: 'touch' }}>
                {tabs.map((t) => {
                    const Icon = t.icon
                    return (
                        <button
                            key={t.id}
                            onClick={t.onClick}
                            aria-pressed={t.isActive}
                            className="relative flex items-center gap-2 h-10 pl-1.5 pr-3.5 rounded-2xl text-[12.5px] font-black whitespace-nowrap flex-shrink-0 transition active:scale-95"
                            style={t.isActive
                                ? { background: colors.textPrimary, color: colors.background }
                                : { background: 'transparent', color: colors.textPrimary, border: `1px solid ${colors.border}` }}
                        >
                            {t.imageUrl
                                ? <img src={t.imageUrl} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                                : <span className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: t.isActive ? `${colors.background}33` : `${colors.border}66` }}><Icon size={14} /></span>}
                            <span className="max-w-[150px] truncate">{t.label}</span>
                            {t.badge && t.badge.count > 0 && <span className="min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black text-white flex items-center justify-center" style={{ background: '#16a34a' }}>{t.badge.count > 99 ? '99+' : t.badge.count}</span>}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}

function ConversasInner({ embedded = false, basePath = '/conversas', defaultRoom = null }: { embedded?: boolean; basePath?: string; defaultRoom?: string | null }) {
    // a conversa aberta ocupa ATÉ O FIM da tela (a caixa de escrever colada embaixo; 23/11/2026): mede onde ela começa e o espaço que sobra
    const threadBoxRef = useRef<HTMLDivElement | null>(null)
    const [threadH, setThreadH] = useState<number | null>(null)
    useEffect(() => {
        const fit = () => {
            const el = threadBoxRef.current
            if (!el) return
            const vh = window.visualViewport?.height ?? window.innerHeight
            const top = el.getBoundingClientRect().top
            setThreadH(Math.max(320, Math.floor(vh - top - 8)))
        }
        fit()
        const t = setTimeout(fit, 300)
        window.addEventListener('resize', fit)
        window.visualViewport?.addEventListener('resize', fit)
        return () => { clearTimeout(t); window.removeEventListener('resize', fit); window.visualViewport?.removeEventListener('resize', fit) }
    })
    const router = useRouter()
    const search = useSearchParams()
    const { colors } = useTheme()
    const { userId, avatarUrl, bgMode, customBgUrl, profileSlug, loading: profileLoading } = useProfile()

    const [stores, setStores] = useState<MyStore[]>([])
    const [rows, setRows] = useState<ConversationRow[] | null>(null)
    // Não lidas por sala, pra mostrar o selo em cada aba
    const [unreadByRoom, setUnreadByRoom] = useState<Record<string, number>>({})
    // Grupos: convites pendentes, folha de nova conversa e dados do grupo aberto
    const [invites, setInvites] = useState<GroupInvite[]>([])
    const [showNew, setShowNew] = useState(false)
    const [showInfo, setShowInfo] = useState(false)
    const [infoVersion, setInfoVersion] = useState(0)

    // a caixa aberta: a que a URL pede; senão a do MODO (a loja, no modo loja); senão a da pessoa. 'perfil' ou o slug da loja
    const room = search.get('sala') || defaultRoom || 'perfil'
    const activeId = search.get('c')
    const activeStore = room !== 'perfil' ? stores.find((s) => s.storeSlug === room) || null : null

    // Chegou já numa conversa (ex.: "Conversar" de um pedido de serviço): o voltar da conversa leva de volta pra
    // página de onde veio, não pra lista. Qualquer navegação feita aqui dentro desliga isso.
    const cameFromOutside = useRef<boolean>(!!search.get('c'))

    const setParams = useCallback((next: { sala?: string; c?: string | null }) => {
        cameFromOutside.current = false
        const p = new URLSearchParams(search.toString())
        // com uma caixa padrão (modo loja), escolher a da pessoa precisa ficar escrito na URL; sem ela, 'perfil' é o padrão e some
        if (next.sala !== undefined) { if (next.sala === 'perfil' && !defaultRoom) p.delete('sala'); else p.set('sala', next.sala) }
        if (next.c !== undefined) { if (next.c) p.set('c', next.c); else p.delete('c') }
        router.replace(`${basePath}${p.toString() ? `?${p}` : ''}`)
    }, [router, search, basePath, defaultRoom])

    // Lojas da pessoa (cada uma vira uma aba)
    useEffect(() => {
        if (!userId) return
        supabase.from('stores').select('id, name, storeSlug, logo_url').eq('owner_id', userId).eq('is_active', true).then(({ data }) => {
            setStores((data || []).map((s: any) => ({
                id: s.id, name: s.name, storeSlug: s.storeSlug,
                logoUrl: s.logo_url ? supabase.storage.from('store-logos').getPublicUrl(s.logo_url).data.publicUrl : null,
            })))
        })
    }, [userId])

    const load = useCallback(async () => {
        if (!userId) return
        const wantStore = room !== 'perfil'
        if (wantStore && !activeStore) return // ainda carregando as lojas
        const { data } = await supabase.rpc('get_my_conversations', wantStore ? { p_scope: 'store', p_store: activeStore!.id } : { p_scope: 'profile' })
        setRows((data as ConversationRow[]) || [])
    }, [userId, room, activeStore])

    // Não lidas de cada sala (selos das abas)
    const loadUnread = useCallback(async () => {
        if (!userId) return
        const next: Record<string, number> = {}
        const { data: mine } = await supabase.rpc('get_my_conversations', { p_scope: 'profile' })
        next.perfil = ((mine as ConversationRow[]) || []).reduce((a, r) => a + (r.unread > 0 ? 1 : 0), 0)
        await Promise.all(stores.map(async (s) => {
            const { data } = await supabase.rpc('get_my_conversations', { p_scope: 'store', p_store: s.id })
            next[s.storeSlug] = ((data as ConversationRow[]) || []).reduce((a, r) => a + (r.unread > 0 ? 1 : 0), 0)
        }))
        setUnreadByRoom(next)
    }, [userId, stores])

    useEffect(() => { setRows(null); load() }, [load])

    const loadInvites = useCallback(async () => {
        if (!userId) return
        try { setInvites(await getMyGroupInvites()) } catch { setInvites([]) }
    }, [userId])
    useEffect(() => { loadInvites() }, [loadInvites])
    useEffect(() => { loadUnread() }, [loadUnread])

    // Conversa nova ou mensagem nova: recarrega a lista
    useEffect(() => {
        if (!userId) return
        const channel = supabase
            .channel(`conversas-page-${userId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => { load(); loadUnread() })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_members' }, () => { load(); loadUnread(); loadInvites() })
            .subscribe()
        return () => { supabase.removeChannel(channel) }
    }, [userId, load, loadUnread, loadInvites])

    const tabs = useMemo(() => {
        const list: any[] = [{
            id: 'perfil',
            label: profileSlug ? `@${profileSlug}` : 'Minhas conversas',
            icon: User,
            imageUrl: avatarUrl,
            onClick: () => setParams({ sala: 'perfil', c: null }),
            isActive: room === 'perfil',
            badge: unreadByRoom.perfil > 0 ? { count: unreadByRoom.perfil, color: '#16a34a' } : null,
        }]
        stores.forEach((s) => list.push({
            id: `loja-${s.storeSlug}`,
            label: s.name,
            icon: StoreIcon,
            imageUrl: s.logoUrl,
            onClick: () => setParams({ sala: s.storeSlug, c: null }),
            isActive: room === s.storeSlug,
            badge: unreadByRoom[s.storeSlug] > 0 ? { count: unreadByRoom[s.storeSlug], color: '#16a34a' } : null,
        }))
        return list
    }, [profileSlug, avatarUrl, stores, room, unreadByRoom, setParams])

    const active = rows?.find((r) => r.id === activeId) || null

    return (
        <div className={(undefined)} style={(undefined)}>
            

            <main className={('relative pb-8')}>
                {((
                    // as CAIXAS (a da pessoa e a de cada loja) seguem o modo; só aparecem quando há mais de uma e num desenho próprio, para não parecerem as subabas de cima
                    tabs.length > 1 ? <RoomSwitch tabs={tabs} colors={colors} /> : (!embedded ? <PageTabs tabs={tabs} /> : null)
                ))}

                <section className={('mt-3')}>
                    {!profileLoading && !userId ? (
                        <div className="rounded-3xl p-8 text-center flex flex-col items-center gap-3" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                            <MessageCircle size={36} style={{ color: colors.accent }} />
                            <p className="text-base font-black" style={{ color: colors.textPrimary }}>Entre na sua conta para conversar</p>
                            <p className="text-xs max-w-xs" style={{ color: colors.textSecondary }}>
                                Aqui ficam as conversas com pessoas e lojas. Você pode ver as comunidades sem conta, mas para escrever é preciso entrar.
                            </p>
                            <Link href="/comunidade" className="text-xs font-black underline" style={{ color: colors.accent }}>Ver as comunidades</Link>
                            <Link href="/login?redirect=/conversas" className="px-6 py-3 rounded-full text-sm font-black text-white" style={{ background: GRADIENT }}>Entrar</Link>
                        </div>
                    ) : (
                        <div className={`grid grid-cols-[minmax(0,1fr)] md:grid-cols-[360px_minmax(0,1fr)] gap-4 ${('md:h-[calc(100dvh-230px)]')}`}>
                            {/* Lista: o título sozinho em cima e os cartões (quadrados) embaixo */}
                            <div className={`${active ? 'hidden md:flex' : 'flex'} flex-col min-h-0 min-w-0`}>
                                <div className="pb-3 flex-shrink-0">
                                    <div className="flex items-center justify-between gap-3">
                                    <p className="text-[17px] font-black min-w-0 truncate" style={{ color: colors.textPrimary }}>
                                        {activeStore ? `Conversas de ${activeStore.name}` : 'Minhas conversas'}
                                        {(rows) && rows.length > 0 && <span className="ml-2 text-xs font-bold" style={{ color: colors.textSecondary }}>{rows.length}</span>}
                                    </p>
                                    {(!activeStore) && (
                                        <button
                                            onClick={() => setShowNew(true)}
                                            className="flex items-center gap-1.5 pl-3 pr-3.5 h-9 rounded-full text-xs font-black text-white flex-shrink-0 transition active:scale-95"
                                            style={{ background: GRADIENT }}
                                        >
                                            <Plus size={15} strokeWidth={3} /> Nova conversa
                                        </button>
                                    )}
                                    </div>
                                    
                                </div>
                                <div className={`flex-1 min-h-0 overflow-y-auto flex flex-col ${('gap-2')}`}>
                                    {(!activeStore) && invites.length > 0 && (
                                        <div className="mb-2 flex flex-col gap-2">
                                            <p className="px-1 text-[11px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>Convites ({invites.length})</p>
                                            {invites.map((inv) => (
                                                <div key={inv.conversation_id} className="rounded-2xl p-3 flex flex-col gap-2.5" style={{ background: '#8b5cf61a' }}>
                                                    <div className="flex items-center gap-3">
                                                        <GroupAvatar size={44} />
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-sm font-black truncate" style={{ color: colors.textPrimary }}>{inv.title}</p>
                                                            <p className="text-xs truncate" style={{ color: colors.textSecondary }}>
                                                                {inv.inviter_slug ? `@${inv.inviter_slug}` : inv.inviter_name || 'Alguém'} convidou você · {inv.member_count} {inv.member_count === 1 ? 'pessoa' : 'pessoas'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={async () => {
                                                                try { await respondGroupInvite(inv.conversation_id, true); await Promise.all([loadInvites(), load(), loadUnread()]); setParams({ sala: 'perfil', c: inv.conversation_id }) }
                                                                catch (err: any) { toast.error(err.message || 'Não foi possível entrar') }
                                                            }}
                                                            className="flex-1 h-10 rounded-full text-xs font-black text-white"
                                                            style={{ background: GRADIENT }}
                                                        >
                                                            Entrar no grupo
                                                        </button>
                                                        <button
                                                            onClick={async () => {
                                                                try { await respondGroupInvite(inv.conversation_id, false); await loadInvites() }
                                                                catch (err: any) { toast.error(err.message || 'Não foi possível recusar') }
                                                            }}
                                                            className="h-10 px-5 rounded-full text-xs font-black"
                                                            style={{ background: `${colors.border}50`, color: colors.textPrimary }}
                                                        >
                                                            Recusar
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {rows === null ? (
                                        <div className="flex justify-center py-10"><Spinner size={22} color={colors.accent} /></div>
                                    ) : rows.length === 0 ? (
                                        <div className="p-8 text-center flex flex-col items-center gap-2 rounded-3xl" style={({ background: `${colors.border}30` })}>
                                            <span className="w-14 h-14 rounded-full flex items-center justify-center text-white" style={{ background: GRADIENT }}><MessageCircle size={26} /></span>
                                            <p className="text-sm font-black" style={{ color: colors.textPrimary }}>Nenhuma conversa ainda</p>
                                            <p className="text-xs" style={{ color: colors.textSecondary }}>
                                                {activeStore
                                                    ? 'Ative o chat da loja em Informações da loja. Quando um cliente chamar, a conversa aparece aqui.'
                                                    : 'Ative o chat no seu perfil para receber conversas, ou toque em "Conversar" no perfil ou loja de alguém.'}
                                            </p>
                                        </div>
                                    ) : rows.map((r) => {
                                        const unread = r.unread > 0
                                        const img = otherAvatarUrl(r)
                                                                                    // 3.0: linha limpa — avatar redondo, nome, última mensagem numa linha, hora e o contador
                                            const selected = r.id === activeId
                                            return (
                                                <button
                                                    key={r.id}
                                                    onClick={() => setParams({ c: r.id })}
                                                    className="w-full flex items-center gap-3 text-left rounded-2xl p-3 transition active:scale-[0.99]"
                                                    style={{ background: selected ? `${colors.border}40` : colors.background, border: `1px solid ${unread ? '#16a34a66' : selected ? '#f97316' : colors.border}`, boxShadow: unread ? '0 4px 14px #16a34a24' : '0 2px 8px rgba(0,0,0,0.05)' }}
                                                >
                                                    {r.is_group
                                                        ? <GroupAvatar size={48} />
                                                        : <Avatar url={img} name={r.other_name || r.other_slug} isStore={r.other_is_store} userId={r.other_is_store ? undefined : r.other_id} size={48} round />}
                                                    <span className="min-w-0 flex-1">
                                                        <span className="flex items-baseline justify-between gap-2">
                                                            <span className="text-[15px] truncate" style={{ color: colors.textPrimary, fontWeight: unread ? 900 : 700 }}>{otherLabel(r)}</span>
                                                            <span className="text-[11px] flex-shrink-0" style={{ color: unread ? '#16a34a' : colors.textSecondary, fontWeight: unread ? 800 : 500 }}>{timeLabel(r.last_message_at)}</span>
                                                        </span>
                                                        <span className="flex items-center justify-between gap-2 mt-0.5">
                                                            <span className="text-[13px] truncate" style={{ color: unread ? colors.textPrimary : colors.textSecondary, fontWeight: unread ? 700 : 400 }}>
                                                                {r.last_message ? `${r.last_sender_id === userId ? 'Você: ' : ''}${r.last_message}` : 'Conversa iniciada'}
                                                            </span>
                                                            {unread && (
                                                                <span className="min-w-5 h-5 px-1.5 rounded-full text-[11px] font-black flex items-center justify-center flex-shrink-0 text-white" style={{ background: '#16a34a' }}>{r.unread}</span>
                                                            )}
                                                        </span>
                                                    </span>
                                                </button>
                                            )
                                    })}
                                </div>
                            </div>

                            {/* Conversa aberta */}
                            <div ref={threadBoxRef} className={`${active ? 'flex' : 'hidden md:flex'} flex-col min-h-0 overflow-hidden`} style={{ height: active ? (threadH != null ? `${threadH}px` : 'calc(100dvh - 250px)') : undefined, minHeight: 360, ...(({ background: `${colors.border}18`, borderRadius: 28 })) }}>
                                {active && userId ? (
                                    <Thread key={active.id} conversation={active} userId={userId} colors={colors} modern={true}
                                        onOpenInfo={() => setShowInfo(true)} infoVersion={infoVersion}
                                        onBack={() => {
                                            if (cameFromOutside.current && window.history.length > 1) { router.back(); return }
                                            setParams({ c: null })
                                        }}
                                        onRead={() => { load(); loadUnread() }} />
                                ) : (
                                    <div className="m-auto p-8 text-center flex flex-col items-center gap-2">
                                        <MessageCircle size={40} style={{ color: colors.textSecondary, opacity: 0.5 }} />
                                        <p className="text-sm font-bold" style={{ color: colors.textSecondary }}>Escolha uma conversa para ler e responder</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </section>
            </main>

            {showNew && userId && (
                <NewConversationSheet
                    me={userId}
                    onClose={() => setShowNew(false)}
                    onOpenConversation={async (id) => {
                        setShowNew(false)
                        await Promise.all([load(), loadUnread()])
                        setParams({ sala: 'perfil', c: id })
                    }}
                />
            )}
            {showInfo && active?.is_group && userId && (
                <GroupInfoSheet
                    conversationId={active.id}
                    title={active.other_name || 'Grupo'}
                    me={userId}
                    onClose={() => setShowInfo(false)}
                    onChanged={() => { setInfoVersion((v) => v + 1); load() }}
                    onLeft={() => { setShowInfo(false); setParams({ c: null }); load(); loadUnread() }}
                />
            )}
        </div>
    )
}

/** Sala de conversas. Uma implementação só para as duas versões (muda só a moldura, ver CarrinhoScreen). */
export default function ConversasScreen({ embedded = false, basePath = '/conversas', defaultRoom = null }: { embedded?: boolean; basePath?: string; defaultRoom?: string | null }) {
    return (
        <Suspense fallback={null}>
            <ConversasInner embedded={embedded} basePath={basePath} defaultRoom={defaultRoom} />
        </Suspense>
    )
}
