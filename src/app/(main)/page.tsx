'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { MapPin, Star, Clock, ArrowDownWideNarrow, ArrowUpNarrowWide, Search as SearchIcon, Filter, X, ChevronRight, Store, ShoppingBag } from 'lucide-react'

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

const PREVIEW_COUNT = 20

export default function Vitrine() {
  const router = useRouter()

  const [allStores, setAllStores] = useState<StoreType[]>([])
  const [allProducts, setAllProducts] = useState<ProductType[]>([])
  const [loading, setLoading] = useState(true)
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)

  const [search, setSearch] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [showAllProducts, setShowAllProducts] = useState(false)
  const [showAllStores, setShowAllStores] = useState(false)

  const [sortBy, setSortBy] = useState<
    'distance' | 'rating' | 'prepTime' | 'priceMin' | 'priceMax'
  >('distance')

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

  const getStore = (storeId: string) => allStores.find(s => s.id === storeId)

  const translateType = (type: string | null) => {
    if (!type) return null
    const t = type.toLowerCase()
    if (t === 'physical') return 'Físico'
    if (t === 'service') return 'Serviço'
    return type
  }

  // 🔥 FILTRO + ORDENAÇÃO - STORES
  const getSortedStores = () => {
    let filtered = [...allStores]

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
        case 'prepTime': return (storeA.store_stats.prep_time_min ?? 9999) - (storeB.store_stats.prep_time_min ?? 9999)
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

      setAllStores(mappedStores as any)
      setAllProducts(mappedProducts as any)

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          pos => {
            setUserLocation({
              lat: pos.coords.latitude,  // CORRIGIDO: coords (com S) ao invés de coordinates
              lng: pos.coords.longitude  // CORRIGIDO: coords (com S) ao invés de coordinates
            })
          },
          () => { }
        )
      }

      setLoading(false)
    }

    init()
  }, [])

  // Reset show-all when search/sort changes
  useEffect(() => {
    setShowAllProducts(false)
    setShowAllStores(false)
  }, [search, sortBy])

  // 🧩 STORE CARD - design destacado, completamente diferente dos produtos
  const renderStoreCard = (store: StoreType, idx: number) => {
    const stats = store.store_stats ?? {}
    const distanceKm = calcDistanceKm(store.location)
    const storeProducts = allProducts.filter(p => p.store_id === store.id).slice(0, 4)

    return (
      <div
        key={store.id + idx}
        onClick={() => router.push(`/${store.storeSlug}`)}
        className="group cursor-pointer relative overflow-hidden rounded-3xl border border-neutral-700/60 bg-gradient-to-br from-neutral-900 via-neutral-950 to-black hover:border-white/30 transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_8px_40px_rgba(255,255,255,0.08)] flex flex-col"
      >
        {/* Fundo banner da loja - imagem completa com blur gradiente no rodapé */}
        <div className="relative h-48 overflow-hidden bg-neutral-900">
          {store.logo_url ? (
            <>
              <img
                src={store.logo_url}
                className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-all duration-700"
                alt=""
              />
              {/* Gradiente no rodapé da imagem */}
              <div className="absolute bottom-0 left-0 w-full h-1/3 bg-gradient-to-t from-neutral-950 via-neutral-950/90 to-transparent" />
            </>
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-neutral-800 to-neutral-950" />
          )}

          {/* Status badge */}
          <div className={`absolute top-3 right-3 px-3 py-1 text-xs font-bold rounded-full border backdrop-blur-md z-10 ${store.is_open
            ? 'bg-green-500/20 text-green-400 border-green-500/30'
            : 'bg-red-500/20 text-red-400 border-red-500/30'
            }`}>
            {store.is_open ? '● Aberto' : '● Fechado'}
          </div>

          {distanceKm && (
            <div className="absolute top-3 left-3 px-2 py-1 text-xs font-semibold bg-black/60 backdrop-blur text-white rounded-full border border-white/10 z-10">
              <MapPin className="w-3 h-3 inline mr-1 -mt-0.5" />{distanceKm} km
            </div>
          )}
        </div>

        {/* Avatar da loja + info */}
        <div className="px-5 pb-5 flex flex-col gap-3 -mt-8 relative z-10">
          <div className="flex items-end gap-3">
            <div className="w-16 h-16 rounded-2xl border-2 border-neutral-700 bg-neutral-900 overflow-hidden shadow-xl flex-shrink-0">
              {store.logo_url ? (
                <img src={store.logo_url} className="w-full h-full object-cover" alt={store.name} />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Store className="w-6 h-6 text-neutral-500" />
                </div>
              )}
            </div>
            <div className="mb-1 flex-1 min-w-0">
              <h3 className="font-bold text-lg text-white leading-tight line-clamp-1">{store.name}</h3>
              <div className="flex items-center gap-1.5 text-xs text-neutral-400 mt-0.5">
                <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                <span className="text-yellow-400 font-semibold">{stats.ratings_avg?.toFixed(1) ?? '0.0'}</span>
                <span className="text-neutral-600">({stats.ratings_count ?? 0} avaliações)</span>
              </div>
            </div>
          </div>

          {store.description && (
            <p className="text-xs text-neutral-500 line-clamp-2 leading-relaxed">{store.description}</p>
          )}

          {/* Mini produtos da loja */}
          {storeProducts.length > 0 && (
            <div className="flex gap-2 mt-1">
              {storeProducts.map(p => (
                <div key={p.id} className="w-12 h-12 rounded-xl border border-neutral-800 bg-neutral-900 overflow-hidden flex-shrink-0 shadow-md">
                  {p.image_url ? (
                    <img src={p.image_url} className="w-full h-full object-cover" alt={p.name} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-neutral-800 text-[7px] text-neutral-500 text-center leading-none p-1">
                      {p.name.slice(0, 8)}
                    </div>
                  )}
                </div>
              ))}
              {allProducts.filter(p => p.store_id === store.id).length > 4 && (
                <div className="w-12 h-12 rounded-xl border border-neutral-700 bg-neutral-900/50 flex items-center justify-center flex-shrink-0 text-xs text-neutral-500 font-bold">
                  +{allProducts.filter(p => p.store_id === store.id).length - 4}
                </div>
              )}
            </div>
          )}

          {/* CTA */}
          <div className="flex items-center justify-between pt-2 border-t border-neutral-800/60 mt-1">
            <span className="text-xs text-neutral-500">{allProducts.filter(p => p.store_id === store.id).length} produtos</span>
            <div className="flex items-center gap-1 text-xs font-semibold text-white group-hover:gap-2 transition-all">
              Visitar loja <ChevronRight className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  // 🧩 PRODUCT CARD - SEM GRADIENTE ESCURO NA IMAGEM
  const renderProductCard = (product: ProductType, idx: number) => {
    const store = getStore(product.store_id)
    const distanceKm = store ? calcDistanceKm(store.location) : null
    const price = typeof product.price === 'number' ? product.price : 0
    const typeLabel = translateType(product.type) || product.category || 'Produto'

    return (
      <div
        key={product.id + idx}
        onClick={() => {
          if (store) {
            router.push(`/${store.storeSlug}/${product.slug}`)
          }
        }}
        className="group cursor-pointer relative isolate overflow-hidden rounded-3xl border border-neutral-700/60 bg-neutral-950 hover:border-white/30 transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_8px_40px_rgba(255,255,255,0.08)] flex flex-col"
      >
        {/* IMAGEM - SEM GRADIENTE ESCURO */}
        <div className="relative h-52 overflow-hidden bg-neutral-900">
          {product.image_url ? (
            <img
              src={product.image_url}
              className="absolute inset-0 w-full h-full object-cover transform-gpu will-change-transform group-hover:scale-110 transition-transform duration-700"
              alt={product.name}
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-neutral-800 to-neutral-950 flex items-center justify-center text-neutral-600 text-sm">
              Sem imagem
            </div>
          )}

          {/* BADGE */}
          <div className="absolute z-20 top-3 left-3 px-2.5 py-1 text-[11px] font-semibold bg-white/10 backdrop-blur-md text-white rounded-full border border-white/20">
            {typeLabel}
          </div>

          {/* DISTÂNCIA */}
          {distanceKm && (
            <div className="absolute z-20 top-3 right-3 px-2.5 py-1 text-xs font-semibold bg-black/60 backdrop-blur text-white rounded-full border border-white/10">
              {distanceKm} km
            </div>
          )}
        </div>

        {/* CONTEÚDO */}
        <div className="px-5 pb-5 pt-4 flex flex-col flex-1 gap-3 bg-neutral-950">
          <h3 className="font-bold text-base text-white leading-tight line-clamp-2 min-h-[40px]">
            {product.name}
          </h3>

          <div className="text-green-400 font-extrabold text-xl tracking-tight">
            R$ {price.toFixed(2).replace('.', ',')}
          </div>

          {store && (
            <div className="flex items-center gap-2 pt-3 border-t border-neutral-800/60">
              <div className="w-7 h-7 rounded-full bg-neutral-800 overflow-hidden border border-neutral-700">
                {store.logo_url ? (
                  <img src={store.logo_url} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[10px] text-neutral-500">
                    <Store className="w-3 h-3" />
                  </div>
                )}
              </div>

              <div className="flex flex-col overflow-hidden">
                <span className="text-xs text-neutral-300 truncate font-medium">
                  {store.name}
                </span>

                <div className="flex items-center gap-1 text-[11px] text-neutral-400">
                  <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                  <span className="text-yellow-400 font-semibold">
                    {store.store_stats.ratings_avg?.toFixed(1) ?? '0.0'}
                  </span>

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

        {/* HOVER */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none">
          <div className="absolute inset-0 bg-white/5" />
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

  const sortedProducts = getSortedProducts()
  const sortedStores = getSortedStores()

  const visibleProducts = showAllProducts ? sortedProducts : sortedProducts.slice(0, PREVIEW_COUNT)
  const visibleStores = showAllStores ? sortedStores : sortedStores.slice(0, PREVIEW_COUNT)

  const hasMoreProducts = sortedProducts.length > PREVIEW_COUNT
  const hasMoreStores = sortedStores.length > PREVIEW_COUNT

  return (
    <div className="min-h-screen bg-black bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-neutral-900/40 via-black to-black">

      {/* CONTAINER PRINCIPAL */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 md:py-8">

        {/* HEADER */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
            iUser
          </h1>
        </div>

        {/* BARRA DE BUSCA E FILTRO */}
        <div className="flex gap-3 mb-4">
          <div className="flex-1 relative">
            <div className="relative group">
              <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500 group-focus-within:text-white transition-colors" />

              <input
                type="text"
                placeholder="Buscar produtos, serviços ou lojas..."
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

        {/* FILTROS */}
        <div className={`${showFilters ? 'block' : 'hidden'} lg:block mb-8`}>
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

        {/* ═══════════════════════════════════
            SEÇÃO DE PRODUTOS - 2 colunas (mobile/tablet/desktop médio) e 4 para telas grandes
        ═══════════════════════════════════ */}
        <section className="mb-14">
          {/* Header seção produtos */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center border border-white/10">
                <ShoppingBag className="w-4 h-4 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Produtos e Serviços</h2>
                <p className="text-xs text-neutral-500">{sortedProducts.length} itens disponíveis</p>
              </div>
            </div>
            {hasMoreProducts && !showAllProducts && (
              <button
                onClick={() => setShowAllProducts(true)}
                className="flex items-center gap-1.5 text-sm font-semibold text-neutral-400 hover:text-white transition-colors group"
              >
                Ver todos ({sortedProducts.length})
                <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </button>
            )}
            {showAllProducts && (
              <button
                onClick={() => setShowAllProducts(false)}
                className="flex items-center gap-1.5 text-sm font-semibold text-neutral-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" /> Mostrar menos
              </button>
            )}
          </div>

          {sortedProducts.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center text-center rounded-2xl border border-neutral-800/50 bg-neutral-950/50">
              <ShoppingBag className="w-10 h-10 text-neutral-700 mb-3" />
              <p className="text-neutral-500 text-sm">Nenhum produto encontrado</p>
            </div>
          ) : (
            <>
              {/* Grid: 2 colunas para mobile, tablet e desktop médio | 4 colunas para desktop grande */}
              <div className="grid grid-cols-2 lg:grid-cols-2 xl:grid-cols-2 gap-3 sm:gap-4">
                {visibleProducts.map((item, idx) => renderProductCard(item, idx))}
              </div>

              {/* Botão ver todos abaixo do grid */}
              {hasMoreProducts && !showAllProducts && (
                <div className="mt-5 text-center">
                  <button
                    onClick={() => setShowAllProducts(true)}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl border border-neutral-700 bg-neutral-900/80 text-sm font-semibold text-white hover:border-white/50 hover:bg-neutral-800 transition-all"
                  >
                    Ver todos os {sortedProducts.length} produtos
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        {/* ═══════════════════════════════════
            SEÇÃO DE LOJAS — design destacado
        ═══════════════════════════════════ */}
        <section>
          {/* Divisor decorativo */}
          <div className="relative mb-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-neutral-800" />
            </div>
            <div className="relative flex justify-center">
              <div className="flex items-center gap-3 px-5 py-2.5 bg-neutral-950 border border-neutral-700 rounded-2xl shadow-lg">
                <Store className="w-4 h-4 text-neutral-300" />
                <span className="text-sm font-bold text-neutral-200 tracking-wide uppercase">Lojas</span>
                <div className="w-1.5 h-1.5 rounded-full bg-neutral-500" />
                <span className="text-xs text-neutral-500">{sortedStores.length} lojas</span>
              </div>
            </div>
          </div>

          {/* Header seção lojas */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-lg font-bold text-white">Descubra as lojas</h2>
              <p className="text-xs text-neutral-500">Explore e visite as lojas próximas</p>
            </div>
            {hasMoreStores && !showAllStores && (
              <button
                onClick={() => setShowAllStores(true)}
                className="flex items-center gap-1.5 text-sm font-semibold text-neutral-400 hover:text-white transition-colors group"
              >
                Ver todas ({sortedStores.length})
                <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </button>
            )}
            {showAllStores && (
              <button
                onClick={() => setShowAllStores(false)}
                className="flex items-center gap-1.5 text-sm font-semibold text-neutral-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" /> Mostrar menos
              </button>
            )}
          </div>

          {sortedStores.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center text-center rounded-2xl border border-neutral-800/50 bg-neutral-950/50">
              <Store className="w-10 h-10 text-neutral-700 mb-3" />
              <p className="text-neutral-500 text-sm">Nenhuma loja encontrada</p>
            </div>
          ) : (
            <>
              {/* Grid de lojas: 1 coluna mobile, 2 colunas tablet/desktop médio, 3 colunas desktop grande */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
                {visibleStores.map((item, idx) => renderStoreCard(item, idx))}
              </div>

              {/* Botão ver todas lojas */}
              {hasMoreStores && !showAllStores && (
                <div className="mt-5 text-center">
                  <button
                    onClick={() => setShowAllStores(true)}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl border border-neutral-700 bg-neutral-900/80 text-sm font-semibold text-white hover:border-white/50 hover:bg-neutral-800 transition-all"
                  >
                    Ver todas as {sortedStores.length} lojas
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </>
          )}

          <div className="pb-10" />
        </section>

      </div>
    </div>
  )
}