// src/versions/v3/screens/FlashScreen.tsx
//
// FLASH (3.0): o feed de PESSOAS no estilo reels/tiktok, com cara de twitter/instagram/facebook juntos. Cada item ocupa a tela toda (rolagem que "encaixa"):
// flash com foto ou vídeo (a mídia é o fundo), flash só de texto (fundo em cor, letra grande, como um tweet/story) e as PUBLICAÇÕES das pessoas.
// À direita: curtir, comentar, compartilhar (e apagar, se for seu); embaixo: quem postou (com Seguir) e o texto. Abas "Para você" e "Seguindo",
// botão de postar e aviso de "novos flashes" ao vivo.
// PILHA DE CARDS: o flash seguinte sobe de baixo para cima POR CIMA do atual, que recua, encolhe, escurece e deixa uma bordinha à mostra no topo (como a pilha de "Sugestões" do Mercado Pago).
// Os cards vivem num palco fixo e são posicionados pela rolagem (StackedFeed); a rolagem que encaixa fica em espaçadores invisíveis. Regras e acesso ao banco: `modules/flash` (quem pode o quê é do banco).
'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { r2Availability } from '@/lib/r2Upload'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { toast } from '@/lib/toast'
import ReportButton from '@/components/moderation/ReportButton'
import { ArrowLeft, ArrowUp, Heart, ImagePlus, MessageCircle, Plus, Send, Share2, Trash2, UserPlus, X, Zap } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { handleShareLink } from '@/lib/share'
import {
    addComment, authorAvatarUrl, countShare, deleteComment, deleteFlash, fetchComments, fetchFeed, fitFontSize, flashGradient, mediaSrc, PAGE_SIZE, postFlash,
    setFollowing, setLiked, shortCount, timeAgo, FLASH_COMMENT_MAX_CHARS, FLASH_MAX_CHARS, validateFlash,
    type FlashComment, type FlashItem, type FlashMode,
} from '@/modules/flash'

const ORANGE = '#f97316'

function Avatar({ item, size = 40 }: { item: Pick<FlashItem, 'authorAvatar' | 'authorName'>; size?: number }) {
    const url = authorAvatarUrl(item.authorAvatar)
    return (
        <span className="rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 font-black text-white" style={{ width: size, height: size, background: 'rgba(255,255,255,0.25)', fontSize: size * 0.4, boxShadow: '0 0 0 2px rgba(255,255,255,0.85)' }}>
            {url ? <img src={url} alt="" className="w-full h-full object-cover" /> : (item.authorName || '?').charAt(0).toUpperCase()}
        </span>
    )
}

/** Vídeo que toca (mudo, em laço) só enquanto é o card da FRENTE da pilha (`active`); um toque pausa/continua */
function FlashVideo({ src, active }: { src: string; active: boolean }) {
    const ref = useRef<HTMLVideoElement>(null)
    const [paused, setPaused] = useState(false)
    useEffect(() => {
        const v = ref.current
        if (!v) return
        if (active) { v.play().catch(() => {}); setPaused(false) } else v.pause()
    }, [active])
    return (
        <>
            <video ref={ref} src={src} muted loop playsInline preload="metadata" className="absolute inset-0 w-full h-full object-cover"
                onClick={() => { const v = ref.current; if (!v) return; if (v.paused) { v.play().catch(() => {}); setPaused(false) } else { v.pause(); setPaused(true) } }} />
            {paused && <span className="absolute inset-0 flex items-center justify-center pointer-events-none"><span className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }}><Zap size={28} color="#fff" /></span></span>}
        </>
    )
}

