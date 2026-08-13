// src/store/usePublicationStore.ts
import { create } from 'zustand'
import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner'

export interface Publication {
    id: string
    name: string
    slug: string
    description?: string | null
    image_url?: string | null
    price?: number
    listing_type: 'sale' | 'publication'
    owner_id: string
    store_id?: string | null
    category?: string
    created_at: string
    profiles?: {
        name: string
        profileSlug: string
        avatar_url?: string | null
    }
    owner?: {
        id: string
        name: string
        slug: string
        avatar_url?: string | null
    }
}

interface PublicationsStore {
    // Dados
    publications: Publication[]
    currentIndex: number
    isLoading: boolean
    hasMore: boolean
    isLoadingMore: boolean
    currentOwnerSlug: string | null
    currentStoreSlug: string | null

    // Metadados
    totalCount: number
    pageSize: number
    currentPage: number

    // Ações
    setPublicationFeed: (
        publications: Publication[],
        initialIndex?: number,
        ownerSlug?: string,
        storeSlug?: string
    ) => void
    loadPublicationsForOwner: (options: {
        ownerSlug?: string
        storeSlug?: string
        initialSlug?: string
    }) => Promise<void>
    loadMore: () => Promise<void>
    navigateTo: (index: number) => void
    next: () => void
    previous: () => void
    getCurrent: () => Publication | null
    getNext: () => Publication | null
    getPrevious: () => Publication | null
    prefetchAdjacent: (index: number) => void
    reset: () => void
}

// Helper para garantir URL publica de imagem
function resolveImageUrl(path?: string | null, bucket: string = 'product-images'): string | null {
    if (!path) return null
    if (path.startsWith('http')) return path
    return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
}

