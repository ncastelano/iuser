// src/components/ShareLinkDialog.tsx
//
// O diálogo PADRÃO de "Compartilhar" do iUser (todo botão de compartilhar abre este, via ShareDialogHost/handleShareLink). Em cima, o que
// é DENTRO do iUser (só para link do iUser e pessoa logada): sugestões dos últimos lugares para onde ela compartilhou, e as escolhas
// Comunidade (as que ela já está), Meu perfil (publicação) e Um perfil (a conversa dele). Embaixo, "Convidar": WhatsApp, Facebook,
// Instagram e X e o link com botão de copiar. Instagram não tem endereço de compartilhar link (só o app); então ele copia o link e abre
// o Direct pra pessoa colar. Em quem tem o compartilhar nativo do aparelho, ainda tem "Mais opções".
'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { Check, Copy, MessageCircle, Search, Share2, UserSquare2, Users, X } from 'lucide-react'
import { toast } from 'sonner'
import { useTheme } from '@/app/contexts/theme'
import { iuserPath } from '@/lib/chatLinks'
import {
    getRecentTargets, listMyChats, listMyCommunities, publishToMyProfile, pushRecentTarget, sendToChat, sendToCommunity, startChatWith,
    type MyChat, type MyCommunity, type RecentTarget,
} from '@/lib/shareToIuser'
import { searchShareTargets, type ShareCard } from '@/lib/shareCards'

interface ShareLinkDialogProps {
    open: boolean
    onClose: () => void
    url: string
    /** Título da janela e do compartilhar nativo */
    title: string
    /** Mensagem que acompanha o link (WhatsApp, X, Facebook) */
    text: string
    /** Imagem do que está sendo compartilhado (vai na publicação do perfil) */
    imageUrl?: string | null
    /** Avisa que a pessoa compartilhou de verdade (copiou, mandou para uma rede, comunidade ou perfil) */
    onShared?: () => void
    /** Desliga "No iUser" (ex.: convite, que não faz sentido numa comunidade) */
    internal?: boolean
}

const WHATSAPP_PATH = 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z'
const FACEBOOK_PATH = 'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z'
const X_PATH = 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z'

function Brand({ d }: { d: string }) {
    return <svg viewBox="0 0 24 24" width="26" height="26" fill="#fff" aria-hidden><path d={d} /></svg>
}
function InstagramIcon() {
    return (
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <rect x="3" y="3" width="18" height="18" rx="5" />
            <circle cx="12" cy="12" r="4" />
            <circle cx="17.3" cy="6.7" r="0.6" fill="#fff" />
        </svg>
    )
}

export async function copyText(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text)
        return true
    } catch {
        return false
    }
}

