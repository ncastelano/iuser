// src/components/social/SocialFeedSections.tsx
//
// As seções de FLASH e PUBLICAÇÕES (das pessoas e das lojas) do Social, num lugar só: o /social e a home (17/11/2026: no lugar
// em que ficavam os planos, decisão do dono) usam as MESMAS, então o desenho e os dados não se separam. Cada seção carrega sozinha
// (esqueleto próprio) e some se vier vazia. Junto vão as peças de seção que o /social usa (título, fileira, esqueletos).
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, Heart, MessageCircle, Plus, Sparkles, Zap } from 'lucide-react'
import { flashGradient, mediaSrc, shortCount, timeAgo, authorAvatarUrl, type FlashItem } from '@/modules/flash'
import { loadFlashes, loadPublications, loadStorePublications } from '@/modules/people'

const ORANGE = '#f97316'

/** Carrega uma seção sozinha (null = carregando; [] = vazia; erro vira vazia) */
export function useSection<T>(load: () => Promise<T[]>, deps: unknown[]): T[] | null {
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

export function Section({ colors, icon: Icon, title, subtitle, onAll, allLabel = 'Ver todos', right, children }: {
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
export function Row({ children }: { children: React.ReactNode }) {
    return <div className="flex gap-3 overflow-x-auto -mx-4 px-4 pt-2 pb-3 -mt-2 -mb-2 snap-x" style={{ scrollbarWidth: 'none' }}>{children}</div>
}
export const Skel = ({ w, h, colors, r = 24 }: { w: number | string; h: number; colors: any; r?: number }) => <span className="block flex-shrink-0 animate-pulse" style={{ width: w, height: h, borderRadius: r, background: `${colors.border}50` }} />
export const SkelRow = ({ colors, w, h, n = 3 }: { colors: any; w: number | string; h: number; n?: number }) => <Row>{Array.from({ length: n }, (_, i) => <Skel key={i} w={w} h={h} colors={colors} />)}</Row>

export function FlashSection({ colors, onOpen, onNew, onAll, following = false }: { colors: any; onOpen: (f: FlashItem) => void; onNew: () => void; onAll: () => void; following?: boolean }) {
    const flashes = useSection(() => loadFlashes(12, following ? 'following' : 'all'), [following])
    if (following && flashes && flashes.length === 0) return null
    return (
        <Section colors={colors} icon={Zap} title={following ? 'Flash de quem você segue' : 'Flash'} subtitle={following ? 'Os posts rápidos dos seus contatos' : 'Posts rápidos das pessoas, em tela cheia'} onAll={onAll} allLabel={following ? 'Ver no feed' : 'Abrir o feed'}>
            {flashes === null ? <SkelRow colors={colors} w={128} h={210} n={3} /> : (
                <Row>
                    {!following && <button onClick={onNew} className="snap-start flex-shrink-0 w-[128px] h-[210px] rounded-3xl flex flex-col items-center justify-center gap-2 transition active:scale-95" style={{ border: `2px dashed ${ORANGE}`, color: ORANGE, background: `${ORANGE}10` }}>
                        <span className="w-11 h-11 rounded-full flex items-center justify-center text-white" style={{ background: ORANGE }}><Plus size={22} strokeWidth={3} /></span>
                        <span className="text-[12px] font-black">Postar um flash</span>
                    </button>}
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

// Publicações das LOJAS (novidades, promoções, avisos): o mesmo cartão das publicações das pessoas; tocar abre a página da publicação.
// A home 2.0 tinha "Publicações em destaque" com lojas e pessoas: as das pessoas já moravam aqui, as das lojas faltavam na 3.0.
export function StorePublicationsSection({ colors }: { colors: any }) {
    const router = useRouter()
    const pubs = useSection(() => loadStorePublications(10), [])
    if (pubs && pubs.length === 0) return null
    return (
        <Section colors={colors} icon={Sparkles} title="Publicações das lojas" subtitle="Novidades e avisos das lojas do iUser" onAll={() => router.push('/publicacoes')} allLabel="Ver todas">
            {pubs === null ? <SkelRow colors={colors} w={128} h={210} n={3} /> : (
                <Row>
                    {pubs.map((p) => {
                        const [c1, c2] = flashGradient(p.id)
                        return (
                            <button key={p.id} onClick={() => router.push(`/publicacoes/${p.slug || p.id}`)} className="snap-start flex-shrink-0 w-[128px] h-[210px] rounded-3xl overflow-hidden relative text-left transition active:scale-95" style={{ background: `linear-gradient(160deg, ${c1}, ${c2})` }}>
                                {p.image && <img src={p.image} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />}
                                {!p.image && <span className="absolute inset-0 flex items-center justify-center px-3 pb-12 text-white text-[14px] font-black leading-tight text-center line-clamp-6" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.25)' }}>{p.title}</span>}
                                <span className="absolute inset-x-0 bottom-0 h-28" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)' }} />
                                <span className="absolute left-2 right-2 bottom-2 flex flex-col gap-1.5 text-white">
                                    {p.image && <span className="text-[11px] font-black leading-snug line-clamp-2" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.5)' }}>{p.title}</span>}
                                    <span className="flex items-center gap-1.5">
                                        <span className="w-7 h-7 rounded-lg overflow-hidden flex items-center justify-center text-[11px] font-black flex-shrink-0" style={{ background: 'rgba(255,255,255,0.3)', boxShadow: '0 0 0 1.5px #fff' }}>
                                            {p.storeLogo ? <img src={p.storeLogo} alt="" className="w-full h-full object-cover" /> : p.storeName.charAt(0).toUpperCase()}
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-[11px] font-black truncate">{p.storeName}</span>
                                            <span className="block text-[9px] opacity-90">{timeAgo(p.createdAt)}</span>
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

export function PublicationsSection({ colors, onOpen, following = false }: { colors: any; onOpen: (f: FlashItem) => void; following?: boolean }) {
    const router = useRouter()
    const pubs = useSection(() => loadPublications(10, following ? 'following' : 'all'), [following])
    if (pubs && pubs.length === 0) return null
    return (
        <Section colors={colors} icon={Sparkles} title={following ? 'Publicações de quem você segue' : 'Publicações das pessoas'} subtitle={following ? 'O que seus contatos estão compartilhando' : 'O que estão compartilhando agora'} onAll={() => router.push('/flash?aba=publicacoes')} allLabel="Ver todas">
            {pubs === null ? <SkelRow colors={colors} w={128} h={210} n={3} /> : (
                <Row>
                    {pubs.map((f) => {
                        const src = mediaSrc(f)
                        const [c1, c2] = flashGradient(f.id)
                        const text = f.title || f.content
                        return (
                            <button key={f.id} onClick={() => onOpen(f)} className="snap-start flex-shrink-0 w-[128px] h-[210px] rounded-3xl overflow-hidden relative text-left transition active:scale-95" style={{ background: `linear-gradient(160deg, ${c1}, ${c2})` }}>
                                {src && <img src={src} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />}
                                {!src && <span className="absolute inset-0 flex items-center justify-center px-3 pb-12 text-white text-[14px] font-black leading-tight text-center line-clamp-6" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.25)' }}>{text}</span>}
                                <span className="absolute inset-x-0 bottom-0 h-28" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)' }} />
                                <span className="absolute left-2 right-2 bottom-2 flex flex-col gap-1.5 text-white">
                                    {src && <span className="text-[11px] font-black leading-snug line-clamp-2" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.5)' }}>{text}</span>}
                                    <span className="flex items-center gap-1.5">
                                        <span className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center text-[11px] font-black flex-shrink-0" style={{ background: 'rgba(255,255,255,0.3)', boxShadow: '0 0 0 1.5px #fff' }}>
                                            {authorAvatarUrl(f.authorAvatar) ? <img src={authorAvatarUrl(f.authorAvatar)!} alt="" className="w-full h-full object-cover" /> : f.authorName.charAt(0).toUpperCase()}
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-[11px] font-black truncate">{f.authorName}</span>
                                            <span className="flex items-center gap-1.5 text-[9px] opacity-90">
                                                <span className="flex items-center gap-0.5"><Heart size={9} fill="#fff" /> {shortCount(f.likeCount)}</span>
                                                <span className="flex items-center gap-0.5"><MessageCircle size={9} /> {shortCount(f.commentCount)}</span>
                                                <span>· {timeAgo(f.createdAt)}</span>
                                            </span>
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

