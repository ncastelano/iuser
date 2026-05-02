import { Store, Search as SearchIcon, X } from 'lucide-react'

interface VitrineHeaderProps {
    search: string
    setSearch: (value: string) => void
    onOpenFilters: () => void
    activeFilterLabel: string
    activeFilterIcon: React.ReactNode
    onLogoClick: () => void
}

export function VitrineHeader({
    search,
    setSearch,
    onOpenFilters,
    activeFilterLabel,
    activeFilterIcon,
    onLogoClick
}: VitrineHeaderProps) {
    return (
        <div className="sticky top-0 z-50 bg-white shadow-lg">
            <div className="px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
                <div className="flex items-center gap-3">
                    {/* Logo */}
                    <div
                        className="flex-shrink-0 cursor-pointer hover:scale-105 transition-transform"
                        onClick={onLogoClick}
                    >
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-red-500 rounded-xl flex items-center justify-center shadow-md">
                                <Store className="w-5 h-5 text-white" />
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
                            placeholder="🔍 Buscar lojas incríveis..."
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
                        className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-2xl text-sm font-bold shadow-md hover:shadow-lg hover:scale-105 transition-all"
                    >
                        {activeFilterIcon}
                        <span className="hidden sm:inline">{activeFilterLabel}</span>
                    </button>
                </div>
            </div>
        </div>
    )
}