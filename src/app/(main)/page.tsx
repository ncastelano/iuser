'use client'

import { useRouter } from 'next/navigation'
import { Flame, ChevronRight, Zap } from 'lucide-react'
import { LoadingSpinner } from '@/components/vitrine/LoadingSpinner'
import { EmptyState } from '@/components/vitrine/EmptyState'
import { VitrineHeader } from '@/components/vitrine/VitrineHeader'
import { FilterModal } from '@/components/vitrine/FilterModal'
import { StoreCard } from '@/components/vitrine/StoreCard'
import { ProductCard } from '@/components/vitrine/ProductCard'
import { PromotionalBanner } from '@/components/vitrine/PromotionalBanner'
import { useStoreFilters } from './hooks/useStoreFilters'
import { useVitrineData } from './hooks/useVitrineData'
import { useGeolocation } from './hooks/useGeolocation'
import AnimatedBackground from '@/components/AnimatedBackground'

const PREVIEW_COUNT = 12

const filtersConfig = [
  { label: 'Mais próximo', value: 'distance', icon: null, description: 'Lojas perto de você', color: 'text-blue-500' },
  { label: 'Melhor avaliado', value: 'rating', icon: null, description: 'Os favoritos do público', color: 'text-yellow-500' },
  { label: 'Menor valor', value: 'priceMin', icon: null, description: 'Economize dinheiro', color: 'text-green-500' },
  { label: 'Maior valor', value: 'priceMax', icon: null, description: 'Produtos premium', color: 'text-purple-500' },
]

export default function Vitrine() {
  const router = useRouter()
  const { userLocation } = useGeolocation()
  const { allStores, allProducts, loading, error } = useVitrineData()

  const {
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
    sortedStores,
    sortedProducts,
    getStore,
    calcDistanceKm,
    getSectionTitle,
    resetShowAll
  } = useStoreFilters(allStores, allProducts, userLocation)

  if (loading) return <LoadingSpinner />
  if (error) console.error('[Vitrine] Error:', error)

  const currentItems = activeTab === 'stores' ? sortedStores : sortedProducts
  const visibleItems = showAllItems ? currentItems : currentItems.slice(0, PREVIEW_COUNT)
  const hasMoreItems = currentItems.length > PREVIEW_COUNT

  const getActiveFilterLabel = () => {
    const active = filtersConfig.find(f => f.value === sortBy)
    return active ? active.label : 'Filtrar'
  }

  const getActiveFilterIcon = () => {
    return <span className="w-3.5 h-3.5">🔍</span>
  }

  const handleStoreClick = (store: any) => {
    router.push(`/${store.profileSlug}/${store.storeSlug}`)
  }

  const handleProductClick = (product: any, store: any) => {
    if (store) {
      router.push(`/${store.profileSlug}/${store.storeSlug}/${product.slug || product.id}`)
    }
  }

  return (
    <div className="relative flex flex-col min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-yellow-50 pb-32">
      <AnimatedBackground />

      <style jsx global>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-15px) rotate(5deg); }
        }
      `}</style>

      <VitrineHeader
        search={search}
        setSearch={(value) => {
          setSearch(value)
          resetShowAll()
        }}
        onOpenFilters={() => setShowFilters(true)}
        activeFilterLabel={getActiveFilterLabel()}
        activeFilterIcon={getActiveFilterIcon()}
        onLogoClick={() => router.push('/')}
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab)
          resetShowAll()
        }}
        storesCount={sortedStores.length}
        productsCount={sortedProducts.length}
        sortBy={sortBy}
      />

      <FilterModal
        isOpen={showFilters}
        onClose={() => setShowFilters(false)}
        sortBy={sortBy}
        onSortChange={(sort) => {
          setSortBy(sort)
          resetShowAll()
        }}
      />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
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
          <EmptyState activeTab={activeTab} />
        ) : activeTab === "stores" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {(visibleItems as any[]).map((store) => {
              const distance = calcDistanceKm(store.location)
              const productCount = allProducts.filter(p => p.store_id === store.id).length

              return (
                <StoreCard
                  key={store.id}
                  store={store}
                  distance={distance}
                  productCount={productCount}
                  onNavigate={() => handleStoreClick(store)}
                />
              )
            })}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-5">
            {(visibleItems as any[]).map((product) => {
              const store = getStore(product.store_id)
              const distance = store ? calcDistanceKm(store.location) : null

              return (
                <ProductCard
                  key={product.id}
                  product={product}
                  store={store}
                  distance={distance}
                  onNavigate={() => handleProductClick(product, store)}
                />
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

        <PromotionalBanner />

        {/* Mensagem final igual ao login */}
        <div className="mt-12 pt-6 pb-4 border-t border-orange-200/30">
          <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-4 border border-orange-200/50">
            <p className="text-[11px] text-gray-600 text-center leading-relaxed">
              ✨ <span className="font-black text-orange-600">Mostre para todos ao redor</span> o que você tem de melhor.<br />
              Sua loja, suas vendas, seu sucesso.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}