// app/(main)/conversas/page.tsx
//
// Sala de conversas. Duas "salas" no cabeçalho: a da PESSOA (aba do perfil, abre primeiro) e uma por LOJA que a pessoa
// tem. A da pessoa mostra todas as conversas dela (as que puxou e as que pessoas puxaram com ela); a da loja só as
// conversas daquela loja. Quem decide o que cada um pode ver é o banco (policies + get_my_conversations).
'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, MessageCircle, Plus, Send, Store as StoreIcon, User, Users } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { useProfile } from '@/app/contexts/ProfileContext'
import { useTheme } from '@/app/contexts/theme'
import PageTabs from '@/components/PageTabs'
import Header from '@/components/Header'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import type { UiVersion } from '@/versions/registry'
import GroupAvatar from '@/modules/chat/ui/GroupAvatar'
import NewConversationSheet from '@/modules/chat/ui/NewConversationSheet'
import GroupInfoSheet from '@/modules/chat/ui/GroupInfoSheet'
import { getMyGroupInvites, respondGroupInvite, type GroupInvite } from '@/modules/chat/api'
import PlanAvatarRing, { PlanRingInset } from '@/components/PlanAvatarRing'
import { Spinner } from '@/components/Spinner'
import { getAvatarUrl } from '@/lib/avatar'
import { notifyChatMessage } from '@/lib/notifyRideStatus'
import RequestCard, { type RequestRef } from '@/components/RequestCard'

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

