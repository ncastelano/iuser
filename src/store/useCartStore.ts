// src/store/useCartStore.ts
'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '@/lib/supabase/client'

export interface CartProduct {
    id: string
    name: string
    price: number
    image_url: string | null
    price_type?: string
    type?: string
    slug?: string
    description?: string
    category?: string
}

export interface CartItem {
    product: CartProduct
    quantity: number
}

export interface StoreDetails {
    name: string
    logo_url: string | null
}

interface CartState {
    itemsByStore: Record<string, CartItem[]>
    storeDetails: Record<string, StoreDetails>

    addItem: (storeSlug: string, store: StoreDetails, product: CartProduct) => void
    removeItem: (storeSlug: string, productId: string) => void
    updateQuantity: (storeSlug: string, productId: string, delta: number) => void
    clearStoreCart: (storeSlug: string) => void
    clearAll: () => void

    loadFromSupabase: (userId: string) => Promise<void>
    syncToSupabase: (userId: string) => Promise<void>
}

const useCartStore = create<CartState>()(
    persist(
        (set, get) => ({
            itemsByStore: {},
            storeDetails: {},

            addItem: (storeSlug, store, product) =>
                set((state) => {
                    const storeItems = state.itemsByStore[storeSlug] || []
                    const existing = storeItems.find((item) => item.product.id === product.id)
                    let newItems: CartItem[]
                    if (existing) {
                        newItems = storeItems.map((item) =>
                            item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
                        )
                    } else {
                        newItems = [...storeItems, { product, quantity: 1 }]
                    }
                    return {
                        itemsByStore: { ...state.itemsByStore, [storeSlug]: newItems },
                        storeDetails: { ...state.storeDetails, [storeSlug]: store },
                    }
                }),

            removeItem: (storeSlug, productId) =>
                set((state) => {
                    const storeItems = (state.itemsByStore[storeSlug] || []).filter(
                        (item) => item.product.id !== productId
                    )
                    const newItemsByStore = { ...state.itemsByStore }
                    const newStoreDetails = { ...state.storeDetails }
                    if (storeItems.length > 0) {
                        newItemsByStore[storeSlug] = storeItems
                    } else {
                        delete newItemsByStore[storeSlug]
                        delete newStoreDetails[storeSlug]
                    }
                    return { itemsByStore: newItemsByStore, storeDetails: newStoreDetails }
                }),

            updateQuantity: (storeSlug, productId, delta) =>
                set((state) => {
                    const storeItems = (state.itemsByStore[storeSlug] || [])
                        .map((item) =>
                            item.product.id === productId
                                ? { ...item, quantity: Math.max(0, item.quantity + delta) }
                                : item
                        )
                        .filter((item) => item.quantity > 0)
                    const newItemsByStore = { ...state.itemsByStore }
                    const newStoreDetails = { ...state.storeDetails }
                    if (storeItems.length > 0) {
                        newItemsByStore[storeSlug] = storeItems
                    } else {
                        delete newItemsByStore[storeSlug]
                        delete newStoreDetails[storeSlug]
                    }
                    return { itemsByStore: newItemsByStore, storeDetails: newStoreDetails }
                }),

            clearStoreCart: (storeSlug) =>
                set((state) => {
                    const newItemsByStore = { ...state.itemsByStore }
                    const newStoreDetails = { ...state.storeDetails }
                    delete newItemsByStore[storeSlug]
                    delete newStoreDetails[storeSlug]
                    return { itemsByStore: newItemsByStore, storeDetails: newStoreDetails }
                }),

            clearAll: () => set({ itemsByStore: {}, storeDetails: {} }),

            loadFromSupabase: async (userId: string) => {
                if (!userId) return
                const { data, error } = await supabase
                    .from('carts')
                    .select('*')
                    .eq('user_id', userId)
                if (error) {
                    console.error('Erro ao carregar carrinho do Supabase:', error)
                    return
                }
                if (!data || data.length === 0) return

                const itemsByStore: Record<string, CartItem[]> = {}
                const storeDetails: Record<string, StoreDetails> = {}

                data.forEach((row: any) => {
                    const slug = row.store_slug
                    if (!itemsByStore[slug]) itemsByStore[slug] = []

                    // Uma linha por produto por loja é o esperado, mas se o banco
                    // tiver duas (ex.: sync concorrente), soma em vez de duplicar
                    // a entrada — senão a mesma product.id vira chave repetida.
                    const existing = itemsByStore[slug].find(
                        (item) => item.product.id === row.product_id
                    )
                    if (existing) {
                        existing.quantity += row.quantity
                    } else {
                        itemsByStore[slug].push({
                            product: row.product_data as CartProduct,
                            quantity: row.quantity,
                        })
                    }

                    if (!storeDetails[slug]) {
                        storeDetails[slug] = row.store_data as StoreDetails
                    }
                })

                set({ itemsByStore, storeDetails })
            },

            syncToSupabase: async (userId: string) => {
                if (!userId) return
                const { itemsByStore, storeDetails } = get()

                // 1. Deletar registros existentes
                const { error: deleteError } = await supabase
                    .from('carts')
                    .delete()
                    .eq('user_id', userId)

                if (deleteError) {
                    console.error('Erro ao deletar carrinho existente:', JSON.stringify(deleteError, null, 2))
                    // Se o delete falhar (ex.: RLS), podemos tentar usar upsert em vez de delete+insert
                    // Mas por enquanto apenas logamos; você pode implementar upsert depois
                }

                const rows: any[] = []
                for (const slug of Object.keys(itemsByStore)) {
                    const items = itemsByStore[slug]
                    const store = storeDetails[slug]
                    for (const item of items) {
                        rows.push({
                            user_id: userId,
                            store_slug: slug,
                            product_id: item.product.id,
                            product_data: item.product,
                            quantity: item.quantity,
                            store_data: store || { name: '', logo_url: null },
                        })
                    }
                }

                if (rows.length > 0) {
                    const { error: insertError } = await supabase.from('carts').insert(rows)
                    if (insertError) {
                        // Log detalhado do erro
                        console.error('Erro ao sincronizar carrinho:', JSON.stringify(insertError, null, 2))
                    }
                }
            },
        }),
        {
            name: 'iuser-cart-storage',
            // Corrige, ao reidratar, um carrinho salvo com entradas duplicadas
            // pro mesmo produto (bug antigo do loadFromSupabase) — sem isso, o
            // React acusa chaves repetidas em toda lista que usa product.id.
            merge: (persistedState, currentState) => {
                const merged = {
                    ...currentState,
                    ...(persistedState as Partial<CartState>),
                }

                const dedupedItemsByStore: Record<string, CartItem[]> = {}
                for (const [slug, items] of Object.entries(merged.itemsByStore || {})) {
                    const bySlug: CartItem[] = []
                    for (const item of items) {
                        const existing = bySlug.find((i) => i.product.id === item.product.id)
                        if (existing) {
                            existing.quantity += item.quantity
                        } else {
                            bySlug.push({ ...item })
                        }
                    }
                    dedupedItemsByStore[slug] = bySlug
                }

                return { ...merged, itemsByStore: dedupedItemsByStore }
            },
        }
    )
)

export { useCartStore }