import { Store, ShoppingBag, Briefcase, X, Search as SearchIcon } from 'lucide-react'
import { Mode } from '@/app/(main)/mapa/hooks/useMapData'

interface MapHeaderProps {
    mode: Mode
    search: string
    setSearch: (value: string) => void
    onOpenFilters: () => void
    onLogoClick: () => void
}

const modeIcons = {
    lojas: Store,
    servicos: Briefcase,
    produtos: ShoppingBag,
}

export function MapHeader({ mode, search, setSearch, onOpenFilters, onLogoClick }: MapHeaderProps) {
    const Icon = modeIcons[mode]

    return (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 w-[95%] max-w-2xl z-20">
            <div className="flex items-center gap-3">
                <div
                    onClick={onLogoClick}
                    className="w-12 h-12 flex-shrink-0 bg-gradient-to-br from-orange-500 to-red-500 rounded-full flex items-center justify-center shadow-xl border-2 border-white/50 cursor-pointer hover:scale-110 transition-transform"
                >
                    <img src="/logo.png" alt="iUser" className="h-7 w-7 object-contain rounded-full" />
                </div>

                <div className="relative group flex-1">
                    <input
                        type="text"
                        placeholder={
                            mode === 'lojas'
                                ? "Buscar lojas incríveis..."
                                : mode === 'servicos'
                                    ? "Encontrar serviços..."
                                    : "Procurar produtos..."
                        }
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-4 pr-10 py-3.5 bg-white/95 backdrop-blur-xl border-2 border-orange-200 focus:border-orange-500 rounded-2xl text-gray-700 placeholder:text-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all duration-300 shadow-2xl"
                    />
                    {search && (
                        <button
                            onClick={() => setSearch('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>

                <button
                    onClick={onOpenFilters}
                    className="flex-shrink-0 flex items-center gap-2 px-5 py-3.5 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-2xl text-xs font-bold uppercase tracking-wider shadow-lg hover:shadow-xl hover:scale-105 transition-all"
                >
                    <Icon className="w-4 h-4" />
                    <span className="hidden sm:inline lowercase first-letter:uppercase">{mode}</span>
                </button>
            </div>
        </div>
    )
}