interface Message { id: string; conversation_id: string; sender_id: string; content: string; created_at: string; ref_product_id?: string | null; ref_request_id?: string | null }

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
    const [loading, setLoading] = useState(true)
    // Grupo: nome de quem escreveu cada mensagem
    const [senderNames, setSenderNames] = useState<Record<string, string>>({})
    const [text, setText] = useState('')
    const [sending, setSending] = useState(false)
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

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        supabase
            .from('direct_messages')
            .select('id, conversation_id, sender_id, content, created_at, ref_product_id, ref_request_id')
            .eq('conversation_id', convId)
            .order('created_at', { ascending: true })
            .limit(300)
            .then(({ data }) => {
                if (cancelled) return
                setMessages((data as Message[]) || [])
                setLoading(false)
                markRead()
                loadRefs()
            })

        const channel = supabase
            .channel(`dm-${convId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `conversation_id=eq.${convId}` }, (payload) => {
                const m = payload.new as Message
                setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))
                if (m.ref_product_id || m.ref_request_id) loadRefs()
                if (m.sender_id !== userId) markRead()
            })
            .subscribe()
        return () => { cancelled = true; supabase.removeChannel(channel) }
    }, [convId, userId, markRead, loadRefs])

    useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [messages])

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

    const send = async () => {
        const content = text.trim()
        if (!content || sending) return
        setSending(true)
        const { data, error } = await supabase
            .from('direct_messages')
            .insert({ conversation_id: convId, sender_id: userId, content })
            .select('id, conversation_id, sender_id, content, created_at')
            .single()
        setSending(false)
        if (error) return
        setText('')
        setMessages((prev) => (prev.some((x) => x.id === data.id) ? prev : [...prev, data as Message]))
        onReadRef.current()
        notifyChatMessage(convId)
    }

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
                            <p className="text-[11px] truncate" style={{ color: colors.textSecondary }}>{conversation.other_is_store ? `@${conversation.other_slug} · ver loja` : 'ver perfil'}</p>
                        </div>
                    </Link>
                ) : (
                    <p className="text-sm font-black truncate" style={{ color: colors.textPrimary }}>{otherLabel(conversation)}</p>
                )}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-3 py-4 flex flex-col gap-2">
                {loading ? (
                    <div className="flex justify-center py-10"><Spinner size={22} color={colors.accent} /></div>
                ) : messages.length === 0 ? (
                    <p className="text-center text-sm py-10" style={{ color: colors.textSecondary }}>Nenhuma mensagem ainda. Diga um oi 👋</p>
                ) : messages.map((m, i) => {
                    const mine = m.sender_id === userId
                    const prev = messages[i - 1]
                    const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString()
                    return (
                        <div key={m.id} className="flex flex-col">
                            {newDay && (
                                <p className="text-center text-[11px] font-bold my-2" style={{ color: colors.textSecondary }}>
                                    {new Date(m.created_at).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
                                </p>
                            )}
                            <div className={`max-w-[80%] px-3.5 py-2 rounded-2xl text-sm break-words whitespace-pre-wrap ${mine ? 'self-end rounded-br-md text-white' : 'self-start rounded-bl-md'}`}
                                style={mine
                                    ? { background: GRADIENT }
                                    : modern
                                        ? { background: `${colors.border}55`, color: colors.textPrimary }
                                        : { background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }}>
                                {conversation.is_group && !mine && (
                                    <span className="block text-[11px] font-black mb-0.5" style={{ color: colors.accent }}>{senderNames[m.sender_id] || 'Alguém'}</span>
                                )}
                                {m.ref_product_id && refs[m.ref_product_id] && (() => {
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
                                {m.content}
                                <span className="block text-[10px] mt-0.5 text-right" style={{ opacity: 0.7 }}>
                                    {new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                        </div>
                    )
                })}
                <div ref={endRef} />
            </div>

            <div className={`flex items-end gap-2 px-3 py-3 flex-shrink-0 ${modern ? '' : 'border-t'}`} style={modern ? undefined : { borderColor: colors.border }}>
                <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                    rows={1}
                    maxLength={2000}
                    placeholder="Escreva uma mensagem..."
                    className="flex-1 resize-none rounded-3xl px-4 py-2.5 text-sm outline-none max-h-32"
                    style={modern
                        ? { background: `${colors.border}40`, color: colors.textPrimary }
                        : { background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                />
                <button
                    onClick={send}
                    disabled={!text.trim() || sending}
                    className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 text-white disabled:opacity-40 transition-transform active:scale-95"
                    style={{ background: GRADIENT, boxShadow: '0 4px 12px #f9731640' }}
                    aria-label="Enviar"
                >
                    <Send size={18} />
                </button>
            </div>
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
function ConversasInner({ ui }: { ui: UiVersion }) {
    const v3 = ui === 'v3'
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

    const room = search.get('sala') || 'perfil'          // 'perfil' ou o slug da loja
    const activeId = search.get('c')
    const activeStore = room !== 'perfil' ? stores.find((s) => s.storeSlug === room) || null : null

    const setParams = useCallback((next: { sala?: string; c?: string | null }) => {
        const p = new URLSearchParams(search.toString())
        if (next.sala !== undefined) { if (next.sala === 'perfil') p.delete('sala'); else p.set('sala', next.sala) }
        if (next.c !== undefined) { if (next.c) p.set('c', next.c); else p.delete('c') }
        router.replace(`/conversas${p.toString() ? `?${p}` : ''}`)
    }, [router, search])

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
        <div className={v3 ? undefined : 'relative min-h-dvh'} style={v3 ? undefined : { background: colors.background }}>
            {!v3 && (
                <div className="fixed inset-0 z-0">
                    <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
                </div>
            )}

            <main className={v3 ? 'relative pb-8' : 'relative z-10 min-h-dvh pb-8'}>
                {v3 ? (
                    <PageTabs tabs={tabs} />
                ) : (
                    <Header
                        title="Conversas"
                        showBack
                        onBack={() => router.push('/')}
                        greeting={`Olá, ${profileLoading ? '...' : profileSlug ? `@${profileSlug}` : 'Visitante'}`}
                        avatarUrl={avatarUrl}
                        loading={profileLoading}
                        tabs={tabs}
                    />
                )}

                <section className={v3 ? 'mt-3' : 'px-4 md:px-6 mt-3'}>
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
                        <div className={`grid grid-cols-[minmax(0,1fr)] md:grid-cols-[360px_minmax(0,1fr)] gap-4 ${v3 ? 'md:h-[calc(100dvh-230px)]' : 'md:h-[calc(100dvh-260px)]'}`}>
                            {/* Lista: o título sozinho em cima e os cartões (quadrados) embaixo */}
                            <div className={`${active ? 'hidden md:flex' : 'flex'} flex-col min-h-0 min-w-0`}>
                                <div className="pb-3 flex-shrink-0">
                                    <div className="flex items-center justify-between gap-3">
                                    <p className="text-lg font-black" style={{ color: colors.textPrimary }}>
                                        {activeStore ? `Conversas de ${activeStore.name}` : 'Minhas conversas'}
                                    </p>
                                    {v3 && !activeStore && (
                                        <button
                                            onClick={() => setShowNew(true)}
                                            className="flex items-center gap-1.5 pl-3 pr-3.5 h-9 rounded-full text-xs font-black text-white flex-shrink-0 transition active:scale-95"
                                            style={{ background: GRADIENT }}
                                        >
                                            <Plus size={15} strokeWidth={3} /> Nova conversa
                                        </button>
                                    )}
                                    </div>
                                    {!v3 && (
                                        <p className="text-xs" style={{ color: colors.textSecondary }}>
                                            {activeStore ? 'Só as conversas desta loja' : 'Pessoas que falaram com você e conversas que você começou'}
                                        </p>
                                    )}
                                </div>
                                <div className={`flex-1 min-h-0 overflow-y-auto flex flex-col ${v3 ? 'gap-0.5' : 'gap-3'}`}>
                                    {v3 && !activeStore && invites.length > 0 && (
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
                                        <div className="p-8 text-center flex flex-col items-center gap-2 rounded-3xl" style={v3 ? { background: `${colors.border}30` } : { background: colors.surface, border: `1px solid ${colors.border}` }}>
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
                                        if (v3) {
                                            // 3.0: linha limpa — avatar redondo, nome, última mensagem numa linha, hora e o contador
                                            const selected = r.id === activeId
                                            return (
                                                <button
                                                    key={r.id}
                                                    onClick={() => setParams({ c: r.id })}
                                                    className="w-full flex items-center gap-3 text-left rounded-2xl px-2.5 py-2.5 transition active:scale-[0.99]"
                                                    style={{ background: selected ? `${colors.border}40` : unread ? '#16a34a14' : 'transparent' }}
                                                >
                                                    {r.is_group
                                                        ? <GroupAvatar size={52} />
                                                        : <Avatar url={img} name={r.other_name || r.other_slug} isStore={r.other_is_store} userId={r.other_is_store ? undefined : r.other_id} size={52} round />}
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
                                        }
                                        // Não lida: o cartão inteiro fica verde e o texto, branco
                                        const fg = unread ? '#ffffff' : colors.textPrimary
                                        const fg2 = unread ? 'rgba(255,255,255,0.85)' : colors.textSecondary
                                        return (
                                            <button
                                                key={r.id}
                                                onClick={() => setParams({ c: r.id })}
                                                className="w-full flex items-stretch text-left overflow-hidden transition-transform hover:-translate-y-0.5"
                                                style={{
                                                    background: unread ? '#16a34a' : colors.surface,
                                                    border: `1px solid ${unread ? '#15803d' : r.id === activeId ? colors.accent : colors.border}`,
                                                    boxShadow: unread ? '0 6px 18px #16a34a55' : colors.shadow,
                                                }}
                                            >
                                                {/* A imagem ocupa o quadrado todo, do lado esquerdo */}
                                                <span className="relative w-24 h-24 flex-shrink-0 overflow-hidden flex items-center justify-center text-white text-3xl font-black" style={{ background: GRADIENT }}>
                                                    {img ? (
                                                        <img src={img} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                                                    ) : r.other_is_store ? (
                                                        <StoreIcon size={32} />
                                                    ) : (
                                                        (otherLabel(r, '?')).replace('@', '').charAt(0).toUpperCase()
                                                    )}
                                                    {!r.other_is_store && <PlanRingInset userId={r.other_id} width={3} radius="0px" />}
                                                </span>
                                                <span className="min-w-0 flex-1 px-3 py-2.5 flex flex-col justify-center gap-0.5">
                                                    <span className="flex items-baseline justify-between gap-2">
                                                        <span className="text-sm font-black truncate" style={{ color: fg }}>{otherLabel(r)}</span>
                                                        <span className="text-[11px] flex-shrink-0" style={{ color: fg2 }}>{timeLabel(r.last_message_at)}</span>
                                                    </span>
                                                    <span className="flex items-center justify-between gap-2">
                                                        <span className="text-xs line-clamp-2" style={{ color: fg2, fontWeight: unread ? 700 : 400 }}>
                                                            {r.last_message ? `${r.last_sender_id === userId ? 'Você: ' : ''}${r.last_message}` : 'Conversa iniciada'}
                                                        </span>
                                                        {unread && (
                                                            <span className="min-w-5 h-5 px-1.5 rounded-full text-[11px] font-black flex items-center justify-center flex-shrink-0" style={{ background: '#ffffff', color: '#16a34a' }}>{r.unread}</span>
                                                        )}
                                                    </span>
                                                    {r.role === 'customer' && <span className="text-[10px]" style={{ color: fg2 }}>Você começou esta conversa</span>}
                                                </span>
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>

                            {/* Conversa aberta */}
                            <div className={`${active ? 'flex' : 'hidden md:flex'} flex-col min-h-0 overflow-hidden`} style={{ height: active ? 'calc(100dvh - 250px)' : undefined, minHeight: 360, ...(v3 ? { background: `${colors.border}18`, borderRadius: 28 } : { background: colors.surface, border: `1px solid ${colors.border}`, boxShadow: colors.shadow }) }}>
                                {active && userId ? (
                                    <Thread key={active.id} conversation={active} userId={userId} colors={colors} modern={v3}
                                        onOpenInfo={() => setShowInfo(true)} infoVersion={infoVersion}
                                        onBack={() => setParams({ c: null })}
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
export default function ConversasScreen({ ui = 'v3' }: { ui?: UiVersion }) {
    return (
        <Suspense fallback={null}>
            <ConversasInner ui={ui} />
        </Suspense>
    )
}
