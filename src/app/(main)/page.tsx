'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { MapPin, Star, Clock, ArrowDownWideNarrow, ArrowUpNarrowWide, Search as SearchIcon, Filter, X, ChevronRight, Store, ShoppingBag, Plus } from 'lucide-react'

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

const PREVIEW_COUNT = 20

// Função para parsear coordenadas (suporta WKT e GeoJSON)
function parseCoords(location: any): [number, number] | null {
  if (!location) return null

  // Se for string JSON, tenta parsear
  if (typeof location === 'string') {
    try {
      location = JSON.parse(location)
    } catch {
      // Continua para outros checks
    }
  }

  // Formato GeoJSON
  if (location?.type === 'Point' && Array.isArray(location.coordinates)) {
    const [lng, lat] = location.coordinates
    return isFinite(lng) && isFinite(lat) ? [lng, lat] : null
  }

  // Fallback para WKT string
  if (typeof location === 'string') {
    const match = location.match(/POINT\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/i)
    return match ? [parseFloat(match[1]), parseFloat(match[2])] : null
  }

  return null
}

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
    { label: 'Menor valor', value: 'priceMin', icon: ArrowDownWideNarrow },
    { label: 'Maior valor', value: 'priceMax', icon: ArrowUpNarrowWide },
  ]

  const getActiveFilterLabel = () => {
    const active = filters.find(f => f.value === sortBy)
    return active ? active.label : 'Filtrar'
  }

  // 📍 DISTÂNCIA - USANDO PARSE COORDENADAS ROBUSTO
  const calcDistanceKm = (storeLocation: any): number | null => {
    if (!userLocation || !storeLocation) return null

    const coords = parseCoords(storeLocation)
    if (!coords) return null

    const [lon, lat] = coords

    const toRad = (v: number) => (v * Math.PI) / 180
    const R = 6371 // Raio da Terra em km

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

  // Função para formatar distância
  const formatDistance = (distance: number | null): string | null => {
    if (distance === null) return null

    if (distance < 1) {
      // Menos de 1km, mostrar em metros
      const meters = Math.round(distance * 1000)
      return `${meters}m`
    } else {
      // Mais de 1km, mostrar em km com 1 casa decimal
      return `${distance.toFixed(1)}km`
    }
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

      // Fetch usando as views _geo (idêntico ao MapPage) para trazer as coordenadas em formato legível
      const { data: storesList } = await supabase
        .from('stores_geo')
        .select('*')

      const { data: profilesList } = await supabase
        .from('profiles')
        .select('id, "profileSlug"')

      const { data: productsList } = await supabase
        .from('products_geo')
        .select('*')

      const mappedProducts = (productsList || []).map(product => ({
        ...product,
        image_url: product.image_url ? supabase.storage.from('product-images').getPublicUrl(product.image_url).data.publicUrl : null,
        price: typeof product.price === 'string' ? parseFloat(product.price) : typeof product.price === 'number' ? product.price : null
      }))

      const mappedStores = (storesList || []).map(store => {
        const prof = (profilesList || []).find(p => p.id === store.owner_id)

        // Verifica todos os produtos desta loja para calcular preço mínimo e máximo
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

  // 🧩 STORE CARD - COM DISTÂNCIA
  const renderStoreCard = (store: StoreType, idx: number) => {
    const stats = store.store_stats ?? {}
    const distance = calcDistanceKm(store.location)
    const distanceFormatted = formatDistance(distance)
    const storeProducts = allProducts.filter(p => p.store_id === store.id).slice(0, 4)

    return (
      <div
        key={store.id + idx}
        onClick={() => router.push(`/${store.profileSlug}/${store.storeSlug}`)}
        className="group cursor-pointer relative overflow-hidden rounded-3xl border border-neutral-700/60 bg-neutral-950 hover:border-white/30 transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_8px_40px_rgba(255,255,255,0.08)] flex flex-col"
      >
        {/* Fundo banner da loja */}
        <div className="relative h-48 overflow-hidden bg-neutral-900">
          {store.logo_url ? (
            <img
              src={store.logo_url}
              className="absolute inset-0 w-full h-full object-cover bg-white"
              alt={store.name}
            />
          ) : (
            <div className="w-full h-full bg-neutral-900" />
          )}


          {/* Status badge */}
          <div className={`absolute top-3 right-3 px-3 py-1 text-xs font-bold rounded-full z-10 ${store.is_open
            ? 'bg-green-600 text-white'
            : 'bg-red-600 text-white'
            }`}>
            {store.is_open ? 'Aberto' : 'Fechado'}
          </div>

          {/* DISTÂNCIA - DESTAQUE */}
          {distanceFormatted && (
            <div className="absolute top-3 left-3 px-2.5 py-1.5 text-xs font-bold bg-black/70 backdrop-blur-md text-white rounded-full border border-white/20 z-10 flex items-center gap-1.5 shadow-lg">
              <MapPin className="w-3 h-3 text-white" />
              <span>{distanceFormatted}</span>
            </div>
          )}
        </div>

        {/* Avatar da loja + info */}
        <div className="px-5 pb-5 pt-5 flex flex-col gap-3 relative z-10">
          <div className="hidden">
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

                {/* DISTÂNCIA NA LINHA DE INFO TAMBÉM */}
                {distanceFormatted && (
                  <>
                    <span className="text-neutral-600">•</span>
                    <span className="text-neutral-400 flex items-center gap-0.5">
                      <MapPin className="w-2.5 h-2.5" />
                      {distanceFormatted}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="mb-1 flex-1 min-w-0">
            <h3 className="font-bold text-lg text-white leading-tight line-clamp-1">{store.name}</h3>
            <div className="flex items-center gap-1.5 text-xs text-neutral-400 mt-0.5">
              <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
              <span className="text-yellow-400 font-semibold">{stats.ratings_avg?.toFixed(1) ?? '0.0'}</span>
              <span className="text-neutral-600">({stats.ratings_count ?? 0} avaliações)</span>
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

  // 🧩 PRODUCT CARD - COM DISTÂNCIA
  const renderProductCard = (product: ProductType, idx: number) => {
    const store = getStore(product.store_id)
    const distance = store ? calcDistanceKm(store.location) : null
    const distanceFormatted = formatDistance(distance)
    const price = typeof product.price === 'number' ? product.price : 0
    const typeLabel = translateType(product.type) || product.category || 'Produto'

    return (
      <div
        key={product.id + idx}
        onClick={() => {
          if (store) {
            router.push(`/${store.profileSlug}/${store.storeSlug}/${product.slug}`)
          }
        }}
        className="group cursor-pointer relative isolate overflow-hidden rounded-3xl border border-neutral-700/60 bg-neutral-950 hover:border-white/30 transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_8px_40px_rgba(255,255,255,0.08)] flex flex-col"
      >
        {/* IMAGEM */}
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
          {distanceFormatted && (
            <div className="absolute z-20 top-3 right-3 px-2.5 py-1 text-xs font-bold bg-black/70 backdrop-blur-md text-white rounded-full border border-white/20 flex items-center gap-1 shadow-lg">
              <MapPin className="w-3 h-3" />
              <span>{distanceFormatted}</span>
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
              <div className="w-8 h-8 rounded-lg border border-neutral-800 bg-black overflow-hidden shadow-sm flex-shrink-0">
                {store.logo_url ? (
                  <img src={store.logo_url} className="w-full h-full object-cover" alt={store.name} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[10px] text-neutral-500">
                    <Store className="w-4 h-4" />
                  </div>
                )}
              </div>

              <div className="flex flex-col overflow-hidden flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-neutral-300 truncate font-medium">
                    {store.name}
                  </span>

                  {/* DISTÂNCIA NA LINHA DA LOJA */}
                  {distanceFormatted && (
                    <span className="text-[10px] text-neutral-400 flex items-center gap-0.5 ml-2">
                      <MapPin className="w-2.5 h-2.5" />
                      {distanceFormatted}
                    </span>
                  )}
                </div>

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
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
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
    <div className="relative min-h-screen bg-background text-foreground font-sans selection:bg-primary selection:text-white overflow-x-hidden">
      {/* Background Glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-primary/10 blur-[130px] rounded-full animate-pulse" />
        <div className="absolute bottom-[10%] right-[-10%] w-[50%] h-[50%] bg-secondary/10 dark:bg-purple-600/10 blur-[120px] rounded-full" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[radial-gradient(circle_at_center,hsl(var(--foreground)/0.015)_1px,transparent_1px)] bg-[size:40px_40px]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Header Section */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-12 sm:mb-20">
          <div className="space-y-4">
            <h1 className="text-6xl md:text-8xl font-black tracking-tighter italic uppercase text-foreground leading-[0.8]">
              iUser<span className="text-primary">.</span>
            </h1>

          </div>

          <div className="flex flex-col gap-4 w-full md:w-auto">
            <div className="relative group">
              <SearchIcon className="absolute left-5 top-1/2 -translate-y-1/2 w-6 h-6 text-muted-foreground group-focus-within:text-foreground transition-all duration-300" />
              <input
                type="text"
                placeholder="O que você está procurando hoje?"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full md:w-[400px] pl-14 pr-12 py-5 bg-card dark:bg-neutral-900/40 backdrop-blur-xl border border-border dark:border-white/5 rounded-[32px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground/20 focus:ring-4 focus:ring-foreground/5 transition-all duration-500 appearance-none shadow-xl shadow-black/5 dark:shadow-none"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Categories / Filters Bar */}
        <nav className="mb-16 overflow-x-auto no-scrollbar scroll-smooth">
          <div className="flex items-center gap-3 pb-4">
            {filters.map((option) => {
              const Icon = option.icon
              const isActive = sortBy === option.value
              return (
                <button
                  key={option.value}
                  onClick={() => setSortBy(option.value as any)}
                  className={`flex-shrink-0 flex items-center gap-3 px-8 py-4 rounded-full text-xs font-black uppercase tracking-widest border transition-all duration-500 shadow-xl dark:shadow-none ${isActive
                    ? 'bg-card dark:bg-white text-foreground dark:text-black border-foreground dark:border-white shadow-[0_15px_30px_rgba(0,0,0,0.1)] dark:shadow-[0_15px_30px_rgba(255,255,255,0.15)] active:scale-95'
                    : 'bg-card dark:bg-neutral-950/50 text-muted-foreground border-transparent dark:border-white/5 hover:border-foreground/20 dark:hover:border-white/20 hover:text-foreground dark:hover:text-white'
                    }`}
                >
                  <Icon className="w-4 h-4" />
                  {option.label}
                </button>
              )
            })}
          </div>
        </nav>

        {/* Lojas Section */}
        <section className="mb-24">
          <div className="flex items-end justify-between mb-10 gap-4">
            <div className="space-y-2">
              <h2 className="text-4xl md:text-5xl font-black italic uppercase tracking-tighter text-foreground">Próximos de Você</h2>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">{sortedStores.length} lojas encontradas</p>
              </div>
            </div>
            {hasMoreStores && (
              <button
                onClick={() => setShowAllStores(!showAllStores)}
                className="group flex items-center gap-2 text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
              >
                {showAllStores ? 'Ver Menos' : `Ver Todas (${sortedStores.length})`}
                <ChevronRight className={`w-4 h-4 transition-transform duration-300 ${showAllStores ? 'rotate-90' : 'group-hover:translate-x-1'}`} />
              </button>
            )}
          </div>

          {sortedStores.length === 0 ? (
            <div className="py-24 text-center rounded-[40px] border border-dashed border-border bg-card/50">
              <Store className="w-16 h-16 text-muted-foreground/30 mx-auto mb-6" />
              <p className="text-muted-foreground text-xl font-bold uppercase italic tracking-wider">Nenhuma loja encontrada na sua região</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {visibleStores.map((store, idx) => {
                const stats = store.store_stats ?? {}
                const distance = calcDistanceKm(store.location)
                const distanceFormatted = formatDistance(distance)
                return (
                  <div
                    key={store.id + idx}
                    onClick={() => router.push(`/${store.profileSlug}/${store.storeSlug}`)}
                    className="group relative flex flex-col bg-card border border-border dark:border-white/5 rounded-[40px] overflow-hidden transition-all duration-500 hover:border-foreground/10 dark:hover:border-white/10 hover:-translate-y-2 cursor-pointer shadow-xl shadow-black/5 dark:shadow-none"
                  >
                    <div className="relative h-48 bg-muted dark:bg-neutral-950 overflow-hidden">
                      {store.logo_url ? (
                        <img src={store.logo_url} className="w-full h-full object-cover grayscale-[0.3] dark:grayscale-[0.5] group-hover:grayscale-0 transition-all duration-700 group-hover:scale-110" alt={store.name} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground/20 text-6xl font-black italic">{store.name?.charAt(0)}</div>
                      )}

                      <div className="absolute top-6 left-6 flex items-center gap-2 px-4 py-2 bg-background/60 backdrop-blur-xl border border-border dark:border-white/10 rounded-2xl z-20">
                        <div className={`w-2 h-2 rounded-full ${store.is_open ? 'bg-green-500' : 'bg-red-500'}`} />
                        <span className="text-[10px] font-black uppercase tracking-widest text-foreground">{store.is_open ? 'Aberta' : 'Fechada'}</span>
                      </div>

                      {distanceFormatted && (
                        <div className="absolute top-6 right-6 px-4 py-2 bg-foreground text-background font-black rounded-2xl z-20 shadow-2xl flex items-center gap-1.5 grayscale group-hover:grayscale-0 transition-all">
                          <MapPin className="w-3.5 h-3.5" />
                          <span className="text-[10px] uppercase tracking-tighter">{distanceFormatted}</span>
                        </div>
                      )}
                    </div>

                    <div className="p-8 space-y-6">
                      <div className="space-y-2">
                        <h3 className="text-3xl font-black italic uppercase tracking-tighter text-foreground group-hover:text-primary transition-colors truncate">{store.name}</h3>
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-1.5">
                            <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
                            <span className="text-sm font-black text-foreground italic">{stats.ratings_avg?.toFixed(1) ?? '0.0'}</span>
                          </div>
                          <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{stats.ratings_count ?? 0} Avaliações</div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-6 border-t border-border">
                        <div className="flex -space-x-4">
                          {allProducts.filter(p => p.store_id === store.id).slice(0, 4).map(p => (
                            <div key={p.id} className="w-12 h-12 rounded-2xl bg-muted border-4 border-card ring-1 ring-border overflow-hidden shadow-2xl">
                              {p.image_url ? (
                                <img src={p.image_url} className="w-full h-full object-cover" alt="" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground font-black italic">{p.name.charAt(0)}</div>
                              )}
                            </div>
                          ))}
                          {allProducts.filter(p => p.store_id === store.id).length > 4 && (
                            <div className="w-12 h-12 rounded-2xl bg-muted border-4 border-card ring-1 ring-border flex items-center justify-center text-[10px] font-black italic text-muted-foreground">
                              +{allProducts.filter(p => p.store_id === store.id).length - 4}
                            </div>
                          )}
                        </div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground group-hover:text-foreground transition-colors">Visitar Vitrine &rarr;</div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Produtos Section */}
        <section className="pb-20">
          <div className="flex items-end justify-between mb-10 gap-4">
            <div className="space-y-2">
              <h2 className="text-4xl md:text-5xl font-black italic uppercase tracking-tighter text-foreground">Produtos ou serviços</h2>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">{sortedProducts.length} itens disponíveis</p>
              </div>
            </div>
            {hasMoreProducts && (
              <button
                onClick={() => setShowAllProducts(!showAllProducts)}
                className="group flex items-center gap-2 text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
              >
                {showAllProducts ? 'Ver Menos' : `Ver Todos (${sortedProducts.length})`}
                <ChevronRight className={`w-4 h-4 transition-transform duration-300 ${showAllProducts ? 'rotate-90' : 'group-hover:translate-x-1'}`} />
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            {visibleProducts.map((product, idx) => {
              const store = getStore(product.store_id)
              const distance = store ? calcDistanceKm(store.location) : null
              const distanceFormatted = formatDistance(distance)
              const price = typeof product.price === 'number' ? product.price : 0
              const typeLabel = translateType(product.type) || product.category || 'Item'

              return (
                <div
                  key={product.id + idx}
                  onClick={() => store && router.push(`/${store.profileSlug}/${store.storeSlug}/${product.slug}`)}
                  className="group relative flex flex-col bg-card border border-border dark:border-white/5 rounded-[36px] overflow-hidden transition-all duration-500 hover:border-foreground/10 dark:hover:border-white/10 hover:-translate-y-2 cursor-pointer shadow-xl shadow-black/5 dark:shadow-none"
                >
                  <div className="relative aspect-[4/5] bg-muted dark:bg-neutral-950 overflow-hidden">
                    {product.image_url ? (
                      <img src={product.image_url} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" alt={product.name} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-muted dark:bg-neutral-900 overflow-hidden group-hover:scale-110 transition-all duration-700 relative">
                        {store?.logo_url ? (
                          <img src={store.logo_url} className="w-[60%] h-[60%] object-contain opacity-40 blur-sm" alt="" />
                        ) : (
                          <div className="text-muted-foreground/20 text-4xl font-black italic">ITEM</div>
                        )}
                        <div className="absolute inset-0 flex items-center justify-center bg-foreground/5 dark:bg-black/40">
                          <span className="text-foreground/40 dark:text-white/60 text-sm font-black italic uppercase tracking-widest">{product.name.slice(0, 10)}...</span>
                        </div>
                      </div>
                    )}

                    <div className="absolute top-5 left-5 z-10">
                      <div className="bg-background/60 backdrop-blur-md border border-border dark:border-white/10 px-4 py-1.5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-foreground">
                        {typeLabel}
                      </div>
                    </div>

                    {distanceFormatted && (
                      <div className="absolute bottom-5 right-5 z-10">
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-foreground/10 dark:bg-white/10 backdrop-blur-xl border border-border dark:border-white/10 rounded-xl text-[10px] font-black uppercase text-foreground dark:text-white">
                          <MapPin className="w-3 h-3" /> {distanceFormatted}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="p-7 space-y-4">
                    <div className="space-y-1">
                      <h4 className="text-lg font-black italic uppercase tracking-tighter text-foreground group-hover:text-primary transition-colors truncate">{product.name}</h4>
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-md overflow-hidden bg-muted dark:bg-black border border-border dark:border-white/5 flex-shrink-0">
                          {store?.logo_url ? (
                            <img src={store.logo_url} className="w-full h-full object-cover" alt="" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-muted dark:bg-neutral-900"><Store className="w-3 h-3 text-muted-foreground/30" /></div>
                          )}
                        </div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground truncate">{store?.name || 'Loja Parceira'}</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-border">
                      <span className="text-2xl font-black italic tracking-tighter text-foreground">R$ {price.toFixed(2).replace('.', ',')}</span>
                      <div className="w-10 h-10 rounded-2xl bg-foreground text-background flex items-center justify-center shadow-2xl transition-transform duration-300 group-hover:scale-110">
                        <Plus className="w-5 h-5" />
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}
