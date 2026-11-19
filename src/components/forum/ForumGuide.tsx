// src/components/forum/ForumGuide.tsx — aba "Como funciona" do Fórum: o guia completo do iUser (texto em modules/forum/guide.ts),
// em tópicos que abrem e fecham, com busca, o passo a passo, as regras e um atalho para a página do app.
'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, User, ShoppingBag, Store, Wrench, Car, Bike, Wallet, Crown, PlayCircle, Users, Radar, Gift, Home, ShieldCheck, Scale, HelpCircle, ChevronDown, Search, CheckCircle2, ArrowRight, X, type LucideIcon } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { GUIDE, type GuideTopic } from '@/modules/forum/guide'

const ICONS: Record<GuideTopic['icon'], LucideIcon> = {
    sparkles: Sparkles, user: User, bag: ShoppingBag, store: Store, wrench: Wrench, car: Car, bike: Bike, wallet: Wallet, crown: Crown,
    play: PlayCircle, users: Users, radar: Radar, gift: Gift, home: Home, shield: ShieldCheck, scale: Scale, help: HelpCircle,
}
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function ForumGuide() {
    const router = useRouter()
    const { colors } = useTheme()
    const [open, setOpen] = useState<string | null>('o-que-e')
    const [q, setQ] = useState('')

    const groups = useMemo(() => {
        const t = norm(q.trim())
        if (!t) return GUIDE
        return GUIDE.map((g) => ({ ...g, topics: g.topics.filter((x) => norm([x.title, x.summary, ...(x.steps || []), ...(x.rules || [])].join(' ')).includes(t)) })).filter((g) => g.topics.length)
    }, [q])

    return (
        <div className="mt-1">
            <div className="flex items-center gap-2 px-4 h-11 rounded-full" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                <Search size={17} style={{ color: colors.textSecondary }} />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Procure no guia: entrega, Pix, plano, motorista..." className="flex-1 min-w-0 bg-transparent text-[13.5px] outline-none" style={{ color: colors.textPrimary }} />
                {q && <button onClick={() => setQ('')} aria-label="Limpar" style={{ color: colors.textSecondary }}><X size={16} /></button>}
            </div>
            {groups.length === 0 && <p className="py-8 text-center text-[13.5px]" style={{ color: colors.textSecondary }}>Nada encontrado. Que tal sugerir essa dúvida na aba Ideias?</p>}
            {groups.map((g) => (
                <section key={g.title} className="mt-4">
                    <h2 className="text-[12px] font-black uppercase tracking-wide mb-2" style={{ color: colors.textSecondary }}>{g.title}</h2>
                    <div className="flex flex-col gap-2">
                        {g.topics.map((t) => {
                            const Icon = ICONS[t.icon]
                            const isOpen = open === t.id || !!q.trim()
                            return (
                                <article key={t.id} id={`guia-${t.id}`} className="rounded-3xl overflow-hidden" style={{ background: colors.surface, border: `1px solid ${isOpen ? `${t.color}66` : colors.border}` }}>
                                    <button onClick={() => setOpen(isOpen && !q.trim() ? null : t.id)} className="w-full flex items-center gap-3 p-3.5 text-left" aria-expanded={isOpen}>
                                        <span className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: `${t.color}1f`, color: t.color }}><Icon size={20} /></span>
                                        <span className="flex-1 text-[14.5px] font-black leading-tight" style={{ color: colors.textPrimary }}>{t.title}</span>
                                        <ChevronDown size={18} className="transition-transform" style={{ color: colors.textSecondary, transform: isOpen ? 'rotate(180deg)' : undefined }} />
                                    </button>
                                    {isOpen && (
                                        <div className="px-4 pb-4 -mt-1">
                                            <p className="text-[13.5px] leading-relaxed" style={{ color: colors.textPrimary }}>{t.summary}</p>
                                            {t.steps && (
                                                <>
                                                    <p className="mt-3 text-[11.5px] font-black uppercase tracking-wide" style={{ color: t.color }}>Passo a passo</p>
                                                    <ol className="mt-1.5 flex flex-col gap-1.5">
                                                        {t.steps.map((s, i) => (
                                                            <li key={i} className="flex gap-2.5 text-[13px] leading-snug" style={{ color: colors.textPrimary }}>
                                                                <span className="w-5 h-5 rounded-full text-[11px] font-black text-white flex items-center justify-center flex-shrink-0 mt-px" style={{ background: t.color }}>{i + 1}</span>{s}
                                                            </li>
                                                        ))}
                                                    </ol>
                                                </>
                                            )}
                                            {t.rules && (
                                                <>
                                                    <p className="mt-3 text-[11.5px] font-black uppercase tracking-wide" style={{ color: colors.textSecondary }}>Bom saber</p>
                                                    <ul className="mt-1.5 flex flex-col gap-1.5">
                                                        {t.rules.map((r, i) => <li key={i} className="flex gap-2 text-[13px] leading-snug" style={{ color: colors.textPrimary }}><CheckCircle2 size={15} className="flex-shrink-0 mt-0.5" style={{ color: '#16a34a' }} />{r}</li>)}
                                                    </ul>
                                                </>
                                            )}
                                            {(t.link || t.link2) && (
                                                <div className="mt-3 flex flex-wrap gap-2">
                                                    {[t.link, t.link2].filter(Boolean).map((l) => (
                                                        <button key={l!.path} onClick={() => router.push(l!.path)} className="h-9 px-3.5 rounded-full text-[12.5px] font-black flex items-center gap-1.5" style={{ background: `${t.color}1f`, color: t.color }}>{l!.label} <ArrowRight size={14} /></button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </article>
                            )
                        })}
                    </div>
                </section>
            ))}
            <p className="mt-5 text-center text-[12.5px]" style={{ color: colors.textSecondary }}>Ficou alguma dúvida? Sugira na aba Ideias: o guia cresce com as perguntas de vocês.</p>
        </div>
    )
}
