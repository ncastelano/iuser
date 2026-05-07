export interface Store {
    id: string
    name: string
    storeSlug: string
    logo_url: string | null
    is_open: boolean
}

export interface Sale {
    id: string
    created_at: string
    price: number
    quantity: number
    product_name: string
    buyer_id: string
    buyer_name: string
    buyer_profile_slug: string
    store_id: string
    status: 'pending' | 'accepted' | 'preparing' | 'ready' | 'paid' | 'rejected'
    checkout_id: string
    store_name?: string
}

export interface GroupedOrder {
    checkout_id: string
    buyer_name: string
    buyer_profile_slug: string
    created_at: string
    status: 'pending' | 'accepted' | 'preparing' | 'ready' | 'paid' | 'rejected'
    items: Sale[]
    totalPrice: number
    store_name?: string
}

export interface Profile {
    id: string
    name: string
    profileSlug: string
    avatar_url: string | null
}