export const usePublicationsStore = create<PublicationsStore>((set, get) => ({
    publications: [],
    currentIndex: 0,
    isLoading: false,
    hasMore: true,
    isLoadingMore: false,
    currentOwnerSlug: null,
    currentStoreSlug: null,
    totalCount: 0,
    pageSize: 20,
    currentPage: 0,

    setPublicationFeed: (publications, initialIndex = 0, ownerSlug, storeSlug) => {
        const index = Math.max(0, Math.min(initialIndex, publications.length - 1))
        set({
            publications,
            currentIndex: index,
            currentOwnerSlug: ownerSlug || null,
            currentStoreSlug: storeSlug || null,
            totalCount: publications.length,
            hasMore: false,
            isLoading: false,
        })
        get().prefetchAdjacent(index)
    },

    loadPublicationsForOwner: async (options = {}) => {
        const { ownerSlug, storeSlug, initialSlug } = options
        const state = get()

        // Se já possuímos publicações carregadas para esse owner/store e o initialSlug está na lista, reutiliza
        if (
            state.publications.length > 0 &&
            ((ownerSlug && state.currentOwnerSlug === ownerSlug) || (storeSlug && state.currentStoreSlug === storeSlug))
        ) {
            if (initialSlug) {
                const index = state.publications.findIndex(p => p.slug === initialSlug)
                if (index !== -1) {
                    set({ currentIndex: index })
                    state.prefetchAdjacent(index)
                    return
                }
            } else {
                return
            }
        }

        set({ isLoading: true, currentOwnerSlug: ownerSlug || null, currentStoreSlug: storeSlug || null })

        try {
            let targetOwnerId: string | null = null
            let targetStoreId: string | null = null

            // 1. Tentar encontrar por loja (se storeSlug fornecido ou ownerSlug for loja)
            if (storeSlug) {
                const { data: store } = await supabase
                    .from('stores')
                    .select('id')
                    .eq('storeSlug', storeSlug)
                    .maybeSingle()
                if (store) targetStoreId = store.id
            }

            if (!targetStoreId && ownerSlug) {
                // Tenta achar como perfil primeiro
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('id')
                    .eq('profileSlug', ownerSlug)
                    .maybeSingle()

                if (profile) {
                    targetOwnerId = profile.id
                } else {
                    // Tenta achar como loja
                    const { data: store } = await supabase
                        .from('stores')
                        .select('id')
                        .eq('storeSlug', ownerSlug)
                        .maybeSingle()

                    if (store) {
                        targetStoreId = store.id
                    }
                }
            }

            let query = supabase
                .from('products')
                .select(`
                    *,
                    profiles:owner_id (
                        name,
                        profileSlug,
                        avatar_url
                    ),
                    stores:store_id (
                        name,
                        storeSlug,
                        logo_url
                    )
                `, { count: 'exact' })
                .eq('listing_type', 'publication')
                .order('created_at', { ascending: false })
                .limit(50)

            if (targetStoreId) {
                query = query.eq('store_id', targetStoreId)
            } else if (targetOwnerId) {
                query = query.eq('owner_id', targetOwnerId).is('store_id', null)
            }

            const { data, error, count } = await query

            if (error) throw error

            const publications: Publication[] = (data || []).map(pub => {
                const isStore = !!pub.store_id && pub.stores
                const rawOwnerName = isStore ? pub.stores.name : pub.profiles?.name || 'Usuário'
                const rawOwnerSlug = isStore ? pub.stores.storeSlug : pub.profiles?.profileSlug || 'usuario'
                const rawAvatar = isStore
                    ? resolveImageUrl(pub.stores.logo_url, 'store-logos')
                    : resolveImageUrl(pub.profiles?.avatar_url, 'avatars')

                return {
                    ...pub,
                    image_url: resolveImageUrl(pub.image_url, 'product-images'),
                    owner: {
                        id: isStore ? pub.store_id : pub.owner_id,
                        name: rawOwnerName,
                        slug: rawOwnerSlug,
                        avatar_url: rawAvatar,
                    },
                    profiles: pub.profiles ? {
                        name: pub.profiles.name,
                        profileSlug: pub.profiles.profileSlug,
                        avatar_url: resolveImageUrl(pub.profiles.avatar_url, 'avatars'),
                    } : undefined,
                }
            })

            let initialIndex = 0
            if (initialSlug && publications.length > 0) {
                const foundIdx = publications.findIndex(p => p.slug === initialSlug)
                if (foundIdx !== -1) {
                    initialIndex = foundIdx
                }
            }

            set({
                publications,
                currentIndex: initialIndex,
                isLoading: false,
                totalCount: count || publications.length,
                hasMore: (count || publications.length) > 50,
                currentPage: 0,
            })

            get().prefetchAdjacent(initialIndex)

        } catch (err) {
            console.error('Erro ao carregar publicações:', err)
            set({ isLoading: false })
            toast.error('Erro ao carregar publicações')
        }
    },

    loadMore: async () => {
        const { publications, isLoadingMore, hasMore, pageSize, currentPage, currentOwnerSlug, currentStoreSlug } = get()
        if (isLoadingMore || !hasMore) return

        set({ isLoadingMore: true })

        try {
            const from = (currentPage + 1) * pageSize
            const to = from + pageSize - 1

            let targetOwnerId: string | null = null
            let targetStoreId: string | null = null

            if (currentStoreSlug) {
                const { data: store } = await supabase
                    .from('stores')
                    .select('id')
                    .eq('storeSlug', currentStoreSlug)
                    .maybeSingle()
                if (store) targetStoreId = store.id
            }

            if (!targetStoreId && currentOwnerSlug) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('id')
                    .eq('profileSlug', currentOwnerSlug)
                    .maybeSingle()
                if (profile) {
                    targetOwnerId = profile.id
                } else {
                    const { data: store } = await supabase
                        .from('stores')
                        .select('id')
                        .eq('storeSlug', currentOwnerSlug)
                        .maybeSingle()
                    if (store) targetStoreId = store.id
                }
            }

            let query = supabase
                .from('products')
                .select(`
                    *,
                    profiles:owner_id (
                        name,
                        profileSlug,
                        avatar_url
                    ),
                    stores:store_id (
                        name,
                        storeSlug,
                        logo_url
                    )
                `, { count: 'exact' })
                .eq('listing_type', 'publication')
                .order('created_at', { ascending: false })
                .range(from, to)

            if (targetStoreId) {
                query = query.eq('store_id', targetStoreId)
            } else if (targetOwnerId) {
                query = query.eq('owner_id', targetOwnerId).is('store_id', null)
            }

            const { data, error, count } = await query

            if (error) throw error

            const newPublications: Publication[] = (data || []).map(pub => {
                const isStore = !!pub.store_id && pub.stores
                const rawOwnerName = isStore ? pub.stores.name : pub.profiles?.name || 'Usuário'
                const rawOwnerSlug = isStore ? pub.stores.storeSlug : pub.profiles?.profileSlug || 'usuario'
                const rawAvatar = isStore
                    ? resolveImageUrl(pub.stores.logo_url, 'store-logos')
                    : resolveImageUrl(pub.profiles?.avatar_url, 'avatars')

                return {
                    ...pub,
                    image_url: resolveImageUrl(pub.image_url, 'product-images'),
                    owner: {
                        id: isStore ? pub.store_id : pub.owner_id,
                        name: rawOwnerName,
                        slug: rawOwnerSlug,
                        avatar_url: rawAvatar,
                    },
                    profiles: pub.profiles ? {
                        name: pub.profiles.name,
                        profileSlug: pub.profiles.profileSlug,
                        avatar_url: resolveImageUrl(pub.profiles.avatar_url, 'avatars'),
                    } : undefined,
                }
            })

            const updated = [...publications, ...newPublications]
            set({
                publications: updated,
                isLoadingMore: false,
                totalCount: count || updated.length,
                hasMore: (count || updated.length) > to + 1,
                currentPage: currentPage + 1,
            })

        } catch (error) {
            console.error('Erro ao carregar mais publicações:', error)
            set({ isLoadingMore: false })
        }
    },

    navigateTo: (index: number) => {
        const { publications } = get()
        if (index >= 0 && index < publications.length) {
            set({ currentIndex: index })
            get().prefetchAdjacent(index)
        }
    },

    next: () => {
        const { currentIndex, publications } = get()
        const nextIndex = currentIndex + 1

        if (nextIndex < publications.length) {
            set({ currentIndex: nextIndex })
            get().prefetchAdjacent(nextIndex)
        } else {
            get().loadMore()
        }
    },

    previous: () => {
        const { currentIndex } = get()
        if (currentIndex > 0) {
            const prevIndex = currentIndex - 1
            set({ currentIndex: prevIndex })
            get().prefetchAdjacent(prevIndex)
        }
    },

    getCurrent: () => {
        const { publications, currentIndex } = get()
        return publications[currentIndex] || null
    },

    getNext: () => {
        const { publications, currentIndex } = get()
        return publications[currentIndex + 1] || null
    },

    getPrevious: () => {
        const { publications, currentIndex } = get()
        return publications[currentIndex - 1] || null
    },

    prefetchAdjacent: (index: number) => {
        const { publications } = get()
        if (!publications || publications.length === 0) return

        // Pré-carregar imagens dos índices adjacentes (anterior e próximos 3)
        const targets = [index - 1, index + 1, index + 2, index + 3]
        targets.forEach(i => {
            if (i >= 0 && i < publications.length) {
                const pub = publications[i]
                if (pub?.image_url) {
                    const img = new Image()
                    img.src = pub.image_url
                }
                if (pub?.owner?.avatar_url) {
                    const img = new Image()
                    img.src = pub.owner.avatar_url
                }
            }
        })
    },

    reset: () => {
        set({
            publications: [],
            currentIndex: 0,
            isLoading: false,
            hasMore: true,
            isLoadingMore: false,
            currentOwnerSlug: null,
            currentStoreSlug: null,
            totalCount: 0,
            currentPage: 0,
        })
    },
}))