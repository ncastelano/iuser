import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface CartProduct {
    id: string
    name: string
    price: number
    image_url: string | null
    [key: string]: any
}

export interface CartItem {
    product: CartProduct
    quantity: number
}

// Map from storeSlug to array of CartItems
export interface CartState {
    itemsByStore: Record<string, CartItem[]>
    storeDetails: Record<string, { name: string, logo_url: string | null }>
    addItem: (storeSlug: string, storeInfo: { name: string, logo_url: string | null }, product: CartProduct) => void
    removeItem: (storeSlug: string, productId: string) => void
    clearStoreCart: (storeSlug: string) => void
    updateQuantity: (storeSlug: string, productId: string, delta: number) => void
    syncToDatabase: () => Promise<void>
    loadFromDatabase: () => Promise<void>
}

// Inicializamos o client do supabase fora para as funcoes
import { createClient } from '@/lib/supabase/client'

export const useCartStore = create<CartState>()(
    persist(
        (set) => ({
            itemsByStore: {},
            storeDetails: {},
            addItem: (storeSlug, storeInfo, product) => set((state) => {
                const storeItems = state.itemsByStore[storeSlug] || []
                const existingItem = storeItems.find(item => item.product.id === product.id)

                let newStoreItems;
                if (existingItem) {
                    newStoreItems = storeItems.map(item =>
                        item.product.id === product.id
                            ? { ...item, quantity: item.quantity + 1 }
                            : item
                    )
                } else {
                    newStoreItems = [...storeItems, { product, quantity: 1 }]
                }

                return {
                    itemsByStore: {
                        ...state.itemsByStore,
                        [storeSlug]: newStoreItems
                    },
                    storeDetails: {
                        ...state.storeDetails,
                        [storeSlug]: { name: storeInfo.name, logo_url: storeInfo.logo_url }
                    }
                }
            }),
            removeItem: (storeSlug, productId) => set((state) => {
                const storeItems = state.itemsByStore[storeSlug] || []
                const newStoreItems = storeItems.filter(item => item.product.id !== productId)

                const newItemsByStore = { ...state.itemsByStore }
                if (newStoreItems.length === 0) {
                    delete newItemsByStore[storeSlug]
                } else {
                    newItemsByStore[storeSlug] = newStoreItems
                }

                return { itemsByStore: newItemsByStore }
            }),
            updateQuantity: (storeSlug, productId, delta) => set((state) => {
                const storeItems = state.itemsByStore[storeSlug] || []
                const newStoreItems = storeItems.map(item => {
                    if (item.product.id === productId) {
                        return { ...item, quantity: Math.max(0, item.quantity + delta) }
                    }
                    return item
                }).filter(item => item.quantity > 0)

                const newItemsByStore = { ...state.itemsByStore }
                if (newStoreItems.length === 0) {
                    delete newItemsByStore[storeSlug]
                } else {
                    newItemsByStore[storeSlug] = newStoreItems
                }

                return { itemsByStore: newItemsByStore }
            }),
            clearStoreCart: (storeSlug) => set((state) => {
                const newItemsByStore = { ...state.itemsByStore }
                delete newItemsByStore[storeSlug]
                return { itemsByStore: newItemsByStore }
            }),
            syncToDatabase: async () => {
                const supabase = createClient()
                const { data: { session } } = await supabase.auth.getSession()
                if (!session?.user?.id) return

                const state = set((state) => state) // get current state
                const { itemsByStore, storeDetails } = useCartStore.getState()

                try {
                    // Tenta atualizar no supabase uma coluna cart_data (assumindo que o usuario vai criar)
                    await supabase.from('profiles').update({
                        cart_data: { itemsByStore, storeDetails }
                    }).eq('id', session.user.id)
                } catch (e) {
                    console.error("Erro ao sincronizar carrinho com banco", e)
                }
            },
            loadFromDatabase: async () => {
                const supabase = createClient()
                const { data: { session } } = await supabase.auth.getSession()
                if (!session?.user?.id) return

                try {
                    const { data } = await supabase.from('profiles').select('cart_data').eq('id', session.user.id).single()
                    if (data?.cart_data) {
                        set({
                            itemsByStore: data.cart_data.itemsByStore || {},
                            storeDetails: data.cart_data.storeDetails || {}
                        })
                    }
                } catch (e) {
                    console.error("Erro ao carregar carrinho do banco", e)
                }
            }
        }),
        {
            name: 'iuser-cart-storage',
            onRehydrateStorage: () => (state) => {
                // Quando o localStorage for reidratado (na carga da aba), dispara carregar do BD para parear
                state?.loadFromDatabase().catch(console.error)
            }
        }
    )
)

// Opcional: ouvir cada mudança local e disparar o sync (debounced opcionalmente)
useCartStore.subscribe((state, prevState) => {
    // se o carrinho mudou, envia
    if (state.itemsByStore !== prevState.itemsByStore) {
        state.syncToDatabase().catch(() => { })
    }
})
