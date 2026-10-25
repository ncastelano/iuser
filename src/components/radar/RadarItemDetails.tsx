// src/components/radar/RadarItemDetails.tsx
//
// Corpo do card de detalhes do /radar para SERVIÇOS, PRODUTOS e PESSOAS — no mesmo nível do card da loja (descrição, quem oferece,
// localização, agendar, WhatsApp, números, "mais vistos" e comentários). Só apresentação + leituras públicas: nada de dado privado
// (telefone só pelas RPCs com login; endereço de pessoa só o bairro `public_address`). O card da LOJA continua no RadarScreen.
'use client'

import { useEffect, useState } from 'react'
import { Calendar, Camera, Clock, Eye, Heart, MapPin, MessageCircle, Package, Star, Store as StoreIcon, UserCheck, UserPlus, Users, Wrench } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { notifyNewFollower } from '@/lib/notifyRideStatus'
import { parseCoords } from '@/lib/geoParse'

type RadarMode = 'servicos' | 'produtos' | 'pessoas'

const DESC_LIMIT = 110

const brl = (v: number | null | undefined) => (v != null && v > 0 ? `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : null)
const publicUrl = (bucket: string, path: string | null | undefined) =>
    path ? (path.startsWith('http') ? path : supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl) : null
const durationText = (min: number | null | undefined) => {
    if (!min || min <= 0) return null
    if (min < 60) return `${min} min`
    const h = Math.floor(min / 60), m = min % 60
    return m ? `${h} h ${m} min` : `${h} h`
}
const compact = (n: number | null | undefined) => {
    const v = n ?? 0
    return v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1).replace('.0', '')} mil` : String(v)
}
const instagramLink = (raw: string | null | undefined) => {
    const handle = (raw || '').trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/$/, '')
    return handle ? `https://instagram.com/${handle}` : null
}

