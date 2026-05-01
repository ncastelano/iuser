import { useState, useMemo } from 'react'
import { StoreType, ProductType } from './useVitrineData'

type SortBy = 'distance' | 'rating' | 'priceMin' | 'priceMax'
type TabType = 'stores' | 'products'

export function useStoreFilters(
    allStores: StoreType[],
    allProducts: ProductType[],
    userLocation: { lat: number; lng: number } | null
) {
    const [activeTab, setActiveTab] = useState<TabType>('stores')
    const [search, setSearch] = useState('')
    const [sortBy, setSortBy] = useState<SortBy>('rating')
    const [showFilters, setShowFilters] = useState(false)
    const [showAllItems, setShowAllItems] = useState(false)

    const parseCoords = (location: any): [number, number] | null => {
        if (!location) return null

        if (typeof location === 'string' && (location.startsWith('{') || location.startsWith('['))) {
            try {
                const parsed = JSON.parse(location)
                if (parsed && typeof parsed === 'object') {
                    location = parsed
                }
            } catch { /* Ignora */ }
        }

        if (location?.type === 'Point' && Array.isArray(location.coordinates)) {
            const [lng, lat] = location.coordinates
            return isFinite(lng) && isFinite(lat) ? [lng, lat] : null
        }

        if (typeof location === 'string' && location.toUpperCase().includes('POINT')) {
            const match = location.match(/POINT\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/i)
            if (match) return [parseFloat(match[1]), parseFloat(match[2])]
        }

        return null
    }

    const calcDistanceKm = (storeLocation: any): number | null => {
        if (!userLocation || !storeLocation) return null

        const coords = parseCoords(storeLocation)
        if (!coords) return null

        const [lon, lat] = coords
        const toRad = (v: number) => (v * Math.PI) / 180
        const R = 6371

        const dLat = toRad(lat - userLocation.lat)
        const dLon = toRad(lon - userLocation.lng)

        const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(userLocation.lat)) *
            Math.cos(toRad(lat)) *
            Math.sin(dLon / 2) ** 2

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
        return R * c
    }

    const getStore = (storeId: string) => allStores.find(s => s.id === storeId)

    const sortedStores = useMemo(() => {
        let filtered = [...allStores]

        if (search.trim()) {
            filtered = filtered.filter(store =>
                store.name.toLowerCase().includes(search.toLowerCase()) ||
                (store.description?.toLowerCase() || '').includes(search.toLowerCase())
            )
        }

        return filtered.sort((a, b) => {
            if (a.is_open !== b.is_open) return a.is_open ? -1 : 1

            const aStats = a.store_stats
            const bStats = b.store_stats

            switch (sortBy) {
                case 'distance': {
                    const distA = calcDistanceKm(a.location) ?? 9999
                    const distB = calcDistanceKm(b.location) ?? 9999
                    return distA - distB
                }
                case 'rating': return (bStats.ratings_avg ?? 0) - (aStats.ratings_avg ?? 0)
                case 'priceMin': return (aStats.price_min ?? 9999) - (bStats.price_min ?? 9999)
                case 'priceMax': return (bStats.price_max ?? 0) - (aStats.price_max ?? 0)
                default: return 0
            }
        })
    }, [allStores, search, sortBy, userLocation])

    const sortedProducts = useMemo(() => {
        let filtered = [...allProducts]

        if (search.trim()) {
            filtered = filtered.filter(p =>
                p.name.toLowerCase().includes(search.toLowerCase()) ||
                (p.category?.toLowerCase() || '').includes(search.toLowerCase())
            )
        }

        return filtered.sort((a, b) => {
            const storeA = getStore(a.store_id)
            const storeB = getStore(b.store_id)

            if (!storeA || !storeB) return 0

            if (storeA.is_open !== storeB.is_open) return storeA.is_open ? -1 : 1

            switch (sortBy) {
                case 'distance': {
                    const distA = calcDistanceKm(storeA.location) ?? 9999
                    const distB = calcDistanceKm(storeB.location) ?? 9999
                    return distA - distB
                }
                case 'rating': return (storeB.store_stats.ratings_avg ?? 0) - (storeA.store_stats.ratings_avg ?? 0)
                case 'priceMin': return (a.price ?? 9999) - (b.price ?? 9999)
                case 'priceMax': return (b.price ?? 0) - (a.price ?? 0)
                default: return 0
            }
        })
    }, [allProducts, allStores, search, sortBy, userLocation])

    const getSectionTitle = () => {
        if (activeTab === 'stores') {
            switch (sortBy) {
                case 'distance': return 'Lojas Próximas a Você'
                case 'rating': return 'Mais Recomendados'
                case 'priceMin': return 'Melhores Ofertas'
                case 'priceMax': return 'Lojas Premium'
                default: return 'Destaques da Semana'
            }
        } else {
            switch (sortBy) {
                case 'distance': return 'Produtos na Sua Região'
                case 'rating': return 'Produtos Mais Amados'
                case 'priceMin': return 'Baratinhos'
                case 'priceMax': return 'Produtos Especiais'
                default: return 'Novidades'
            }
        }
    }

    const resetShowAll = () => setShowAllItems(false)

    return {
        // State
        activeTab,
        setActiveTab,
        search,
        setSearch,
        sortBy,
        setSortBy,
        showFilters,
        setShowFilters,
        showAllItems,
        setShowAllItems,
        // Data
        sortedStores,
        sortedProducts,
        getStore,
        // Utils
        calcDistanceKm,
        getSectionTitle,
        resetShowAll
    }
}