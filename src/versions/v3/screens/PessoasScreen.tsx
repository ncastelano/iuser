// src/versions/v3/screens/PessoasScreen.tsx
//
// PESSOAS (3.0): a "página inicial" das pessoas do iUser, em várias seções como a home — FLASH (as postagens rápidas; o feed completo é o /flash),
// PUBLICAÇÕES das pessoas, PESSOAS PERTO de você, LOCAIS COM MAIS PESSOAS (bairros; toque abre quem está lá), EM DESTAQUE (mais pontos),
// NOVOS por aqui, QUEM OFERECE SERVIÇOS e COMUNIDADES; e uma busca por nome ou @. Cada seção carrega sozinha (esqueleto próprio) e some se vier vazia.
// Só dado público. Regras e fontes em `modules/people` (e `modules/flash` para os flashes e publicações).
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Award, ChevronRight, Heart, MapPin, MessageCircle, Plus, Radar as RadarIcon, Search, Sparkles, Star, UserPlus, Users, Wrench, X, Zap } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { flashGradient, mediaSrc, shortCount, timeAgo, authorAvatarUrl, type FlashItem } from '@/modules/flash'
import {
    avatarOf, canSearch, formatKm, joinedLabel, loadCommunities, loadFlashes, loadNearbyPeople, loadNewPeople, loadPeopleInPlace, loadPlaces, loadPublications,
    loadServiceProviders, loadTopPeople, peopleLabel, searchPeople, type CommunityCard, type Person, type Place,
} from '@/modules/people'

const ORANGE = '#f97316'
const DEVICE_LOCATION_KEY = 'iuser_device_location'

