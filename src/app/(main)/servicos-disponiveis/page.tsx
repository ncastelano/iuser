// app/(main)/servicos-disponiveis/page.tsx
//
// Todos os serviços do iUser: os das lojas (serviços do catálogo) e os divulgados por pessoas (perfis), no mesmo cartão em
// linha de /produtos. "Serviços que você pode gostar" da home leva pra cá. (/servicos é a categoria de lojas, por isso o nome.)
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Wrench } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useProfile } from '@/app/contexts/ProfileContext'
import { useTheme } from '@/app/contexts/theme'
import Header from '@/components/Header'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import ListingRowCard from '@/components/ListingRowCard'
import { Spinner } from '@/components/Spinner'
import { useInsideShell } from '@/components/InsideShell'
import { getAvatarUrl } from '@/lib/avatar'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'
const PAGE_SIZE = 24

interface ServiceCard {
    id: string
    name: string
    description: string | null
    imageUrl: string | null
    price: number | null
    minutes: number | null
    views: number
    rating: number
    seller: string
    sellerImage: string | null
    sellerId: string | null
    kind: 'Loja' | 'Pessoa'
    href: string
}

const publicImage = (bucket: string, path: string | null | undefined) => {
    if (!path) return null
    return path.startsWith('http') ? path : supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
}

async function loadServiceCards(): Promise<ServiceCard[]> {
    const { data: rows } = await supabase
        .from('products')
        .select('id, name, slug, description, image_url, price, duration_minutes, view_count, owner_id, store_id, owner_image_url')
        .eq('is_active', true)
        .or('listing_type.eq.service_offer,and(type.eq.service,listing_type.eq.sale)')
        .order('view_count', { ascending: false })
        .limit(500)
    const list = (rows || []) as any[]
    if (list.length === 0) return []

    const storeIds = [...new Set(list.filter((r) => r.store_id).map((r) => r.store_id))]
    const ownerIds = [...new Set(list.filter((r) => !r.store_id && r.owner_id).map((r) => r.owner_id))]
    const [{ data: stores }, { data: profiles }, { data: reviews }] = await Promise.all([
        storeIds.length ? supabase.from('stores').select('id, name, "storeSlug", logo_url, owner_id').in('id', storeIds) : Promise.resolve({ data: [] as any[] }),
        ownerIds.length ? supabase.from('profiles').select('id, name, "profileSlug", avatar_url').in('id', ownerIds) : Promise.resolve({ data: [] as any[] }),
        supabase.from('product_reviews').select('product_id, rating').in('product_id', list.map((r) => r.id)),
    ])
    const storeById = new Map((stores || []).map((s: any) => [s.id, s]))
    const profileById = new Map((profiles || []).map((p: any) => [p.id, p]))
    const sums = new Map<string, { sum: number; n: number }>()
    ;(reviews || []).forEach((r: any) => {
        const cur = sums.get(r.product_id) || { sum: 0, n: 0 }
        cur.sum += r.rating; cur.n += 1
        sums.set(r.product_id, cur)
    })

    const cards: ServiceCard[] = []
    for (const r of list) {
        const store: any = r.store_id ? storeById.get(r.store_id) : null
        const profile: any = !r.store_id ? profileById.get(r.owner_id) : null
        const slug = store ? store.storeSlug : profile?.profileSlug
        if (!slug || !r.slug) continue
        const rt = sums.get(r.id)
        cards.push({
            id: r.id,
            name: r.name,
            description: r.description,
            imageUrl: publicImage('product-images', r.image_url),
            price: r.price != null ? Number(r.price) : null,
            minutes: r.duration_minutes ?? null,
            views: r.view_count ?? 0,
            rating: rt ? Number((rt.sum / rt.n).toFixed(1)) : 0,
            seller: store ? store.name : `@${slug}`,
            sellerImage: r.owner_image_url || (store ? publicImage('store-logos', store.logo_url) : getAvatarUrl(supabase, profile?.avatar_url) || null),
            sellerId: store ? store.owner_id : r.owner_id,
            kind: store ? 'Loja' : 'Pessoa',
            href: `/${slug}/${r.slug}`,
        })
    }
    return cards
}

