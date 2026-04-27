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

// Função para parsear coordenadas (suporta WKT, GeoJSON e PostGIS Hex Binary)
function parseCoords(location: any): [number, number] | null {
  if (!location) return null

  // 1. Se for string JSON, tenta parsear
  if (typeof location === 'string' && (location.startsWith('{') || location.startsWith('['))) {
    try {
      const parsed = JSON.parse(location)
      if (parsed && typeof parsed === 'object') {
        location = parsed
      }
    } catch { /* Ignora */ }
  }

  // 2. Formato GeoJSON (Objeto)
  if (location?.type === 'Point' && Array.isArray(location.coordinates)) {
    const [lng, lat] = location.coordinates
    return isFinite(lng) && isFinite(lat) ? [lng, lat] : null
  }

  // 3. Formato WKT string (ex: POINT(-46.123 -23.456))
  if (typeof location === 'string' && location.toUpperCase().includes('POINT')) {
    const match = location.match(/POINT\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/i)
    if (match) return [parseFloat(match[1]), parseFloat(match[2])]
  }

  // 4. Formato PostGIS Binary Hex (WKB/EWKB)
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

  // Começar com filtro de "Melhor avaliado" ao invés de "distância"
  const [sortBy, setSortBy] = useState<
    'distance' | 'rating' | 'prepTime' | 'priceMin' | 'priceMax'
  >('rating')

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

  const getActiveFilterIcon = () => {
    const active = filters.find(f => f.value === sortBy)
    const Icon = active?.icon || Filter
    return <Icon className="w-3.5 h-3.5" />
  }

  // Função para obter o título dinâmico baseado no filtro
  const getSectionTitle = () => {
    switch (sortBy) {
      case 'distance':
        return 'Próximos de Você'
      case 'rating':
        return 'Melhores do iUser'
      case 'priceMin':
        return 'Mais Baratos'
      case 'priceMax':
        return 'Mais Requintados'
      default:
        return 'Melhores do iUser'
    }
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
    if (t === 'physical') return 'Produto'
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

  // Reset show-all when search/sort changes
  useEffect(() => {
    setShowAllProducts(false)
    setShowAllStores(false)
  }, [search, sortBy])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-6 h-6 border-2 border-green-500/20 border-t-green-500 rounded-full animate-spin"></div>
      </div>
    )
  }

  const sortedProducts = getSortedProducts()
  const sortedStores = getSortedStores()

  const visibleProducts = showAllProducts ? sortedProducts : sortedProducts.slice(0, PREVIEW_COUNT)
  const visibleStores = showAllStores ? sortedStores : sortedStores.slice(0, PREVIEW_COUNT)

  const hasMoreProducts = sortedProducts.length > PREVIEW_COUNT
  const hasMoreStores = sortedStores.length > PREVIEW_COUNT

  const sectionTitle = getSectionTitle()

  return (
    <div className="min-h-screen bg-background font-sans">
      {/* Header Fixo no Topo - Logo e Input Colados */}
      <div className="sticky top-0 z-40 bg-background border-b border-border">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center gap-2 py-2">
            {/* Logo */}
            <div className="bg-black p-1.5 flex-shrink-0">
              <img src="/logo.png" alt="iUser" className="h-6 w-auto object-contain" />
            </div>

            {/* Search Input */}
            <div className="relative group flex-1">
              <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Procurar lojas ou produtos..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-7 py-1.5 bg-card border border-border text-foreground placeholder:text-muted-foreground text-xs focus:outline-none focus:border-green-500/50 transition-all"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Filter Button */}
            <button
              onClick={() => setShowFilters(true)}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-card border border-border text-[9px] font-black uppercase tracking-wider text-foreground hover:bg-muted transition-all"
            >
              {getActiveFilterIcon()}
              <span className="hidden sm:inline">{getActiveFilterLabel()}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Filter Modal/Popup */}
        {showFilters && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowFilters(false)}>
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity" />
            <div
              className="relative bg-card border border-border w-full sm:max-w-md mx-auto shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b border-border">
                <h3 className="text-sm font-black uppercase tracking-wider text-foreground">Ordenar por</h3>
                <button
                  onClick={() => setShowFilters(false)}
                  className="p-1 hover:bg-muted transition-colors"
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>

              <div className="p-2">
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
                      className={`w-full flex items-center gap-3 px-4 py-3 transition-all ${isActive
                        ? 'bg-green-500/10 text-green-500'
                        : 'text-foreground hover:bg-muted'
                        }`}
                    >
                      <Icon className={`w-4 h-4 ${isActive ? 'text-green-500' : 'text-muted-foreground'}`} />
                      <span className={`flex-1 text-left text-xs font-black uppercase tracking-wider ${isActive ? 'text-green-500' : 'text-foreground'}`}>
                        {option.label}
                      </span>
                      {isActive && (
                        <div className="w-1.5 h-1.5 bg-green-500" />
                      )}
                    </button>
                  )
                })}
              </div>

              <div className="p-4 border-t border-border">
                <button
                  onClick={() => {
                    setSortBy('rating')
                    setShowFilters(false)
                  }}
                  className="w-full py-2 text-[9px] font-black uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                >
                  Limpar filtros
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Lojas Section */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-baseline gap-2">
              <h2 className="text-lg font-black italic uppercase tracking-tighter text-foreground">{sectionTitle}</h2>
              <span className="text-[9px] font-black text-muted-foreground">({sortedStores.length})</span>
            </div>
            {hasMoreStores && (
              <button
                onClick={() => setShowAllStores(!showAllStores)}
                className="text-[8px] font-black text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 uppercase tracking-wider"
              >
                {showAllStores ? 'Menos' : `Ver tudo`}
                <ChevronRight className={`w-3 h-3 transition-transform duration-300 ${showAllStores ? 'rotate-90' : ''}`} />
              </button>
            )}
          </div>

          {sortedStores.length === 0 ? (
            <div className="py-12 text-center border border-dashed border-border bg-card/20">
              <Store className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-[9px] text-muted-foreground uppercase font-black tracking-wider">Nenhuma loja encontrada</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {visibleStores.map((store, idx) => {
                const stats = store.store_stats ?? {}
                const distance = calcDistanceKm(store.location)
                const distanceFormatted = formatDistance(distance)
                return (
                  <div
                    key={store.id + idx}
                    onClick={() => router.push(`/${store.profileSlug}/${store.storeSlug}`)}
                    className="group relative bg-card border border-border overflow-hidden transition-all duration-300 cursor-pointer hover:border-green-500/30 hover:shadow-lg"
                  >
                    <div className="relative h-24 bg-muted overflow-hidden">
                      {store.logo_url ? (
                        <img src={store.logo_url} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" alt={store.name} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground/20 text-xl font-black italic">{store.name?.charAt(0)}</div>
                      )}

                      <div className="absolute top-1 left-1 flex items-center gap-1 px-1.5 py-0.5 bg-background/90 border border-border/50">
                        <div className={`w-1 h-1 ${store.is_open ? 'bg-green-500' : 'bg-red-500'}`} />
                        <span className="text-[6px] font-black uppercase tracking-wider text-foreground">{store.is_open ? 'Aberto' : 'Fechado'}</span>
                      </div>

                      {distanceFormatted && (
                        <div className="absolute top-1 right-1 px-1.5 py-0.5 bg-background/90 border border-border/50 flex items-center gap-0.5">
                          <MapPin className="w-2 h-2 text-muted-foreground" />
                          <span className="text-[6px] font-black text-foreground">{distanceFormatted}</span>
                        </div>
                      )}
                    </div>

                    <div className="p-2">
                      <h3 className="text-xs font-black uppercase tracking-tighter text-foreground mb-0.5 truncate">{store.name}</h3>
                      <div className="flex items-center gap-1 mb-1.5">
                        <div className="flex items-center gap-0.5">
                          <Star className="w-2.5 h-2.5 text-yellow-500 fill-yellow-500" />
                          <span className="text-[9px] font-black text-foreground/80">{stats.ratings_avg?.toFixed(1) ?? '0.0'}</span>
                        </div>
                        <span className="text-[7px] text-muted-foreground font-bold">({stats.ratings_count ?? 0})</span>
                      </div>

                      <div className="flex items-center justify-between pt-1.5 border-t border-border">
                        <div className="flex -space-x-1">
                          {allProducts.filter(p => p.store_id === store.id).slice(0, 2).map(p => (
                            <div key={p.id} className="w-5 h-5 bg-muted border border-card overflow-hidden">
                              {p.image_url ? (
                                <img src={p.image_url} className="w-full h-full object-cover" alt="" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-[5px] text-muted-foreground/40 font-black">{p.name.charAt(0)}</div>
                              )}
                            </div>
                          ))}
                        </div>
                        <span className="text-[7px] font-black text-muted-foreground group-hover:text-green-500 transition-colors uppercase tracking-wider">Entrar →</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Produtos Section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-baseline gap-2">
              <h2 className="text-lg font-black italic uppercase tracking-tighter text-foreground">Produtos e Serviços</h2>
              <span className="text-[9px] font-black text-muted-foreground">({sortedProducts.length})</span>
            </div>
            {hasMoreProducts && (
              <button
                onClick={() => setShowAllProducts(!showAllProducts)}
                className="text-[8px] font-black text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 uppercase tracking-wider"
              >
                {showAllProducts ? 'Menos' : 'Ver tudo'}
                <ChevronRight className={`w-3 h-3 transition-transform duration-300 ${showAllProducts ? 'rotate-90' : ''}`} />
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {visibleProducts.map((product, idx) => {
              const store = getStore(product.store_id)
              const distance = store ? calcDistanceKm(store.location) : null
              const distanceFormatted = formatDistance(distance)
              const price = typeof product.price === 'number' ? product.price : 0
              const typeLabel = translateType(product.type) || product.category || 'Produto'

              return (
                <div
                  key={product.id + idx}
                  onClick={() => store && router.push(`/${store.profileSlug}/${store.storeSlug}/${product.slug || product.id}`)}
                  className="group relative bg-card border border-border overflow-hidden transition-all duration-300 cursor-pointer hover:border-green-500/30 hover:shadow-lg"
                >
                  <div className="relative aspect-square bg-muted overflow-hidden border-b border-border/50">
                    {product.image_url ? (
                      <img src={product.image_url} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" alt={product.name} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-muted">
                        <ShoppingBag className="w-6 h-6 text-muted-foreground/20" />
                      </div>
                    )}

                    <div className="absolute top-1 left-1">
                      <div className="bg-background/90 border border-border/50 px-1 py-0.5 text-[6px] font-black uppercase tracking-wider text-foreground">
                        {typeLabel}
                      </div>
                    </div>

                    {distanceFormatted && (
                      <div className="absolute bottom-1 right-1">
                        <div className="flex items-center gap-0.5 px-1 py-0.5 bg-background/90 border border-border/50">
                          <MapPin className="w-2 h-2 text-muted-foreground" />
                          <span className="text-[6px] font-black text-foreground">{distanceFormatted}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="p-2">
                    <h4 className="font-black text-foreground mb-0.5 line-clamp-1 text-[10px] uppercase tracking-tighter">{product.name}</h4>

                    {store && (
                      <div className="flex items-center gap-1 mb-1.5 opacity-60">
                        <div className="w-3 h-3 bg-muted overflow-hidden border border-border/50">
                          {store.logo_url ? (
                            <img src={store.logo_url} className="w-full h-full object-cover" alt="" />
                          ) : (
                            <Store className="w-1.5 h-1.5 text-muted-foreground/30" />
                          )}
                        </div>
                        <span className="text-[6px] font-black uppercase tracking-wider text-muted-foreground truncate">{store.name}</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1.5 border-t border-border">
                      <span className="text-xs font-black text-foreground italic">R$ {price.toFixed(2).replace('.', ',')}</span>
                      <div className="w-5 h-5 bg-foreground text-background flex items-center justify-center transition-transform duration-300 group-hover:scale-110 group-hover:bg-green-500">
                        <Plus className="w-2.5 h-2.5" />
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