/** Carrega uma seção sozinha (null = carregando; [] = vazia; erro vira vazia) */
function useSection<T>(load: () => Promise<T[]>, deps: unknown[]): T[] | null {
    const [data, setData] = useState<T[] | null>(null)
    useEffect(() => {
        let cancelled = false
        setData(null)
        load().then((d) => { if (!cancelled) setData(d) }, () => { if (!cancelled) setData([]) })
        return () => { cancelled = true }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps)
    return data
}

function Section({ colors, icon: Icon, title, subtitle, onAll, allLabel = 'Ver todos', right, children }: {
    colors: any; icon: any; title: string; subtitle?: string; onAll?: () => void; allLabel?: string; right?: React.ReactNode; children: React.ReactNode
}) {
    return (
        <section className="mt-7">
            <div className="flex items-end justify-between gap-3 mb-3">
                <div className="min-w-0">
                    <h2 className="flex items-center gap-1.5 text-[17px] font-black" style={{ color: colors.textPrimary }}><Icon size={17} style={{ color: ORANGE }} /> {title}</h2>
                    {subtitle && <p className="text-[11px] mt-0.5" style={{ color: colors.textSecondary }}>{subtitle}</p>}
                </div>
                {right}
                {onAll && <button onClick={onAll} className="text-xs font-black flex items-center gap-0.5 flex-shrink-0" style={{ color: ORANGE }}>{allLabel} <ChevronRight size={13} /></button>}
            </div>
            {children}
        </section>
    )
}

/** Fileira que rola para o lado, sem barra */
function Row({ children }: { children: React.ReactNode }) {
    return <div className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-1 snap-x" style={{ scrollbarWidth: 'none' }}>{children}</div>
}
const Skel = ({ w, h, colors, r = 24 }: { w: number | string; h: number; colors: any; r?: number }) => <span className="block flex-shrink-0 animate-pulse" style={{ width: w, height: h, borderRadius: r, background: `${colors.border}50` }} />
const SkelRow = ({ colors, w, h, n = 3 }: { colors: any; w: number | string; h: number; n?: number }) => <Row>{Array.from({ length: n }, (_, i) => <Skel key={i} w={w} h={h} colors={colors} />)}</Row>

function Avatar({ path, name, size = 56 }: { path: string | null; name: string; size?: number }) {
    const { colors } = useTheme()
    const url = avatarOf(path)
    return (
        <span className="rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 font-black" style={{ width: size, height: size, background: url ? `${colors.border}60` : 'linear-gradient(135deg,#f97316,#dc2626)', color: '#fff', fontSize: size * 0.4 }}>
            {url ? <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" /> : (name || '?').charAt(0).toUpperCase()}
        </span>
    )
}

/** A pessoa em cartão vertical (foto, nome, @ e um detalhe) */
function PersonTile({ p, detail, colors, onOpen }: { p: Person; detail?: React.ReactNode; colors: any; onOpen: (p: Person) => void }) {
    return (
        <button onClick={() => onOpen(p)} className="snap-start flex-shrink-0 w-[112px] rounded-3xl p-3 flex flex-col items-center text-center transition active:scale-95" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
            <Avatar path={p.avatarPath} name={p.name} size={60} />
            <span className="mt-2 text-[12px] font-black leading-tight w-full truncate" style={{ color: colors.textPrimary }}>{p.name}</span>
            <span className="text-[10px] w-full truncate" style={{ color: colors.textSecondary }}>@{p.slug}</span>
            {detail && <span className="mt-1.5 text-[10px] font-black px-2 py-0.5 rounded-full max-w-full truncate" style={{ background: `${ORANGE}1f`, color: ORANGE }}>{detail}</span>}
        </button>
    )
}

function FlashSection({ colors, onOpen, onNew, onAll }: { colors: any; onOpen: (f: FlashItem) => void; onNew: () => void; onAll: () => void }) {
    const flashes = useSection(() => loadFlashes(12), [])
    return (
        <Section colors={colors} icon={Zap} title="Flash" subtitle="Posts rápidos das pessoas, em tela cheia" onAll={onAll} allLabel="Abrir o feed">
            {flashes === null ? <SkelRow colors={colors} w={128} h={210} n={3} /> : (
                <Row>
                    <button onClick={onNew} className="snap-start flex-shrink-0 w-[128px] h-[210px] rounded-3xl flex flex-col items-center justify-center gap-2 transition active:scale-95" style={{ border: `2px dashed ${ORANGE}`, color: ORANGE, background: `${ORANGE}10` }}>
                        <span className="w-11 h-11 rounded-full flex items-center justify-center text-white" style={{ background: ORANGE }}><Plus size={22} strokeWidth={3} /></span>
                        <span className="text-[12px] font-black">Postar um flash</span>
                    </button>
                    {flashes.map((f) => {
                        const src = mediaSrc(f)
                        const [c1, c2] = flashGradient(f.id)
                        return (
                            <button key={f.id} onClick={() => onOpen(f)} className="snap-start flex-shrink-0 w-[128px] h-[210px] rounded-3xl overflow-hidden relative text-left transition active:scale-95" style={{ background: `linear-gradient(160deg, ${c1}, ${c2})` }}>
                                {src && f.mediaType !== 'video' && <img src={src} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />}
                                {src && f.mediaType === 'video' && <video src={src} muted playsInline preload="metadata" className="absolute inset-0 w-full h-full object-cover" />}
                                {!src && <span className="absolute inset-0 flex items-center justify-center px-3 pb-10 text-white text-[14px] font-black leading-tight text-center line-clamp-6" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.25)' }}>{f.content}</span>}
                                <span className="absolute inset-x-0 bottom-0 h-20" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.75), transparent)' }} />
                                <span className="absolute left-2 right-2 bottom-2 flex items-center gap-1.5 text-white">
                                    <span className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center text-[11px] font-black flex-shrink-0" style={{ background: 'rgba(255,255,255,0.3)', boxShadow: '0 0 0 1.5px #fff' }}>
                                        {authorAvatarUrl(f.authorAvatar) ? <img src={authorAvatarUrl(f.authorAvatar)!} alt="" className="w-full h-full object-cover" /> : f.authorName.charAt(0).toUpperCase()}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-[11px] font-black truncate">{f.authorName}</span>
                                        <span className="flex items-center gap-1 text-[9px] opacity-90"><Heart size={9} fill="#fff" /> {shortCount(f.likeCount)} · {timeAgo(f.createdAt)}</span>
                                    </span>
                                </span>
                            </button>
                        )
                    })}
                </Row>
            )}
        </Section>
    )
}

