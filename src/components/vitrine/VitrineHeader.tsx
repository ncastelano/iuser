'use client'

import { Store, Search as SearchIcon, X, Store as StoreIcon, Package, SlidersHorizontal, Star, ArrowUpDown, TrendingDown, TrendingUp, MapPin } from 'lucide-react'

interface VitrineHeaderProps {
    search: string
    setSearch: (value: string) => void
    onOpenFilters: () => void
    activeFilterLabel: string
    activeFilterIcon: React.ReactNode
    onLogoClick: () => void
    activeTab: 'stores' | 'products'
    onTabChange: (tab: 'stores' | 'products') => void
    storesCount: number
    productsCount: number
    sortBy: string
}

const filterIcons: Record<string, React.ReactNode> = {
    distance: <MapPin className="w-4 h-4" />,
    rating: <Star className="w-4 h-4" />,
    priceMin: <TrendingDown className="w-4 h-4" />,
    priceMax: <TrendingUp className="w-4 h-4" />,
}

export function VitrineHeader({
    search,
    setSearch,
    onOpenFilters,
    activeFilterLabel,
    activeFilterIcon,
    onLogoClick,
    activeTab,
    onTabChange,
    storesCount,
    productsCount,
    sortBy,
}: VitrineHeaderProps) {
    const currentFilterIcon = filterIcons[sortBy] || <SlidersHorizontal className="w-4 h-4" />

    // Placeholder alterna conforme a tab ativa
    const placeholder = activeTab === 'stores'
        ? 'Buscar lojas'
        : 'Buscar produtos'

    return (
        <div className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl shadow-lg">
            {/* Header Row */}
            <div className="px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
                <div className="flex items-center gap-3">
                    {/* Logo */}
                    <div
                        className="flex-shrink-0 cursor-pointer hover:scale-105 transition-transform"
                        onClick={onLogoClick}
                    >
                        <div className="flex items-center gap-2">
                            <div className="w-12 h-12 flex-shrink-0 bg-gradient-to-br from-orange-500 to-red-500 rounded-full flex items-center justify-center shadow-xl border-2 border-white/50 hover:scale-110 transition-transform">
                                <img src="/logo.png" alt="iUser" className="h-7 w-7 object-contain rounded-full" />
                            </div>
                            <span className="text-xl font-black bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent hidden sm:inline">
                                Vitrine
                            </span>
                        </div>
                    </div>

                    {/* Search Input */}
                    <div className="relative group flex-1">
                        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-orange-400 group-focus-within:text-orange-500 transition-colors" />
                        <input
                            type="text"
                            placeholder={placeholder}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-10 pr-8 py-2.5 bg-orange-50 border-2 border-orange-200 focus:border-orange-500 text-gray-700 placeholder:text-orange-300 text-sm rounded-2xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all"
                        />
                        {search && (
                            <button
                                onClick={() => setSearch("")}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg text-orange-400 hover:text-orange-600 transition-colors"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>

                    {/* Filter Button */}
                    <button
                        onClick={onOpenFilters}
                        className="flex-shrink-0 flex items-center gap-2 px-3 py-2.5 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-2xl text-sm font-bold shadow-md hover:shadow-lg hover:scale-105 transition-all"
                    >
                        {currentFilterIcon}
                        <span className="hidden sm:inline text-xs">{activeFilterLabel}</span>
                    </button>
                </div>
            </div>

            {/* Tabs Row */}
            <div className="px-4 sm:px-6 lg:px-8 pb-3">
                <div className="flex gap-2">
                    <button
                        onClick={() => onTabChange("stores")}
                        className={`flex items-center gap-2 px-5 sm:px-7 py-3 text-sm font-bold transition-all relative rounded-xl ${activeTab === "stores"
                            ? "text-orange-600 bg-orange-50"
                            : "text-gray-500 hover:text-orange-500 hover:bg-orange-50/50"
                            }`}
                    >
                        <StoreIcon className="w-4 h-4" />
                        <span>Lojas</span>
                        <span className={`text-xs font-bold ml-1 px-2 py-0.5 rounded-full transition-all ${activeTab === "stores"
                            ? "bg-gradient-to-r from-orange-500 to-red-500 text-white"
                            : "bg-orange-100 text-orange-600"
                            }`}>
                            {storesCount}
                        </span>
                    </button>
                    <button
                        onClick={() => onTabChange("products")}
                        className={`flex items-center gap-2 px-5 sm:px-7 py-3 text-sm font-bold transition-all relative rounded-xl ${activeTab === "products"
                            ? "text-orange-600 bg-orange-50"
                            : "text-gray-500 hover:text-orange-500 hover:bg-orange-50/50"
                            }`}
                    >
                        <Package className="w-4 h-4" />
                        <span>Produtos</span>
                        <span className={`text-xs font-bold ml-1 px-2 py-0.5 rounded-full transition-all ${activeTab === "products"
                            ? "bg-gradient-to-r from-orange-500 to-red-500 text-white"
                            : "bg-orange-100 text-orange-600"
                            }`}>
                            {productsCount}
                        </span>
                    </button>
                </div>
            </div>
        </div>
    )
}