function FlashCard({ item, me, active, onLike, onFollow, onComments, onShare, onDelete }: {
    item: FlashItem; me: string | null; active: boolean
    onLike: (i: FlashItem) => void; onFollow: (i: FlashItem) => void; onComments: (i: FlashItem) => void; onShare: (i: FlashItem) => void; onDelete: (i: FlashItem) => void
}) {
    const router = useRouter()
    const [more, setMore] = useState(false)
    const src = mediaSrc(item)
    const [c1, c2] = useMemo(() => flashGradient(item.id), [item.id])
    const textOnly = !src
    const own = !!me && me === item.authorId
    const body = item.content || ''
    const long = body.length > 140
    const goAuthor = () => router.push(`/${item.authorSlug}`)
    const openPublication = () => item.link && router.push(`/${item.authorSlug}/${item.link}`)

    return (
        <article data-flash-id={item.id} className="relative w-full h-full overflow-hidden" style={{ borderRadius: 28, background: `linear-gradient(160deg, ${c1}, ${c2})` }}>
            {src && item.mediaType === 'video' && <FlashVideo src={src} active={active} />}
            {src && item.mediaType !== 'video' && <img src={src} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />}

            {/* Só texto: letra grande no meio, como um tweet/story */}
            {textOnly && (
                <div className="absolute inset-0 flex items-center justify-center pl-8 pr-20 pb-24 pt-16">
                    {item.kind === 'publication' && item.title && item.title !== body && <p className="absolute top-20 left-8 right-20 text-xs font-black uppercase tracking-widest text-white/80">Publicação</p>}
                    <p className="text-white font-black leading-tight text-center break-words" style={{ fontSize: fitFontSize(item.kind === 'publication' ? (item.title || body) : body), textShadow: '0 2px 14px rgba(0,0,0,0.25)' }} onClick={item.kind === 'publication' ? openPublication : undefined}>
                        {item.kind === 'publication' ? (item.title || body) : body}
                    </p>
                </div>
            )}

            {/* Escurece o card quando ele recua na pilha (--dim vem do palco) */}
            <div className="absolute inset-0 bg-black pointer-events-none z-20" style={{ opacity: 'var(--dim, 0)' }} />

            {/* Degradê para as letras ficarem legíveis sobre foto/vídeo */}
            <div className="absolute inset-x-0 bottom-0 h-[55%] pointer-events-none" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.78), rgba(0,0,0,0))' }} />
            <div className="absolute inset-x-0 top-0 h-24 pointer-events-none" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.35), rgba(0,0,0,0))' }} />

            {/* Trilho de ações (direita) */}
            <div className="absolute right-3 bottom-24 flex flex-col items-center gap-4 z-10">
                <button onClick={() => onLike(item)} aria-label={item.liked ? 'Descurtir' : 'Curtir'} className="flex flex-col items-center gap-0.5 text-white transition active:scale-90">
                    <span className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.35)' }}><Heart size={22} fill={item.liked ? '#ef4444' : 'none'} color={item.liked ? '#ef4444' : '#fff'} /></span>
                    <span className="text-[11px] font-black">{shortCount(item.likeCount)}</span>
                </button>
                <button onClick={() => onComments(item)} aria-label="Comentários" className="flex flex-col items-center gap-0.5 text-white transition active:scale-90">
                    <span className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.35)' }}><MessageCircle size={22} /></span>
                    <span className="text-[11px] font-black">{shortCount(item.commentCount)}</span>
                </button>
                <button onClick={() => onShare(item)} aria-label="Compartilhar" className="flex flex-col items-center gap-0.5 text-white transition active:scale-90">
                    <span className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.35)' }}><Share2 size={21} /></span>
                    <span className="text-[11px] font-black">{item.shareCount > 0 ? shortCount(item.shareCount) : ''}</span>
                </button>
                {!own && (
                    <span className="flex flex-col items-center" title="Denunciar">
                        <span className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.35)' }}><ReportButton type={item.kind === 'publication' ? 'publication' : 'flash'} id={item.id} authorId={item.authorId} size={18} style={{ color: '#fff' }} /></span>
                    </span>
                )}
                {own && item.kind === 'flash' && (
                    <button onClick={() => onDelete(item)} aria-label="Apagar" className="flex flex-col items-center text-white transition active:scale-90">
                        <span className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.35)' }}><Trash2 size={19} /></span>
                    </button>
                )}
            </div>

            {/* Quem postou + texto (embaixo) */}
            <div className="absolute left-4 right-20 bottom-5 z-10 text-white">
                <div className="flex items-center gap-2.5">
                    <button onClick={goAuthor} aria-label={`Abrir o perfil de ${item.authorName}`}><Avatar item={item} /></button>
                    <button onClick={goAuthor} className="min-w-0 text-left">
                        <span className="block text-sm font-black leading-tight truncate">{item.authorName}</span>
                        <span className="block text-[11px] opacity-85 truncate">@{item.authorSlug} · {timeAgo(item.createdAt)}</span>
                    </button>
                    {!own && !item.following && (
                        <button onClick={() => onFollow(item)} className="ml-1 h-7 px-3 rounded-full text-[11px] font-black flex items-center gap-1 transition active:scale-95" style={{ background: ORANGE, color: '#fff' }}><UserPlus size={12} /> Seguir</button>
                    )}
                </div>
                {!textOnly && (item.title || body) && (
                    <div className="mt-2.5">
                        {item.kind === 'publication' && item.title && <p className="text-[13px] font-black leading-snug">{item.title}</p>}
                        {body && body !== item.title && (
                            <p className={`text-[13px] leading-snug ${more ? '' : 'line-clamp-3'}`} style={{ textShadow: '0 1px 6px rgba(0,0,0,0.5)' }}>
                                {body}
                                {long && <button onClick={() => setMore((v) => !v)} className="ml-1 font-black opacity-90">{more ? 'menos' : 'mais'}</button>}
                            </p>
                        )}
                    </div>
                )}
                {item.kind === 'publication' && (
                    <button onClick={openPublication} className="mt-2.5 h-8 px-4 rounded-full text-[11px] font-black transition active:scale-95" style={{ background: 'rgba(255,255,255,0.22)', border: '1px solid rgba(255,255,255,0.45)' }}>Abrir publicação</button>
                )}
            </div>
        </article>
    )
}