function PublicationsSection({ colors, onOpen }: { colors: any; onOpen: (f: FlashItem) => void }) {
    const pubs = useSection(() => loadPublications(10), [])
    if (pubs && pubs.length === 0) return null
    return (
        <Section colors={colors} icon={Sparkles} title="Publicações das pessoas" subtitle="O que estão compartilhando agora" onAll={() => onOpen(pubs![0])} allLabel="Ver">
            {pubs === null ? <SkelRow colors={colors} w={236} h={210} n={2} /> : (
                <Row>
                    {pubs.map((f) => {
                        const src = mediaSrc(f)
                        const [c1, c2] = flashGradient(f.id)
                        return (
                            <button key={f.id} onClick={() => onOpen(f)} className="snap-start flex-shrink-0 w-[236px] rounded-3xl overflow-hidden text-left flex flex-col transition active:scale-[0.98]" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                                <span className="relative block h-[104px] w-full" style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}>
                                    {src ? <img src={src} alt="" loading="lazy" className="w-full h-full object-cover" /> : <span className="absolute inset-0 flex items-center px-4 text-white text-[15px] font-black leading-tight line-clamp-3">{f.title || f.content}</span>}
                                </span>
                                <span className="p-3 flex flex-col gap-1.5">
                                    <span className="text-[13px] font-black leading-snug line-clamp-2" style={{ color: colors.textPrimary }}>{f.title || f.content}</span>
                                    <span className="flex items-center gap-2">
                                        <span className="w-6 h-6 rounded-full overflow-hidden flex items-center justify-center text-[10px] font-black flex-shrink-0" style={{ background: `${colors.border}70`, color: colors.textPrimary }}>
                                            {authorAvatarUrl(f.authorAvatar) ? <img src={authorAvatarUrl(f.authorAvatar)!} alt="" className="w-full h-full object-cover" /> : f.authorName.charAt(0).toUpperCase()}
                                        </span>
                                        <span className="text-[11px] font-bold truncate min-w-0 flex-1" style={{ color: colors.textSecondary }}>{f.authorName}</span>
                                        <span className="flex items-center gap-2 text-[10px] font-bold flex-shrink-0" style={{ color: colors.textSecondary }}>
                                            <span className="flex items-center gap-0.5"><Heart size={10} /> {shortCount(f.likeCount)}</span>
                                            <span className="flex items-center gap-0.5"><MessageCircle size={10} /> {shortCount(f.commentCount)}</span>
                                        </span>
                                    </span>
                                </span>
                            </button>
                        )
                    })}
                </Row>
            )}
        </Section>
    )
}