function Label({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
    return <p className="text-[9px] font-black uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-1">{icon}{children}</p>
}

function Chip({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
    return <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] bg-gray-100 text-gray-500">{icon}{children}</span>
}

function InfoRow({ icon, color, title, sub, onClick, href }: { icon: React.ReactNode; color?: string; title: string; sub?: string | null; onClick?: () => void; href?: string }) {
    const inner = (
        <>
            <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-white" style={{ background: color || 'linear-gradient(135deg, #f97316, #ef4444)' }}>{icon}</div>
            <div className="min-w-0">
                <p className="text-xs font-bold text-gray-900">{title}</p>
                {sub && <p className="text-[10px] mt-0.5 truncate text-gray-500">{sub}</p>}
            </div>
        </>
    )
    const cls = 'w-full flex items-center gap-3 p-2.5 rounded-xl text-left bg-gray-50 hover:bg-gray-100 transition-colors'
    if (href) return <a href={href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className={cls}>{inner}</a>
    return <button type="button" onClick={onClick} className={cls}>{inner}</button>
}

interface StripItem { id: string; title: string; image: string | null; sub?: string | null; href: string }
function Strip({ items, fallback, onGo }: { items: StripItem[]; fallback: React.ReactNode; onGo: (href: string) => void }) {
    return (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {items.map((it) => (
                <button key={it.id} type="button" onClick={() => onGo(it.href)} className="flex-shrink-0 w-24 text-left rounded-xl overflow-hidden border border-gray-200 hover:border-orange-300 transition-colors">
                    <div className="w-full h-16 bg-gray-100 flex items-center justify-center text-gray-300">
                        {it.image ? <img src={it.image} className="w-full h-full object-cover" alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} /> : fallback}
                    </div>
                    <div className="p-1.5">
                        <p className="text-[9px] font-bold text-gray-800 line-clamp-1">{it.title}</p>
                        {it.sub && <p className="text-[9px] font-black text-orange-600 line-clamp-1">{it.sub}</p>}
                    </div>
                </button>
            ))}
        </div>
    )
}

export default function RadarItemDetails({ mode, item, stores, userId, go }: {
    mode: RadarMode
    item: any
    stores: any[]
    userId: string | null | undefined
    /** Navega para um endereço do iUser (ex.: "/loja/produto") */
    go: (path: string) => void
}) {
    const [expanded, setExpanded] = useState(false)
    const [data, setData] = useState<any | null>(null)
    const [loading, setLoading] = useState(false)

    useEffect(() => { setExpanded(false) }, [item?.id])

    useEffect(() => {
        let cancelled = false
        setData(null)
        if (!item) return
        setLoading(true)
        ;(mode === 'pessoas' ? loadPerson(item, userId) : loadOffer(item, stores))
            .then((d) => { if (!cancelled) setData(d) })
            .catch((e) => { console.error('[RadarItemDetails]', e); if (!cancelled) setData(null) })
            .finally(() => { if (!cancelled) setLoading(false) })
        return () => { cancelled = true }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [item?.id, mode, userId, stores.length])

    if (!item) return null
    return mode === 'pessoas'
        ? <PersonBody item={item} data={data} loading={loading} userId={userId} expanded={expanded} setExpanded={setExpanded} go={go} setData={setData} />
        : <OfferBody mode={mode} item={item} data={data} loading={loading} expanded={expanded} setExpanded={setExpanded} go={go} />
}

// ---------- serviço / produto ----------
async function loadOffer(item: any, stores: any[]) {
    const store = item.store_id ? stores.find((s) => s.id === item.store_id) || null : null
    let owner: any = null
    if (!store && item.owner_id) {
        const { data } = await supabase.from('profiles').select('id, name, "profileSlug", avatar_url, ratings_avg, ratings_count, public_address, allow_scheduling').eq('id', item.owner_id).maybeSingle()
        owner = data
    }
    // Mais do mesmo dono (da loja, ou do perfil) — mesmo tipo
    let related = supabase.from('products').select('id, name, slug, price, image_url, view_count').eq('is_active', true).eq('type', item.type).neq('id', item.id)
    related = store ? related.eq('store_id', store.id).eq('listing_type', 'sale') : related.eq('owner_id', item.owner_id).is('store_id', null)
    const [{ data: relatedRaw }, { data: reviewsRaw }, wa] = await Promise.all([
        related.order('view_count', { ascending: false, nullsFirst: false }).limit(6),
        supabase.from('product_reviews').select('id, rating, comment, is_anonymous, created_at, profiles(name)').eq('product_id', item.id).not('comment', 'is', null).order('created_at', { ascending: false }).limit(3),
        (async () => {
            if (item.show_whatsapp === false) return null
            if (store) return store.show_whatsapp === false ? null : ((await supabase.rpc('get_store_whatsapp', { p_store: store.id })).data as string | null)
            if (item.owner_id) return (await supabase.rpc('get_profile_whatsapp', { p_profile: item.owner_id })).data as string | null
            return null
        })(),
    ])
    return {
        store,
        owner,
        whatsapp: wa || null,
        related: (relatedRaw || []).map((p: any) => ({ ...p, image_url: publicUrl('product-images', p.image_url) })),
        reviews: (reviewsRaw || []).map((r: any) => ({ ...r, profiles: Array.isArray(r.profiles) ? r.profiles[0] : r.profiles })),
    }
}

function OfferBody({ mode, item, data, loading, expanded, setExpanded, go }: { mode: 'servicos' | 'produtos'; item: any; data: any | null; loading: boolean; expanded: boolean; setExpanded: (v: boolean) => void; go: (p: string) => void }) {
    const store = data?.store || null
    const owner = data?.owner || null
    const isService = mode === 'servicos'
    const ownerSlug: string | null = store?.storeSlug || owner?.profileSlug || null
    const providerName: string = store?.name || (owner?.profileSlug ? `@${owner.profileSlug}` : owner?.name) || ''
    const providerImg: string | null = store?.logo_url || publicUrl('avatars', owner?.avatar_url)
    const open: boolean | null = store ? !!store.is_open : null
    const rating: number = item.ratings_avg > 0 ? item.ratings_avg : 0
    const price = brl(item.price)
    const dur = isService ? durationText(item.duration_minutes) : null
    const stock = !isService && item.stock_quantity != null ? item.stock_quantity : null
    const desc: string = item.description || ''
    const address: string | null = item.address || store?.address || owner?.public_address || null
    const coords = parseCoords(item.location) || parseCoords(store?.location)
    const canSchedule = isService && ownerSlug && (store ? store.allow_scheduling : owner?.allow_scheduling)
    const showMore = (data?.related?.length || 0) > 0

    return (
        <div className="px-4 pb-4 space-y-3">
            {(price || dur || stock != null) && (
                <div className="flex items-center gap-2 flex-wrap p-2.5 bg-gradient-to-r from-orange-50 to-red-50 rounded-xl">
                    {price ? <p className="text-xl font-black text-orange-600 mr-auto">{price}</p> : <span className="mr-auto" />}
                    {dur && <span className="flex items-center gap-1 text-[10px] font-black text-gray-600 bg-white/80 rounded-full px-2.5 py-1"><Clock className="w-3 h-3 text-orange-500" />{dur}</span>}
                    {stock != null && <span className={`text-[10px] font-black rounded-full px-2.5 py-1 bg-white/80 ${stock > 0 ? 'text-green-600' : 'text-red-500'}`}>{stock > 0 ? `${stock} em estoque` : 'Esgotado'}</span>}
                </div>
            )}

            {/* Quem oferece — a loja (com aberto/fechado) ou a pessoa */}
            {(store || owner) && ownerSlug && (
                <button type="button" onClick={() => go(`/${ownerSlug}`)} className="w-full flex items-center gap-3 p-2.5 rounded-xl text-left bg-gray-50 hover:bg-gray-100 transition-colors">
                    <span className="w-10 h-10 rounded-xl overflow-hidden bg-white border border-gray-200 flex items-center justify-center flex-shrink-0">
                        {providerImg ? <img src={providerImg} className="w-full h-full object-cover" alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} /> : <StoreIcon className="w-4 h-4 text-orange-400" />}
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="block text-[9px] font-black uppercase tracking-wider text-gray-400">{store ? 'Loja' : 'Oferecido por'}</span>
                        <span className="block text-xs font-bold text-gray-900 truncate">{providerName}</span>
                    </span>
                    {open != null && (
                        <span className={`text-[9px] font-black uppercase rounded-full px-2 py-0.5 ${open ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>{open ? 'Aberta' : 'Fechada'}</span>
                    )}
                </button>
            )}

            {desc && (
                <p className="text-xs text-gray-600 leading-relaxed">
                    {expanded || desc.length <= DESC_LIMIT ? desc : `${desc.slice(0, DESC_LIMIT)}...`}
                    {desc.length > DESC_LIMIT && (
                        <button onClick={() => setExpanded(!expanded)} className="ml-1 font-bold text-[10px] uppercase text-orange-500 hover:underline">{expanded ? 'ver menos' : 'ver mais'}</button>
                    )}
                </p>
            )}

            <div className="space-y-2">
                {address && (
                    <InfoRow
                        icon={<MapPin size={16} />}
                        title="Localização"
                        sub={address}
                        href={coords ? `https://www.google.com/maps/dir/?api=1&destination=${coords[1]},${coords[0]}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
                    />
                )}
                {canSchedule && (
                    <InfoRow icon={<Calendar size={16} />} title="Agendar atendimento" sub="Ver horários disponíveis" onClick={() => go(`/${ownerSlug}?agendar=${item.id}`)} />
                )}
                {data?.whatsapp && (
                    <InfoRow icon={<MessageCircle size={16} />} color="#25D366" title="WhatsApp" sub={data.whatsapp} href={`https://wa.me/${String(data.whatsapp).replace(/\D/g, '')}`} />
                )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <Chip icon={<Eye size={12} />}><span className="font-bold text-gray-900">{compact(item.view_count)}</span> visualizações</Chip>
                {rating > 0 && (
                    <Chip icon={<Star size={12} className="fill-yellow-500 text-yellow-500" />}><span className="font-bold text-gray-900">{rating.toFixed(1)}</span> ({item.ratings_count ?? 0})</Chip>
                )}
            </div>

            {loading && !data && <p className="text-[10px] text-gray-400">Carregando detalhes…</p>}

            {showMore && (
                <div>
                    <Label icon={<Eye className="w-3 h-3" />}>{isService ? `Mais serviços de ${providerName || 'quem oferece'}` : 'Mais produtos da loja'}</Label>
                    <Strip
                        items={data.related.map((p: any) => ({ id: p.id, title: p.name, image: p.image_url, sub: brl(p.price), href: `/${ownerSlug}/${p.slug || p.id}` }))}
                        fallback={isService ? <Wrench className="w-5 h-5" /> : <Package className="w-5 h-5" />}
                        onGo={go}
                    />
                </div>
            )}

            {(data?.reviews?.length || 0) > 0 && (
                <div>
                    <Label>Comentários</Label>
                    <div className="space-y-2">
                        {data.reviews.map((r: any) => (
                            <div key={r.id} className="bg-gray-50 rounded-xl p-2.5">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-[10px] font-bold text-gray-700 truncate">{r.is_anonymous ? 'Anônimo' : r.profiles?.name || 'Usuário'}</span>
                                    <span className="flex items-center gap-0.5 flex-shrink-0"><Star size={9} className="fill-yellow-500 text-yellow-500" /><span className="text-[9px] font-black text-yellow-600">{r.rating}</span></span>
                                </div>
                                <p className="text-[10px] text-gray-600 mt-0.5 line-clamp-2">"{r.comment}"</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

// ---------- pessoa ----------
async function loadPerson(item: any, userId: string | null | undefined) {
    const id = item.id as string
    const [{ data: profile }, { count: followers }, { count: following }, follow, { data: svcRaw }, { data: pubRaw }, { data: storesRaw }, wa] = await Promise.all([
        supabase.from('profiles').select('id, name, "profileSlug", bio, description, instagram, ratings_avg, ratings_count, view_count, public_address, category').eq('id', id).maybeSingle(),
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', id),
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', id),
        userId && userId !== id ? supabase.from('follows').select('*').eq('follower_id', userId).eq('following_id', id).maybeSingle() : Promise.resolve({ data: null }),
        supabase.from('products').select('id, name, slug, price, image_url').eq('owner_id', id).is('store_id', null).eq('listing_type', 'service_offer').eq('is_active', true).order('view_count', { ascending: false, nullsFirst: false }).limit(6),
        supabase.from('products').select('id, name, slug, image_url, likes:likes(count)').eq('owner_id', id).is('store_id', null).eq('listing_type', 'publication').order('created_at', { ascending: false }).limit(8),
        supabase.from('stores').select('id, name, "storeSlug", logo_url').eq('owner_id', id).eq('is_active', true).limit(6),
        userId ? supabase.rpc('get_profile_whatsapp', { p_profile: id }) : Promise.resolve({ data: null }),
    ])
    return {
        profile,
        followers: followers || 0,
        following: following || 0,
        isFollowing: !!(follow as any)?.data,
        services: (svcRaw || []).map((p: any) => ({ ...p, image_url: publicUrl('product-images', p.image_url) })),
        publications: (pubRaw || []).map((p: any) => ({ ...p, image_url: publicUrl('product-images', p.image_url), likes: p.likes?.[0]?.count || 0 })),
        stores: (storesRaw || []).map((s: any) => ({ ...s, logo_url: publicUrl('store-logos', s.logo_url) })),
        whatsapp: ((wa as any)?.data as string | null) || null,
    }
}

function PersonBody({ item, data, loading, userId, expanded, setExpanded, go, setData }: { item: any; data: any | null; loading: boolean; userId: string | null | undefined; expanded: boolean; setExpanded: (v: boolean) => void; go: (p: string) => void; setData: (d: any) => void }) {
    const profile = data?.profile
    const slug: string | null = profile?.profileSlug || item.profileSlug || null
    const bio: string = (profile?.bio || profile?.description || '').trim()
    const ig = instagramLink(profile?.instagram)
    const rating = profile?.ratings_avg > 0 ? profile.ratings_avg : 0

    const toggleFollow = async () => {
        if (!userId || !data) return
        const was = data.isFollowing
        setData({ ...data, isFollowing: !was, followers: data.followers + (was ? -1 : 1) })
        if (was) await supabase.from('follows').delete().eq('follower_id', userId).eq('following_id', item.id)
        else { const { error } = await supabase.from('follows').insert({ follower_id: userId, following_id: item.id }); if (!error) notifyNewFollower(item.id) }
    }

    return (
        <div className="px-4 pb-4 space-y-3">
            {profile?.category && <span className="inline-block text-[10px] font-black uppercase tracking-wide text-purple-700 bg-purple-100 rounded-full px-2.5 py-1">{profile.category}</span>}

            {bio && (
                <p className="text-xs text-gray-600 leading-relaxed">
                    {expanded || bio.length <= DESC_LIMIT ? bio : `${bio.slice(0, DESC_LIMIT)}...`}
                    {bio.length > DESC_LIMIT && (
                        <button onClick={() => setExpanded(!expanded)} className="ml-1 font-bold text-[10px] uppercase text-orange-500 hover:underline">{expanded ? 'ver menos' : 'ver mais'}</button>
                    )}
                </p>
            )}

            <div className="flex flex-wrap items-center gap-2">
                <Chip icon={<Users size={12} />}><span className="font-bold text-gray-900">{loading && !data ? '···' : compact(data?.followers)}</span> seguidores</Chip>
                <Chip icon={<UserCheck size={12} />}><span className="font-bold text-gray-900">{loading && !data ? '···' : compact(data?.following)}</span> seguindo</Chip>
                <Chip icon={<Eye size={12} />}><span className="font-bold text-gray-900">{compact(profile?.view_count)}</span> visitas</Chip>
                {rating > 0 && <Chip icon={<Star size={12} className="fill-yellow-500 text-yellow-500" />}><span className="font-bold text-gray-900">{rating.toFixed(1)}</span> ({profile.ratings_count ?? 0})</Chip>}
                {userId && userId !== item.id && data && (
                    <button
                        onClick={toggleFollow}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold transition-all ${data.isFollowing ? 'border-2 border-orange-500 text-orange-500 bg-transparent' : 'text-white bg-gradient-to-r from-orange-500 to-red-500'}`}
                    >
                        {data.isFollowing ? <UserCheck size={12} /> : <UserPlus size={12} />}
                        {data.isFollowing ? 'Seguindo' : 'Seguir'}
                    </button>
                )}
            </div>

            <div className="space-y-2">
                {profile?.public_address && (
                    <InfoRow icon={<MapPin size={16} />} title="Região" sub={profile.public_address} href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(profile.public_address)}`} />
                )}
                {data?.whatsapp && <InfoRow icon={<MessageCircle size={16} />} color="#25D366" title="WhatsApp" sub={data.whatsapp} href={`https://wa.me/${String(data.whatsapp).replace(/\D/g, '')}`} />}
                {ig && <InfoRow icon={<Camera size={16} />} color="linear-gradient(135deg, #f09433, #dc2743, #bc1888)" title="Instagram" sub={profile?.instagram} href={ig} />}
            </div>

            {(data?.stores?.length || 0) > 0 && (
                <div>
                    <Label icon={<StoreIcon className="w-3 h-3" />}>Lojas</Label>
                    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                        {data.stores.map((s: any) => (
                            <button key={s.id} type="button" onClick={() => go(`/${s.storeSlug}`)} className="flex-shrink-0 flex items-center gap-2 rounded-full border border-gray-200 hover:border-orange-300 pl-1 pr-3 py-1 transition-colors">
                                <span className="w-7 h-7 rounded-full overflow-hidden bg-gray-100 flex items-center justify-center">
                                    {s.logo_url ? <img src={s.logo_url} className="w-full h-full object-cover" alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} /> : <StoreIcon className="w-3.5 h-3.5 text-orange-400" />}
                                </span>
                                <span className="text-[10px] font-bold text-gray-800 whitespace-nowrap">{s.name}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {(data?.services?.length || 0) > 0 && slug && (
                <div>
                    <Label icon={<Wrench className="w-3 h-3" />}>Serviços</Label>
                    <Strip items={data.services.map((p: any) => ({ id: p.id, title: p.name, image: p.image_url, sub: brl(p.price), href: `/${slug}/${p.slug || p.id}` }))} fallback={<Wrench className="w-5 h-5" />} onGo={go} />
                </div>
            )}

            {(data?.publications?.length || 0) > 0 && slug && (
                <div>
                    <Label icon={<Eye className="w-3 h-3" />}>Publicações</Label>
                    <Strip
                        items={data.publications.map((p: any) => ({ id: p.id, title: p.name, image: p.image_url, sub: p.likes > 0 ? `❤ ${p.likes}` : null, href: `/${slug}/${p.slug || p.id}` }))}
                        fallback={<Heart className="w-5 h-5" />}
                        onGo={go}
                    />
                </div>
            )}

            {loading && !data && <p className="text-[10px] text-gray-400">Carregando perfil…</p>}
        </div>
    )
}
