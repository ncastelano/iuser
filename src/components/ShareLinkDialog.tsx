// src/components/ShareLinkDialog.tsx
//
// O diálogo PADRÃO de "Compartilhar" do iUser (todo botão de compartilhar abre este, via ShareDialogHost/handleShareLink): o link com
// botão de copiar, atalhos pra WhatsApp, Facebook, Instagram e X e, para links do iUser com a pessoa logada, "No iUser": mandar para uma
// comunidade em que ela já está ou publicar no próprio perfil. Instagram não tem endereço de compartilhar link (só o app); então ele
// copia o link e abre o Direct pra pessoa colar. Em quem tem o compartilhar nativo do aparelho, ainda tem "Mais opções".
'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { Check, Copy, Share2, UserSquare2, Users, X } from 'lucide-react'
import { toast } from 'sonner'
import { useTheme } from '@/app/contexts/theme'
import { iuserPath } from '@/lib/chatLinks'
import { listMyCommunities, publishToMyProfile, sendToCommunity, type MyCommunity } from '@/lib/shareToIuser'

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
    const [pickCommunity, setPickCommunity] = useState(false)
    const [sentTo, setSentTo] = useState<Record<string, 'sending' | 'sent'>>({})
    const [profileState, setProfileState] = useState<'idle' | 'sending' | 'sent'>('idle')

    useEffect(() => {
        setCanNativeShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function')
    }, [])
    useEffect(() => {
        if (!open) return
        setCopied(false); setPickCommunity(false); setSentTo({}); setProfileState('idle'); setCommunities(undefined)
        if (canInternal) listMyCommunities().then(setCommunities, () => setCommunities([]))
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [open, onClose, canInternal])

    if (!open || typeof document === 'undefined') return null

    const full = `${text}\n${url}`
    const enc = encodeURIComponent
    const openWindow = (href: string) => { onShared?.(); window.open(href, '_blank', 'noopener,noreferrer') }

    const sendCommunity = async (c: MyCommunity) => {
        setSentTo((m) => ({ ...m, [c.id]: 'sending' }))
        try {
            await sendToCommunity(c.id, title, url)
            onShared?.()
            setSentTo((m) => ({ ...m, [c.id]: 'sent' }))
            toast.success(`Enviado para ${c.name}!`)
        } catch (e: any) {
            setSentTo((m) => { const n = { ...m }; delete n[c.id]; return n })
            toast.error(e?.message || 'Não foi possível enviar para a comunidade.')
        }
    }
    const publishProfile = async () => {
        setProfileState('sending')
        try {
            await publishToMyProfile({ title, text, url, imageUrl })
            onShared?.()
            setProfileState('sent')
            toast.success('Publicado no seu perfil!')
        } catch (e: any) {
            setProfileState('idle')
            toast.error(e?.message || 'Não foi possível publicar no seu perfil.')
        }
    }

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
                style={{ width: '100%', maxWidth: 400, background: colors.surface, color: colors.textPrimary, border: `1px solid ${colors.border}`, borderRadius: 24, padding: 20, boxShadow: colors.shadow }}
            >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 900 }}>{title}</h2>
                    <button onClick={onClose} aria-label="Fechar" style={{ width: 34, height: 34, borderRadius: '50%', border: 'none', background: `${colors.border}66`, color: colors.textSecondary, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <X size={16} />
                    </button>
                </div>
                <p style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 14 }}>
                    Escolha onde enviar:
                </p>

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

                {canInternal && communities !== null && (
                    <div style={{ marginTop: 16 }}>
                        <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.textSecondary, marginBottom: 8 }}>No iUser</p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            <button
                                onClick={() => setPickCommunity((v) => !v)}
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, border: `1px solid ${pickCommunity ? '#f97316' : colors.border}`, background: pickCommunity ? '#f9731618' : 'transparent', color: colors.textPrimary, borderRadius: 14, padding: '11px 8px', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}
                            >
                                <Users size={15} color="#f97316" /> Numa comunidade
                            </button>
                            <button
                                onClick={publishProfile}
                                disabled={profileState !== 'idle'}
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, border: `1px solid ${colors.border}`, background: 'transparent', color: colors.textPrimary, borderRadius: 14, padding: '11px 8px', fontWeight: 800, fontSize: 13, cursor: profileState === 'idle' ? 'pointer' : 'default', opacity: profileState === 'sending' ? 0.6 : 1 }}
                            >
                                {profileState === 'sent' ? <><Check size={15} color="#10b981" /> No seu perfil</> : <><UserSquare2 size={15} color="#f97316" /> {profileState === 'sending' ? 'Publicando…' : 'No meu perfil'}</>}
                            </button>
                        </div>
                        {pickCommunity && (
                            <div style={{ marginTop: 8, maxHeight: 176, overflowY: 'auto', borderRadius: 14, border: `1px solid ${colors.border}` }}>
                                {communities === undefined && <p style={{ padding: 12, fontSize: 12, color: colors.textSecondary }}>Carregando suas comunidades…</p>}
                                {communities && communities.length === 0 && (
                                    <p style={{ padding: 12, fontSize: 12, color: colors.textSecondary }}>
                                        Você ainda não está em nenhuma comunidade. <Link href="/comunidade" onClick={onClose} style={{ color: '#f97316', fontWeight: 800 }}>Ver comunidades</Link>
                                    </p>
                                )}
                                {communities?.map((c) => (
                                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: `1px solid ${colors.border}60` }}>
                                        <span style={{ flex: 1, minWidth: 0 }}>
                                            <span style={{ display: 'block', fontSize: 13, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                                            <span style={{ display: 'block', fontSize: 11, color: colors.textSecondary }}>{c.city}</span>
                                        </span>
                                        <button
                                            onClick={() => sendCommunity(c)}
                                            disabled={!!sentTo[c.id]}
                                            style={{ border: 'none', borderRadius: 999, padding: '7px 14px', fontSize: 12, fontWeight: 900, cursor: sentTo[c.id] ? 'default' : 'pointer', background: sentTo[c.id] === 'sent' ? '#10b981' : '#f97316', color: '#fff', opacity: sentTo[c.id] === 'sending' ? 0.6 : 1 }}
                                        >
                                            {sentTo[c.id] === 'sent' ? 'Enviado' : sentTo[c.id] === 'sending' ? '…' : 'Enviar'}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

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
            </div>
        </div>,
        document.body,
    )
}
