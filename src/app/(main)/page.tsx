'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { MapPin, Star, Clock, ArrowDownWideNarrow, ArrowUpNarrowWide, Search as SearchIcon, Filter, X, ChevronRight, Store, ShoppingBag, Plus, Building2, Package, TrendingUp, Award, Flame, Zap, Truck, CreditCard, Gift } from 'lucide-react'

type StoreStats = {
  ratings_count: number
  ratings_avg: number
  prep_time_min: number | null
  prep_time_max: number | null
  price_min: number | null
  price_max: number | null
}

type StoreType = {
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

type ProductType = {
  id: string
  name: string
  store_id: string
  image_url: string | null
  category: string | null
  type: string | null
  price: number | null
  slug: string | null
}

const PREVIEW_COUNT = 12

// Função para parsear coordenadas (suporta WKT, GeoJSON e PostGIS Hex Binary)
function parseCoords(location: any): [number, number] | null {
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

  if (typeof location === 'string' && location.length >= 42 && /^[0-9A-F]+$/i.test(location)) {
    try {
      const hexToDouble = (hex: string) => {
        const bytes = new Uint8Array(hex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)))
        const view = new DataView(bytes.buffer)
        return view.getFloat64(0, true)
      }

      if (location.length === 50) {
        const lng = hexToDouble(location.substring(18, 34))
        const lat = hexToDouble(location.substring(34, 50))
        return isFinite(lng) && isFinite(lat) ? [lng, lat] : null
      } else if (location.length === 42) {
        const lng = hexToDouble(location.substring(10, 26))
        const lat = hexToDouble(location.substring(26, 42))
        return isFinite(lng) && isFinite(lat) ? [lng, lat] : null
      }
    } catch (e) { console.error('[Geo] WKB Error:', e) }
  }

  return null
}

type TabType = 'stores' | 'products'

