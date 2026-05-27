import { MapPin, Star, ArrowDownWideNarrow, ArrowUpNarrowWide, Filter, X } from 'lucide-react'

type SortBy = 'distance' | 'rating' | 'priceMin' | 'priceMax'

interface FilterModalProps {
    isOpen: boolean
    onClose: () => void
    sortBy: SortBy
    onSortChange: (sort: SortBy) => void
}

const filters = [
    { label: 'Mais próximo', value: 'distance' as const, icon: MapPin, description: 'Lojas perto de você', color: 'text-blue-500' },
    { label: 'Melhor avaliado', value: 'rating' as const, icon: Star, description: 'Os favoritos do público', color: 'text-yellow-500' },
    { label: 'Menor valor', value: 'priceMin' as const, icon: ArrowDownWideNarrow, description: 'Economize dinheiro', color: 'text-green-500' },
    { label: 'Maior valor', value: 'priceMax' as const, icon: ArrowUpNarrowWide, description: 'Produtos premium', color: 'text-purple-500' },
]

export function FilterModal({ isOpen, onClose, sortBy, onSortChange }: FilterModalProps) {
    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" />
            <div
                className="relative bg-white rounded-3xl shadow-2xl w-full sm:max-w-md mx-auto animate-in slide-in-from-bottom-4 duration-300 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="bg-gradient-to-r from-orange-500 to-red-500 p-5">
                    <div className="flex items-center justify-between">
                        <h3 className="text-xl font-bold text-white">Ordenar por</h3>
                        <button
                            onClick={onClose}
                            className="p-1 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
                        >
                            <X className="w-5 h-5 text-white" />
                        </button>
                    </div>
                </div>

                <div className="p-3">
                    {filters.map((option) => {
                        const Icon = option.icon
                        const isActive = sortBy === option.value
                        return (
                            <button
                                key={option.value}
                                onClick={() => {
                                    onSortChange(option.value)
                                    onClose()
                                }}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all mb-1 ${isActive
                                        ? "bg-gradient-to-r from-orange-50 to-red-50 border-2 border-orange-500"
                                        : "text-gray-700 hover:bg-gray-50"
                                    }`}
                            >
                                <Icon className={`w-5 h-5 ${isActive ? "text-orange-500" : "text-gray-400"}`} />
                                <div className="flex-1 text-left">
                                    <div className={`text-sm font-bold ${isActive ? "text-orange-600" : "text-gray-900"}`}>
                                        {option.label}
                                    </div>
                                    <div className="text-xs text-gray-500">{option.description}</div>
                                </div>
                                {isActive && (
                                    <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                                )}
                            </button>
                        )
                    })}
                </div>

                <div className="p-4 border-t border-gray-100">
                    <button
                        onClick={() => {
                            onSortChange("rating")
                            onClose()
                        }}
                        className="w-full py-2.5 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
                    >
                        Limpar filtros
                    </button>
                </div>
            </div>
        </div>
    )
}