// versions/v3/screens/ForumScreen.tsx — FÓRUM DO iUSER (/forum; migration 20261130000087, regras em modules/forum).
// Duas abas: NOVIDADES (o que entrou, melhorou e saiu em cada versão, com comentários) e IDEIAS (sugestões de quem usa, com voto
// para cima/para baixo, a situação dada pelo iUser e comentários). Visitante lê; para votar, sugerir e comentar precisa entrar.
// A aba vai na URL (?aba=ideias) e ?ideia=<id> abre uma ideia.
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { ChevronUp, ChevronDown, MessageCircle, Lightbulb, Megaphone, BookOpen, Plus, Minus, Sparkles, X, Send, Trash2, BadgeCheck } from 'lucide-react'
import Header from '@/components/Header'
import ForumGuide from '@/components/forum/ForumGuide'
import PageTabs from '@/components/PageTabs'
import { Spinner } from '@/components/Spinner'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { toast } from '@/lib/toast'
import { lockBodyScroll } from '@/lib/bodyScrollLock'
import {
    ago, applyVote, CATEGORIES, comment, createIdea, deleteComment, loadComments, loadIdeas, loadReleases, nextVote, score, sortIdeas,
    STATUS_INFO, validateIdea, vote, type Category, type ForumComment, type Idea, type IdeaSort, type IdeaStatus, type Release,
} from '@/modules/forum'

const ORANGE = '#f97316'
type Tab = 'guia' | 'novidades' | 'ideias'

