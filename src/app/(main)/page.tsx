'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { MapPin, Star, Clock, ArrowDownWideNarrow, ArrowUpNarrowWide, Search as SearchIcon, Filter, X } from 'lucide-react'

type SearchMode = 'lojas' | 'produtos'

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

export default function Vitrine() {
  const router = useRouter()

  const [mode, setMode] = useState<SearchMode>('produtos')
  const [displayedItems, setDisplayedItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)

  const [search, setSearch] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  const [sortBy, setSortBy] = useState<
    'distance' | 'rating' | 'prepTime' | 'priceMin' | 'priceMax'
  >('distance')

  const [currentPage, setCurrentPage] = useState(1)

  const PAGE_SIZE = 30
  const allMockStoresRef = useRef<StoreType[]>([])
  const allMockProductsRef = useRef<ProductType[]>([])

  const filters = [
    { label: 'Mais próximo', value: 'distance', icon: MapPin },
    { label: 'Melhor avaliado', value: 'rating', icon: Star },
    { label: 'Menor tempo', value: 'prepTime', icon: Clock },
    { label: 'Menor valor', value: 'priceMin', icon: ArrowDownWideNarrow },
    { label: 'Maior valor', value: 'priceMax', icon: ArrowUpNarrowWide },
  ]

  const getActiveFilterLabel = () => {
    const active = filters.find(f => f.value === sortBy)
    return active ? active.label : 'Filtrar'
  }

  // 📍 DISTÂNCIA
  const calcDistanceKm = (storeLocation: any) => {
    if (!userLocation || !storeLocation) return null

    let lon, lat;
    if (typeof storeLocation === 'string') {
      const match = storeLocation.match(/POINT\((-?\d+\.?\d*)\s+(-?\d+\.?\d*)\)/)
      if (!match) return null
      lon = parseFloat(match[1])
      lat = parseFloat(match[2])
    } else if (typeof storeLocation === 'object' && storeLocation.type === 'Point' && Array.isArray(storeLocation.coordinates)) {
      lon = storeLocation.coordinates[0]
      lat = storeLocation.coordinates[1]
    } else {
      return null
    }

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
    return Number((R * c).toFixed(1))
  }

  const getStore = (storeId: string) => allMockStoresRef.current.find(s => s.id === storeId)

  // 🔥 FILTRO + ORDENAÇÃO
  const sortItems = () => {
    if (mode === 'lojas') {
      let filtered = [...allMockStoresRef.current]

      if (search.trim()) {
        filtered = filtered.filter(store =>
          store.name.toLowerCase().includes(search.toLowerCase())
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
          case 'prepTime': return (aStats.prep_time_min ?? 9999) - (bStats.prep_time_min ?? 9999)
          case 'priceMin': return (aStats.price_min ?? 9999) - (bStats.price_min ?? 9999)
          case 'priceMax': return (bStats.price_max ?? 0) - (aStats.price_max ?? 0)
          default: return 0
        }
      })
    } else {
      let filtered = [...allMockProductsRef.current]

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
          case 'prepTime': return (storeA.store_stats.prep_time_min ?? 9999) - (storeB.store_stats.prep_time_min ?? 9999)
          case 'priceMin': return (a.price ?? 9999) - (b.price ?? 9999)
          case 'priceMax': return (b.price ?? 0) - (a.price ?? 0)
          default: return 0
        }
      })
    }
  }

  // 🔥 PAGINAÇÃO
  const loadPage = (page: number) => {
    const sorted = sortItems()

    const totalPages = Math.ceil(sorted.length / PAGE_SIZE) || 1
    const validPage = Math.max(1, Math.min(page, totalPages))

    const start = (validPage - 1) * PAGE_SIZE
    const end = start + PAGE_SIZE

    const data = sorted.slice(start, end)

    setDisplayedItems(data)
    setCurrentPage(validPage)
  }

  // 🔥 INIT
  useEffect(() => {
    const init = async () => {
      setLoading(true)

      const supabase = createClient()

      const { data: storesList } = await supabase
        .from('stores')
        .select(`id, name, storeSlug, logo_url, description, owner_id, location`)

      const { data: productsList } = await supabase
        .from('products')
        .select('*')

      const mappedStores = (storesList || []).map(store => ({
        ...store,
        logo_url: store.logo_url ? supabase.storage.from('store-logos').getPublicUrl(store.logo_url).data.publicUrl : null,
        is_open: true,
        store_stats: {
          ratings_count: 0,
          ratings_avg: 0,
          prep_time_min: null,
          prep_time_max: null,
          price_min: null,
          price_max: null
        }
      }))

      const mappedProducts = (productsList || []).map(product => ({
        ...product,
        image_url: product.image_url ? supabase.storage.from('product-images').getPublicUrl(product.image_url).data.publicUrl : null
      }))

      allMockStoresRef.current = mappedStores as any
      allMockProductsRef.current = mappedProducts as any

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          pos => {
            setUserLocation({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude
            })
          },
          () => { }
        )
      }

      setLoading(false)
    }

    init()
  }, [])

  // 🔁 RELOAD on dep changes
  useEffect(() => {
    if (loading) return
    loadPage(1)
  }, [loading, sortBy, userLocation, search, mode])

  const sortedAll = sortItems()
  const totalItems = sortedAll.length
  const totalPages = Math.ceil(totalItems / PAGE_SIZE) || 1

  // 🧩 STORE CARD
  const renderStoreCard = (store: StoreType, idx: number) => {
    const stats = store.store_stats ?? {}
    const distanceKm = calcDistanceKm(store.location)
    const storeProducts = allMockProductsRef.current.filter(p => p.store_id === store.id).slice(0, 3)

    return (
      <div
        key={store.id + idx}
        onClick={() => router.push(`/${store.storeSlug}`)}
        className="group cursor-pointer rounded-2xl overflow-hidden border border-neutral-800 bg-neutral-950/80 backdrop-blur-sm hover:border-white/50 hover:-translate-y-1 transition-all duration-300 shadow-md hover:shadow-[0_0_20px_rgba(255,255,255,0.1)] flex flex-col"
      >
        <div className="relative h-48 bg-neutral-900 flex items-center justify-center overflow-hidden">
          {store.logo_url ? (
            <img src={store.logo_url} className="w-full h-full object-cover opacity-80 group-hover:scale-105 transition-transform duration-500" alt={store.name} />
          ) : (
            <span className="text-neutral-600 text-sm">Sem imagem</span>
          )}

          <div className={`absolute top-3 left-3 px-3 py-1 text-xs font-bold rounded-lg border backdrop-blur-md ${store.is_open
            ? 'bg-green-500/20 text-green-400 border-green-500/30'
            : 'bg-red-500/20 text-red-400 border-red-500/30'
            }`}>
            {store.is_open ? 'Aberto' : 'Fechado'}
          </div>

          {distanceKm && (
            <div className="absolute top-3 right-3 px-2 py-1 text-xs font-semibold bg-black/70 backdrop-blur text-white rounded-md border border-neutral-700">
              {distanceKm} km
            </div>
          )}
        </div>

        <div className="p-4 flex flex-col gap-3 relative flex-1">
          <h3 className="font-semibold text-lg text-white line-clamp-2 pr-2">
            {store.name}
          </h3>

          <div className="flex items-center gap-1 text-sm text-neutral-300">
            <Star className="w-3 h-3 fill-white text-white" /> {stats.ratings_avg?.toFixed(1) ?? '0.0'}
            <span className="text-neutral-500 text-xs">
              ({stats.ratings_count})
            </span>
          </div>

          <div className="flex flex-wrap gap-2 mt-1">
            {(stats.prep_time_min !== null && stats.prep_time_max !== null) && (
              <div className="text-xs px-2 py-1 rounded-md bg-neutral-900/50 border border-neutral-800/80 text-neutral-300">
                ⏱ {stats.prep_time_min}-{stats.prep_time_max} min
              </div>
            )}

            {(stats.price_min !== null && stats.price_max !== null) && (
              <div className="text-xs px-2 py-1 rounded-md bg-neutral-900/50 border border-neutral-800/80 text-green-400">
                💰 R${stats.price_min} - R${stats.price_max}
              </div>
            )}
          </div>

          <div className="mt-auto pt-3 flex gap-2">
            {storeProducts.map(p => (
              <div key={p.id} className="w-10 h-10 rounded-md border border-neutral-800 bg-neutral-900 overflow-hidden flex-shrink-0">
                {p.image_url ? (
                  <img src={p.image_url} className="w-full h-full object-cover" alt={p.name} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-neutral-800 text-[8px] text-neutral-500 text-center leading-none p-0.5 break-words">
                    {p.name.slice(0, 10)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // 🧩 PRODUCT CARD
  const renderProductCard = (product: ProductType, idx: number) => {
    const store = getStore(product.store_id)
    const distanceKm = store ? calcDistanceKm(store.location) : null
    const price = typeof product.price === 'number' ? product.price : 0

    return (
      <div
        key={product.id + idx}
        onClick={() => {
          if (store) {
            router.push(`/${store.storeSlug}/${product.slug}`)
          }
        }}
        className="group cursor-pointer rounded-2xl overflow-hidden border border-neutral-800 bg-neutral-950/80 backdrop-blur-sm hover:border-white/50 hover:-translate-y-1 transition-all duration-300 shadow-md hover:shadow-[0_0_20px_rgba(255,255,255,0.1)] flex flex-col"
      >
        <div className="relative h-40 bg-neutral-900 flex items-center justify-center overflow-hidden">
          {product.image_url ? (
            <img src={product.image_url} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt={product.name} />
          ) : (
            <span className="text-neutral-600 text-sm">Sem imagem</span>
          )}

          <div className="absolute top-2 left-2 px-2 py-1 bg-white text-black text-xs font-bold rounded-md">
            {product.type || product.category || 'Produto'}
          </div>

          {distanceKm && (
            <div className="absolute top-2 right-2 px-2 py-1 text-xs font-semibold bg-black/70 backdrop-blur text-white rounded-md border border-neutral-700">
              {distanceKm} km
            </div>
          )}
        </div>

        <div className="p-4 flex flex-col flex-1 gap-2">
          <h3 className="font-semibold text-base text-white line-clamp-2 leading-tight">
            {product.name}
          </h3>

          <p className="text-green-400 font-bold text-lg mt-auto pt-2">
            R$ {price.toFixed(2).replace('.', ',')}
          </p>

          {store && (
            <div className="flex items-center gap-2 mt-2 pt-3 border-t border-neutral-800/50">
              <div className="w-6 h-6 rounded-full bg-neutral-800 flex-shrink-0 overflow-hidden">
                {store.logo_url && <img src={store.logo_url} className="w-full h-full object-cover" alt="Logo" />}
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className="text-xs text-neutral-400 truncate">{store.name}</span>
                <div className="flex items-center gap-1 text-[10px] text-neutral-400">
                  <Star className="w-2.5 h-2.5 fill-current" /> {store.store_stats.ratings_avg?.toFixed(1) ?? '0.0'}
                  {store.store_stats.prep_time_min && (
                    <span className="text-neutral-500 ml-1">
                      • {store.store_stats.prep_time_min}m
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-neutral-900/40 via-black to-black">

      {/* CONTAINER PRINCIPAL COM PADDING RESPONSIVO */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 md:py-8">

        {/* HEADER COM TÍTULO */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
            {mode === 'produtos' ? 'Produtos e Serviços' : 'Lojas'}
          </h1>
          <p className="text-neutral-500 text-sm sm:text-base mt-1">
            Encontre o que você precisa perto de você
          </p>
        </div>

        {/* SWITCH MODE - ESTILO SEGMENTADO */}
        <div className="mb-6">
          <div className="inline-flex p-1 bg-neutral-900/80 backdrop-blur-sm border border-neutral-800 rounded-2xl">
            <button
              onClick={() => setMode('produtos')}
              className={`px-4 sm:px-6 py-2 rounded-xl text-sm sm:text-base font-semibold transition-all whitespace-nowrap ${mode === 'produtos'
                  ? 'bg-white text-black shadow-lg'
                  : 'text-neutral-400 hover:text-white hover:bg-neutral-800/50'
                }`}
            >
              📦 Produtos
            </button>
            <button
              onClick={() => setMode('lojas')}
              className={`px-4 sm:px-6 py-2 rounded-xl text-sm sm:text-base font-semibold transition-all whitespace-nowrap ${mode === 'lojas'
                  ? 'bg-white text-black shadow-lg'
                  : 'text-neutral-400 hover:text-white hover:bg-neutral-800/50'
                }`}
            >
              🏪 Lojas
            </button>
          </div>
        </div>

        {/* BARRA DE BUSCA E FILTRO */}
        <div className="flex gap-3 mb-4">
          {/* INPUT DE BUSCA */}
          <div className="flex-1 relative">
            <div className="relative group">
              <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500 group-focus-within:text-white transition-colors" />

              <input
                type="text"
                placeholder={mode === 'produtos' ? 'Buscar produtos ou serviços...' : 'Buscar lojas...'}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-11 pr-10 py-3 sm:py-3.5 bg-neutral-900/80 backdrop-blur-sm border border-neutral-700 rounded-2xl text-white placeholder:text-neutral-500 focus:outline-none focus:border-white focus:shadow-[0_0_20px_rgba(255,255,255,0.1)] transition-all"
              />

              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* BOTÃO FILTRO MOBILE */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`lg:hidden px-4 py-3 rounded-2xl border transition-all ${showFilters
                ? 'bg-white text-black border-white'
                : 'bg-neutral-900/80 text-neutral-400 border-neutral-700 hover:border-white/50'
              }`}
          >
            <Filter className="w-5 h-5" />
          </button>

          {/* FILTRO ATIVO MOBILE */}
          <div className="lg:hidden px-4 py-3 rounded-2xl bg-neutral-900/80 border border-neutral-700">
            <span className="text-sm font-medium text-white">{getActiveFilterLabel()}</span>
          </div>
        </div>

        {/* FILTROS - DESKTOP (SEMPRE VISÍVEL) / MOBILE (TOGGLE) */}
        <div className={`${showFilters ? 'block' : 'hidden'} lg:block mb-6`}>
          <div className="bg-neutral-900/40 backdrop-blur-sm rounded-2xl border border-neutral-800 p-4">
            <div className="flex items-center gap-2 mb-3 lg:hidden">
              <Filter className="w-4 h-4 text-neutral-400" />
              <span className="text-sm font-medium text-neutral-400">Ordenar por</span>
            </div>

            <div className="flex flex-wrap gap-2">
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
                    className={`group relative px-4 py-2 rounded-full text-sm font-medium border transition-all flex items-center gap-2 ${isActive
                        ? 'bg-white text-black border-white shadow-lg'
                        : 'bg-neutral-900/50 text-neutral-400 border-neutral-700 hover:bg-neutral-800 hover:text-white hover:border-neutral-500'
                      }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? 'text-black' : 'text-neutral-500 group-hover:text-white'}`} />
                    {option.label}

                    {isActive && (
                      <div className="absolute inset-0 rounded-full bg-white/20 animate-pulse" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* RESULTADOS */}
        {displayedItems.length === 0 && (
          <div className="py-20 flex flex-col items-center justify-center text-center">
            <div className="w-24 h-24 mb-6 rounded-full bg-neutral-900/50 flex items-center justify-center border border-neutral-800">
              <SearchIcon className="w-10 h-10 text-neutral-600" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Nenhum resultado encontrado</h3>
            <p className="text-neutral-500 max-w-md">
              Tente ajustar sua busca ou explorar outras categorias
            </p>
          </div>
        )}

        {/* GRID DE CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 sm:gap-6">
          {displayedItems.map((item, idx) =>
            mode === 'lojas'
              ? renderStoreCard(item, idx)
              : renderProductCard(item, idx)
          )}
        </div>

        {/* INFO E PAGINAÇÃO */}
        {displayedItems.length > 0 && (
          <>
            <div className="flex flex-col sm:flex-row justify-between items-center mt-10 mb-6 text-sm text-neutral-400 gap-3">
              <div className="bg-neutral-900/50 px-4 py-2 rounded-full border border-neutral-800">
                Mostrando {(currentPage - 1) * PAGE_SIZE + 1}-
                {Math.min(currentPage * PAGE_SIZE, totalItems)} de {totalItems} resultados
              </div>

              <div className="bg-neutral-900/50 px-4 py-2 rounded-full border border-neutral-800">
                Página {currentPage} de {totalPages}
              </div>
            </div>

            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-2 pb-10 flex-wrap">
                <button
                  disabled={currentPage === 1}
                  onClick={() => loadPage(currentPage - 1)}
                  className="w-10 h-10 flex items-center justify-center rounded-full border border-neutral-700 bg-neutral-900/80 text-sm hover:bg-neutral-800 hover:text-white hover:border-white/50 transition-all disabled:opacity-30 disabled:hover:bg-neutral-900/80 disabled:hover:text-neutral-400"
                >
                  ←
                </button>

                {Array.from({ length: totalPages }).map((_, i) => {
                  const page = i + 1

                  if (
                    page !== 1 &&
                    page !== totalPages &&
                    Math.abs(page - currentPage) > 2
                  ) {
                    if (Math.abs(page - currentPage) === 3) {
                      return <span key={page} className="text-neutral-600 px-1">...</span>
                    }
                    return null
                  }

                  return (
                    <button
                      key={page}
                      onClick={() => loadPage(page)}
                      className={`w-10 h-10 flex items-center justify-center rounded-full text-sm font-bold border transition-all ${currentPage === page
                          ? 'bg-white text-black border-white shadow-lg'
                          : 'bg-neutral-900/80 text-neutral-400 border-neutral-700 hover:bg-neutral-800 hover:text-white'
                        }`}
                    >
                      {page}
                    </button>
                  )
                })}

                <button
                  disabled={currentPage === totalPages}
                  onClick={() => loadPage(currentPage + 1)}
                  className="w-10 h-10 flex items-center justify-center rounded-full border border-neutral-700 bg-neutral-900/80 text-sm hover:bg-neutral-800 hover:text-white hover:border-white/50 transition-all disabled:opacity-30 disabled:hover:bg-neutral-900/80 disabled:hover:text-neutral-400"
                >
                  →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}