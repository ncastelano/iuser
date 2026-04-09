'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

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
}

export default function Vitrine() {
  const router = useRouter()

  const [mode, setMode] = useState<SearchMode>('lojas')
  const [displayedItems, setDisplayedItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)

  const [search, setSearch] = useState('')

  const [sortBy, setSortBy] = useState<
    'distance' | 'rating' | 'prepTime' | 'priceMin' | 'priceMax'
  >('distance')

  const [currentPage, setCurrentPage] = useState(1)

  const PAGE_SIZE = 30
  const allMockStoresRef = useRef<StoreType[]>([])
  const allMockProductsRef = useRef<ProductType[]>([])

  // 🔍 PLACEHOLDER DINÂMICO
  const getSearchPlaceholder = () => {
    const isLoja = mode === 'lojas'
    switch (sortBy) {
      case 'distance':
        return isLoja ? 'Procurar loja mais próxima' : 'Procurar produto ou serviço mais próximo'
      case 'rating':
        return isLoja ? 'Procurar loja melhor avaliada' : 'Procurar produto ou serviço melhor avaliado'
      case 'prepTime':
        return isLoja ? 'Procurar loja mais rápida' : 'Procurar produto ou serviço com preparo rápido'
      case 'priceMin':
        return isLoja ? 'Procurar loja mais barata' : 'Procurar produto mais barato'
      case 'priceMax':
        return isLoja ? 'Procurar loja requintada' : 'Procurar produto mais caro'
      default:
        return isLoja ? 'Procurar loja' : 'Procurar produto'
    }
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
      } else {
        // Just load without location immediately
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

    // Pegar até 3 produtos dessa loja
    const storeProducts = allMockProductsRef.current.filter(p => p.store_id === store.id).slice(0, 3)

    return (
      <div
        key={store.id + idx}
        onClick={() => router.push(`/${store.storeSlug}`)}
        className="group cursor-pointer rounded-2xl overflow-hidden border border-neutral-800 bg-neutral-950/80 backdrop-blur-sm hover:border-orange-500/50 hover:-translate-y-1 transition-all duration-300 shadow-md hover:shadow-orange-500/10 flex flex-col"
      >
        <div className="relative h-48 bg-neutral-900 flex items-center justify-center overflow-hidden">
          {store.logo_url ? (
            <img src={store.logo_url} className="w-full h-full object-cover opacity-80 group-hover:scale-105 transition-transform duration-500" alt={store.name} />
          ) : (
            <span className="text-neutral-600 text-sm">Sem imagem</span>
          )}

          <div className={`absolute top-3 left-3 px-3 py-1 text-xs font-bold rounded-lg border ${store.is_open
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

          <div className="flex items-center gap-1 text-sm text-orange-400">
            ★ {stats.ratings_avg?.toFixed(1) ?? '0.0'}
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

    // ✅ GARANTE PREÇO VÁLIDO
    const price = typeof product.price === 'number' ? product.price : 0

    return (
      <div
        key={product.id + idx}
        onClick={() => {
          if (store) {
            router.push(`/${store.storeSlug}/${product.id}`)
          }
        }}
        className="group cursor-pointer rounded-2xl overflow-hidden border border-neutral-800 bg-neutral-950/80 backdrop-blur-sm hover:border-orange-500/50 hover:-translate-y-1 transition-all duration-300 shadow-md hover:shadow-orange-500/10 flex flex-col"
      >
        <div className="relative h-40 bg-neutral-900 flex items-center justify-center overflow-hidden">
          {product.image_url ? (
            <img src={product.image_url} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt={product.name} />
          ) : (
            <span className="text-neutral-600 text-sm">Sem imagem</span>
          )}

          <div className="absolute top-2 left-2 px-2 py-1 bg-orange-500 text-black text-xs font-bold rounded-md">
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

          {/* ✅ PREÇO SEGURO */}
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
                <div className="flex items-center gap-1 text-[10px] text-orange-400">
                  ★ {store.store_stats.ratings_avg?.toFixed(1) ?? '0.0'}
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
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 text-white bg-black min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-neutral-900/40 via-black to-black">

      {/* HEADER */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-8 gap-4">

        {/* BUSCA */}
        <div className="flex-1 max-w-xl">
          <div className="flex items-center gap-2 bg-neutral-900/80 backdrop-blur-md px-4 py-3 rounded-full border border-neutral-800 focus-within:border-orange-500 focus-within:shadow-[0_0_15px_rgba(249,115,22,0.15)] transition-all">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-5 h-5 text-neutral-400 group-focus-within:text-orange-500 transition-colors"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 100-15 7.5 7.5 0 000 15z" />
            </svg>

            <input
              type="text"
              placeholder={getSearchPlaceholder()}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent w-full text-sm text-white placeholder:text-neutral-500 focus:outline-none"
            />

            {search && (
              <button
                onClick={() => setSearch('')}
                className="text-neutral-400 hover:text-white text-sm"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4">
        </div>
      </div>

      {/* TABS (LOJAS / PRODUTOS) */}
      <div className="flex items-center gap-2 mb-6 p-1 bg-neutral-900/60 backdrop-blur-sm border border-neutral-800 rounded-2xl w-fit">
        <button
          onClick={() => setMode('lojas')}
          className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${mode === 'lojas'
            ? 'bg-orange-500 text-black shadow-md'
            : 'text-neutral-400 hover:text-white hover:bg-neutral-800/50'
            }`}
        >
          Lojas
        </button>
        <button
          onClick={() => setMode('produtos')}
          className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${mode === 'produtos'
            ? 'bg-orange-500 text-black shadow-md'
            : 'text-neutral-400 hover:text-white hover:bg-neutral-800/50'
            }`}
        >
          Produtos e Serviços
        </button>
      </div>

      {/* FILTROS */}
      <div className="flex gap-2 flex-wrap mb-8 pb-4 border-b border-neutral-800">
        {[
          { label: 'Mais próximo', value: 'distance', icon: '📍' },
          { label: 'Melhor avaliado', value: 'rating', icon: '⭐' },
          { label: 'Menor tempo', value: 'prepTime', icon: '⏱' },
          { label: 'Menor valor', value: 'priceMin', icon: '📉' },
          { label: 'Maior valor', value: 'priceMax', icon: '📈' },
        ].map(option => (
          <button
            key={option.value}
            onClick={() => setSortBy(option.value as any)}
            className={`px-4 py-2 rounded-full text-xs sm:text-sm font-medium border flex items-center gap-2 transition-all ${sortBy === option.value
              ? 'bg-orange-500/10 text-orange-400 border-orange-500/50 shadow-[0_0_10px_rgba(249,115,22,0.1)]'
              : 'bg-neutral-900/50 text-neutral-400 border-neutral-800 hover:bg-neutral-800'
              }`}
          >
            <span>{option.icon}</span>
            {option.label}
          </button>
        ))}
      </div>

      {/* LISTA VAZIA */}
      {displayedItems.length === 0 && (
        <div className="py-20 flex flex-col items-center justify-center text-center text-neutral-500">
          <div className="text-4xl mb-4">🔍</div>
          <h3 className="text-xl font-bold text-white mb-2">Nenhum resultado</h3>
          <p>Tente ajustar a sua busca ou filtros.</p>
        </div>
      )}

      {/* GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
        {displayedItems.map((item, idx) =>
          mode === 'lojas'
            ? renderStoreCard(item, idx)
            : renderProductCard(item, idx)
        )}
      </div>

      {/* INFO */}
      {displayedItems.length > 0 && (
        <div className="flex flex-col sm:flex-row justify-between items-center mt-12 mb-4 text-sm text-neutral-400 gap-4">
          <span>
            Mostrando {(currentPage - 1) * PAGE_SIZE + 1}-
            {Math.min(currentPage * PAGE_SIZE, totalItems)} de {totalItems} resultados
          </span>

          <span>
            Página {currentPage} de {totalPages}
          </span>
        </div>
      )}

      {/* PAGINAÇÃO */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 pb-10 flex-wrap">
          <button
            disabled={currentPage === 1}
            onClick={() => loadPage(currentPage - 1)}
            className="w-10 h-10 flex items-center justify-center rounded-full border border-neutral-800 bg-neutral-900 text-sm hover:bg-neutral-800 hover:text-orange-400 transition-colors disabled:opacity-30 disabled:hover:bg-neutral-900 disabled:hover:text-white"
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
                  ? 'bg-orange-500 text-black border-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.2)]'
                  : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:bg-neutral-800 hover:text-white'
                  }`}
              >
                {page}
              </button>
            )
          })}

          <button
            disabled={currentPage === totalPages}
            onClick={() => loadPage(currentPage + 1)}
            className="w-10 h-10 flex items-center justify-center rounded-full border border-neutral-800 bg-neutral-900 text-sm hover:bg-neutral-800 hover:text-orange-400 transition-colors disabled:opacity-30 disabled:hover:bg-neutral-900 disabled:hover:text-white"
          >
            →
          </button>
        </div>
      )}
    </div>
  )
}