export default function ForumScreen() {
    const router = useRouter()
    const { colors } = useTheme()
    const { userId } = useProfile()
    const [tab, setTab] = useState<Tab>('novidades')
    const [releases, setReleases] = useState<Release[] | null>(null)
    const [ideas, setIdeas] = useState<Idea[] | null>(null)
    const [sort, setSort] = useState<IdeaSort>('trending')
    const [statusFilter, setStatusFilter] = useState<IdeaStatus | 'all'>('all')
    const [openIdea, setOpenIdea] = useState<string | null>(null)
    const [composing, setComposing] = useState(false)

    // a aba e a ideia aberta vêm da URL (lidas depois de montar: ler no useState quebra a hidratação)
    useEffect(() => {
        const q = new URLSearchParams(window.location.search)
        if (q.get('aba') === 'ideias') setTab('ideias')
        if (q.get('aba') === 'guia') setTab('guia')
        const i = q.get('ideia')
        if (i) { setTab('ideias'); setOpenIdea(i) }
        if (q.get('nova') === '1') { setTab('ideias'); setComposing(true) }
    }, [])
    const goTab = (t: Tab) => { setTab(t); window.history.replaceState(window.history.state, '', t === 'novidades' ? '/forum' : `/forum?aba=${t}`) }

    const reload = useCallback(() => {
        loadReleases().then(setReleases).catch(() => setReleases([]))
        loadIdeas(userId || null).then(setIdeas).catch(() => setIdeas([]))
    }, [userId])
    useEffect(() => { reload() }, [reload])

    const shown = useMemo(() => sortIdeas((ideas || []).filter((i) => statusFilter === 'all' || i.status === statusFilter), sort), [ideas, sort, statusFilter])
    const needLogin = () => router.push(`/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`)

    const onVote = async (idea: Idea, pressed: -1 | 1) => {
        if (!userId) { needLogin(); return }
        const next = nextVote(idea.mine, pressed)
        setIdeas((l) => (l || []).map((x) => (x.id === idea.id ? applyVote(x, next) : x)))
        try {
            const r = await vote(idea.id, next)
            setIdeas((l) => (l || []).map((x) => (x.id === idea.id ? { ...x, up: r.up, down: r.down, mine: next } : x)))
        } catch (e: any) {
            setIdeas((l) => (l || []).map((x) => (x.id === idea.id ? idea : x)))
            toast.error(e?.message || 'Não deu para votar')
        }
    }

    const back = () => { if (window.history.length > 1) router.back(); else router.push('/') }
    const card = { background: colors.surface, border: `1px solid ${colors.border}` }
    const current = ideas?.find((i) => i.id === openIdea) || null

    return (
        <div className="pb-24">
            <Header title="Fórum do iUser" showBack onBack={back} />

            <section className="mt-2 rounded-3xl p-4 text-white" style={{ background: `linear-gradient(140deg, ${ORANGE}, #dc2626)` }}>
                <p className="text-[18px] font-black leading-tight flex items-center gap-2"><Sparkles size={19} /> O iUser é feito com você</p>
                <p className="text-[13px] mt-1" style={{ opacity: 0.93 }}>Aprenda como tudo funciona, veja o que muda a cada versão, sugira o que você quer no app e vote nas ideias das outras pessoas. As mais votadas entram primeiro na nossa lista.</p>
                <button onClick={() => { if (!userId) needLogin(); else setComposing(true) }} className="mt-3 h-10 px-4 rounded-full text-[13.5px] font-black flex items-center gap-1.5" style={{ background: '#fff', color: '#dc2626' }}>
                    <Lightbulb size={16} /> Sugerir uma ideia
                </button>
            </section>

            <div className="mt-2">
                <PageTabs tabs={[
                    { id: 'guia', label: 'Como funciona', icon: BookOpen, isActive: tab === 'guia', onClick: () => goTab('guia') },
                    { id: 'novidades', label: 'Novidades', icon: Megaphone, isActive: tab === 'novidades', onClick: () => goTab('novidades') },
                    { id: 'ideias', label: 'Ideias', icon: Lightbulb, isActive: tab === 'ideias', onClick: () => goTab('ideias'), badge: ideas?.length ? { count: ideas.length } : null },
                ]} />
            </div>

            {tab === 'guia' ? <ForumGuide /> : tab === 'novidades' ? (
                releases === null ? <Loading /> : releases.length === 0 ? <Empty text="Nenhuma novidade publicada ainda." /> : (
                    <div className="flex flex-col gap-3 mt-1">
                        {releases.map((r) => <ReleaseCard key={r.id} r={r} card={card} userId={userId || null} onNeedLogin={needLogin} />)}
                    </div>
                )
            ) : (
                <>
                    <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 py-1">
                        {([['trending', 'Em alta'], ['top', 'Mais votadas'], ['new', 'Novas']] as const).map(([k, l]) => (
                            <Chip key={k} on={sort === k} onClick={() => setSort(k)} label={l} colors={colors} />
                        ))}
                        <span className="w-px flex-shrink-0 my-1.5" style={{ background: colors.border }} />
                        {(['all', 'planned', 'doing', 'done'] as const).map((s) => (
                            <Chip key={s} on={statusFilter === s} onClick={() => setStatusFilter(s)} label={s === 'all' ? 'Todas' : STATUS_INFO[s].label} colors={colors} />
                        ))}
                    </div>
                    {ideas === null ? <Loading /> : shown.length === 0 ? <Empty text={statusFilter === 'all' ? 'Ainda não há ideias. Seja a primeira pessoa a sugerir!' : 'Nenhuma ideia nessa situação.'} /> : (
                        <div className="flex flex-col gap-2.5 mt-2">
                            {shown.map((i, n) => <IdeaRow key={i.id} idea={i} rank={sort === 'top' ? n + 1 : null} card={card} onVote={onVote} onOpen={() => setOpenIdea(i.id)} />)}
                        </div>
                    )}
                </>
            )}

            {composing && <ComposeSheet onClose={() => setComposing(false)} onDone={(id) => { setComposing(false); goTab('ideias'); setSort('new'); reload(); setOpenIdea(id) }} />}
            {current && <IdeaSheet idea={current} userId={userId || null} onClose={() => setOpenIdea(null)} onVote={onVote} onNeedLogin={needLogin}
                onCommented={() => setIdeas((l) => (l || []).map((x) => (x.id === current.id ? { ...x, comments: x.comments + 1 } : x)))} />}
        </div>
    )
}

function Chip({ on, onClick, label, colors }: { on: boolean; onClick: () => void; label: string; colors: any }) {
    return (
        <button onClick={onClick} className="h-9 px-3.5 rounded-full text-[12.5px] font-black whitespace-nowrap flex-shrink-0"
            style={on ? { background: ORANGE, color: '#fff' } : { background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }}>{label}</button>
    )
}
function Loading() { return <div className="py-10 flex justify-center"><Spinner size={24} color={ORANGE} /></div> }
function Empty({ text }: { text: string }) {
    const { colors } = useTheme()
    return <p className="py-10 text-center text-[13.5px]" style={{ color: colors.textSecondary }}>{text}</p>
}

function StatusPill({ s }: { s: IdeaStatus }) {
    const i = STATUS_INFO[s]
    return <span className="px-2 h-5 rounded-full text-[10.5px] font-black inline-flex items-center" style={{ background: `${i.color}1f`, color: i.color }}>{i.label}</span>
}

