// src/components/AdminDashboard/ManualReader.tsx
//
// A LEITURA do manual de regras (admin → Manual), só depois de o cofre ser desbloqueado (ver ManualSection). Os capítulos são de UMA palavra cada; o texto chega
// do servidor um capítulo por vez, nunca é guardado no aparelho (nada em localStorage, nada em cache) e a tela é "difícil de levar embora": marca d'água com
// quem está lendo, sem seleção/menu de cópia, escondida ao imprimir e borrada quando a janela perde o foco. É um desestímulo, não uma barreira: quem está
// vendo o texto sempre pode fotografar a tela. A barreira de verdade é o servidor (login + aparelho cadastrado + sessão curta + texto cifrado).
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { callAdminApi } from '@/lib/callAdminApi'
import { Spinner } from '@/components/Spinner'
import type { ThemeColors } from '@/app/contexts/theme'

type Block =
    | { t: 'p'; text: string }
    | { t: 'steps'; items: string[] }
    | { t: 'list'; items: string[] }
    | { t: 'note'; tone?: 'info' | 'warn' | 'todo'; text: string }
    | { t: 'table'; head: string[]; rows: string[][] }
interface Section { id: string; title: string; status?: string; blocks: Block[]; where?: string[]; config?: string[]; evolve?: string[] }
interface Chapter { slug: string; title: string; summary: string; position: number; sections: Section[] }
interface Meta { slug: string; title: string; summary: string; position: number; sections: { id: string; title: string; status?: string }[] }
interface Hit { slug: string; chapter: string; sectionId: string; section: string; snippet: string }

const STATUS: Record<string, { label: string; color: string }> = {
    ativo: { label: 'ativo', color: '#16a34a' },
    desligado: { label: 'desligado', color: '#64748b' },
    parcial: { label: 'parcial', color: '#d97706' },
    pendente: { label: 'pendente de produção', color: '#ea580c' },
    planejado: { label: 'planejado', color: '#7c3aed' },
}

/** `código` e **negrito** dentro de uma frase */
function Inline({ text, colors }: { text: string; colors: ThemeColors }) {
    const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean)
    return (
        <>
            {parts.map((p, i) => p.startsWith('`') ? <code key={i} className="px-1 py-0.5 rounded text-[0.92em] font-mono" style={{ background: `${colors.border}55`, color: colors.textPrimary }}>{p.slice(1, -1)}</code>
                : p.startsWith('**') ? <strong key={i} style={{ color: colors.textPrimary }}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>)}
        </>
    )
}

function BlockView({ b, colors }: { b: Block; colors: ThemeColors }) {
    const txt = { color: colors.textSecondary }
    if (b.t === 'p') return <p className="text-[13px] leading-relaxed" style={txt}><Inline text={b.text} colors={colors} /></p>
    if (b.t === 'steps') return <ol className="list-decimal pl-5 space-y-1.5 text-[13px] leading-relaxed" style={txt}>{b.items.map((x, i) => <li key={i}><Inline text={x} colors={colors} /></li>)}</ol>
    if (b.t === 'list') return <ul className="list-disc pl-5 space-y-1 text-[13px] leading-relaxed" style={txt}>{b.items.map((x, i) => <li key={i}><Inline text={x} colors={colors} /></li>)}</ul>
    if (b.t === 'note') {
        const c = b.tone === 'warn' ? '#d97706' : b.tone === 'todo' ? '#7c3aed' : '#2563eb'
        return <p className="text-[12.5px] leading-relaxed rounded-xl px-3 py-2" style={{ background: `${c}14`, border: `1px solid ${c}35`, color: colors.textPrimary }}><Inline text={b.text} colors={colors} /></p>
    }
    return (
        <div className="overflow-x-auto rounded-xl" style={{ border: `1px solid ${colors.border}` }}>
            <table className="w-full text-[12px]">
                <thead><tr>{b.head.map((h, i) => <th key={i} className="text-left px-3 py-2 font-black" style={{ background: `${colors.border}40`, color: colors.textPrimary }}>{h}</th>)}</tr></thead>
                <tbody>{b.rows.map((r, i) => <tr key={i} style={{ borderTop: `1px solid ${colors.border}` }}>{r.map((c, j) => <td key={j} className="px-3 py-2 align-top" style={txt}><Inline text={c} colors={colors} /></td>)}</tr>)}</tbody>
            </table>
        </div>
    )
}

