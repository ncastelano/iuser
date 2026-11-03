// src/components/v3/SocialAroundCard.tsx
//
// "Social" da home 3.0, no molde do "Ver ao redor": um de cada coisa da parte social do iUser — flash, publicação, perfil em destaque, gente nova,
// quem oferece serviços e comunidade —, cada tile alternando entre os (até) 3 mais recentes a cada 5 s. Tocar num tile abre o item; tocar no título abre a página Social.
// Cada fonte carrega sozinha (as mesmas da página /social, `modules/people`); a que falhar ou vier vazia só some do card.
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, Newspaper, Sparkles, Trophy, UserPlus, Users, Wrench, Zap } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { avatarOf, loadCommunities, loadFlashes, loadNewPeople, loadPublications, loadServiceProviders, loadTopPeople, joinedLabel } from '@/modules/people'
import { authorAvatarUrl, mediaSrc, shortCount, timeAgo, type FlashItem } from '@/modules/flash'

const COLOR = '#f97316'

interface Tile { key: string; kind: string; label: string; color: string; icon: typeof Zap; name: string; sub?: string; image: string | null; round: boolean; href: string }
const META = {
    flash: { label: 'Flash', color: '#ea580c', icon: Zap },
    publication: { label: 'Publicação', color: '#2563eb', icon: Newspaper },
    top: { label: 'Em destaque', color: '#ca8a04', icon: Trophy },
    fresh: { label: 'Novo por aqui', color: '#16a34a', icon: UserPlus },
    service: { label: 'Faz serviços', color: '#7c3aed', icon: Wrench },
    community: { label: 'Comunidade', color: '#0891b2', icon: Users },
} as const
type Kind = keyof typeof META

const fromItem = (kind: 'flash' | 'publication', f: FlashItem): Tile => ({
    key: `${kind}-${f.id}`, kind, ...META[kind],
    name: (kind === 'publication' ? f.title || f.content : f.content) || f.authorName,
    sub: `${f.authorName} · ${f.likeCount > 0 ? `${shortCount(f.likeCount)} curtidas` : timeAgo(f.createdAt)}`,
    image: kind === 'flash' && f.mediaType === 'video' ? authorAvatarUrl(f.authorAvatar) : mediaSrc(f) ?? authorAvatarUrl(f.authorAvatar),
    round: !mediaSrc(f) || (kind === 'flash' && f.mediaType === 'video'),
    href: kind === 'publication' && f.link ? `/${f.authorSlug}/${f.link}` : `/flash?de=${f.id}`,
})

export default function SocialAroundCard() {
    const router = useRouter()
    const { colors } = useTheme()
    const [lists, setLists] = useState<Partial<Record<Kind, Tile[]>> | null>(null)
    const [tick, setTick] = useState(0)

    useEffect(() => {
        let cancelled = false
        const safe = <T,>(p: Promise<T[]>) => p.catch(() => [] as T[])
        Promise.all([
            safe(loadFlashes(3)), safe(loadPublications(3)), safe(loadTopPeople(3)), safe(loadNewPeople(3)), safe(loadServiceProviders(3)), safe(loadCommunities(3)),
        ]).then(([flash, pubs, top, fresh, service, comm]) => {
            if (cancelled) return
            setLists({
                flash: flash.map((f) => fromItem('flash', f)),
                publication: pubs.map((f) => fromItem('publication', f)),
                top: top.map((p) => ({ key: `top-${p.id}`, kind: 'top', ...META.top, name: p.name, sub: `${p.points} pontos`, image: avatarOf(p.avatarPath), round: true, href: `/${p.slug}` })),
                fresh: fresh.map((p) => ({ key: `fresh-${p.id}`, kind: 'fresh', ...META.fresh, name: p.name, sub: (joinedLabel(p.joinedAt) || '').replace('entrou ', 'entrou '), image: avatarOf(p.avatarPath), round: true, href: `/${p.slug}` })),
                service: service.map((p) => ({ key: `service-${p.id}`, kind: 'service', ...META.service, name: p.name, sub: p.offers || 'Oferece serviços', image: avatarOf(p.avatarPath), round: true, href: `/${p.slug}` })),
                community: comm.map((c) => ({ key: `community-${c.id}`, kind: 'community', ...META.community, name: c.name, sub: c.city || 'Sala de conversa', image: c.image, round: false, href: `/comunidade/${c.slug}` })),
            })
        })
        return () => { cancelled = true }
    }, [])

    useEffect(() => {
        if (!lists || !Object.values(lists).some((l) => (l?.length || 0) > 1)) return
        const t = setInterval(() => { if (!document.hidden) setTick((n) => n + 1) }, 5000)
        return () => clearInterval(t)
    }, [lists])

    const tiles = lists ? (Object.keys(META) as Kind[]).filter((k) => (lists[k]?.length || 0) > 0).map((k) => lists[k]![tick % lists[k]!.length]) : null
    const soft = `${colors.border}40`

    return (
        <div className="col-span-2 md:col-span-4 rounded-3xl border" style={{ background: colors.surface, borderColor: colors.border, boxShadow: colors.shadow }}>
            <button onClick={() => router.push('/social')} className="w-full p-3.5 flex items-center gap-3 text-left transition active:opacity-80">
                <span className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: `${COLOR}1f`, color: COLOR }}><Sparkles size={22} /></span>
                <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-black leading-tight" style={{ color: colors.textPrimary }}>Social</span>
                    <span className="block text-xs mt-0.5 leading-snug" style={{ color: colors.textSecondary }}>Flash, publicações e gente do iUser</span>
                </span>
                <span className="flex items-center gap-0.5 text-xs font-black flex-shrink-0" style={{ color: COLOR }}>Abrir <ChevronRight size={14} /></span>
            </button>

            {tiles === null ? (
                <div className="px-3.5 pb-3.5 grid grid-cols-2 gap-2.5">
                    {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-[66px] rounded-2xl animate-pulse" style={{ background: soft }} />)}
                </div>
            ) : tiles.length > 0 && (
                <div className="px-3.5 pb-3.5 grid grid-cols-2 md:grid-cols-3 gap-2.5">
                    {tiles.map((t) => {
                        const Icon = t.icon
                        return (
                            <button key={t.key} onClick={() => router.push(t.href)} className="social-in min-w-0 rounded-2xl p-2 flex items-center gap-2.5 text-left transition active:scale-[0.98]" style={{ background: soft }}>
                                <span className={`w-12 h-12 overflow-hidden flex-shrink-0 flex items-center justify-center ${t.round ? 'rounded-full' : 'rounded-xl'}`} style={{ background: `${t.color}22`, color: t.color }}>
                                    {t.image ? <img src={t.image} alt="" loading="lazy" className="w-full h-full object-cover" /> : <Icon size={20} />}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-[10px] font-black uppercase tracking-wide" style={{ color: t.color }}>{t.label}</span>
                                    <span className="block text-[13px] font-black leading-tight" style={{ color: colors.textPrimary, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word' }}>{t.name}</span>
                                    {t.sub && <span className="block text-[11px] truncate" style={{ color: colors.textSecondary }}>{t.sub}</span>}
                                </span>
                            </button>
                        )
                    })}
                </div>
            )}
            <style jsx>{`
                .social-in { animation: socialIn .4s ease both; }
                @keyframes socialIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: none; } }
                @media (prefers-reduced-motion: reduce) { .social-in { animation: none; } }
            `}</style>
        </div>
    )
}