function VoteColumn({ idea, onVote }: { idea: Idea; onVote: (i: Idea, v: -1 | 1) => void }) {
    const { colors } = useTheme()
    const s = score(idea)
    return (
        <div className="flex flex-col items-center flex-shrink-0 w-12">
            <button onClick={(e) => { e.stopPropagation(); onVote(idea, 1) }} aria-label="Quero isso" className="w-10 h-9 rounded-xl flex items-center justify-center"
                style={idea.mine === 1 ? { background: ORANGE, color: '#fff' } : { background: `${colors.border}35`, color: colors.textPrimary }}><ChevronUp size={20} strokeWidth={2.6} /></button>
            <span className="text-[15px] font-black my-0.5" style={{ color: s > 0 ? ORANGE : s < 0 ? '#ef4444' : colors.textPrimary }}>{s}</span>
            <button onClick={(e) => { e.stopPropagation(); onVote(idea, -1) }} aria-label="Não quero isso" className="w-10 h-7 rounded-xl flex items-center justify-center"
                style={idea.mine === -1 ? { background: '#64748b', color: '#fff' } : { color: colors.textSecondary }}><ChevronDown size={18} /></button>
        </div>
    )
}

function IdeaRow({ idea, rank, card, onVote, onOpen }: { idea: Idea; rank: number | null; card: any; onVote: (i: Idea, v: -1 | 1) => void; onOpen: () => void }) {
    const { colors } = useTheme()
    const cat = CATEGORIES.find((c) => c.id === idea.category)?.label
    return (
        <div onClick={onOpen} role="button" className="rounded-3xl p-3 flex gap-2.5 active:scale-[0.99] transition cursor-pointer" style={card}>
            <VoteColumn idea={idea} onVote={onVote} />
            <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex flex-wrap items-center gap-1.5">
                    {rank !== null && rank <= 3 && <span className="text-[11px] font-black" style={{ color: ORANGE }}>#{rank}</span>}
                    <StatusPill s={idea.status} />
                    {cat && <span className="text-[11px]" style={{ color: colors.textSecondary }}>{cat}</span>}
                </div>
                <p className="text-[14.5px] font-black leading-snug mt-1" style={{ color: colors.textPrimary }}>{idea.title}</p>
                {idea.body && <p className="text-[12.5px] mt-0.5 line-clamp-2" style={{ color: colors.textSecondary }}>{idea.body}</p>}
                <p className="text-[11.5px] mt-1.5 flex items-center gap-2" style={{ color: colors.textSecondary }}>
                    <span className="truncate">{idea.author.slug ? `@${idea.author.slug}` : idea.author.name} · {ago(idea.createdAt)}</span>
                    <span className="flex items-center gap-1 flex-shrink-0"><MessageCircle size={13} /> {idea.comments}</span>
                </p>
            </div>
        </div>
    )
}

function ReleaseCard({ r, card, userId, onNeedLogin }: { r: Release; card: any; userId: string | null; onNeedLogin: () => void }) {
    const { colors } = useTheme()
    const [open, setOpen] = useState(false)
    const [count, setCount] = useState(r.comments)
    const list = (title: string, items: string[], color: string, Icon: typeof Plus) => items.length > 0 && (
        <div className="mt-3">
            <p className="text-[11.5px] font-black uppercase tracking-wide" style={{ color }}>{title}</p>
            <ul className="mt-1 flex flex-col gap-1">
                {items.map((t) => <li key={t} className="flex gap-2 text-[13.5px] leading-snug" style={{ color: colors.textPrimary }}><Icon size={15} className="flex-shrink-0 mt-0.5" style={{ color }} />{t}</li>)}
            </ul>
        </div>
    )
    return (
        <article className="rounded-3xl p-4" style={card}>
            <div className="flex items-center gap-2">
                <span className="px-2.5 h-6 rounded-full text-[11.5px] font-black text-white flex items-center" style={{ background: ORANGE }}>v{r.version}</span>
                <span className="text-[11.5px]" style={{ color: colors.textSecondary }}>{new Date(r.releasedAt).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
            </div>
            <h2 className="text-[16px] font-black leading-tight mt-2" style={{ color: colors.textPrimary }}>{r.title}</h2>
            {r.summary && <p className="text-[13px] mt-1" style={{ color: colors.textSecondary }}>{r.summary}</p>}
            {list('O que entrou', r.added, '#16a34a', Plus)}
            {list('O que melhorou', r.improved, '#0ea5e9', Sparkles)}
            {list('O que saiu', r.removed, '#ef4444', Minus)}
            <button onClick={() => setOpen((o) => !o)} className="mt-3 h-9 px-3.5 rounded-full text-[12.5px] font-black flex items-center gap-1.5" style={{ background: `${colors.border}35`, color: colors.textPrimary }}>
                <MessageCircle size={15} /> {open ? 'Fechar comentários' : count ? `Comentários (${count})` : 'Comentar'}
            </button>
            {open && <div className="mt-3"><Comments target={{ release: r.id }} userId={userId} onNeedLogin={onNeedLogin} onAdded={() => setCount((c) => c + 1)} /></div>}
        </article>
    )
}

function Comments({ target, userId, onNeedLogin, onAdded }: { target: { idea?: string; release?: string }; userId: string | null; onNeedLogin: () => void; onAdded: () => void }) {
    const { colors } = useTheme()
    const [list, setList] = useState<ForumComment[] | null>(null)
    const [text, setText] = useState('')
    const [busy, setBusy] = useState(false)
    const load = useCallback(() => { loadComments(target, userId).then(setList).catch(() => setList([])) }, [target.idea, target.release, userId]) // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { load() }, [load])
    const send = async () => {
        if (!userId) { onNeedLogin(); return }
        if (!text.trim()) return
        setBusy(true)
        try { await comment(target, text); setText(''); onAdded(); load() }
        catch (e: any) { toast.error(e?.message || 'Não deu para comentar') }
        finally { setBusy(false) }
    }
    return (
        <div className="flex flex-col gap-2">
            {list === null ? <Loading /> : list.length === 0 ? <p className="text-[12.5px]" style={{ color: colors.textSecondary }}>Ninguém comentou ainda.</p> : list.map((c) => (
                <div key={c.id} className="rounded-2xl px-3 py-2" style={{ background: c.isTeam ? `${ORANGE}14` : `${colors.border}25`, border: c.isTeam ? `1px solid ${ORANGE}55` : undefined }}>
                    <p className="text-[11.5px] font-black flex items-center gap-1" style={{ color: c.isTeam ? ORANGE : colors.textPrimary }}>
                        {c.isTeam && <BadgeCheck size={13} />}{c.author.slug && !c.isTeam ? `@${c.author.slug}` : c.author.name}
                        <span className="font-normal ml-1" style={{ color: colors.textSecondary }}>{ago(c.createdAt)}</span>
                        {c.isMine && <button onClick={async () => { await deleteComment(c.id).catch(() => {}); load() }} aria-label="Apagar" className="ml-auto" style={{ color: colors.textSecondary }}><Trash2 size={13} /></button>}
                    </p>
                    <p className="text-[13px] mt-0.5 whitespace-pre-wrap" style={{ color: colors.textPrimary }}>{c.body}</p>
                </div>
            ))}
            <div className="flex gap-2 mt-1">
                <input value={text} onChange={(e) => setText(e.target.value.slice(0, 600))} onKeyDown={(e) => { if (e.key === 'Enter') void send() }}
                    placeholder={userId ? 'Escreva um comentário' : 'Entre para comentar'} className="flex-1 min-w-0 h-10 px-3.5 rounded-full text-[13px] outline-none"
                    style={{ background: colors.background, border: `1px solid ${colors.border}`, color: colors.textPrimary }} />
                <button onClick={send} disabled={busy} aria-label="Enviar" className="w-10 h-10 rounded-full flex items-center justify-center text-white disabled:opacity-50" style={{ background: ORANGE }}>
                    {busy ? <Spinner size={16} color="#fff" /> : <Send size={16} />}
                </button>
            </div>
        </div>
    )
}

function Sheet({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
    const { colors } = useTheme()
    useEffect(() => lockBodyScroll(), [])
    useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])
    return createPortal(
        <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={title}>
            <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose} />
            <div className="relative w-full sm:max-w-lg max-h-[90dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-4 pb-[calc(18px+env(safe-area-inset-bottom))]" style={{ background: colors.background, border: `1px solid ${colors.border}` }}>
                <div className="flex items-center justify-between gap-2 mb-2">
                    <p className="text-[15px] font-black" style={{ color: colors.textPrimary }}>{title}</p>
                    <button onClick={onClose} aria-label="Fechar" className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: `${colors.border}40`, color: colors.textPrimary }}><X size={17} /></button>
                </div>
                {children}
            </div>
        </div>, document.body)
}