export default function Vitrine() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabType>('stores')

  const [allStores, setAllStores] = useState<StoreType[]>([])
  const [allProducts, setAllProducts] = useState<ProductType[]>([])
  const [loading, setLoading] = useState(true)
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)

  const [search, setSearch] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [showAllItems, setShowAllItems] = useState(false)

  const [sortBy, setSortBy] = useState<'distance' | 'rating' | 'priceMin' | 'priceMax'>('rating')

  const filters = [
    { label: 'Mais próximo', value: 'distance', icon: MapPin, description: 'Lojas perto de você', color: 'text-blue-500' },
    { label: 'Melhor avaliado', value: 'rating', icon: Star, description: 'Os favoritos do público', color: 'text-yellow-500' },
    { label: 'Menor valor', value: 'priceMin', icon: ArrowDownWideNarrow, description: 'Economize dinheiro', color: 'text-green-500' },
    { label: 'Maior valor', value: 'priceMax', icon: ArrowUpNarrowWide, description: 'Produtos premium', color: 'text-purple-500' },
  ]

  const getActiveFilterLabel = () => {
    const active = filters.find(f => f.value === sortBy)
    return active ? active.label : 'Filtrar'
  }

  const getActiveFilterIcon = () => {
    const active = filters.find(f => f.value === sortBy)
    const Icon = active?.icon || Filter
    return <Icon className="w-3.5 h-3.5" />
  }

  // 📍 DISTÂNCIA
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
    const km = R * c

    return km
  }

  const formatDistance = (distance: number | null): string | null => {
    if (distance === null) return null
    if (distance < 1) {
      const meters = Math.round(distance * 1000)
      return `${meters}m`
    } else {
      return `${distance.toFixed(1)}km`
    }
  }

  const getStore = (storeId: string) => allStores.find(s => s.id === storeId)

  const translateType = (type: string | null) => {
    if (!type) return null
    const t = type.toLowerCase()
    if (t === 'physical') return 'Produto'
    if (t === 'service') return 'Serviço'
    return type
  }

  // 🔥 FILTRO + ORDENAÇÃO - STORES
  const getSortedStores = () => {
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
  }

  // 🔥 FILTRO + ORDENAÇÃO - PRODUCTS
  const getSortedProducts = () => {
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
  }

  // 🔥 INIT
  useEffect(() => {
    const init = async () => {
      setLoading(true)
      try {
        const supabase = createClient()

        const [{ data: storesList, error: sErr }, { data: profilesList, error: prErr }, { data: productsList, error: pErr }] = await Promise.all([
          supabase.from('stores').select('*'),
          supabase.from('profiles').select('id, "profileSlug"'),
          supabase.from('products').select('*')
        ])

        if (sErr || prErr || pErr) {
          console.error('[Vitrine] Erro ao carregar dados:', { sErr, prErr, pErr })
        }

        const mappedProducts = (productsList || []).map(product => {
          try {
            return {
              ...product,
              image_url: product.image_url ? supabase.storage.from('product-images').getPublicUrl(product.image_url).data.publicUrl : null,
              price: typeof product.price === 'string' ? parseFloat(product.price) : typeof product.price === 'number' ? product.price : 0
            }
          } catch (e) {
            console.error('[Vitrine] Erro ao mapear produto:', product.id, e)
            return product
          }
        })

        const mappedStores = (storesList || []).map(store => {
          try {
            const prof = (profilesList || []).find(p => p.id === store.owner_id)
            const storeProducts = mappedProducts.filter(p => p.store_id === store.id)
            const prices = storeProducts.map(p => p.price).filter(p => p !== null && !isNaN(p as number)) as number[]
            const minPrice = prices.length > 0 ? Math.min(...prices) : null
            const maxPrice = prices.length > 0 ? Math.max(...prices) : null

            return {
              ...store,
              profileSlug: prof?.profileSlug || 'loja',
              logo_url: store.logo_url ? supabase.storage.from('store-logos').getPublicUrl(store.logo_url).data.publicUrl : null,
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

        setAllStores(mappedStores as any)
        setAllProducts(mappedProducts as any)

        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            pos => {
              setUserLocation({
                lat: pos.coords.latitude,
                lng: pos.coords.longitude
              })
            },
            () => { console.warn('[Vitrine] Geolocalização negada ou falhou.') }
          )
        }
      } catch (globalErr) {
        console.error('[Vitrine] Erro global no init:', globalErr)
      } finally {
        setLoading(false)
      }
    }

    init()
  }, [])

  useEffect(() => {
    setShowAllItems(false)
  }, [search, sortBy, activeTab])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 via-red-50 to-yellow-50">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-3 h-3 bg-orange-500 rounded-full animate-pulse"></div>
          </div>
        </div>
      </div>
    )
  }

  const sortedProducts = getSortedProducts()
  const sortedStores = getSortedStores()
  const currentItems = activeTab === 'stores' ? sortedStores : sortedProducts
  const visibleItems = showAllItems ? currentItems : currentItems.slice(0, PREVIEW_COUNT)
  const hasMoreItems = currentItems.length > PREVIEW_COUNT

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-yellow-50">
      {/* Header Sticky - SEM PADDING EXTERNO */}
      <div className="sticky top-0 z-50 bg-white shadow-lg">
        <div className="px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="flex items-center gap-3">
            {/* Logo */}
            <div className="flex-shrink-0 cursor-pointer hover:scale-105 transition-transform" onClick={() => router.push('/')}>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-red-500 rounded-xl flex items-center justify-center shadow-md">
                  <Store className="w-5 h-5 text-white" />
                </div>
                <span className="text-xl font-black bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent hidden sm:inline">
                  iUser Market
                </span>
              </div>
            </div>

            {/* Search Input */}
            <div className="relative group flex-1">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-orange-400 group-focus-within:text-orange-500 transition-colors" />
              <input
                type="text"
                placeholder={activeTab === "stores" ? "🔍 Buscar lojas incríveis..." : "🔍 O que você procura?"}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-8 py-2.5 bg-orange-50 border-2 border-orange-200 focus:border-orange-500 text-gray-700 placeholder:text-orange-300 text-sm rounded-2xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg text-orange-400 hover:text-orange-600 transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter Button */}
            <button
              onClick={() => setShowFilters(true)}
              className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-2xl text-sm font-bold shadow-md hover:shadow-lg hover:scale-105 transition-all"
            >
              {getActiveFilterIcon()}
              <span className="hidden sm:inline">{getActiveFilterLabel()}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tabs - SEM PADDING EXTERNO */}
      <div className="sticky top-[73px] sm:top-[81px] z-40 bg-white shadow-md">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab("stores")}
              className={`flex items-center gap-2 px-5 sm:px-7 py-3.5 text-sm font-bold transition-all relative ${activeTab === "stores"
                  ? "text-orange-600"
                  : "text-gray-500 hover:text-orange-500"
                }`}
            >
              <Store className="w-4 h-4" />
              <span>Lojas</span>
              <span className="text-xs font-normal ml-1 bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full">
                {sortedStores.length}
              </span>
              {activeTab === "stores" && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 to-red-500 rounded-full"></div>
              )}
            </button>
            <button
              onClick={() => setActiveTab("products")}
              className={`flex items-center gap-2 px-5 sm:px-7 py-3.5 text-sm font-bold transition-all relative ${activeTab === "products"
                  ? "text-orange-600"
                  : "text-gray-500 hover:text-orange-500"
                }`}
            >
              <Package className="w-4 h-4" />
              <span>Produtos e Serviços</span>
              <span className="text-xs font-normal ml-1 bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full">
                {sortedProducts.length}
              </span>
              {activeTab === "products" && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 to-red-500 rounded-full"></div>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
        {/* Filter Modal */}
        {showFilters && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowFilters(false)}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" />
            <div
              className="relative bg-white rounded-3xl shadow-2xl w-full sm:max-w-md mx-auto animate-in slide-in-from-bottom-4 duration-300 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-gradient-to-r from-orange-500 to-red-500 p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold text-white">Ordenar por</h3>
                  <button
                    onClick={() => setShowFilters(false)}
                    className="p-1 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
                  >
                    <X className="w-5 h-5 text-white" />
                  </button>
                </div>
              </div>

              <div className="p-3">
                {filters.map((option) => {
                  const Icon = option.icon
                  const isActive = sortBy === option.value
                  return (
                    <button
                      key={option.value}
                      onClick={() => {
                        setSortBy(option.value as any)
                        setShowFilters(false)
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all mb-1 ${isActive
                          ? "bg-gradient-to-r from-orange-50 to-red-50 border-2 border-orange-500"
                          : "text-gray-700 hover:bg-gray-50"
                        }`}
                    >
                      <Icon className={`w-5 h-5 ${isActive ? "text-orange-500" : "text-gray-400"}`} />
                      <div className="flex-1 text-left">
                        <div className={`text-sm font-bold ${isActive ? "text-orange-600" : "text-gray-900"}`}>
                          {option.label}
                        </div>
                        <div className="text-xs text-gray-500">{option.description}</div>
                      </div>
                      {isActive && (
                        <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                      )}
                    </button>
                  )
                })}
              </div>

              <div className="p-4 border-t border-gray-100">
                <button
                  onClick={() => {
                    setSortBy("rating")
                    setShowFilters(false)
                  }}
                  className="w-full py-2.5 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
                >
                  Limpar filtros
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Header Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Flame className="w-6 h-6 text-orange-500 fill-orange-500" />
                <h1 className="text-3xl sm:text-4xl font-black bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
                  {getSectionTitle()}
                </h1>
              </div>
              <p className="text-sm text-gray-600">
                🎉 {currentItems.length} {activeTab === "stores" ? "lojas parceiras" : "itens disponíveis"} prontos para você
              </p>
            </div>
            {hasMoreItems && (
              <button
                onClick={() => setShowAllItems(!showAllItems)}
                className="text-sm font-bold text-orange-600 hover:text-orange-700 transition-colors flex items-center gap-1 bg-orange-50 px-4 py-2 rounded-full"
              >
                {showAllItems ? "Ver menos" : `Ver todos (${currentItems.length})`}
                <ChevronRight className={`w-4 h-4 transition-transform duration-300 ${showAllItems ? "rotate-90" : ""}`} />
              </button>
            )}
          </div>
        </div>

        {/* Content Grid */}
        {currentItems.length === 0 ? (
          <div className="py-16 text-center bg-white rounded-3xl shadow-sm">
            <div className="inline-flex p-4 bg-gradient-to-br from-orange-100 to-red-100 rounded-full mb-4">
              {activeTab === "stores" ? (
                <Building2 className="w-12 h-12 text-orange-500" />
              ) : (
                <Package className="w-12 h-12 text-orange-500" />
              )}
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              Nenhum resultado encontrado
            </h3>
            <p className="text-gray-500">
              😕 Tente buscar por outro termo ou ajustar os filtros
            </p>
          </div>
        ) : activeTab === "stores" ? (
          /* Store Cards - Grid Responsivo */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {(visibleItems as StoreType[]).map((store, idx) => {
              const stats = store.store_stats ?? {}
              const distance = calcDistanceKm(store.location)
              const distanceFormatted = formatDistance(distance)
              const productCount = allProducts.filter(p => p.store_id === store.id).length

              return (
                <div
                  key={store.id + idx}
                  onClick={() => router.push(`/${store.profileSlug}/${store.storeSlug}`)}
                  className="group relative bg-white rounded-2xl overflow-hidden transition-all duration-300 cursor-pointer hover:shadow-2xl hover:scale-105 border-2 border-transparent hover:border-orange-500"
                >
                  {/* Store Banner */}
                  <div className="relative h-36 bg-gradient-to-br from-orange-400 to-red-500 overflow-hidden">
                    {store.logo_url ? (
                      <img
                        src={store.logo_url}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                        alt={store.name}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Building2 className="w-16 h-16 text-white/30" />
                      </div>
                    )}

                    {/* Status Badge */}
                    <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1.5 bg-white rounded-xl shadow-md">
                      <div className={`w-2 h-2 rounded-full ${store.is_open ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />
                      <span className="text-xs font-bold text-gray-700">{store.is_open ? "Aberto" : "Fechado"}</span>
                    </div>

                    {/* Distance Badge */}
                    {distanceFormatted && (
                      <div className="absolute top-3 right-3 px-2.5 py-1.5 bg-white rounded-xl shadow-md">
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-orange-500" />
                          <span className="text-xs font-bold text-gray-700">{distanceFormatted}</span>
                        </div>
                      </div>
                    )}

                    {/* Featured Badge */}
                    {stats.ratings_avg > 4.5 && (
                      <div className="absolute bottom-3 left-3 px-2.5 py-1 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-lg shadow-md">
                        <div className="flex items-center gap-1">
                          <Award className="w-3 h-3 text-white" />
                          <span className="text-xs font-bold text-white">Destaque</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Store Info */}
                  <div className="p-4">
                    <h3 className="text-lg font-black text-gray-900 mb-1 line-clamp-1">
                      {store.name}
                    </h3>

                    {store.description && (
                      <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                        {store.description}
                      </p>
                    )}

                    {/* Rating & Stats */}
                    <div className="flex items-center gap-3 mb-3">
                      <div className="flex items-center gap-1">
                        <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                        <span className="font-bold text-gray-900">
                          {stats.ratings_avg?.toFixed(1) ?? "0.0"}
                        </span>
                        <span className="text-xs text-gray-500">({stats.ratings_count ?? 0})</span>
                      </div>
                      <div className="w-px h-4 bg-gray-300" />
                      <div className="text-sm text-gray-600 flex items-center gap-1">
                        <ShoppingBag className="w-3 h-3" />
                        {productCount} itens
                      </div>
                    </div>

                    {/* Price Range */}
                    {(stats.price_min || stats.price_max) && (
                      <div className="mb-3 p-2 bg-gradient-to-r from-orange-50 to-yellow-50 rounded-xl">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">💰 Faixa de preço</span>
                          <span className="font-bold text-orange-600">
                            {stats.price_min && `R$ ${stats.price_min.toFixed(2)}`}
                            {stats.price_min && stats.price_max && " - "}
                            {stats.price_max && `R$ ${stats.price_max.toFixed(2)}`}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Action Button */}
                    <div className="pt-3">
                      <div className="flex items-center justify-between">
                        <span className="text-orange-600 font-bold group-hover:translate-x-1 transition-transform inline-flex items-center gap-1">
                          Conhecer loja
                          <ChevronRight className="w-4 h-4" />
                        </span>
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <Truck className="w-3 h-3" />
                          <span>Entrega rápida</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          /* Product Cards - Grid Responsivo */
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-5">
            {(visibleItems as ProductType[]).map((product, idx) => {
              const store = getStore(product.store_id)
              const distance = store ? calcDistanceKm(store.location) : null
              const distanceFormatted = formatDistance(distance)
              const price = typeof product.price === "number" ? product.price : 0
              const typeLabel = translateType(product.type) || product.category || "Produto"

              return (
                <div
                  key={product.id + idx}
                  onClick={() => store && router.push(`/${store.profileSlug}/${store.storeSlug}/${product.slug || product.id}`)}
                  className="group relative bg-white rounded-2xl overflow-hidden transition-all duration-300 cursor-pointer hover:shadow-2xl hover:scale-105 border-2 border-transparent hover:border-orange-500"
                >
                  {/* Product Image */}
                  <div className="relative aspect-square bg-gradient-to-br from-orange-100 to-red-100 overflow-hidden">
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                        alt={product.name}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ShoppingBag className="w-12 h-12 text-orange-300" />
                      </div>
                    )}

                    {/* Type Badge */}
                    <div className="absolute top-2 left-2">
                      <div className="px-2.5 py-1 bg-gradient-to-r from-orange-500 to-red-500 rounded-xl text-xs font-bold text-white shadow-md">
                        {typeLabel}
                      </div>
                    </div>

                    {/* Discount Badge */}
                    {price > 100 && (
                      <div className="absolute top-2 right-2">
                        <div className="px-2 py-1 bg-green-500 rounded-xl text-xs font-bold text-white shadow-md animate-pulse">
                          -10%
                        </div>
                      </div>
                    )}

                    {/* Distance Badge */}
                    {distanceFormatted && (
                      <div className="absolute bottom-2 right-2">
                        <div className="flex items-center gap-1 px-2 py-1 bg-white rounded-xl shadow-md">
                          <MapPin className="w-3 h-3 text-orange-500" />
                          <span className="text-xs font-bold text-gray-700">{distanceFormatted}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Product Info */}
                  <div className="p-3">
                    <h4 className="font-bold text-gray-900 mb-1 line-clamp-2 text-sm">
                      {product.name}
                    </h4>

                    {/* Store Name */}
                    {store && (
                      <div className="flex items-center gap-1.5 mb-2 p-1.5 bg-orange-50 rounded-lg">
                        <div className="w-5 h-5 bg-gradient-to-br from-orange-400 to-red-500 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center">
                          {store.logo_url ? (
                            <img src={store.logo_url} className="w-full h-full object-cover" alt="" />
                          ) : (
                            <Store className="w-2.5 h-2.5 text-white" />
                          )}
                        </div>
                        <span className="text-xs font-semibold text-gray-700 truncate">{store.name}</span>
                      </div>
                    )}

                    {/* Price & Action */}
                    <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                      <div>
                        <span className="text-xl font-black text-orange-600">
                          R$ {price.toFixed(2).replace(".", ",")}
                        </span>
                        {store?.store_stats.ratings_avg && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                            <span className="text-xs text-gray-600">{store.store_stats.ratings_avg.toFixed(1)}</span>
                          </div>
                        )}
                      </div>
                      <button className="w-9 h-9 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white rounded-xl flex items-center justify-center transition-all group-hover:scale-110 shadow-md">
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Load More Button */}
        {!showAllItems && hasMoreItems && (
          <div className="mt-10 text-center">
            <button
              onClick={() => setShowAllItems(true)}
              className="inline-flex items-center gap-2 px-8 py-3.5 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white rounded-2xl font-bold shadow-lg hover:shadow-xl transition-all hover:scale-105"
            >
              <Zap className="w-5 h-5" />
              Carregar mais {currentItems.length - PREVIEW_COUNT} itens
            </button>
          </div>
        )}

        {/* Promotional Banner */}
        <div className="mt-12 bg-gradient-to-r from-orange-500 via-red-500 to-yellow-500 rounded-3xl p-6 text-center shadow-xl">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Gift className="w-6 h-6 text-white" />
            <h3 className="text-xl font-black text-white">Ganhe Frete Grátis</h3>
          </div>
          <p className="text-white/90 text-sm mb-3">Nas primeiras 3 compras com pagamento via PIX</p>
          <button className="px-6 py-2 bg-white text-orange-600 rounded-xl font-bold hover:scale-105 transition-transform shadow-md">
            Saiba mais →
          </button>
        </div>
      </div>
    </div>
  )
}