export default function PessoasScreen() {
    const router = useRouter()
    const { colors } = useTheme()
    const { userId } = useProfile()
    const soft = `${colors.border}40`
    const openPerson = (p: Person) => router.push(`/${p.slug}`)
    const openPost = (f: FlashItem) => router.push(f.kind === 'publication' && f.link ? `/${f.authorSlug}/${f.link}` : `/flash?de=${f.id}`)

    // Onde a pessoa está (para "perto de você"): o endereço do perfil; visitante, o local definido neste aparelho
    const [origin, setOrigin] = useState<{ lat: number; lng: number } | null | undefined>(undefined)
    useEffect(() => {
        let cancelled = false
        const done = (o: { lat: number; lng: number } | null) => { if (!cancelled) setOrigin(o) }
        if (!userId) {
            try { const p = JSON.parse(localStorage.getItem(DEVICE_LOCATION_KEY) || 'null'); done(p && Number.isFinite(p.lat) && Number.isFinite(p.lng) ? { lat: p.lat, lng: p.lng } : null) } catch { done(null) }
        } else {
            supabase.from('my_profile').select('store_lat, store_lng').eq('id', userId).maybeSingle().then(({ data }) => {
                const r = data as { store_lat: number | null; store_lng: number | null } | null
                done(r?.store_lat != null && r?.store_lng != null ? { lat: Number(r.store_lat), lng: Number(r.store_lng) } : null)
            })
        }
        return () => { cancelled = true }
    }, [userId])

    // Busca
    const [q, setQ] = useState('')
    const searching = canSearch(q)
    const [found, setFound] = useState<Person[] | null>(null)
    useEffect(() => {
        if (!searching) { setFound(null); return }
        let cancelled = false
        const t = setTimeout(() => { searchPeople(q).then((r) => { if (!cancelled) setFound(r) }, () => { if (!cancelled) setFound([]) }) }, 250)
        return () => { cancelled = true; clearTimeout(t) }
    }, [q, searching])

    // Local escolhido em "locais com mais pessoas"
    const [place, setPlace] = useState<string | null>(null)

    const nearby = useSection(() => (origin === undefined ? Promise.resolve([]) : loadNearbyPeople(origin, userId || null, 12)), [origin, userId])
    const places = useSection(() => loadPlaces(8), [])
    const inPlace = useSection(() => (place ? loadPeopleInPlace(place, 24) : Promise.resolve([])), [place])
    const top = useSection(() => loadTopPeople(6), [])
    const fresh = useSection(() => loadNewPeople(14), [])
    const providers = useSection(() => loadServiceProviders(10), [])
    const communities = useSection<CommunityCard>(() => loadCommunities(8), [])

    return (
        <div className="pb-6">
            <header>
                <h1 className="flex items-center gap-2 text-2xl font-black" style={{ color: colors.textPrimary }}><Users size={24} style={{ color: ORANGE }} /> Pessoas</h1>
                <p className="text-[13px] mt-0.5" style={{ color: colors.textSecondary }}>Quem está por aqui, o que está postando e onde tem mais gente.</p>
                <div className="relative mt-3">
                    <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: colors.textSecondary }} />
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar pessoas por nome ou @" className="w-full h-12 rounded-full pl-11 pr-11 text-[14px] focus:outline-none" style={{ background: soft, color: colors.textPrimary }} />
                    {q && <button onClick={() => setQ('')} aria-label="Limpar" className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center" style={{ background: `${colors.border}70`, color: colors.textPrimary }}><X size={14} /></button>}
                </div>
            </header>

            {searching ? (
                <Section colors={colors} icon={Search} title="Resultado da busca" subtitle={found ? (found.length ? `${peopleLabel(found.length)} encontradas` : 'Ninguém com esse nome ou @') : 'Buscando…'}>
                    <div className="flex flex-col gap-2">
                        {found === null ? [0, 1, 2].map((i) => <Skel key={i} w="100%" h={64} colors={colors} />) : found.map((p) => (
                            <button key={p.id} onClick={() => openPerson(p)} className="w-full rounded-2xl p-3 flex items-center gap-3 text-left transition active:scale-[0.99]" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                                <Avatar path={p.avatarPath} name={p.name} size={44} />
                                <span className="min-w-0 flex-1"><span className="block text-[14px] font-black truncate" style={{ color: colors.textPrimary }}>{p.name}</span><span className="block text-[12px] truncate" style={{ color: colors.textSecondary }}>@{p.slug}</span></span>
                                <ChevronRight size={16} style={{ color: colors.textSecondary }} />
                            </button>
                        ))}
                    </div>
                </Section>
            ) : (
                <>
                    <FlashSection colors={colors} onOpen={(f) => router.push(`/flash?de=${f.id}`)} onNew={() => router.push(userId ? '/flash?novo=1' : '/login?redirect=/flash')} onAll={() => router.push('/flash')} />

                    <PublicationsSection colors={colors} onOpen={openPost} />

                    {/* Pessoas perto de você */}
                    {!(nearby && nearby.length === 0) && (
                        <Section colors={colors} icon={MapPin} title={origin ? 'Pessoas perto de você' : 'Pessoas em destaque na cidade'} subtitle={origin === null ? 'Defina o seu local no Radar para ver quem está mais perto' : 'Quem escolheu aparecer no Radar'} onAll={() => router.push('/radar')} allLabel="Radar">
                            {nearby === null ? <SkelRow colors={colors} w={112} h={150} n={4} /> : (
                                <Row>
                                    {nearby.map((p) => <PersonTile key={p.id} p={p} colors={colors} onOpen={openPerson} detail={p.distanceKm != null ? formatKm(p.distanceKm) : p.points > 0 ? `${p.points} pts` : undefined} />)}
                                    <button onClick={() => router.push('/radar')} className="snap-start flex-shrink-0 w-[112px] rounded-3xl p-3 flex flex-col items-center justify-center gap-2 text-center transition active:scale-95" style={{ background: soft, color: colors.textPrimary }}>
                                        <RadarIcon size={26} style={{ color: ORANGE }} /><span className="text-[12px] font-black leading-tight">Ver no mapa</span>
                                    </button>
                                </Row>
                            )}
                        </Section>
                    )}

                    {/* Locais com mais pessoas */}
                    {!(places && places.length === 0) && (
                        <Section colors={colors} icon={MapPin} title="Locais com mais pessoas" subtitle="Os bairros onde mais gente do iUser está. Toque para ver quem">
                            {places === null ? <SkelRow colors={colors} w={168} h={104} n={3} /> : (
                                <Row>
                                    {places.map((pl: Place, i) => {
                                        const on = place === pl.place
                                        return (
                                            <button key={pl.place} onClick={() => setPlace(on ? null : pl.place)} className="snap-start flex-shrink-0 w-[168px] rounded-3xl p-3.5 text-left flex flex-col gap-2 transition active:scale-95" style={on ? { background: ORANGE, color: '#fff' } : { background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }}>
                                                <span className="flex items-center justify-between gap-2">
                                                    <span className="text-[15px] font-black truncate">{pl.place}</span>
                                                    {i === 0 && <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full flex-shrink-0" style={on ? { background: 'rgba(255,255,255,0.3)' } : { background: `${ORANGE}22`, color: ORANGE }}>+ gente</span>}
                                                </span>
                                                <span className="text-[12px] font-bold" style={{ opacity: on ? 0.95 : 0.7 }}>{peopleLabel(pl.count)}</span>
                                                <span className="flex">
                                                    {pl.avatars.slice(0, 5).map((a, k) => (
                                                        <span key={k} className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0" style={{ marginLeft: k ? -8 : 0, boxShadow: `0 0 0 2px ${on ? ORANGE : colors.surface}`, background: `${colors.border}80` }}>
                                                            {avatarOf(a) ? <img src={avatarOf(a)!} alt="" className="w-full h-full object-cover" loading="lazy" /> : null}
                                                        </span>
                                                    ))}
                                                </span>
                                            </button>
                                        )
                                    })}
                                </Row>
                            )}
                            {place && (
                                <div className="mt-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="text-[14px] font-black" style={{ color: colors.textPrimary }}>Pessoas em {place}</p>
                                        <button onClick={() => setPlace(null)} className="text-xs font-black flex items-center gap-1" style={{ color: colors.textSecondary }}><X size={13} /> Limpar</button>
                                    </div>
                                    {inPlace === null ? <SkelRow colors={colors} w={112} h={150} n={3} /> : <Row>{inPlace.map((p) => <PersonTile key={p.id} p={p} colors={colors} onOpen={openPerson} detail={p.points > 0 ? `${p.points} pts` : undefined} />)}</Row>}
                                </div>
                            )}
                        </Section>
                    )}

                    {/* Em destaque (mais pontos) */}
                    {!(top && top.length === 0) && (
                        <Section colors={colors} icon={Award} title="Em destaque" subtitle="As pessoas com mais pontos no iUser" onAll={() => router.push('/social')} allLabel="Ranking">
                            {top === null ? <Skel w="100%" h={250} colors={colors} /> : (
                                <div className="rounded-3xl overflow-hidden" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                                    {top.map((p, i) => (
                                        <button key={p.id} onClick={() => openPerson(p)} className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition active:opacity-70" style={i ? { borderTop: `1px solid ${colors.border}` } : undefined}>
                                            <span className="w-6 text-center text-[13px] font-black" style={{ color: i === 0 ? '#eab308' : i === 1 ? '#94a3b8' : i === 2 ? '#c2763a' : colors.textSecondary }}>{i + 1}</span>
                                            <Avatar path={p.avatarPath} name={p.name} size={40} />
                                            <span className="min-w-0 flex-1"><span className="block text-[14px] font-black truncate" style={{ color: colors.textPrimary }}>{p.name}</span><span className="block text-[11px] truncate" style={{ color: colors.textSecondary }}>@{p.slug}</span></span>
                                            <span className="text-[12px] font-black flex items-center gap-1 flex-shrink-0" style={{ color: ORANGE }}><Star size={12} fill={ORANGE} /> {p.points}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </Section>
                    )}

                    {/* Novos por aqui */}
                    {!(fresh && fresh.length === 0) && (
                        <Section colors={colors} icon={UserPlus} title="Novos por aqui" subtitle="Quem acabou de chegar no iUser">
                            {fresh === null ? <SkelRow colors={colors} w={112} h={150} n={4} /> : <Row>{fresh.map((p) => <PersonTile key={p.id} p={p} colors={colors} onOpen={openPerson} detail={joinedLabel(p.joinedAt).replace('entrou ', '')} />)}</Row>}
                        </Section>
                    )}

                    {/* Quem oferece serviços */}
                    {!(providers && providers.length === 0) && (
                        <Section colors={colors} icon={Wrench} title="Quem oferece serviços" subtitle="Pessoas prontas para atender" onAll={() => router.push('/servicos-disponiveis?tipo=profissionais')} allLabel="Ver todas">
                            {providers === null ? <SkelRow colors={colors} w={176} h={118} n={2} /> : (
                                <Row>
                                    {providers.map((p) => (
                                        <button key={p.id} onClick={() => openPerson(p)} className="snap-start flex-shrink-0 w-[176px] rounded-3xl p-3.5 text-left flex flex-col gap-2 transition active:scale-95" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                                            <span className="flex items-center gap-2.5">
                                                <Avatar path={p.avatarPath} name={p.name} size={40} />
                                                <span className="min-w-0 flex-1"><span className="block text-[13px] font-black truncate" style={{ color: colors.textPrimary }}>{p.name}</span>{p.ratingAvg ? <span className="flex items-center gap-0.5 text-[11px] font-bold" style={{ color: '#f59e0b' }}><Star size={10} fill="#f59e0b" /> {p.ratingAvg.toFixed(1).replace('.', ',')}</span> : <span className="block text-[11px]" style={{ color: colors.textSecondary }}>@{p.slug}</span>}</span>
                                            </span>
                                            <span className="text-[12px] font-bold leading-snug line-clamp-2" style={{ color: colors.textSecondary }}>{p.offers || 'Presta serviços'}</span>
                                        </button>
                                    ))}
                                </Row>
                            )}
                        </Section>
                    )}

                    {/* Comunidades */}
                    {!(communities && communities.length === 0) && (
                        <Section colors={colors} icon={Users} title="Comunidades" subtitle="Salas de conversa para falar com as pessoas" onAll={() => router.push('/comunidade')} allLabel="Ver todas">
                            {communities === null ? <SkelRow colors={colors} w={150} h={90} n={3} /> : (
                                <Row>
                                    {communities.map((c) => (
                                        <button key={c.id} onClick={() => router.push(`/comunidade/${c.slug}`)} className="snap-start flex-shrink-0 w-[150px] rounded-3xl overflow-hidden text-left transition active:scale-95" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                                            <span className="block h-14 w-full" style={{ background: c.image ? undefined : `linear-gradient(135deg, ${flashGradient(c.id)[0]}, ${flashGradient(c.id)[1]})` }}>{c.image && <img src={c.image} alt="" className="w-full h-full object-cover" loading="lazy" />}</span>
                                            <span className="block p-2.5"><span className="block text-[12px] font-black leading-tight line-clamp-2" style={{ color: colors.textPrimary }}>{c.name}</span>{c.city && <span className="block text-[10px] mt-0.5 truncate" style={{ color: colors.textSecondary }}>{c.city}</span>}</span>
                                        </button>
                                    ))}
                                </Row>
                            )}
                        </Section>
                    )}
                </>
            )}
        </div>
    )
}