export default function ShareLinkDialog({ open, onClose, url, title, text, imageUrl, onShared, internal = true }: ShareLinkDialogProps) {
    const { colors } = useTheme()
    const [copied, setCopied] = useState(false)
    const [canNativeShare, setCanNativeShare] = useState(false)
    // "No iUser": só link do iUser (é o que a comunidade aceita) e com a pessoa logada
    const canInternal = internal && !!url && iuserPath(url) !== null
    const [communities, setCommunities] = useState<MyCommunity[] | null | undefined>(undefined)   // undefined = carregando, null = sem login
    const [chats, setChats] = useState<MyChat[]>([])
    const [recents, setRecents] = useState<RecentTarget[]>([])
    const [panel, setPanel] = useState<null | 'community' | 'chat'>(null)
    const [q, setQ] = useState('')
    const [found, setFound] = useState<ShareCard[]>([])
    const [state, setState] = useState<Record<string, 'sending' | 'sent'>>({})

    useEffect(() => {
        setCanNativeShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function')
    }, [])
    useEffect(() => {
        if (!open) return
        setCopied(false); setPanel(null); setQ(''); setFound([]); setState({}); setCommunities(undefined); setChats([]); setRecents(getRecentTargets())
        if (canInternal) {
            listMyCommunities().then(setCommunities, () => setCommunities([]))
            listMyChats().then((c) => setChats(c || []), () => setChats([]))
        }
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [open, onClose, canInternal])

    // Busca de perfis (para quem ainda não tem conversa)
    useEffect(() => {
        if (panel !== 'chat' || q.trim().length < 2) { setFound([]); return }
        let alive = true
        const t = setTimeout(() => { searchShareTargets('profile', q.trim()).then((r) => { if (alive) setFound(r) }).catch(() => { if (alive) setFound([]) }) }, 250)
        return () => { alive = false; clearTimeout(t) }
    }, [panel, q])

    if (!open || typeof document === 'undefined') return null

    const showInternal = canInternal && communities !== null
    const full = `${text}\n${url}`
    const enc = encodeURIComponent
    const openWindow = (href: string) => { onShared?.(); window.open(href, '_blank', 'noopener,noreferrer') }

    // Sugestões: os últimos lugares onde ela compartilhou; sem histórico, as conversas e comunidades mais recentes dela
    const suggestions: RecentTarget[] = recents.length > 0 ? recents : [
        ...chats.slice(0, 3).map((c): RecentTarget => ({ kind: 'chat', id: c.id, name: c.name, sub: c.sub, avatar: c.avatar })),
        ...(communities || []).slice(0, 2).map((c): RecentTarget => ({ kind: 'community', id: c.id, name: c.name, sub: c.city })),
    ]

    const run = async (key: string, target: RecentTarget, action: () => Promise<RecentTarget | void>) => {
        setState((m) => ({ ...m, [key]: 'sending' }))
        try {
            const done = (await action()) || target
            onShared?.()
            pushRecentTarget(done)
            setRecents(getRecentTargets())
            setState((m) => ({ ...m, [key]: 'sent' }))
            toast.success(done.kind === 'profile' ? 'Publicado no seu perfil!' : `Enviado para ${done.name}!`)
        } catch (e: any) {
            setState((m) => { const n = { ...m }; delete n[key]; return n })
            toast.error(e?.message || 'Não foi possível compartilhar.')
        }
    }
    const sendTarget = (t: RecentTarget) => run(`${t.kind}:${t.id}`, t, async () => {
        if (t.kind === 'community') await sendToCommunity(t.id, title, url)
        else if (t.kind === 'chat') await sendToChat(t.id, title, url)
        else await publishToMyProfile({ title, text, url, imageUrl })
    })
    const sendToProfile = (c: ShareCard) => run(`found:${c.id}`, { kind: 'chat', id: c.id, name: c.title }, async () => {
        const convId = await startChatWith(c.id)
        await sendToChat(convId, title, url)
        return { kind: 'chat', id: convId, name: c.title, sub: c.subtitle, avatar: c.imageUrl }
    })

    const copy = async () => {
        const ok = await copyText(url)
        if (ok) {
            onShared?.()
            setCopied(true)
            toast.success('Link copiado!')
            setTimeout(() => setCopied(false), 2500)
        } else {
            toast.error('Não foi possível copiar o link.')
        }
    }

    const targets: { id: string; label: string; bg: string; icon: React.ReactNode; onClick: () => void }[] = [
        { id: 'whatsapp', label: 'WhatsApp', bg: '#25D366', icon: <Brand d={WHATSAPP_PATH} />, onClick: () => openWindow(`https://wa.me/?text=${enc(full)}`) },
        { id: 'facebook', label: 'Facebook', bg: '#1877F2', icon: <Brand d={FACEBOOK_PATH} />, onClick: () => openWindow(`https://www.facebook.com/sharer/sharer.php?u=${enc(url)}&quote=${enc(text)}`) },
        {
            id: 'instagram', label: 'Instagram', bg: 'linear-gradient(45deg, #f09433, #e6683c 30%, #dc2743 55%, #cc2366 75%, #bc1888)', icon: <InstagramIcon />,
            // O Instagram não aceita link por endereço: copia e abre o Direct pra colar
            onClick: async () => {
                await copyText(url)
                onShared?.()
                toast.success('Link copiado! Cole no Direct, nos stories ou na bio do Instagram.')
                openWindow('https://www.instagram.com/direct/inbox/')
            },
        },
        { id: 'x', label: 'X', bg: '#000000', icon: <Brand d={X_PATH} />, onClick: () => openWindow(`https://x.com/intent/post?text=${enc(text)}&url=${enc(url)}`) },
    ]

    const label = (t: string, extra?: React.ReactNode) => (
        <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.textSecondary, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>{t}{extra}</p>
    )
    const bigBtn = (active: boolean, icon: React.ReactNode, text: string, onClick: () => void, status?: 'sending' | 'sent') => (
        <button
            onClick={onClick}
            disabled={status === 'sending'}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, border: `1.5px solid ${active ? '#f97316' : colors.border}`, background: active ? '#f9731618' : colors.surface, color: colors.textPrimary, borderRadius: 16, padding: '12px 6px', fontWeight: 800, fontSize: 12.5, cursor: 'pointer', opacity: status === 'sending' ? 0.6 : 1 }}
        >
            {status === 'sent' ? <Check size={20} color="#10b981" /> : icon}
            <span style={{ lineHeight: 1.1, textAlign: 'center' }}>{text}</span>
        </button>
    )
    const avatarBubble = (src: string | null | undefined, fallback: string) => (
        <span style={{ width: 34, height: 34, borderRadius: '50%', overflow: 'hidden', background: `${colors.border}80`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900, flexShrink: 0 }}>
            {src ? <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : fallback.replace('@', '').charAt(0).toUpperCase()}
        </span>
    )
    const row = (key: string, avatar: React.ReactNode, name: string, sub: string | null | undefined, onSend: () => void) => (
        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderBottom: `1px solid ${colors.border}60` }}>
            {avatar}
            <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                {sub && <span style={{ display: 'block', fontSize: 11, color: colors.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</span>}
            </span>
            <button
                onClick={onSend}
                disabled={!!state[key]}
                style={{ border: 'none', borderRadius: 999, padding: '7px 14px', fontSize: 12, fontWeight: 900, cursor: state[key] ? 'default' : 'pointer', background: state[key] === 'sent' ? '#10b981' : '#f97316', color: '#fff', opacity: state[key] === 'sending' ? 0.6 : 1 }}
            >
                {state[key] === 'sent' ? 'Enviado' : state[key] === 'sending' ? '…' : 'Enviar'}
            </button>
        </div>
    )

    const chatList = chats.filter((c) => !q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase()) || (c.sub || '').toLowerCase().includes(q.trim().toLowerCase())).slice(0, 12)
    const knownProfile = new Set(chats.map((c) => (c.sub || '').toLowerCase()))
    const foundNew = found.filter((c) => !knownProfile.has((c.title || '').toLowerCase()))

    return createPortal(
        <div
            onClick={onClose}
            style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
            role="dialog"
            aria-modal="true"
            aria-label={title}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{ width: '100%', maxWidth: 420, maxHeight: '92dvh', overflowY: 'auto', background: colors.surface, color: colors.textPrimary, border: `1px solid ${colors.border}`, borderRadius: 24, padding: 20, boxShadow: colors.shadow }}
            >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 900 }}>Compartilhar</h2>
                    <button onClick={onClose} aria-label="Fechar" style={{ width: 34, height: 34, borderRadius: '50%', border: 'none', background: `${colors.border}66`, color: colors.textSecondary, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <X size={16} />
                    </button>
                </div>

                {/* ===== O QUE ESTÁ SENDO COMPARTILHADO ===== */}
                <div style={{ display: 'flex', gap: 12, padding: 10, marginBottom: 16, borderRadius: 18, border: `1px solid ${colors.border}`, background: `${colors.border}25` }}>
                    <span style={{ width: 72, height: 72, borderRadius: 14, overflow: 'hidden', flexShrink: 0, background: '#f9731622', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {imageUrl ? <img src={imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Share2 size={24} color="#f97316" />}
                    </span>
                    <span style={{ minWidth: 0, flex: 1 }}>
                        <span style={{ display: 'block', fontSize: 15, fontWeight: 900, lineHeight: 1.25 }}>{title}</span>
                        {text && text.trim() !== title.trim() && (
                            <span style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontSize: 12.5, lineHeight: 1.35, color: colors.textSecondary, marginTop: 3 }}>{text}</span>
                        )}
                        <span style={{ display: 'block', fontSize: 11, color: colors.textSecondary, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.8 }}>{url.replace(/^https?:\/\//, '')}</span>
                    </span>
                </div>

                {/* ===== DENTRO DO iUSER (em cima) ===== */}
                {showInternal && (
                    <section style={{ marginBottom: 16 }}>
                        {label('Compartilhar no iUser')}
                        {suggestions.length > 0 && (
                            <div style={{ marginBottom: 12 }}>
                                <p style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 6, fontWeight: 700 }}>Últimos lugares</p>
                                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                                    {suggestions.map((t) => {
                                        const key = `${t.kind}:${t.id}`
                                        return (
                                            <button
                                                key={key}
                                                onClick={() => sendTarget(t)}
                                                disabled={!!state[key]}
                                                style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, maxWidth: 190, padding: '6px 12px 6px 6px', borderRadius: 999, border: `1px solid ${state[key] === 'sent' ? '#10b981' : colors.border}`, background: colors.surface, color: colors.textPrimary, cursor: state[key] ? 'default' : 'pointer', opacity: state[key] === 'sending' ? 0.6 : 1 }}
                                            >
                                                {state[key] === 'sent'
                                                    ? <span style={{ width: 34, height: 34, borderRadius: '50%', background: '#10b98122', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Check size={16} color="#10b981" /></span>
                                                    : t.kind === 'profile'
                                                        ? <span style={{ width: 34, height: 34, borderRadius: '50%', background: '#f9731622', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><UserSquare2 size={16} color="#f97316" /></span>
                                                        : t.kind === 'community'
                                                            ? <span style={{ width: 34, height: 34, borderRadius: '50%', background: '#f9731622', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Users size={16} color="#f97316" /></span>
                                                            : avatarBubble(t.avatar, t.name)}
                                                <span style={{ fontSize: 12.5, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.kind === 'profile' ? 'Meu perfil' : t.name}</span>
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                        )}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                            {bigBtn(panel === 'community', <Users size={20} color="#f97316" />, 'Comunidade', () => setPanel((v) => (v === 'community' ? null : 'community')))}
                            {bigBtn(false, <UserSquare2 size={20} color="#f97316" />, 'Meu perfil', () => sendTarget({ kind: 'profile', id: 'me', name: 'Meu perfil' }), state['profile:me'])}
                            {bigBtn(panel === 'chat', <MessageCircle size={20} color="#f97316" />, 'Um perfil', () => setPanel((v) => (v === 'chat' ? null : 'chat')))}
                        </div>

                        {panel === 'community' && (
                            <div style={{ marginTop: 10, maxHeight: 190, overflowY: 'auto', borderRadius: 14, border: `1px solid ${colors.border}`, background: colors.surface }}>
                                {communities === undefined && <p style={{ padding: 12, fontSize: 12, color: colors.textSecondary }}>Carregando suas comunidades…</p>}
                                {communities && communities.length === 0 && (
                                    <p style={{ padding: 12, fontSize: 12, color: colors.textSecondary }}>
                                        Você ainda não está em nenhuma comunidade. <Link href="/comunidade" onClick={onClose} style={{ color: '#f97316', fontWeight: 800 }}>Ver comunidades</Link>
                                    </p>
                                )}
                                {communities?.map((c) => row(`community:${c.id}`, <span style={{ width: 34, height: 34, borderRadius: '50%', background: '#f9731622', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Users size={16} color="#f97316" /></span>, c.name, c.city, () => sendTarget({ kind: 'community', id: c.id, name: c.name, sub: c.city })))}
                            </div>
                        )}

                        {panel === 'chat' && (
                            <div style={{ marginTop: 10 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', height: 40, borderRadius: 999, border: `1px solid ${colors.border}`, background: colors.surface }}>
                                    <Search size={15} color={colors.textSecondary} />
                                    <input
                                        autoFocus
                                        value={q}
                                        onChange={(e) => setQ(e.target.value)}
                                        placeholder="Buscar conversa ou perfil"
                                        style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: colors.textPrimary, fontSize: 13 }}
                                    />
                                </div>
                                <div style={{ marginTop: 8, maxHeight: 190, overflowY: 'auto', borderRadius: 14, border: `1px solid ${colors.border}`, background: colors.surface }}>
                                    {chatList.map((c) => row(`chat:${c.id}`, avatarBubble(c.avatar, c.name), c.name, c.sub, () => sendTarget({ kind: 'chat', id: c.id, name: c.name, sub: c.sub, avatar: c.avatar })))}
                                    {foundNew.map((c) => row(`found:${c.id}`, avatarBubble(c.imageUrl, c.title), c.title, c.subtitle || 'Abrir conversa', () => sendToProfile(c)))}
                                    {chatList.length === 0 && foundNew.length === 0 && (
                                        <p style={{ padding: 12, fontSize: 12, color: colors.textSecondary }}>{q.trim().length < 2 ? 'Você ainda não tem conversas. Busque um perfil pelo nome.' : 'Ninguém encontrado.'}</p>
                                    )}
                                </div>
                            </div>
                        )}
                    </section>
                )}

                {/* ===== CONVIDAR (fora do iUser, embaixo, no cartão laranja) ===== */}
                <section style={{ borderRadius: 20, padding: 14, background: '#f973161a', border: '1px solid #f9731640' }}>
                {label('Convidar')}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                    {targets.map((t) => (
                        <button
                            key={t.id}
                            onClick={t.onClick}
                            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', cursor: 'pointer', color: colors.textPrimary, padding: 0 }}
                        >
                            <span style={{ width: 54, height: 54, borderRadius: 18, background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.18)' }}>{t.icon}</span>
                            <span style={{ fontSize: 12, fontWeight: 700 }}>{t.label}</span>
                        </button>
                    ))}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, padding: 6, paddingLeft: 12, borderRadius: 14, border: `1px solid ${colors.border}`, background: `${colors.border}22` }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: colors.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{url}</span>
                    <button
                        onClick={copy}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', cursor: 'pointer', borderRadius: 10, padding: '8px 12px', fontWeight: 800, fontSize: 13, background: copied ? '#10b981' : colors.accent, color: copied ? '#fff' : colors.accentText, flexShrink: 0 }}
                    >
                        {copied ? <><Check size={14} /> Copiado</> : <><Copy size={14} /> Copiar</>}
                    </button>
                </div>

                {canNativeShare && (
                    <button
                        onClick={() => navigator.share({ title, text, url }).then(() => onShared?.()).catch(() => {})}
                        style={{ marginTop: 10, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, border: `1px dashed ${colors.border}`, background: 'transparent', color: colors.textSecondary, borderRadius: 14, padding: '10px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                    >
                        <Share2 size={14} /> Mais opções do aparelho
                    </button>
                )}
                </section>
            </div>
        </div>,
        document.body,
    )
}