const formatPrice = (price: number | null) => (price == null ? null : price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))

export default function ServicosDisponiveisPage() {
    const router = useRouter()
    const v3 = useInsideShell()
    const { colors } = useTheme()
    const { avatarUrl, bgMode, customBgUrl, profileSlug, loading: profileLoading } = useProfile()

    const [services, setServices] = useState<ServiceCard[] | null>(null)
    const [search, setSearch] = useState('')
    const [shown, setShown] = useState(PAGE_SIZE)

    useEffect(() => { loadServiceCards().then(setServices).catch(() => setServices([])) }, [])

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase()
        const list = services || []
        if (!q) return list
        return list.filter((s) => s.name?.toLowerCase().includes(q) || s.seller.toLowerCase().includes(q) || s.description?.toLowerCase().includes(q))
    }, [services, search])

    useEffect(() => { setShown(PAGE_SIZE) }, [search])

    return (
        <div className="relative min-h-dvh" style={{ background: colors.background }}>
            <div className="fixed inset-0 z-0">
                <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
            </div>

            <main className="relative z-10 min-h-dvh" style={{ overscrollBehavior: 'none' }}>
                <Header
                    title="Serviços"
                    showBack
                    onBack={() => router.push('/')}
                    greeting={`Olá, ${profileLoading ? '...' : profileSlug ? `@${profileSlug}` : 'Visitante'}`}
                    avatarUrl={avatarUrl}
                    loading={profileLoading}
                    showSearch
                    searchPlaceholder="Procurar serviços"
                    searchValue={search}
                    onSearch={setSearch}
                />

                <section className="px-4 md:px-6 mt-3 pb-24">
                    {services === null ? (
                        <div className="flex justify-center py-16"><Spinner size={28} color={colors.accent} /></div>
                    ) : filtered.length === 0 ? (
                        <div className="rounded-3xl p-8 flex flex-col items-center gap-2 text-center" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                            <span className="w-14 h-14 rounded-full flex items-center justify-center text-white" style={{ background: GRADIENT }}><Wrench size={26} /></span>
                            <p className="text-sm font-black" style={{ color: colors.textPrimary }}>{search ? 'Nenhum serviço encontrado' : 'Nenhum serviço por enquanto'}</p>
                        </div>
                    ) : (
                        <>
                            <p className="text-xs mb-3" style={{ color: colors.textSecondary }}>
                                {filtered.length} {filtered.length === 1 ? 'serviço' : 'serviços'}{search ? ` para “${search}”` : ''}
                            </p>
                            <div className={v3 ? 'flex flex-col' : 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3'}>
                                {filtered.slice(0, shown).map((s) => (
                                    <ListingRowCard
                                        key={s.id}
                                        title={s.name}
                                        description={s.description}
                                        imageUrl={s.imageUrl || s.sellerImage}
                                        fallbackIcon={<Wrench size={30} />}
                                        priceLabel={formatPrice(s.price)}
                                        priceNote={s.minutes ? `${s.minutes} min` : null}
                                        sellerName={s.seller}
                                        sellerImageUrl={s.sellerImage}
                                        sellerId={s.sellerId}
                                        tag={s.kind}
                                        rating={s.rating}
                                        views={s.views}
                                        onClick={() => router.push(s.href)}
                                    />
                                ))}
                            </div>
                            {shown < filtered.length && (
                                <div className="flex justify-center mt-5">
                                    <button
                                        onClick={() => setShown((n) => n + PAGE_SIZE)}
                                        className="px-6 py-3 rounded-full font-black text-sm text-white transition-transform hover:scale-105 active:scale-95"
                                        style={v3 ? { background: '#f97316' } : { background: GRADIENT, boxShadow: '0 4px 12px #f9731640' }}
                                    >
                                        Mostrar mais
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </section>
            </main>
        </div>
    )
}
