import { useState, useEffect, useCallback } from 'react'
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
    top_products?: ProductType[]
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

    const mapStoreData = useCallback((
        store: any,
        profilesList: any[],
        productsList: any[],
        ratingsMap: Map<string, { sum: number; count: number }>,
        salesMap: Map<string, number>,
        supabase: any
    ) => {
        const prof = (profilesList || []).find(p => p.id === store.owner_id)
        const storeProducts = (productsList || []).filter((p: any) => p.store_id === store.id)
        const prices = storeProducts
            .map((p: any) => p.price)
            .filter((p: any): p is number => p !== null && !isNaN(p))
        const minPrice = prices.length > 0 ? Math.min(...prices) : null
        const maxPrice = prices.length > 0 ? Math.max(...prices) : null

        // Primeiro tenta usar os valores da tabela stores
        // Se forem null/undefined, usa os valores calculados da tabela store_ratings
        const ratingsFromStore = ratingsMap.get(store.id)
        const calculatedAvg = ratingsFromStore
            ? ratingsFromStore.sum / ratingsFromStore.count
            : 0
        const calculatedCount = ratingsFromStore ? ratingsFromStore.count : 0

        // Prioridade: Se temos avaliações calculadas (count > 0), usamos elas.
        // Caso contrário, tentamos o valor da tabela stores.
        const finalAvg = (calculatedCount > 0) ? calculatedAvg : (store.ratings_avg ?? 0)
        const finalCount = (calculatedCount > 0) ? calculatedCount : (store.ratings_count ?? 0)

        return {
            ...store,
            profileSlug: prof?.profileSlug || 'loja',
            logo_url: store.logo_url
                ? supabase.storage.from('store-logos').getPublicUrl(store.logo_url).data.publicUrl
                : null,
            is_open: store.is_open ?? true,
            store_stats: {
                ratings_count: finalCount,
                ratings_avg: finalAvg,
                prep_time_min: store.prep_time_min ?? null,
                prep_time_max: store.prep_time_max ?? null,
                price_min: minPrice,
                price_max: maxPrice
            },
            top_products: storeProducts
                .map(p => ({ ...p, sales_count: salesMap.get(p.id) || 0 }))
                .sort((a, b) => b.sales_count - a.sales_count)
                .slice(0, 3)
        }
    }, [])

    useEffect(() => {
        const supabase = createClient()
        let storesSubscription: any = null
        let ratingsSubscription: any = null

        const fetchData = async () => {
            setLoading(true)
            setError(null)

            try {
                // Buscar tudo em paralelo
                const [
                    { data: storesList, error: sErr },
                    { data: profilesList, error: prErr },
                    { data: productsList, error: pErr },
                    { data: ratingsList, error: rErr },
                    { data: salesList, error: slErr }
                ] = await Promise.all([
                    supabase.from('stores').select('*'),
                    supabase.from('profiles').select('id, "profileSlug"'),
                    supabase.from('products').select('*'),
                    supabase.from('store_ratings').select('store_id, rating'),
                    supabase.from('store_sales').select('product_id')
                ])

                if (sErr || prErr || pErr || rErr || slErr) {
                    const errorMsg = sErr?.message || prErr?.message || pErr?.message || rErr?.message || slErr?.message || 'Erro desconhecido'
                    console.error('[Vitrine] Detalhes do erro:', { sErr, prErr, pErr, rErr })
                    setError(`Erro ao carregar dados: ${errorMsg}`)
                    setLoading(false)
                    return
                }

                // Mapear produtos
                const mappedProducts = (productsList || []).map((product: any) => {
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

                // Calcular ratings por loja
                const ratingsMap = new Map<string, { sum: number; count: number }>()

                ratingsList?.forEach(rating => {
                    if (!ratingsMap.has(rating.store_id)) {
                        ratingsMap.set(rating.store_id, { sum: 0, count: 0 })
                    }
                    const current = ratingsMap.get(rating.store_id)!
                    current.sum += rating.rating
                    current.count += 1
                })

                // Calcular vendas por produto
                const salesMap = new Map<string, number>()
                salesList?.forEach((sale: any) => {
                    salesMap.set(sale.product_id, (salesMap.get(sale.product_id) || 0) + 1)
                })

                console.log('[Vitrine] 📊 Ratings calculados por loja:')
                ratingsMap.forEach((value, key) => {
                    console.log(`  Loja ${key}: ${value.count} avaliações, média ${(value.sum / value.count).toFixed(1)}`)
                })

                // Log dos valores do banco para debug
                storesList?.forEach(store => {
                    console.log(`[Vitrine] Banco - "${store.name}": ratings_avg=${store.ratings_avg}, ratings_count=${store.ratings_count}`)
                })

                // Mapear lojas com ratings calculados
                const mappedStores = (storesList || []).map((store: any) =>
                    mapStoreData(store, profilesList || [], mappedProducts, ratingsMap, salesMap, supabase)
                )

                // Log final do que está sendo exibido
                mappedStores.forEach(store => {
                    console.log(`[Vitrine] ✅ Final - "${store.name}":`, store.store_stats)
                })

                setAllStores(mappedStores as StoreType[])
                setAllProducts(mappedProducts as ProductType[])

            } catch (globalErr: any) {
                console.error('[Vitrine] Erro global:', globalErr)
                setError(`Erro crítico: ${globalErr.message || 'Erro de conexão'}`)
            } finally {
                setLoading(false)
            }
        }

        fetchData()

        // Realtime para mudanças nas stores
        storesSubscription = supabase
            .channel('stores-realtime-changes')
            .on('postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'stores' },
                (payload) => {
                    console.log('[Vitrine] 🔄 Realtime: loja atualizada:', payload.new.id, {
                        ratings_avg: payload.new.ratings_avg,
                        ratings_count: payload.new.ratings_count
                    })

                    setAllStores(current => current.map(s => {
                        if (s.id === payload.new.id) {
                            return {
                                ...s,
                                ...payload.new,
                                store_stats: {
                                    ...s.store_stats,
                                    ratings_count: payload.new.ratings_count ?? s.store_stats.ratings_count ?? 0,
                                    ratings_avg: payload.new.ratings_avg ?? s.store_stats.ratings_avg ?? 0,
                                }
                            }
                        }
                        return s
                    }))
                }
            )
            .subscribe()

        // Realtime para novos ratings
        ratingsSubscription = supabase
            .channel('ratings-realtime-changes')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'store_ratings' },
                () => {
                    console.log('[Vitrine] 🔄 Realtime: nova avaliação detectada, recarregando dados...')
                    // Recarregar tudo quando houver mudança nos ratings
                    fetchData()
                }
            )
            .subscribe()

        return () => {
            if (storesSubscription) supabase.removeChannel(storesSubscription)
            if (ratingsSubscription) supabase.removeChannel(ratingsSubscription)
        }
    }, [mapStoreData])

    return { allStores, allProducts, loading, error }
}