// app/(main)/minhas-compras-digitais/[productId]/page.tsx — a "sala de aula" do produto digital: tela escura estilo cinema, player grande, módulos e aulas ao lado (com o que já foi
// assistido), materiais para baixar e a próxima aula abrindo sozinha. O que já foi concluído e onde parou ficam neste aparelho (localStorage); o acesso vem do banco.
'use client'

import { useReportStorePresence } from '@/modules/store-presence'
import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Lock, PlayCircle } from 'lucide-react'
import { useProfile } from '@/app/contexts/ProfileContext'
import { useTheme } from '@/app/contexts/theme'
import { Spinner } from '@/components/Spinner'
import { supabase } from '@/lib/supabase/client'
import { fetchCurriculum, formatDuration, formatSize, groupByModule, curriculumStats, type CurriculumItem } from '@/modules/digital'
import DigitalViewer from '@/components/digital/DigitalViewer'
import ProPlayer from '@/components/digital/ProPlayer'
import MusicPlayer from '@/components/digital/MusicPlayer'
import { usePlayerStore } from '@/store/usePlayerStore'
import AppDownloads from '@/components/digital/AppDownloads'
import ReportButton from '@/components/moderation/ReportButton'
import TipButton from '@/components/tips/TipButton'
import { kindIcon } from '@/components/digital/DigitalCurriculum'

// vídeo e áudio tocam na sala (áudio no player de música); arquivos e links abrem à parte
const isPlayable = (i: CurriculumItem) => i.kind === 'video' || i.kind === 'audio'