/** Comentários de um flash, numa folha que sobe de baixo */
function CommentsSheet({ item, me, onClose, onCounted }: { item: FlashItem; me: string | null; onClose: () => void; onCounted: (delta: number) => void }) {
    const { colors } = useTheme()
    const router = useRouter()
    const [list, setList] = useState<FlashComment[] | null>(null)
    const [text, setText] = useState('')
    const [sending, setSending] = useState(false)
    const load = useCallback(() => { fetchComments(item.id).then(setList, () => setList([])) }, [item.id])
    useEffect(() => { load() }, [load])
    useEffect(() => {
        const ch = supabase.channel(`flash-comments-${item.id}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'flash_comments', filter: `flash_id=eq.${item.id}` }, () => load()).subscribe()
        return () => { supabase.removeChannel(ch) }
    }, [item.id, load])

    const send = async () => {
        if (!me) { router.push('/login?redirect=/flash'); return }
        if (!text.trim() || sending) return
        setSending(true)
        try { await addComment(item.id, me, text); setText(''); onCounted(1); load() } catch (e: any) { toast.error(e.message || 'Não foi possível comentar.') } finally { setSending(false) }
    }
    const remove = async (c: FlashComment) => { try { await deleteComment(c.id); onCounted(-1); load() } catch { toast.error('Não foi possível apagar.') } }

    // Portal no body: a folha precisa ficar ACIMA da ilha e da barra de baixo (a página da casca é uma camada abaixo delas)
    return createPortal(
        <div className="fixed inset-0 z-[80] flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
            <div className="w-full max-w-md flex flex-col rounded-t-3xl overflow-hidden" style={{ background: colors.background, height: '68dvh', border: `1px solid ${colors.border}` }} onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 h-14 flex-shrink-0" style={{ borderBottom: `1px solid ${colors.border}` }}>
                    <p className="text-sm font-black" style={{ color: colors.textPrimary }}>Comentários {item.commentCount > 0 ? `(${shortCount(item.commentCount)})` : ''}</p>
                    <button onClick={onClose} aria-label="Fechar" className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: `${colors.border}50`, color: colors.textPrimary }}><X size={18} /></button>
                </div>
                <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
                    {list === null ? [0, 1, 2].map((i) => <span key={i} className="block h-12 rounded-2xl animate-pulse" style={{ background: `${colors.border}40` }} />)
                        : list.length === 0 ? <p className="text-sm text-center py-8" style={{ color: colors.textSecondary }}>Ninguém comentou ainda. Seja a primeira pessoa!</p>
                        : list.map((c) => (
                            <div key={c.id} className="flex gap-2.5">
                                <button onClick={() => router.push(`/${c.authorSlug}`)} className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center text-xs font-black flex-shrink-0" style={{ background: `${colors.border}60`, color: colors.textPrimary }}>
                                    {authorAvatarUrl(c.authorAvatar) ? <img src={authorAvatarUrl(c.authorAvatar)!} alt="" className="w-full h-full object-cover" /> : c.authorName.charAt(0).toUpperCase()}
                                </button>
                                <div className="min-w-0 flex-1">
                                    <p className="text-[12px]" style={{ color: colors.textSecondary }}><b style={{ color: colors.textPrimary }}>{c.authorName}</b> · {timeAgo(c.createdAt)}</p>
                                    <p className="text-[13px] leading-snug break-words" style={{ color: colors.textPrimary }}>{c.content}</p>
                                </div>
                                {(me === c.authorId || me === item.authorId) && <button onClick={() => remove(c)} aria-label="Apagar comentário" className="self-start p-1" style={{ color: colors.textSecondary }}><Trash2 size={14} /></button>}
                                <ReportButton type="flash_comment" id={c.id} authorId={c.authorId} size={13} className="self-start p-1" />
                            </div>
                        ))}
                </div>
                <div className="flex items-center gap-2 px-3 pt-3 flex-shrink-0" style={{ borderTop: `1px solid ${colors.border}`, paddingBottom: 'calc(12px + var(--staging-banner-h, 0px) + env(safe-area-inset-bottom))' }}>
                    <input value={text} onChange={(e) => setText(e.target.value.slice(0, FLASH_COMMENT_MAX_CHARS))} onKeyDown={(e) => { if (e.key === 'Enter') send() }} placeholder={me ? 'Escreva um comentário...' : 'Entre para comentar'} className="flex-1 h-11 rounded-full px-4 text-sm focus:outline-none" style={{ background: `${colors.border}40`, color: colors.textPrimary }} />
                    <button onClick={send} disabled={sending || !text.trim()} aria-label="Enviar" className="w-11 h-11 rounded-full flex items-center justify-center text-white disabled:opacity-50" style={{ background: ORANGE }}><Send size={18} /></button>
                </div>
            </div>
        </div>,
        document.body,
    )
}

/** Postar um flash: texto e/ou foto ou vídeo */
function ComposeSheet({ me, onClose, onPosted }: { me: string; onClose: () => void; onPosted: () => void }) {
    const { colors } = useTheme()
    const [text, setText] = useState('')
    const [file, setFile] = useState<File | null>(null)
    const [preview, setPreview] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [progress, setProgress] = useState<number | null>(null)
    const [videoMax, setVideoMax] = useState<number | undefined>(undefined)   // limite do vídeo quando o envio pesado (R2) está ligado
    useEffect(() => { let on = true; r2Availability('media_r2').then((a) => { if (on && a.available) setVideoMax(a.maxBytes) }); return () => { on = false } }, [])
    const problem = validateFlash({ content: text, file, videoMaxBytes: videoMax })
    const pick = (f: File | null) => {
        if (preview) URL.revokeObjectURL(preview)
        setFile(f); setPreview(f ? URL.createObjectURL(f) : null)
    }
    useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
    const post = async () => {
        if (problem || busy) { if (problem) toast.error(problem); return }
        setBusy(true)
        try { await postFlash(me, text, file, { onProgress: setProgress }); toast.success('Flash no ar!'); onPosted(); onClose() } catch (e: any) { toast.error(e.message || 'Não foi possível postar.') } finally { setBusy(false); setProgress(null) }
    }
    return createPortal(
        <div className="fixed inset-0 z-[80] flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
            <div className="w-full max-w-md rounded-t-3xl px-4 pt-4 flex flex-col gap-3" style={{ background: colors.background, border: `1px solid ${colors.border}`, paddingBottom: 'calc(12px + var(--staging-banner-h, 0px) + env(safe-area-inset-bottom))' }} onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                    <p className="text-base font-black flex items-center gap-2" style={{ color: colors.textPrimary }}><Zap size={18} style={{ color: ORANGE }} /> Novo flash</p>
                    <button onClick={onClose} aria-label="Fechar" className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: `${colors.border}50`, color: colors.textPrimary }}><X size={18} /></button>
                </div>
                <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, FLASH_MAX_CHARS))} rows={4} placeholder="O que está acontecendo?" className="w-full rounded-2xl p-3 text-[15px] resize-none focus:outline-none" style={{ background: `${colors.border}40`, color: colors.textPrimary }} />
                {preview && (
                    <div className="relative rounded-2xl overflow-hidden" style={{ height: 180, background: '#000' }}>
                        {file?.type.startsWith('video') ? <video src={preview} muted playsInline controls className="w-full h-full object-contain" /> : <img src={preview} alt="" className="w-full h-full object-cover" />}
                        <button onClick={() => pick(null)} aria-label="Tirar" className="absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center text-white" style={{ background: 'rgba(0,0,0,0.6)' }}><X size={16} /></button>
                    </div>
                )}
                <div className="flex items-center gap-2">
                    <label className="h-11 px-4 rounded-full flex items-center gap-2 text-[13px] font-black cursor-pointer transition active:scale-95" style={{ background: `${colors.border}50`, color: colors.textPrimary }}>
                        <ImagePlus size={17} /> Foto ou vídeo
                        <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" className="hidden" onChange={(e) => { pick(e.target.files?.[0] || null); e.target.value = '' }} />
                    </label>
                    <span className="text-[11px] ml-auto" style={{ color: colors.textSecondary }}>{text.length}/{FLASH_MAX_CHARS}</span>
                    <button onClick={post} disabled={busy || !!problem} className="h-11 px-6 rounded-full text-[14px] font-black text-white disabled:opacity-50 transition active:scale-95" style={{ background: ORANGE }}>{busy ? (progress != null && progress < 100 ? `Enviando ${progress}%` : 'Postando…') : 'Postar'}</button>
                </div>
            </div>
        </div>,
        document.body,
    )
}

/** A pilha: palco fixo + espaçadores que dão a rolagem. Cada card é posicionado pela rolagem: o de baixo sobe e cobre o da frente, que recua. */
const PEEK_TOP = 44          // faixa em cima: bordas dos cards de trás (14 px do 1º + 6 px do 2º) + folga para a sombra deles não bater no topo do palco
const PEEK_BOTTOM = 6
const STACK_DEPTH = 3        // quantos cards de trás ainda aparecem na pilha
// A SOMBRA tem de caber inteira na margem, senão o palco e a rolagem a recortam (ficava uma quina dura nos lados e no topo). Sombra: sobe 4 px, desfoca 12 e encolhe 4
// (spread negativo), então passa só 8 px dos lados (a margem é 12) e 12 px do topo; o card mais de trás fica a 24 px do topo do palco (faixa de 44 menos 20 de recuo). Se mexer em um número, confira os outros.
const STACK_SIDE = 12
const STACK_SHADOW = '0 -4px 12px -4px rgba(0,0,0,0.35)'

function StackedFeed({ items, me, scrollerRef, onNearEnd, onLike, onFollow, onComments, onShare, onDelete }: {
    items: FlashItem[]; me: string | null; scrollerRef: React.RefObject<HTMLDivElement>; onNearEnd: () => void
    onLike: (i: FlashItem) => void; onFollow: (i: FlashItem) => void; onComments: (i: FlashItem) => void; onShare: (i: FlashItem) => void; onDelete: (i: FlashItem) => void
}) {
    const n = items.length
    const [H, setH] = useState(0)
    const [view, setView] = useState({ base: 0, active: 0 })
    const cardEls = useRef(new Map<number, HTMLDivElement>())
    const Hr = useRef(0)
    const raf = useRef(0)
    const reduce = useRef(false)
    const nRef = useRef(n); nRef.current = n
    const nearEnd = useRef(onNearEnd); nearEnd.current = onNearEnd

    const apply = useCallback(() => {
        const scrollEl = scrollerRef.current, h = Hr.current
        if (!scrollEl || !h) return
        const pos = scrollEl.scrollTop / h
        cardEls.current.forEach((el, i) => {
            const d = pos - i      // < 0: ainda subindo | 0..1: sendo coberto pelo próximo | > 1: mais fundo na pilha
            let ty = 0, scale = 1, dim = 0, visible = true
            if (d <= -1) { ty = h; visible = false }
            else if (d < 0) ty = -d * h
            else {
                const dd = Math.min(d, STACK_DEPTH)
                if (!reduce.current) { ty = dd <= 1 ? -14 * dd : -14 - 6 * (dd - 1); scale = 1 - 0.05 * dd }
                dim = Math.min(0.55, 0.22 * dd)
                if (d > STACK_DEPTH + 0.05) visible = false
            }
            el.style.transform = `translate3d(0, ${ty}px, 0) scale(${scale})`
            el.style.setProperty('--dim', String(dim))
            el.style.visibility = visible ? 'visible' : 'hidden'
        })
    }, [scrollerRef])

    // altura do palco = altura da área do feed (acompanha girar o aparelho e a barra de baixo); mantém o card que estava na frente
    useLayoutEffect(() => {
        const el = scrollerRef.current
        if (!el) return
        reduce.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        const measure = () => {
            const h = el.clientHeight
            if (!h || h === Hr.current) return
            const idx = Hr.current ? Math.round(el.scrollTop / Hr.current) : 0
            Hr.current = h; setH(h); el.scrollTop = idx * h
        }
        measure()
        const ro = new ResizeObserver(measure)
        ro.observe(el)
        return () => ro.disconnect()
    }, [scrollerRef])

    const onScroll = useCallback(() => {
        if (raf.current) return
        raf.current = requestAnimationFrame(() => {
            raf.current = 0
            apply()
            const el = scrollerRef.current, h = Hr.current
            if (!el || !h) return
            const pos = el.scrollTop / h
            const base = Math.floor(pos + 1e-6), active = Math.round(pos)
            setView((v) => (v.base === base && v.active === active ? v : { base, active }))
            if (active >= nRef.current - 3) nearEnd.current()
        })
    }, [apply, scrollerRef])
    useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current) }, [])

    // sempre que o que está montado muda, posiciona os cards na hora (antes de pintar)
    useLayoutEffect(() => { apply() })

    const lo = Math.max(0, view.base - STACK_DEPTH), hi = Math.min(n - 1, view.base + 2)
    return (
        <div ref={scrollerRef} onScroll={onScroll} className="h-full overflow-y-auto snap-y snap-mandatory" style={{ scrollbarWidth: 'none', overscrollBehavior: 'contain' }}>
            {H > 0 && (
                <div className="relative" style={{ height: n * H }}>
                    {/* espaçadores: só dão o tamanho da rolagem e os pontos onde ela encaixa */}
                    {items.map((it, i) => <div key={`s-${it.kind}-${it.id}`} aria-hidden className="absolute left-0 right-0 snap-start snap-always pointer-events-none" style={{ top: i * H, height: H }} />)}
                    <div className="sticky top-0 overflow-hidden" style={{ height: H, zIndex: 1 }}>
                        {items.slice(lo, hi + 1).map((it, k) => {
                            const i = lo + k
                            return (
                                <div key={`${it.kind}-${it.id}`} ref={(el) => { if (el) cardEls.current.set(i, el); else cardEls.current.delete(i) }}
                                    onClick={(e) => {   // tocar na bordinha de um card de trás volta até ele
                                        const el = scrollerRef.current
                                        if (el && Hr.current && el.scrollTop / Hr.current - i > 0.5) { e.stopPropagation(); el.scrollTo({ top: i * Hr.current, behavior: 'smooth' }) }
                                    }}
                                    className="absolute" style={{ left: STACK_SIDE, right: STACK_SIDE, top: PEEK_TOP, height: H - PEEK_TOP - PEEK_BOTTOM, transformOrigin: 'top center', willChange: 'transform', borderRadius: 28, zIndex: i, boxShadow: STACK_SHADOW }}>
                                    <FlashCard item={it} me={me} active={i === view.active} onLike={onLike} onFollow={onFollow} onComments={onComments} onShare={onShare} onDelete={onDelete} />
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}
        </div>
    )
}

export default function FlashScreen() {
    const { colors } = useTheme()
    const router = useRouter()
    const { userId } = useProfile()
    const [mode, setMode] = useState<FlashMode>('all')
    const [items, setItems] = useState<FlashItem[]>([])
    const [loading, setLoading] = useState(true)
    const [done, setDone] = useState(false)
    const [fresh, setFresh] = useState(0)
    const [commentsOf, setCommentsOf] = useState<FlashItem | null>(null)
    const [composing, setComposing] = useState(false)
    const scroller = useRef<HTMLDivElement>(null)
    const busy = useRef(false)
    const loginFirst = () => { toast.info('Entre na sua conta para isso.'); router.push('/login?redirect=/flash') }

    const loadFirst = useCallback(async () => {
        setLoading(true); setDone(false); setFresh(0)
        try { const rows = await fetchFeed(mode); setItems(rows); setDone(rows.length < PAGE_SIZE) } catch { setItems([]); setDone(true) } finally { setLoading(false) }
        scroller.current?.scrollTo({ top: 0 })
    }, [mode])
    useEffect(() => { loadFirst() }, [loadFirst, userId])
    // Vindo da página Social: ?de=<id> abre no flash tocado; ?novo=1 já abre o postar
    const jumped = useRef(false)
    useEffect(() => {
        if (loading || jumped.current) return
        jumped.current = true
        const sp = new URLSearchParams(window.location.search)
        const de = sp.get('de')
        if (sp.get('novo') === '1' && userId) setComposing(true)
        if (de) requestAnimationFrame(() => { const el = scroller.current; const idx = items.findIndex((i) => i.id === de); if (el && idx >= 0) el.scrollTo({ top: idx * el.clientHeight }) })
    }, [loading, userId])

    const loadMore = useCallback(async () => {
        if (busy.current || done || items.length === 0) return
        busy.current = true
        try { const rows = await fetchFeed(mode, items[items.length - 1].createdAt); setItems((cur) => [...cur, ...rows.filter((r) => !cur.some((c) => c.id === r.id && c.kind === r.kind))]); if (rows.length < PAGE_SIZE) setDone(true) } catch { setDone(true) } finally { busy.current = false }
    }, [mode, done, items])

    // Novos flashes ao vivo: um aviso para voltar ao topo e recarregar
    useEffect(() => {
        const ch = supabase.channel('flash-feed').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'flashes' }, (p) => {
            if ((p.new as any)?.author_id !== userId) setFresh((n) => n + 1)
        }).subscribe()
        return () => { supabase.removeChannel(ch) }
    }, [userId])

    const patch = (item: FlashItem, fn: (i: FlashItem) => FlashItem) => setItems((cur) => cur.map((i) => (i.id === item.id && i.kind === item.kind ? fn(i) : i)))

    const like = async (item: FlashItem) => {
        if (!userId) return loginFirst()
        const next = !item.liked
        patch(item, (i) => ({ ...i, liked: next, likeCount: Math.max(0, i.likeCount + (next ? 1 : -1)) }))
        try { await setLiked(item, userId, next) } catch { patch(item, (i) => ({ ...i, liked: !next, likeCount: Math.max(0, i.likeCount + (next ? -1 : 1)) })); toast.error('Não foi possível curtir.') }
    }
    const follow = async (item: FlashItem) => {
        if (!userId) return loginFirst()
        setItems((cur) => cur.map((i) => (i.authorId === item.authorId ? { ...i, following: true } : i)))
        try { await setFollowing(item.authorId, userId, true); toast.success(`Você segue ${item.authorName}`) } catch { setItems((cur) => cur.map((i) => (i.authorId === item.authorId ? { ...i, following: false } : i))); toast.error('Não foi possível seguir.') }
    }
    const share = async (item: FlashItem) => {
        const url = `${window.location.origin}/${item.authorSlug}${item.kind === 'publication' && item.link ? `/${item.link}` : ''}`
        const ok = await handleShareLink({ title: `${item.authorName} no iUser`, text: (item.title || item.content || 'Flash').slice(0, 100), url })
        if (ok) { countShare(item); patch(item, (i) => ({ ...i, shareCount: i.shareCount + 1 })) }
    }
    const remove = async (item: FlashItem) => {
        if (!confirm('Apagar este flash?')) return
        try { await deleteFlash(item.id, item.mediaUrl); setItems((cur) => cur.filter((i) => !(i.id === item.id && i.kind === item.kind))); toast.success('Flash apagado') } catch { toast.error('Não foi possível apagar.') }
    }
    const openComments = (item: FlashItem) => {
        if (item.kind === 'publication') { router.push(`/${item.authorSlug}/${item.link}`); return }
        setCommentsOf(item)
    }

    const showEmpty = !loading && items.length === 0
    return (
        // Entre a ilha (em cima) e a barra de baixo: ocupa só o miolo
        <div className="fixed left-0 right-0 z-[1]" style={{ top: 'var(--shell-top, 74px)', bottom: 'var(--shell-bottom, 0px)' }}>
            <div className="relative h-full max-w-md mx-auto">
                {/* Abas e botão de postar, por cima do feed */}
                <div className="absolute left-0 right-0 z-20 flex items-center justify-center gap-1 pointer-events-none" style={{ top: PEEK_TOP + 8 }}>
                    <div className="pointer-events-auto flex items-center gap-1 p-1 rounded-full" style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)' }}>
                        {([['all', 'Para você'], ['following', 'Seguindo']] as const).map(([k, label]) => (
                            <button key={k} onClick={() => { if (k === 'following' && !userId) return loginFirst(); setMode(k) }} className="h-8 px-4 rounded-full text-[12px] font-black transition active:scale-95"
                                style={mode === k ? { background: '#fff', color: '#111827' } : { color: '#fff' }}>{label}</button>
                        ))}
                    </div>
                </div>
                <button onClick={() => router.push('/social')} aria-label="Voltar para o Social" className="absolute left-3 z-20 w-9 h-9 rounded-full flex items-center justify-center text-white transition active:scale-95" style={{ top: PEEK_TOP + 10, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)' }}><ArrowLeft size={18} /></button>
                <button onClick={() => (userId ? setComposing(true) : loginFirst())} aria-label="Postar um flash" className="absolute right-3 z-20 h-9 px-3.5 rounded-full flex items-center gap-1.5 text-[12px] font-black text-white transition active:scale-95" style={{ top: PEEK_TOP + 10, background: ORANGE, boxShadow: '0 4px 14px rgba(249,115,22,0.5)' }}><Plus size={15} strokeWidth={3} /> Flash</button>

                {fresh > 0 && (
                    <button onClick={loadFirst} className="absolute left-1/2 -translate-x-1/2 z-20 h-8 px-4 rounded-full flex items-center gap-1.5 text-[12px] font-black text-white transition active:scale-95" style={{ top: PEEK_TOP + 52, background: '#111827', boxShadow: '0 4px 14px rgba(0,0,0,0.4)' }}>
                        <ArrowUp size={14} /> {fresh} {fresh === 1 ? 'novo flash' : 'novos flashes'}
                    </button>
                )}

                {(loading || showEmpty) ? (
                    <div ref={scroller} className="h-full overflow-y-auto flex flex-col gap-2 px-2 pb-1 pt-0" style={{ scrollbarWidth: 'none', overscrollBehavior: 'contain' }}>
                        {loading && [0, 1].map((i) => <div key={i} className="flex-shrink-0 w-full animate-pulse" style={{ height: '100%', borderRadius: 28, background: `${colors.border}50` }} />)}
                        {showEmpty && (
                            <div className="flex-shrink-0 w-full flex flex-col items-center justify-center text-center px-8 gap-3" style={{ height: '100%', borderRadius: 28, background: colors.surface, border: `1px solid ${colors.border}` }}>
                                <Zap size={34} style={{ color: ORANGE }} />
                                <p className="text-base font-black" style={{ color: colors.textPrimary }}>{mode === 'following' ? 'Nada de quem você segue ainda' : 'Nenhum flash por aqui'}</p>
                                <p className="text-sm" style={{ color: colors.textSecondary }}>{mode === 'following' ? 'Siga pessoas para ver os flashes e as publicações delas aqui.' : 'Seja a primeira pessoa a postar um flash.'}</p>
                                {mode === 'following' && <button onClick={() => setMode('all')} className="h-10 px-5 rounded-full text-[13px] font-black text-white" style={{ background: ORANGE }}>Ver Para você</button>}
                            </div>
                        )}
                    </div>
                ) : (
                    <StackedFeed items={items} me={userId || null} scrollerRef={scroller} onNearEnd={loadMore} onLike={like} onFollow={follow} onComments={openComments} onShare={share} onDelete={remove} />
                )}
            </div>

            {commentsOf && <CommentsSheet item={commentsOf} me={userId || null} onClose={() => setCommentsOf(null)} onCounted={(d) => { patch(commentsOf, (i) => ({ ...i, commentCount: Math.max(0, i.commentCount + d) })); setCommentsOf((c) => (c ? { ...c, commentCount: Math.max(0, c.commentCount + d) } : c)) }} />}
            {composing && userId && <ComposeSheet me={userId} onClose={() => setComposing(false)} onPosted={loadFirst} />}
        </div>
    )
}