function IdeaSheet({ idea, userId, onClose, onVote, onNeedLogin, onCommented }: { idea: Idea; userId: string | null; onClose: () => void; onVote: (i: Idea, v: -1 | 1) => void; onNeedLogin: () => void; onCommented: () => void }) {
    const { colors } = useTheme()
    return (
        <Sheet title="Ideia" onClose={onClose}>
            <div className="flex gap-2.5">
                <VoteColumn idea={idea} onVote={onVote} />
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5"><StatusPill s={idea.status} /><span className="text-[11px]" style={{ color: colors.textSecondary }}>{CATEGORIES.find((c) => c.id === idea.category)?.label}</span></div>
                    <p className="text-[17px] font-black leading-snug mt-1" style={{ color: colors.textPrimary }}>{idea.title}</p>
                    <p className="text-[11.5px] mt-0.5" style={{ color: colors.textSecondary }}>{idea.author.slug ? `@${idea.author.slug}` : idea.author.name} · {ago(idea.createdAt)} · {idea.up} querem · {idea.down} não querem</p>
                </div>
            </div>
            {idea.body && <p className="text-[13.5px] mt-3 whitespace-pre-wrap" style={{ color: colors.textPrimary }}>{idea.body}</p>}
            {idea.statusNote && (
                <div className="mt-3 rounded-2xl p-3" style={{ background: `${STATUS_INFO[idea.status].color}14`, border: `1px solid ${STATUS_INFO[idea.status].color}55` }}>
                    <p className="text-[11.5px] font-black flex items-center gap-1" style={{ color: STATUS_INFO[idea.status].color }}><BadgeCheck size={13} /> Resposta do iUser</p>
                    <p className="text-[13px] mt-0.5" style={{ color: colors.textPrimary }}>{idea.statusNote}</p>
                </div>
            )}
            <p className="text-[12px] font-black uppercase tracking-wide mt-4 mb-2" style={{ color: colors.textSecondary }}>Comentários</p>
            <Comments target={{ idea: idea.id }} userId={userId} onNeedLogin={onNeedLogin} onAdded={onCommented} />
        </Sheet>
    )
}

