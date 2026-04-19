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

  // Começar com filtro de "Melhor avaliado" ao invés de "distância"
  const [sortBy, setSortBy] = useState<
    'distance' | 'rating' | 'prepTime' | 'priceMin' | 'priceMax'
  >('rating') // Alterado de 'distance' para 'rating'

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
    return <Icon className="w-4 h-4" />
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
      try {
        const supabase = createClient()

        const [{ data: storesList, error: sErr }, { data: profilesList, error: prErr }, { data: productsList, error: pErr }] = await Promise.all([
          supabase.from('stores_geo').select('*'),
          supabase.from('profiles').select('id, "profileSlug"'),
          supabase.from('products_geo').select('*')
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-4 border-gray-300 border-t-gray-600 rounded-full animate-spin"></div>
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Header Section - Compacto */}
        <header className="mb-8">
          <div className="flex items-center gap-3">
            {/* Logo - Verde e Branco */}
            <div className="bg-black p-2 rounded-xl shadow-lg">
              <img src="/logo.png" alt="iUser" className="h-8 w-auto object-contain brightness-0 invert" />
            </div>
            {/* Search Input */}
            <div className="relative group flex-1">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Procurar produtos ou serviços..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-8 py-2 bg-card border border-border rounded-lg text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all duration-300 shadow-sm"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter Button */}
            <button
              onClick={() => setShowFilters(true)}
              className="flex-shrink-0 flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-lg text-sm font-medium text-foreground hover:bg-muted transition-all duration-300 shadow-sm"
            >
              {getActiveFilterIcon()}
              <span className="hidden sm:inline">{getActiveFilterLabel()}</span>
            </button>
          </div>
        </header>

        {/* Filter Modal/Popup */}
        {showFilters && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={() => setShowFilters(false)}>
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity" />
            <div
              className="relative bg-card rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md mx-4 sm:mx-auto shadow-2xl transform transition-all duration-300 animate-in slide-in-from-bottom sm:slide-in-from-bottom-0"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header do Popup */}
              <div className="flex items-center justify-between p-4 border-b border-border">
                <h3 className="text-lg font-semibold text-foreground">Ordenar por</h3>
                <button
                  onClick={() => setShowFilters(false)}
                  className="p-1 rounded-lg hover:bg-muted transition-colors"
                >
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>

              {/* Opções de Filtro */}
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
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${isActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-foreground hover:bg-muted'
                        }`}
                    >
                      <Icon className={`w-5 h-5 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                      <span className={`flex-1 text-left font-medium ${isActive ? 'text-primary' : 'text-foreground'}`}>
                        {option.label}
                      </span>
                      {isActive && (
                        <div className="w-2 h-2 rounded-full bg-primary" />
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Footer com botão de limpar */}
              <div className="p-4 border-t border-border">
                <button
                  onClick={() => {
                    setSortBy('rating') // Mudado para 'rating' ao invés de 'distance'
                    setShowFilters(false)
                  }}
                  className="w-full py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  Limpar filtros
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Lojas Section - Título Dinâmico */}
        <section className="mb-16">
          <div className="flex items-end justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-foreground">{sectionTitle}</h2>
              <p className="text-xs text-muted-foreground mt-1">{sortedStores.length} lojas encontradas</p>
            </div>
            {hasMoreStores && (
              <button
                onClick={() => setShowAllStores(!showAllStores)}
                className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              >
                {showAllStores ? 'Ver Menos' : `Ver Todas (${sortedStores.length})`}
                <ChevronRight className={`w-3 h-3 transition-transform duration-300 ${showAllStores ? 'rotate-90' : ''}`} />
              </button>
            )}
          </div>

          {sortedStores.length === 0 ? (
            <div className="py-16 text-center bg-card rounded-2xl border border-border shadow-sm">
              <Store className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground">Nenhuma loja encontrada na sua região</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {visibleStores.map((store, idx) => {
                const stats = store.store_stats ?? {}
                const distance = calcDistanceKm(store.location)
                const distanceFormatted = formatDistance(distance)
                return (
                  <div
                    key={store.id + idx}
                    onClick={() => router.push(`/${store.profileSlug}/${store.storeSlug}`)}
                    className="group relative bg-card rounded-2xl overflow-hidden transition-all duration-300 cursor-pointer shadow-sm hover:shadow-xl hover:-translate-y-1 border border-border/50"
                  >
                    <div className="relative h-40 bg-muted overflow-hidden">
                      {store.logo_url ? (
                        <img src={store.logo_url} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" alt={store.name} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground/20 text-4xl font-bold">{store.name?.charAt(0)}</div>
                      )}

                      <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 bg-background/90 backdrop-blur-sm rounded-lg shadow-sm">
                        <div className={`w-1.5 h-1.5 rounded-full ${store.is_open ? 'bg-green-500' : 'bg-red-500'}`} />
                        <span className="text-[10px] font-medium text-foreground">{store.is_open ? 'Aberto' : 'Fechado'}</span>
                      </div>

                      {distanceFormatted && (
                        <div className="absolute top-3 right-3 px-2.5 py-1 bg-background/90 backdrop-blur-sm rounded-lg shadow-sm flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-muted-foreground" />
                          <span className="text-[10px] font-medium text-foreground">{distanceFormatted}</span>
                        </div>
                      )}
                    </div>

                    <div className="p-5">
                      <h3 className="text-xl font-bold text-foreground mb-1 truncate">{store.name}</h3>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="flex items-center gap-1">
                          <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
                          <span className="text-sm font-bold text-foreground/80">{stats.ratings_avg?.toFixed(1) ?? '0.0'}</span>
                        </div>
                        <span className="text-xs text-muted-foreground font-medium">({stats.ratings_count ?? 0})</span>
                      </div>

                      <div className="flex items-center justify-between pt-4 border-t border-border">
                        <div className="flex -space-x-2">
                          {allProducts.filter(p => p.store_id === store.id).slice(0, 3).map(p => (
                            <div key={p.id} className="w-8 h-8 rounded-lg bg-muted border-2 border-card overflow-hidden shadow-sm">
                              {p.image_url ? (
                                <img src={p.image_url} className="w-full h-full object-cover" alt="" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-[8px] text-muted-foreground/40 font-bold">{p.name.charAt(0)}</div>
                              )}
                            </div>
                          ))}
                          {allProducts.filter(p => p.store_id === store.id).length > 3 && (
                            <div className="w-8 h-8 rounded-lg bg-primary border-2 border-card flex items-center justify-center text-[10px] font-bold text-primary-foreground">
                              +{allProducts.filter(p => p.store_id === store.id).length - 3}
                            </div>
                          )}
                        </div>
                        <span className="text-xs font-medium text-muted-foreground group-hover:text-primary transition-colors italic uppercase tracking-widest text-[9px] font-black">Ver loja →</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Produtos Section */}
        <section className="pb-12">
          <div className="flex items-end justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-foreground">Produtos e Serviços</h2>
              <p className="text-xs text-muted-foreground mt-1">{sortedProducts.length} produtos disponíveis</p>
            </div>
            {hasMoreProducts && (
              <button
                onClick={() => setShowAllProducts(!showAllProducts)}
                className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              >
                {showAllProducts ? 'Ver Menos' : `Ver Todas (${sortedProducts.length})`}
                <ChevronRight className={`w-3 h-3 transition-transform duration-300 ${showAllProducts ? 'rotate-90' : ''}`} />
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
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
                  className="group relative bg-card rounded-2xl overflow-hidden transition-all duration-300 cursor-pointer shadow-sm hover:shadow-xl hover:-translate-y-1 border border-border/50"
                >
                  <div className="relative aspect-[4/3] bg-muted overflow-hidden border-b border-border/50">
                    {product.image_url ? (
                      <img src={product.image_url} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" alt={product.name} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-muted">
                        <div className="text-center opacity-30">
                          <ShoppingBag className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
                          <span className="text-xs text-muted-foreground">{product.name.slice(0, 15)}</span>
                        </div>
                      </div>
                    )}

                    <div className="absolute top-3 left-3">
                      <div className="bg-background/90 backdrop-blur-sm px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest text-foreground shadow-sm">
                        {typeLabel}
                      </div>
                    </div>

                    {distanceFormatted && (
                      <div className="absolute bottom-3 right-3">
                        <div className="flex items-center gap-1 px-2 py-1 bg-background/90 backdrop-blur-sm rounded-lg shadow-sm">
                          <MapPin className="w-3 h-3 text-muted-foreground" />
                          <span className="text-[10px] font-medium text-foreground">{distanceFormatted}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="p-4">
                    <h4 className="font-bold text-foreground mb-1 line-clamp-2 min-h-[48px] italic">{product.name}</h4>

                    {store && (
                      <div className="flex items-center gap-1.5 mb-2">
                        <div className="w-5 h-5 rounded bg-muted overflow-hidden flex-shrink-0 border border-border/50">
                          {store.logo_url ? (
                            <img src={store.logo_url} className="w-full h-full object-cover" alt="" />
                          ) : (
                            <Store className="w-3 h-3 text-muted-foreground/30 m-1" />
                          )}
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground truncate">{store.name}</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-3 border-t border-border">
                      <span className="text-xl font-black text-foreground italic">R$ {price.toFixed(2).replace('.', ',')}</span>
                      <div className="w-8 h-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center transition-transform duration-300 group-hover:scale-110 shadow-md">
                        <Plus className="w-4 h-4" />
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