export default function SalaDeAulaPage() {
    const router = useRouter()
    const { colors } = useTheme()
    // As cores seguem o tema do aplicativo (claro, escuro, preto e branco...); só o laranja e o verde são fixos
    const C = { bg: colors.background, surface: colors.surface, surface2: `${colors.border}33`, line: colors.border, text: colors.textPrimary, muted: colors.textSecondary, orange: '#f97316', green: '#22c55e' }
    const { productId } = useParams<{ productId: string }>()
    const { userId, loading } = useProfile()
    const [items, setItems] = useState<CurriculumItem[] | null>(null)
    const [name, setName] = useState('')
    const [cover, setCover] = useState<string | null>(null)
    const [ownerId, setOwnerId] = useState<string | null>(null)
    const [storeId, setStoreId] = useState<string | null>(null)
    const [artist, setArtist] = useState<string | null>(null)   // nome da loja de quem publicou (o artista, na música)
    const [current, setCurrent] = useState<string | null>(null)
    const [done, setDone] = useState<Record<string, true>>({})
    const [closed, setClosed] = useState<Record<string, true>>({})
    const key = `iuser_digital_done_${productId}`

    useEffect(() => { if (!loading && !userId) router.replace('/login') }, [loading, userId, router])
    useEffect(() => { try { setDone(JSON.parse(localStorage.getItem(key) || '{}')) } catch { /* sem armazenamento */ } }, [key])
    useEffect(() => {
        if (!userId || !productId) return
        supabase.from('products').select('name, image_url, store_id, owner_id').eq('id', productId).maybeSingle().then(({ data }) => {
            setName(data?.name || '')
            setOwnerId((data as any)?.owner_id || null)
            setStoreId(data?.store_id || null)
            setCover(data?.image_url ? supabase.storage.from('product-images').getPublicUrl(data.image_url).data.publicUrl : null)
            if (data?.store_id) supabase.from('stores').select('name').eq('id', data.store_id).maybeSingle().then(({ data: st }) => setArtist(st?.name || null))
        })
        fetchCurriculum(productId).then((d) => {
            setItems(d)
            const firstOpen = d.find((i) => i.unlocked && isPlayable(i)) || d.find((i) => i.unlocked && i.kind !== 'app')
            // ?aula=<id> (o "continuar" do mini-player) abre direto nessa aula
            let wanted: string | null = null
            try { wanted = new URLSearchParams(window.location.search).get('aula') } catch { /* sem window */ }
            const target = wanted && d.find((i) => i.id === wanted && i.unlocked) ? wanted : null
            // se a música deste produto já está tocando (veio do mini-player), a sala ADOTA essa faixa em vez de recomeçar pela primeira
            const pl = usePlayerStore.getState().item
            const playing = pl && pl.kind === 'musica' && d.some((i) => i.id === pl.id && i.kind === 'audio' && i.unlocked) ? pl.id : null
            setCurrent((c) => c || playing || target || firstOpen?.id || null)
        }).catch(() => setItems([]))
    }, [userId, productId])

    // O player da casca passa de faixa sozinho (e segue tocando fora da sala): a sala acompanha a faixa que está tocando e marca a que acabou
    const playingId = usePlayerStore((st) => (st.item?.kind === 'musica' ? st.item.id : null))
    const endedTick = usePlayerStore((st) => st.ended)
    const mark = (id: string) => setDone((d) => { if (d[id]) return d; const n = { ...d, [id]: true as const }; try { localStorage.setItem(key, JSON.stringify(n)) } catch { /* ok */ } return n })
    const open = useMemo(() => (items || []).filter((i) => i.unlocked), [items])
    const lessons = useMemo(() => open.filter(isPlayable), [open])
    useEffect(() => { if (playingId && playingId !== current && items?.some((i) => i.id === playingId && i.kind === 'audio')) setCurrent(playingId) }, [playingId, items]) // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { if (endedTick && items?.some((i) => i.id === endedTick.id)) mark(endedTick.id) }, [endedTick?.n]) // eslint-disable-line react-hooks/exhaustive-deps
    const cur = items?.find((i) => i.id === current) || null
    const lessonIdx = cur ? lessons.findIndex((l) => l.id === cur.id) : -1
    const prev = lessonIdx > 0 ? lessons[lessonIdx - 1] : null
    const next = lessonIdx >= 0 ? lessons[lessonIdx + 1] || null : null
    const fullAccess = !!items?.length && items.every((i) => i.unlocked)
    // programas para baixar ficam no cartão "Baixar" (AppDownloads); a lista ao lado e o player são só do resto
    const hasApps = !!items?.some((i) => i.kind === 'app')
    const listItems = (items || []).filter((i) => i.kind !== 'app')
    const programOnly = hasApps && listItems.length === 0
    // só áudio = música/álbum: textos e player de música
    const music = !!items?.length && items.filter((i) => i.kind !== 'link').every((i) => i.kind === 'audio' || i.kind === 'document') && items.some((i) => i.kind === 'audio')
    const unit = music ? 'Faixa' : 'Aula'
    // "Agora na sua loja" do artista/produtor: ouvindo, assistindo ou lendo (sem identidade; o próprio dono não conta)
    useReportStorePresence(storeId, music ? 'ouvindo' : cur?.kind === 'document' ? 'lendo' : 'assistindo', name || null, !!userId && userId === ownerId)

    if (loading || !userId || !items) {
        return <div className="min-h-dvh flex items-center justify-center" style={{ background: C.bg }}><Spinner size={32} color={C.orange} /></div>
    }
    const stats = curriculumStats(items)
    const progress = lessons.length ? Math.round((lessons.filter((i) => done[i.id]).length / lessons.length) * 100) : 0
    const groups = groupByModule(listItems)
    const go = (id: string) => { setCurrent(id); window.scrollTo({ top: 0, behavior: 'smooth' }) }

    return (
        <div className="min-h-dvh pb-28" style={{ background: C.bg, color: C.text, paddingTop: 'max(1rem, var(--shell-top, 0px))' }}>
            <div className="max-w-6xl mx-auto px-4 flex flex-col gap-4">
                {/* topo */}
                <div className="flex items-center gap-3">
                    <button type="button" onClick={() => (window.history.length > 1 ? router.back() : router.push('/minhas-compras-digitais'))} aria-label="Voltar" className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition active:scale-90" style={{ background: C.surface2, border: `1px solid ${C.line}` }}><ArrowLeft size={18} /></button>
                    <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: C.orange }}>{programOnly ? 'Meus programas' : music ? 'Minha música' : 'Sala de aula'}</p>
                        <h1 className="text-base sm:text-lg font-black leading-tight truncate">{name || 'Conteúdo'}</h1>
                    </div>
                    <div className="hidden sm:flex flex-col items-end gap-1 w-44">
                        <span className="text-[11px] font-bold" style={{ color: C.muted }}>{progress}% concluído</span>
                        <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: C.line }}><div className="h-full rounded-full" style={{ width: `${progress}%`, background: C.green, transition: 'width .5s' }} /></div>
                    </div>
                </div>

                {!fullAccess && (
                    <div className="rounded-2xl px-4 py-3 text-[12px] font-bold flex items-center gap-2" style={{ background: 'rgba(249,115,22,.12)', border: '1px solid rgba(249,115,22,.35)', color: '#c2410c' }}>
                        <Lock size={14} /> Seu acesso completo abre quando a loja confirma o pagamento. Por enquanto você vê só o que está grátis.
                    </div>
                )}

                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
                    {/* player + título + navegação */}
                    <div className="flex flex-col gap-4 min-w-0">
                        {cur && cur.kind === 'audio' ? (
                            <MusicPlayer key={cur.id} itemId={cur.id} title={cur.title} artist={artist} cover={cover}
                                trackLabel={lessonIdx >= 0 ? `Faixa ${lessonIdx + 1} de ${lessons.length}` : undefined}
                                queue={lessons.filter((l) => l.kind === 'audio').map((l) => ({ itemId: l.id, title: l.title }))}
                                index={Math.max(0, lessons.filter((l) => l.kind === 'audio').findIndex((l) => l.id === cur.id))}
                                href={`/minhas-compras-digitais/${productId}`} />
                        ) : cur && isPlayable(cur) ? (
                            <ProPlayer key={cur.id} itemId={cur.id} title={cur.title} nextTitle={next?.title} onEnded={() => mark(cur.id)} onNext={next ? () => go(next.id) : null} track={{ sub: `${name || 'Curso'} · Aula`, cover, href: `/minhas-compras-digitais/${productId}?aula=${cur.id}` }} />
                        ) : cur ? (
                            <DigitalViewer itemId={cur.id} title={cur.title} />
                        ) : !hasApps ? (
                            <div className="rounded-2xl p-10 text-center" style={{ background: C.surface, border: `1px solid ${C.line}`, color: C.muted }}>Nada para abrir ainda.</div>
                        ) : null}

                        {hasApps && <AppDownloads productId={productId} />}

                        {cur && (
                            <div className="flex flex-col gap-3">
                                <div>
                                    {cur.module_title && <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: C.muted }}>{cur.module_title}</p>}
                                    <h2 className="text-xl font-black leading-tight">{cur.title}</h2>
                                    {lessonIdx >= 0 && <p className="text-[12px] mt-0.5" style={{ color: C.muted }}>{unit} {lessonIdx + 1} de {lessons.length}{cur.duration_seconds ? ` · ${formatDuration(cur.duration_seconds)}` : ''}</p>}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {lessons.length > 1 && <button type="button" disabled={!prev} onClick={() => prev && go(prev.id)} className="h-11 px-4 rounded-full text-sm font-black inline-flex items-center gap-1.5 disabled:opacity-30 transition active:scale-95" style={{ background: C.surface2, border: `1px solid ${C.line}` }}><ChevronLeft size={16} /> Anterior</button>}
                                    {done[cur.id] ? (
                                        <span className="h-11 px-4 rounded-full text-sm font-black inline-flex items-center gap-1.5" style={{ background: 'rgba(34,197,94,.14)', color: C.green }}><CheckCircle2 size={16} /> Concluída</span>
                                    ) : (
                                        <button type="button" onClick={() => mark(cur.id)} className="h-11 px-4 rounded-full text-sm font-black inline-flex items-center gap-1.5 transition active:scale-95" style={{ background: C.surface2, border: `1px solid ${C.line}` }}><CheckCircle2 size={16} /> Marcar como concluída</button>
                                    )}
                                    {lessons.length > 1 && <button type="button" disabled={!next} onClick={() => { if (next) { mark(cur.id); go(next.id) } }} className="h-11 px-5 rounded-full text-sm font-black inline-flex items-center gap-1.5 disabled:opacity-30 transition active:scale-95" style={{ background: C.orange, color: '#fff' }}>Próxima {unit.toLowerCase()} <ChevronRight size={16} /></button>}
                                </div>
                                {!music && <p className="text-[11px]" style={{ color: C.muted }}>Atalhos: espaço pausa · ← → pulam 5 s · J L pulam 10 s · F tela cheia · M som · &lt; &gt; velocidade</p>}
                            </div>
                        )}

                        {storeId && <TipButton storeId={storeId} storeName={artist || 'o artista'} productId={productId} className="w-full" />}
                        <ReportButton type="digital_product" id={productId} authorId={ownerId} label="Denunciar este conteúdo" size={14} className="self-start" />

                        {cover && (
                            <div className="flex items-center gap-3 rounded-2xl p-3" style={{ background: C.surface, border: `1px solid ${C.line}` }}>
                                <img src={cover} alt="" className="w-16 h-16 rounded-xl object-cover flex-shrink-0" />
                                <div className="min-w-0">
                                    <p className="text-sm font-black truncate">{name}</p>
                                    <p className="text-[12px]" style={{ color: C.muted }}>{music ? `${stats.audios} ${stats.audios === 1 ? 'faixa' : 'faixas'}` : `${stats.videos} ${stats.videos === 1 ? 'aula' : 'aulas'}`}{stats.modules ? ` · ${stats.modules} módulos` : ''}{stats.docs ? ` · ${stats.docs} ${stats.docs === 1 ? 'material' : 'materiais'}` : ''}{stats.seconds ? ` · ${formatDuration(stats.seconds)}` : ''}</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* lista de aulas */}
                    {!programOnly && <aside className="rounded-2xl overflow-hidden lg:sticky lg:top-4" style={{ background: C.surface, border: `1px solid ${C.line}` }}>
                        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: `1px solid ${C.line}` }}>
                            <p className="text-sm font-black">{music ? 'Faixas' : 'Conteúdo do curso'}</p>
                            <span className="text-[11px] font-bold" style={{ color: C.muted }}>{lessons.filter((i) => done[i.id]).length}/{lessons.length}</span>
                        </div>
                        <div className="max-h-[70vh] overflow-y-auto">
                            {groups.map((g, gi) => {
                                const hasCurrent = g.items.some((i) => i.id === current)
                                const isClosed = !!g.title && !!closed[g.title] && !hasCurrent
                                let n = groups.slice(0, gi).reduce((a, x) => a + x.items.filter(isPlayable).length, 0)
                                return (
                                    <div key={gi}>
                                        {g.title && (
                                            <button type="button" onClick={() => setClosed((c) => { const x = { ...c }; if (x[g.title!]) delete x[g.title!]; else x[g.title!] = true; return x })} className="w-full px-4 py-2.5 flex items-center gap-2 text-left" style={{ background: C.surface2, borderBottom: `1px solid ${C.line}` }}>
                                                <span className="flex-1 text-[12px] font-black uppercase tracking-wide">{g.title}</span>
                                                <span className="text-[11px] font-bold" style={{ color: C.muted }}>{g.items.filter((i) => done[i.id]).length}/{g.items.length}</span>
                                                <ChevronDown size={15} style={{ color: C.muted, transform: isClosed ? 'rotate(-90deg)' : 'none', transition: 'transform .2s' }} />
                                            </button>
                                        )}
                                        {!isClosed && g.items.map((it) => {
                                            const play = isPlayable(it)
                                            if (play) n += 1
                                            const active = it.id === current
                                            return (
                                                <button key={it.id} type="button" disabled={!it.unlocked} onClick={() => go(it.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left transition disabled:opacity-45"
                                                    style={{ background: active ? 'rgba(249,115,22,.14)' : 'transparent', borderLeft: `3px solid ${active ? C.orange : 'transparent'}`, borderBottom: `1px solid ${C.line}` }}>
                                                    <span className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-black" style={{ background: done[it.id] ? 'rgba(34,197,94,.16)' : active ? C.orange : C.surface2, color: done[it.id] ? C.green : active ? '#fff' : C.muted }}>
                                                        {done[it.id] ? <CheckCircle2 size={15} /> : play ? (active ? <PlayCircle size={15} /> : n) : kindIcon(it.kind, 13)}
                                                    </span>
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block text-[13px] font-bold leading-snug" style={{ color: C.text }}>{it.title}</span>
                                                        <span className="block text-[11px]" style={{ color: C.muted }}>{[it.kind === 'video' ? 'Vídeo' : it.kind === 'audio' ? (music ? 'Faixa' : 'Áudio') : it.kind === 'document' ? 'Material' : 'Link', formatDuration(it.duration_seconds), formatSize(it.size_bytes)].filter(Boolean).join(' · ')}</span>
                                                    </span>
                                                    {it.is_preview && <span className="text-[10px] font-black rounded-full px-2 py-0.5 flex-shrink-0" style={{ background: 'rgba(34,197,94,.16)', color: C.green }}>Grátis</span>}
                                                    {!it.unlocked && <Lock size={14} style={{ color: C.muted }} />}
                                                </button>
                                            )
                                        })}
                                    </div>
                                )
                            })}
                        </div>
                    </aside>}
                </div>
            </div>
        </div>
    )
}
