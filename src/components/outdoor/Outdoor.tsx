// src/components/outdoor/Outdoor.tsx
//
// O OUTDOOR: vitrine por PONTUAÇÃO, o mesmo desenho em todas as telas (home, /comprar, /social, /imoveis...). Cada tela diz só o TIPO
// (`kind`: lojas, pessoas, imóveis...); a regra de pontos de cada tipo mora no banco (get_outdoor) e os nomes/cores em modules/outdoor.
// Logos flutuantes sobre um painel colorido; os 3 primeiros ganham medalha (ouro, prata, bronze) e ficam maiores. Some se não houver ninguém.
'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Crown, Info, X } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { loadOutdoor, loadOutdoorRules, outdoorImageUrl, OUTDOOR_INFO, outdoorHref, medalOf, pointsLabel, type OutdoorItem, type OutdoorKind, type Medal } from '@/modules/outdoor'

const MEDAL: Record<Medal, { ring: string; glow: string; text: string }> = {
    gold:   { ring: '#facc15', glow: 'rgba(250,204,21,0.65)',  text: '#713f12' },
    silver: { ring: '#e2e8f0', glow: 'rgba(226,232,240,0.55)', text: '#334155' },
    bronze: { ring: '#d97706', glow: 'rgba(217,119,6,0.55)',   text: '#431407' },
}

function Logo({ kind, item, size, medal, index }: { kind: OutdoorKind; item: OutdoorItem; size: number; medal: Medal | null; index: number }) {
    const info = OUTDOOR_INFO[kind]
    const url = outdoorImageUrl(kind, item.image)
    const radius = info.shape === 'circle' ? '9999px' : `${Math.round(size * 0.26)}px`
    return (
        <span
            className="relative block flex-shrink-0 overflow-hidden"
            style={{
                width: size, height: size, borderRadius: radius, background: '#fff',
                border: `${medal ? 3 : 2.5}px solid ${medal ? MEDAL[medal].ring : '#fff'}`,
                boxShadow: medal ? `0 0 0 3px ${MEDAL[medal].glow}, 0 8px 18px rgba(0,0,0,0.25)` : '0 6px 14px rgba(0,0,0,0.2)',
            }}
        >
            <span className="absolute inset-0 flex items-center justify-center font-black text-orange-500" style={{ fontSize: size * 0.4, background: 'linear-gradient(135deg,#ffedd5,#fee2e2)' }}>
                {item.name.replace('@', '').charAt(0).toUpperCase()}
            </span>
            {url && <img src={url} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />}
        </span>
    )
}

