import { StoreType } from '@/app/(main)/hooks/useVitrineData'
import { MapPin, Star, Award, ShoppingBag, ChevronRight, Truck, Building2 } from 'lucide-react'


interface StoreCardProps {
    store: StoreType
    distance: number | null
    productCount: number
    onNavigate: () => void
}

const formatDistance = (distance: number | null): string | null => {
    if (distance === null) return null
    if (distance < 1) {
        const meters = Math.round(distance * 1000)
        return `${meters}m`
    } else {
        return `${distance.toFixed(1)}km`
    }
}

export function StoreCard({ store, distance, productCount, onNavigate }: StoreCardProps) {
    const stats = store.store_stats ?? {}
    const distanceFormatted = formatDistance(distance)

    return (
        <div
            onClick={onNavigate}
            className="group relative bg-white rounded-2xl overflow-hidden transition-all duration-300 cursor-pointer hover:shadow-2xl hover:scale-105 border-2 border-transparent hover:border-orange-500"
        >
            {/* Store Banner */}
            <div className="relative h-36 bg-gradient-to-br from-orange-400 to-red-500 overflow-hidden">
                {store.logo_url ? (
                    <img
                        src={store.logo_url}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                        alt={store.name}
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <Building2 className="w-16 h-16 text-white/30" />
                    </div>
                )}

                {/* Status Badge */}
                <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1.5 bg-white rounded-xl shadow-md">
                    <div className={`w-2 h-2 rounded-full ${store.is_open ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />
                    <span className="text-xs font-bold text-gray-700">{store.is_open ? "Aberto" : "Fechado"}</span>
                </div>

                {/* Distance Badge */}
                {distanceFormatted && (
                    <div className="absolute top-3 right-3 px-2.5 py-1.5 bg-white rounded-xl shadow-md">
                        <div className="flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-orange-500" />
                            <span className="text-xs font-bold text-gray-700">{distanceFormatted}</span>
                        </div>
                    </div>
                )}

                {/* Featured Badge */}
                {stats.ratings_avg > 4.5 && (
                    <div className="absolute bottom-3 left-3 px-2.5 py-1 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-lg shadow-md">
                        <div className="flex items-center gap-1">
                            <Award className="w-3 h-3 text-white" />
                            <span className="text-xs font-bold text-white">Destaque</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Store Info */}
            <div className="p-4">
                <h3 className="text-lg font-black text-gray-900 mb-1 line-clamp-1">
                    {store.name}
                </h3>

                {store.description && (
                    <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                        {store.description}
                    </p>
                )}

                {/* Rating & Stats */}
                <div className="flex items-center gap-3 mb-3">
                    <div className="flex items-center gap-1">
                        <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                        <span className="font-bold text-gray-900">
                            {stats.ratings_avg?.toFixed(1) ?? "0.0"}
                        </span>
                        <span className="text-xs text-gray-500">({stats.ratings_count ?? 0})</span>
                    </div>
                    <div className="w-px h-4 bg-gray-300" />
                    <div className="text-sm text-gray-600 flex items-center gap-1">
                        <ShoppingBag className="w-3 h-3" />
                        {productCount} itens
                    </div>
                </div>

                {/* Price Range */}
                {(stats.price_min || stats.price_max) && (
                    <div className="mb-3 p-2 bg-gradient-to-r from-orange-50 to-yellow-50 rounded-xl">
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-600">💰 Faixa de preço</span>
                            <span className="font-bold text-orange-600">
                                {stats.price_min && `R$ ${stats.price_min.toFixed(2)}`}
                                {stats.price_min && stats.price_max && " - "}
                                {stats.price_max && `R$ ${stats.price_max.toFixed(2)}`}
                            </span>
                        </div>
                    </div>
                )}

                {/* Action Button */}
                <div className="pt-3">
                    <div className="flex items-center justify-between">
                        <span className="text-orange-600 font-bold group-hover:translate-x-1 transition-transform inline-flex items-center gap-1">
                            Conhecer loja
                            <ChevronRight className="w-4 h-4" />
                        </span>
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                            <Truck className="w-3 h-3" />
                            <span>Entrega rápida</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}