export default function ManualReader({ colors, who, onActivity }: { colors: ThemeColors; who: string; onActivity: () => void }) {
    const [index, setIndex] = useState<Meta[] | null>(null)
    const [slug, setSlug] = useState<string | null>(null)
    const [chapter, setChapter] = useState<Chapter | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [q, setQ] = useState('')
    const [hits, setHits] = useState<Hit[] | null>(null)
    const [away, setAway] = useState(false)
    const [stamp, setStamp] = useState(() => new Date().toLocaleString('pt-BR'))
    const topRef = useRef<HTMLDivElement>(null)

    // Borra o texto quando a janela perde o foco (deixa a captura de tela menos óbvia)
    useEffect(() => {
        const on = () => setAway(document.hidden || !document.hasFocus())
        window.addEventListener('blur', on); window.addEventListener('focus', on); document.addEventListener('visibilitychange', on)
        return () => { window.removeEventListener('blur', on); window.removeEventListener('focus', on); document.removeEventListener('visibilitychange', on) }
    }, [])
    useEffect(() => { const t = setInterval(() => setStamp(new Date().toLocaleString('pt-BR')), 30_000); return () => clearInterval(t) }, [])

    useEffect(() => {
        callAdminApi<{ chapters: Meta[] }>('/api/admin/manual/content', { action: 'index' })
            .then((r) => { setIndex(r.chapters); if (r.chapters[0]) setSlug(r.chapters[0].slug) })
            .catch((e) => setError(e.message))
    }, [])

    const open = useCallback(async (s: string, scrollTo?: string) => {
        onActivity(); setSlug(s); setHits(null); setLoading(true); setError('')
        try {
            const r = await callAdminApi<{ chapter: Chapter }>('/api/admin/manual/content', { action: 'chapter', slug: s })
            setChapter(r.chapter)
            requestAnimationFrame(() => { (scrollTo ? document.getElementById(`sec-${scrollTo}`) : topRef.current)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) })
        } catch (e: any) { setError(e.message) } finally { setLoading(false) }
    }, [onActivity])
    useEffect(() => { if (slug && !chapter) open(slug) }, [slug]) // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (q.trim().length < 2) { setHits(null); return }
        const t = setTimeout(() => {
            onActivity()
            callAdminApi<{ hits: Hit[] }>('/api/admin/manual/content', { action: 'search', q }).then((r) => setHits(r.hits)).catch(() => setHits([]))
        }, 300)
        return () => clearTimeout(t)
    }, [q]) // eslint-disable-line react-hooks/exhaustive-deps

    const mark = useMemo(() => Array.from({ length: 30 }, () => `${who} · ${stamp}`), [who, stamp])
    const meta = index?.find((c) => c.slug === slug)

    return (
        <div className="manual-secret relative select-none" onContextMenu={(e) => e.preventDefault()} onCopy={(e) => e.preventDefault()} onCut={(e) => e.preventDefault()} onDragStart={(e) => e.preventDefault()} onMouseMove={onActivity} onKeyDown={onActivity} style={{ userSelect: 'none', WebkitUserSelect: 'none' }}>
            <style>{`@media print { .manual-secret { display: none !important } }`}</style>

            {/* marca d'água: quem está lendo e quando */}
            <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden z-20" style={{ opacity: 0.07 }}>
                <div className="absolute -inset-1/2 flex flex-wrap content-start gap-x-14 gap-y-10 text-[12px] font-black whitespace-nowrap" style={{ transform: 'rotate(-24deg)', color: colors.textPrimary }}>
                    {mark.map((m, i) => <span key={i}>{m}</span>)}{mark.map((m, i) => <span key={`b${i}`}>{m}</span>)}{mark.map((m, i) => <span key={`c${i}`}>{m}</span>)}
                </div>
            </div>

            <div className="relative z-10 space-y-4 transition-[filter] duration-150" style={{ filter: away ? 'blur(14px)' : 'none' }}>
                {/* os capítulos: uma palavra cada */}
                <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                    {index === null ? <Spinner size={18} color={colors.accent} /> : index.map((c) => {
                        const on = c.slug === slug && !hits
                        return <button key={c.slug} onClick={() => { setQ(''); open(c.slug) }} className="px-3 h-8 rounded-full text-[12px] font-black whitespace-nowrap transition active:scale-95" style={on ? { background: colors.accent, color: colors.accentText } : { background: `${colors.border}40`, color: colors.textPrimary }}>{c.title}</button>
                    })}
                </div>

                <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: colors.textSecondary }} />
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar em todo o manual" className="w-full h-10 rounded-full pl-9 pr-9 text-[13px] focus:outline-none select-text" style={{ background: `${colors.border}35`, color: colors.textPrimary, userSelect: 'text' }} />
                    {q && <button onClick={() => setQ('')} aria-label="Limpar" className="absolute right-2.5 top-1/2 -translate-y-1/2"><X size={14} style={{ color: colors.textSecondary }} /></button>}
                </div>

                {error && <p className="text-[12px] font-bold" style={{ color: '#ef4444' }}>{error}</p>}
                {index && index.length === 0 && <p className="text-[13px]" style={{ color: colors.textSecondary }}>O manual ainda está vazio neste ambiente.</p>}

                {hits ? (
                    <div className="space-y-2">
                        <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: colors.textSecondary }}>{hits.length ? `${hits.length} resultado(s)` : 'Nada encontrado'}</p>
                        {hits.map((h, i) => (
                            <button key={i} onClick={() => { setQ(''); open(h.slug, h.sectionId) }} className="w-full text-left rounded-2xl p-3 transition active:scale-[0.99]" style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}` }}>
                                <p className="text-[12px] font-black" style={{ color: colors.accent }}>{h.chapter} · {h.section}</p>
                                <p className="text-[12px] mt-0.5" style={{ color: colors.textSecondary }}>{h.snippet}</p>
                            </button>
                        ))}
                    </div>
                ) : (
                    <div ref={topRef}>
                        {loading && <div className="py-10 flex justify-center"><Spinner size={24} color={colors.accent} /></div>}
                        {!loading && chapter && chapter.slug === slug && (
                            <div className="space-y-4">
                                <div>
                                    <h2 className="text-xl font-black" style={{ color: colors.textPrimary }}>{chapter.title}</h2>
                                    <p className="text-[13px] mt-0.5" style={{ color: colors.textSecondary }}>{chapter.summary}</p>
                                </div>
                                {meta && meta.sections.length > 1 && (
                                    <div className="flex flex-wrap gap-1.5">
                                        {meta.sections.map((s) => <a key={s.id} href={`#sec-${s.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(`sec-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }} className="px-2.5 h-7 inline-flex items-center rounded-full text-[11px] font-bold" style={{ background: `${colors.border}35`, color: colors.textSecondary }}>{s.title}</a>)}
                                    </div>
                                )}
                                {chapter.sections.map((s) => {
                                    const st = s.status ? STATUS[s.status] : null
                                    return (
                                        <section key={s.id} id={`sec-${s.id}`} className="rounded-3xl p-4 space-y-3 scroll-mt-24" style={{ background: `rgba(127,127,127,0.06)`, border: `1px solid ${colors.border}` }}>
                                            <div className="flex items-start justify-between gap-2">
                                                <h3 className="text-[15px] font-black leading-snug" style={{ color: colors.textPrimary }}>{s.title}</h3>
                                                <span className="flex items-center gap-1.5 flex-shrink-0">
                                                    {st && <span className="px-2 py-0.5 rounded-full text-[10px] font-black" style={{ background: `${st.color}1f`, color: st.color }}>{st.label}</span>}
                                                    <span className="text-[10px] font-mono font-bold" style={{ color: colors.textSecondary }}>{s.id}</span>
                                                </span>
                                            </div>
                                            {s.blocks.map((b, i) => <BlockView key={i} b={b} colors={colors} />)}
                                            {(s.where?.length || s.config?.length) ? (
                                                <div className="grid gap-2 sm:grid-cols-2 pt-1">
                                                    {s.where?.length ? <div><p className="text-[10px] font-black uppercase tracking-wide mb-1" style={{ color: colors.textSecondary }}>Onde mora</p><div className="flex flex-wrap gap-1">{s.where.map((w, i) => <code key={i} className="px-1.5 py-0.5 rounded text-[11px] font-mono" style={{ background: `${colors.border}55`, color: colors.textPrimary }}>{w}</code>)}</div></div> : null}
                                                    {s.config?.length ? <div><p className="text-[10px] font-black uppercase tracking-wide mb-1" style={{ color: colors.textSecondary }}>Onde se configura</p><div className="flex flex-wrap gap-1">{s.config.map((w, i) => <span key={i} className="px-1.5 py-0.5 rounded text-[11px] font-bold" style={{ background: `${colors.accent}1f`, color: colors.accent }}>{w}</span>)}</div></div> : null}
                                                </div>
                                            ) : null}
                                            {s.evolve?.length ? (
                                                <div className="rounded-2xl p-3" style={{ background: '#7c3aed12', border: '1px dashed #7c3aed55' }}>
                                                    <p className="text-[10px] font-black uppercase tracking-wide mb-1.5" style={{ color: '#7c3aed' }}>Para evoluir</p>
                                                    <ul className="list-disc pl-4 space-y-1 text-[12.5px]" style={{ color: colors.textSecondary }}>{s.evolve.map((e, i) => <li key={i}><Inline text={e} colors={colors} /></li>)}</ul>
                                                </div>
                                            ) : null}
                                        </section>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
