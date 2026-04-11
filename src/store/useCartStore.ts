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
}

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
            })
        }),
        {
            name: 'iuser-cart-storage'
        }
    )
)