function RulesSheet({ kind, onClose }: { kind: OutdoorKind; onClose: () => void }) {
    const { colors } = useTheme()
    const info = OUTDOOR_INFO[kind]
    const [rules, setRules] = useState<{ label: string; points: number }[] | null | undefined>(undefined)
    useEffect(() => { void loadOutdoorRules(kind).then(setRules) }, [kind])
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])
    if (typeof document === 'undefined') return null
    return createPortal(
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={`Como pontua: ${info.title}`}>
            <button aria-label="Fechar" onClick={onClose} className="absolute inset-0 bg-black/50 cursor-default" />
            <div className="relative w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 pb-8 max-h-[80dvh] overflow-y-auto" style={{ background: colors.background, color: colors.textPrimary }}>
                <div className="flex items-center gap-2">
                    <span className="w-9 h-9 rounded-full flex items-center justify-center text-white flex-shrink-0" style={{ background: info.color }}><Crown size={18} /></span>
                    <div className="min-w-0 flex-1">
                        <p className="text-base font-black leading-tight">{info.title}</p>
                        <p className="text-xs" style={{ color: colors.textSecondary }}>Quem soma mais pontos fica em primeiro</p>
                    </div>
                    <button onClick={onClose} aria-label="Fechar" className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: `${colors.border}50` }}><X size={17} /></button>
                </div>
                <p className="mt-4 mb-2 text-[11px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>Como pontua</p>
                {rules === undefined ? <p className="text-sm" style={{ color: colors.textSecondary }}>Carregando...</p>
                    : !rules || rules.length === 0 ? <p className="text-sm" style={{ color: colors.textSecondary }}>Não foi possível carregar as regras agora.</p>
                    : (
                        <ul className="flex flex-col gap-1.5">
                            {rules.map((r) => (
                                <li key={r.label} className="flex items-center gap-3 rounded-2xl px-3 py-2.5" style={{ background: `${colors.border}30` }}>
                                    <span className="flex-1 text-sm font-bold leading-snug">{r.label}</span>
                                    <span className="text-xs font-black px-2 py-1 rounded-full text-white whitespace-nowrap" style={{ background: info.color }}>
                                        {r.points >= 1 ? `+${r.points.toLocaleString('pt-BR')}` : `+${r.points.toLocaleString('pt-BR')} (cada ${Math.round(1 / r.points)})`}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
            </div>
        </div>,
        document.body,
    )
}

export default function Outdoor({ kind, limit = 12, className = '', title }: { kind: OutdoorKind; limit?: number; className?: string; title?: string }) {
    const router = useRouter()
    const { colors } = useTheme()
    const info = OUTDOOR_INFO[kind]
    const [items, setItems] = useState<OutdoorItem[] | null | undefined>(undefined)   // undefined = carregando; null = falhou
    const [rulesOpen, setRulesOpen] = useState(false)
    useEffect(() => {
        let alive = true
        setItems(undefined)
        void loadOutdoor(kind, limit).then((r) => { if (alive) setItems(r) })
        return () => { alive = false }
    }, [kind, limit])

    if (items === null || (items && items.length === 0)) return null   // sem dados ou falha: não ocupa lugar nem mostra "vazio"

    // Sem painel de fundo: só o título, os logos flutuando e os pontos, nas cores do tema da página
    return (
        <section aria-label={info.title} className={`relative ${className}`}>
            <div className="flex items-center gap-2">
                <Crown size={16} className="flex-shrink-0" style={{ color: '#eab308' }} fill="#facc15" />
                <p className="flex-1 min-w-0 text-[13px] font-black tracking-wide uppercase truncate" style={{ color: colors.textPrimary }}>{title || info.title}</p>
                <button onClick={() => setRulesOpen(true)} aria-label="Como pontua" className="flex items-center gap-1 h-7 pl-2 pr-2.5 rounded-full text-[11px] font-black transition active:scale-95" style={{ background: `${colors.border}40`, color: colors.textSecondary }}>
                    <Info size={13} /> Como pontua
                </button>
            </div>

            <div className="flex gap-3.5 overflow-x-auto scrollbar-hide -mx-4 px-4 pt-7 pb-3 snap-x items-start" style={{ WebkitOverflowScrolling: 'touch' }}>
                {items === undefined
                    ? Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="flex-shrink-0 w-[76px] flex flex-col items-center gap-2">
                            <span className="w-[64px] h-[64px] rounded-full animate-pulse" style={{ background: `${colors.border}55` }} />
                            <span className="w-14 h-2.5 rounded-full animate-pulse" style={{ background: `${colors.border}55` }} />
                        </div>
                    ))
                    : items.map((item, idx) => {
                        const medal = medalOf(item.rank)
                        const size = medal ? 76 : 62
                        const href = outdoorHref(kind, item)
                        const Tag = href ? 'button' : 'div'
                        return (
                            <Tag
                                key={item.id}
                                {...(href ? { onClick: () => router.push(href), 'aria-label': `${item.rank}º lugar: ${item.name}, ${pointsLabel(item.points)}` } : {})}
                                className="snap-start flex-shrink-0 flex flex-col items-center text-center transition active:scale-95"
                                style={{ width: medal ? 92 : 78 }}
                            >
                                <span className="relative" style={{ paddingTop: medal ? 0 : 7 }}>
                                    {medal === 'gold' && <Crown size={24} className="absolute left-1/2 -translate-x-1/2 -top-[20px] z-10 drop-shadow" style={{ color: MEDAL.gold.ring }} fill={MEDAL.gold.ring} />}
                                    <Logo kind={kind} item={item} size={size} medal={medal} index={idx} />
                                    <span
                                        className="absolute -bottom-1 -right-1 min-w-[22px] h-[22px] px-1 rounded-full flex items-center justify-center text-[10px] font-black"
                                        style={{ background: medal ? MEDAL[medal].ring : info.color, color: medal ? MEDAL[medal].text : '#fff', boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }}
                                    >
                                        {item.rank}º
                                    </span>
                                </span>
                                <span className="mt-2 w-full text-[11px] font-black leading-tight line-clamp-2" style={{ color: colors.textPrimary }}>{item.name}</span>
                                <span className="mt-1 text-[10px] font-black px-1.5 py-0.5 rounded-full whitespace-nowrap" style={{ background: `${info.color}1f`, color: info.color }}>{pointsLabel(item.points)}</span>
                            </Tag>
                        )
                    })}
            </div>
            {rulesOpen && <RulesSheet kind={kind} onClose={() => setRulesOpen(false)} />}
        </section>
    )
}
