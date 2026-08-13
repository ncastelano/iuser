// src/store/usePublicationsStore.ts
import { create } from 'zustand'
import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner' // <-- ADICIONAR ESTA LINHA

interface Publication {
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

    // Metadados
    totalCount: number
    pageSize: number
    currentPage: number

    // Ações
    loadPublications: (options?: {
        ownerSlug?: string
        storeSlug?: string
        category?: string
        reset?: boolean
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

// Cache em memória
const publicationCache = new Map<string, Publication[]>()

export const usePublicationsStore = create<PublicationsStore>((set, get) => ({
    publications: [],
    currentIndex: 0,
    isLoading: false,
    hasMore: true,
    isLoadingMore: false,
    totalCount: 0,
    pageSize: 20,
    currentPage: 0,

    loadPublications: async (options = {}) => {
        const { ownerSlug, storeSlug, category, reset = true } = options

        // Gerar chave de cache
        const cacheKey = `${ownerSlug || 'all'}_${storeSlug || 'all'}_${category || 'all'}`

        // Verificar cache
        if (publicationCache.has(cacheKey) && reset) {
            const cached = publicationCache.get(cacheKey)!
            set({
                publications: cached,
                currentIndex: 0,
                isLoading: false,
                totalCount: cached.length,
                hasMore: cached.length >= 20,
            })
            return
        }

        set({ isLoading: true })

        try {
            let query = supabase
                .from('products')
                .select(`
                    *,
                    profiles:owner_id (
                        name,
                        profileSlug,
                        avatar_url
                    )
                `, { count: 'exact' })
                .eq('listing_type', 'publication')
                .order('created_at', { ascending: false })
                .limit(20)

            // Filtros
            if (ownerSlug) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('id')
                    .eq('profileSlug', ownerSlug)
                    .single()

                if (profile) {
                    query = query.eq('owner_id', profile.id)
                }
            }

            if (storeSlug) {
                const { data: store } = await supabase
                    .from('stores')
                    .select('id')
                    .eq('storeSlug', storeSlug)
                    .single()

                if (store) {
                    query = query.eq('store_id', store.id)
                }
            }

            if (category) {
                query = query.eq('category', category)
            }

            const { data, error, count } = await query

            if (error) throw error

            // Processar dados
            const publications = data?.map(pub => ({
                ...pub,
                owner: pub.profiles ? {
                    id: pub.owner_id,
                    name: pub.profiles.name,
                    slug: pub.profiles.profileSlug,
                    avatar_url: pub.profiles.avatar_url,
                } : undefined,
            })) || []

            // Salvar no cache
            publicationCache.set(cacheKey, publications)

            set({
                publications,
                currentIndex: 0,
                isLoading: false,
                totalCount: count || 0,
                hasMore: (count || 0) > 20,
                currentPage: 0,
            })

        } catch (error) {
            console.error('Erro ao carregar publicações:', error)
            set({ isLoading: false })
            toast.error('Erro ao carregar publicações')
        }
    },

    loadMore: async () => {
        const { publications, isLoadingMore, hasMore, pageSize, currentPage } = get()
        if (isLoadingMore || !hasMore) return

        set({ isLoadingMore: true })

        try {
            const from = (currentPage + 1) * pageSize
            const to = from + pageSize - 1

            const { data, error, count } = await supabase
                .from('products')
                .select(`
                    *,
                    profiles:owner_id (
                        name,
                        profileSlug,
                        avatar_url
                    )
                `, { count: 'exact' })
                .eq('listing_type', 'publication')
                .order('created_at', { ascending: false })
                .range(from, to)

            if (error) throw error

            const newPublications = data?.map(pub => ({
                ...pub,
                owner: pub.profiles ? {
                    id: pub.owner_id,
                    name: pub.profiles.name,
                    slug: pub.profiles.profileSlug,
                    avatar_url: pub.profiles.avatar_url,
                } : undefined,
            })) || []

            set({
                publications: [...publications, ...newPublications],
                isLoadingMore: false,
                totalCount: count || 0,
                hasMore: (count || 0) > to + 1,
                currentPage: currentPage + 1,
            })

        } catch (error) {
            console.error('Erro ao carregar mais:', error)
            set({ isLoadingMore: false })
            toast.error('Erro ao carregar mais publicações')
        }
    },

    navigateTo: (index: number) => {
        const { publications } = get()
        if (index >= 0 && index < publications.length) {
            set({ currentIndex: index })
            // Pré-carregar adjacentes
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
            // Carregar mais se necessário
            get().loadMore()
        }
    },

    previous: () => {
        const { currentIndex } = get()
        if (currentIndex > 0) {
            set({ currentIndex: currentIndex - 1 })
            get().prefetchAdjacent(currentIndex - 1)
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
        // Pré-carregar próximos 3 itens
        for (let i = index + 1; i <= Math.min(index + 3, publications.length - 1); i++) {
            const pub = publications[i]
            if (pub?.image_url) {
                // Pré-carregar imagem
                const img = new Image()
                img.src = pub.image_url
            }
        }
    },

    reset: () => {
        set({
            publications: [],
            currentIndex: 0,
            isLoading: false,
            hasMore: true,
            isLoadingMore: false,
            totalCount: 0,
            currentPage: 0,
        })
    },
}))