function ComposeSheet({ onClose, onDone }: { onClose: () => void; onDone: (id: string) => void }) {
    const { colors } = useTheme()
    const [title, setTitle] = useState('')
    const [body, setBody] = useState('')
    const [cat, setCat] = useState<Category>('geral')
    const [busy, setBusy] = useState(false)
    const err = title || body ? validateIdea(title, body) : null
    const send = async () => {
        const e = validateIdea(title, body)
        if (e) { toast.error(e); return }
        setBusy(true)
        try { const id = await createIdea(title.trim(), body.trim(), cat); toast.success('Ideia publicada! Agora é juntar votos.'); onDone(id) }
        catch (x: any) { toast.error(x?.message || 'Não deu para publicar') }
        finally { setBusy(false) }
    }
    const input = { background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }
    return (
        <Sheet title="Sugerir uma ideia" onClose={onClose}>
            <p className="text-[12.5px]" style={{ color: colors.textSecondary }}>Conte o que você quer no iUser. Antes, veja se alguém já sugeriu algo parecido e vote nela: assim a ideia sobe mais rápido.</p>
            <label className="block mt-3 text-[12px] font-bold" style={{ color: colors.textPrimary }}>Sua ideia, numa frase</label>
            <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 100))} placeholder="Ex.: Agendar a entrega para um horário" className="mt-1 w-full h-11 px-3.5 rounded-xl text-[14px] outline-none" style={input} />
            <label className="block mt-3 text-[12px] font-bold" style={{ color: colors.textPrimary }}>Explique melhor (opcional)</label>
            <textarea value={body} onChange={(e) => setBody(e.target.value.slice(0, 1000))} rows={4} placeholder="Por que isso ajudaria você?" className="mt-1 w-full px-3.5 py-2.5 rounded-xl text-[13.5px] outline-none resize-none" style={input} />
            <p className="mt-3 text-[12px] font-bold" style={{ color: colors.textPrimary }}>Sobre o quê?</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
                {CATEGORIES.map((c) => (
                    <button key={c.id} onClick={() => setCat(c.id)} className="h-8 px-3 rounded-full text-[12px] font-black"
                        style={cat === c.id ? { background: ORANGE, color: '#fff' } : { background: `${colors.border}35`, color: colors.textPrimary }}>{c.label}</button>
                ))}
            </div>
            {err && <p className="mt-2 text-[12px]" style={{ color: '#ef4444' }}>{err}</p>}
            <button onClick={send} disabled={busy || !!err || !title.trim()} className="mt-4 w-full h-12 rounded-full text-[14.5px] font-black text-white disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: ORANGE }}>
                {busy ? <Spinner size={18} color="#fff" /> : <><Lightbulb size={17} /> Publicar ideia</>}
            </button>
        </Sheet>
    )
}
