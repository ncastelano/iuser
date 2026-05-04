import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export type StoreStats = {
    ratings_count: number
    ratings_avg: number
    prep_time_min: number | null
    prep_time_max: number | null
    price_min: number | null
    price_max: number | null
}

export type StoreType = {
    id: string
    name: string
    storeSlug: string
    logo_url: string | null
    description: string | null
    owner_id: string
    location: any
    is_open: boolean
    store_stats: StoreStats
    profileSlug?: string
}

export type ProductType = {
    id: string
    name: string
    store_id: string
    image_url: string | null
    category: string | null
    type: string | null
    price: number | null
    slug: string | null
}

export function useVitrineData() {
    const [allStores, setAllStores] = useState<StoreType[]>([])
    const [allProducts, setAllProducts] = useState<ProductType[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const supabase = createClient()
        let storesSubscription: any = null

        const fetchData = async () => {
            setLoading(true)
            setError(null)

            try {
                const [{ data: storesList, error: sErr }, { data: profilesList, error: prErr }, { data: productsList, error: pErr }] = await Promise.all([
                    supabase.from('stores').select('*'),
                    supabase.from('profiles').select('id, "profileSlug"'),
                    supabase.from('products').select('*')
                ])

                if (sErr || prErr || pErr) {
                    const errorMsg = sErr?.message || prErr?.message || pErr?.message || 'Erro desconhecido'
                    console.error('[Vitrine] Detalhes do erro:', { sErr, prErr, pErr })
                    setError(`Erro ao carregar dados: ${errorMsg}`)
                    setLoading(false)
                    return
                }

                const mappedProducts = (productsList || []).map(product => {
                    try {
                        return {
                            ...product,
                            image_url: product.image_url
                                ? supabase.storage.from('product-images').getPublicUrl(product.image_url).data.publicUrl
                                : null,
                            price: typeof product.price === 'string'
                                ? parseFloat(product.price)
                                : typeof product.price === 'number'
                                    ? product.price
                                    : 0
                        }
                    } catch (e) {
                        console.error('[Vitrine] Erro ao mapear produto:', product.id, e)
                        return product
                    }
                })

                const mapStores = (sList: any[]) => sList.map(store => {
                    try {
                        const prof = (profilesList || []).find(p => p.id === store.owner_id)
                        const storeProducts = mappedProducts.filter(p => p.store_id === store.id)
                        const prices = storeProducts
                            .map(p => p.price)
                            .filter((p): p is number => p !== null && !isNaN(p))
                        const minPrice = prices.length > 0 ? Math.min(...prices) : null
                        const maxPrice = prices.length > 0 ? Math.max(...prices) : null

                        return {
                            ...store,
                            profileSlug: prof?.profileSlug || 'loja',
                            logo_url: store.logo_url
                                ? supabase.storage.from('store-logos').getPublicUrl(store.logo_url).data.publicUrl
                                : null,
                            is_open: store.is_open ?? true,
                            store_stats: {
                                ratings_count: store.ratings_count ?? 0,
                                ratings_avg: store.ratings_avg ?? 0,
                                prep_time_min: store.prep_time_min ?? null,
                                prep_time_max: store.prep_time_max ?? null,
                                price_min: minPrice,
                                price_max: maxPrice
                            }
                        }
                    } catch (e) {
                        console.error('[Vitrine] Erro ao mapear loja:', store.id, e)
                        return store
                    }
                })

                setAllStores(mapStores(storesList || []) as any)
                setAllProducts(mappedProducts as any)

            } catch (globalErr: any) {
                console.error('[Vitrine] Erro global:', globalErr)
                setError(`Erro crítico: ${globalErr.message || 'Erro de conexão'}`)
            } finally {
                setLoading(false)
            }
        }

        fetchData()

        // Inscrição Realtime configurada fora da função assíncrona para evitar erros de callback após subscribe
        storesSubscription = supabase
            .channel('stores-realtime-changes')
            .on('postgres_changes', 
                { event: 'UPDATE', schema: 'public', table: 'stores' }, 
                (payload) => {
                    console.log('[Vitrine] Mudança detectada via Realtime:', payload)
                    setAllStores(current => current.map(s => {
                        if (s.id === payload.new.id) {
                            return {
                                ...s,
                                ...payload.new,
                                store_stats: {
                                    ...s.store_stats,
                                    ratings_count: payload.new.ratings_count ?? s.store_stats.ratings_count,
                                    ratings_avg: payload.new.ratings_avg ?? s.store_stats.ratings_avg,
                                }
                            }
                        }
                        return s
                    }))
                }
            )
            .subscribe()

        return () => {
            if (storesSubscription) {
                supabase.removeChannel(storesSubscription)
            }
        }
    }, [])

    return { allStores, allProducts, loading, error }
}