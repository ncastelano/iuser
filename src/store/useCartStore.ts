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

export interface CartAddon {
    id: string
    name: string
    price: number
}

export interface CartItem {
    product: CartProduct
    quantity: number
    comment?: string
    addons?: CartAddon[]
}

export interface StoreDetails {
    name: string
    logo_url: string | null
}

interface CartState {
    itemsByStore: Record<string, CartItem[]>
    storeDetails: Record<string, StoreDetails>

    addItem: (storeSlug: string, store: StoreDetails, product: CartProduct, comment?: string, addons?: CartAddon[]) => void
    removeItem: (storeSlug: string, productId: string, comment?: string, addons?: CartAddon[]) => void
    updateQuantity: (storeSlug: string, productId: string, delta: number, comment?: string, addons?: CartAddon[]) => void
    clearStoreCart: (storeSlug: string) => void
    clearAll: () => void

    loadFromSupabase: (userId: string) => Promise<void>
    syncToSupabase: (userId: string) => Promise<void>
}

// Preço efetivo de uma linha do carrinho: o do produto + a soma dos
// adicionais escolhidos - usado em todo lugar que precisa do valor
// unitário ou total de um item (carrinho, checkout, pedido).
export function cartItemUnitPrice(item: Pick<CartItem, 'product' | 'addons'>): number {
    const addonsTotal = (item.addons || []).reduce((sum, a) => sum + a.price, 0)
    return item.product.price + addonsTotal
}

export function cartItemLineTotal(item: Pick<CartItem, 'product' | 'quantity' | 'addons'>): number {
    return cartItemUnitPrice(item) * item.quantity
}

// Duas linhas do mesmo produto com observação e/ou adicionais diferentes
// são pedidos distintos (ex.: "sem cebola" e "bem passado", ou um com
// bacon extra e outro sem) — não podem ser somadas numa única quantidade,
// senão a personalização de uma delas se perde.
const commentKey = (comment?: string) => comment || ''
const addonsKey = (addons?: CartAddon[]) =>
    (addons || [])
        .map((a) => a.id)
        .sort()
        .join(',')
export const lineKey = (comment?: string, addons?: CartAddon[]) => `${commentKey(comment)}::${addonsKey(addons)}`

const useCartStore = create<CartState>()(
    persist(
        (set, get) => ({
            itemsByStore: {},
            storeDetails: {},

            addItem: (storeSlug, store, product, comment, addons) =>
                set((state) => {
                    const storeItems = state.itemsByStore[storeSlug] || []
                    const existingIndex = storeItems.findIndex(
                        (item) => item.product.id === product.id && lineKey(item.comment, item.addons) === lineKey(comment, addons)
                    )
                    let newItems: CartItem[]
                    if (existingIndex !== -1) {
                        newItems = storeItems.map((item, i) =>
                            i === existingIndex ? { ...item, quantity: item.quantity + 1 } : item
                        )
                    } else {
                        newItems = [...storeItems, { product, quantity: 1, comment: comment || undefined, addons: addons && addons.length > 0 ? addons : undefined }]
                    }
                    return {
                        itemsByStore: { ...state.itemsByStore, [storeSlug]: newItems },
                        storeDetails: { ...state.storeDetails, [storeSlug]: store },
                    }
                }),

            // comment/addons omitidos (undefined) = compatibilidade com quem não
            // sabe de personalização (ex.: botão "remover todos" da grade de
            // produtos): afeta todas as linhas daquele produto, seja qual for
            // a observação/adicionais.
            removeItem: (storeSlug, productId, comment, addons) =>
                set((state) => {
                    const storeItems = (state.itemsByStore[storeSlug] || []).filter((item) => {
                        if (item.product.id !== productId) return true
                        if (comment === undefined && addons === undefined) return false
                        return lineKey(item.comment, item.addons) !== lineKey(comment, addons)
                    })
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

            updateQuantity: (storeSlug, productId, delta, comment, addons) =>
                set((state) => {
                    const storeItems = state.itemsByStore[storeSlug] || []
                    const targetIndex = comment === undefined && addons === undefined
                        ? storeItems.findIndex((item) => item.product.id === productId)
                        : storeItems.findIndex((item) => item.product.id === productId && lineKey(item.comment, item.addons) === lineKey(comment, addons))

                    if (targetIndex === -1) return state

                    const updatedItems = storeItems
                        .map((item, i) => (i === targetIndex ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item))
                        .filter((item) => item.quantity > 0)

                    const newItemsByStore = { ...state.itemsByStore }
                    const newStoreDetails = { ...state.storeDetails }
                    if (updatedItems.length > 0) {
                        newItemsByStore[storeSlug] = updatedItems
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

                    const rowAddons = (row.addons as CartAddon[] | null) || undefined

                    // Uma linha por produto+observação+adicionais por loja é o
                    // esperado, mas se o banco tiver duas (ex.: sync concorrente),
                    // soma em vez de duplicar a entrada — senão a mesma chave vira
                    // React key repetida.
                    const existing = itemsByStore[slug].find(
                        (item) => item.product.id === row.product_id && lineKey(item.comment, item.addons) === lineKey(row.comment, rowAddons)
                    )
                    if (existing) {
                        existing.quantity += row.quantity
                    } else {
                        itemsByStore[slug].push({
                            product: row.product_data as CartProduct,
                            quantity: row.quantity,
                            comment: row.comment || undefined,
                            addons: rowAddons && rowAddons.length > 0 ? rowAddons : undefined,
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
                            comment: item.comment || null,
                            addons: item.addons && item.addons.length > 0 ? item.addons : null,
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
            // pro mesmo produto+observação+adicionais (bug antigo do
            // loadFromSupabase) — sem isso, o React acusa chaves repetidas em
            // toda lista que usa product.id. Linhas com observação/adicionais
            // diferentes continuam separadas de propósito.
            merge: (persistedState, currentState) => {
                const merged = {
                    ...currentState,
                    ...(persistedState as Partial<CartState>),
                }

                const dedupedItemsByStore: Record<string, CartItem[]> = {}
                for (const [slug, items] of Object.entries(merged.itemsByStore || {})) {
                    const bySlug: CartItem[] = []
                    for (const item of items) {
                        const existing = bySlug.find(
                            (i) => i.product.id === item.product.id && lineKey(i.comment, i.addons) === lineKey(item.comment, item.addons)
                        )
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
