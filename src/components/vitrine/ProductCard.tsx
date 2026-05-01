import { ProductType, StoreType } from '@/app/(main)/hooks/useVitrineData'
import { MapPin, Star, Plus, ShoppingBag, Store, ChevronRight } from 'lucide-react'


interface ProductCardProps {
    product: ProductType
    store: StoreType | undefined
    distance: number | null
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

const translateType = (type: string | null) => {
    if (!type) return null
    const t = type.toLowerCase()
    if (t === 'physical') return 'Produto'
    if (t === 'service') return 'Serviço'
    return type
}

export function ProductCard({ product, store, distance, onNavigate }: ProductCardProps) {
    const price = typeof product.price === "number" ? product.price : 0
    const typeLabel = translateType(product.type) || product.category || "Produto"
    const distanceFormatted = formatDistance(distance)

    return (
        <div
            onClick={onNavigate}
            className="group relative bg-white rounded-2xl overflow-hidden transition-all duration-300 cursor-pointer hover:shadow-2xl hover:scale-105 border-2 border-transparent hover:border-orange-500"
        >
            {/* Product Image */}
            <div className="relative aspect-square bg-gradient-to-br from-orange-100 to-red-100 overflow-hidden">
                {product.image_url ? (
                    <img
                        src={product.image_url}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                        alt={product.name}
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <ShoppingBag className="w-12 h-12 text-orange-300" />
                    </div>
                )}

                {/* Type Badge */}
                <div className="absolute top-2 left-2">
                    <div className="px-2.5 py-1 bg-gradient-to-r from-orange-500 to-red-500 rounded-xl text-xs font-bold text-white shadow-md">
                        {typeLabel}
                    </div>
                </div>

                {/* Discount Badge */}
                {price > 100 && (
                    <div className="absolute top-2 right-2">
                        <div className="px-2 py-1 bg-green-500 rounded-xl text-xs font-bold text-white shadow-md animate-pulse">
                            -10%
                        </div>
                    </div>
                )}

                {/* Distance Badge */}
                {distanceFormatted && (
                    <div className="absolute bottom-2 right-2">
                        <div className="flex items-center gap-1 px-2 py-1 bg-white rounded-xl shadow-md">
                            <MapPin className="w-3 h-3 text-orange-500" />
                            <span className="text-xs font-bold text-gray-700">{distanceFormatted}</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Product Info */}
            <div className="p-3">
                <h4 className="font-bold text-gray-900 mb-1 line-clamp-2 text-sm">
                    {product.name}
                </h4>

                {/* Store Name */}
                {store && (
                    <div className="flex items-center gap-1.5 mb-2 p-1.5 bg-orange-50 rounded-lg">
                        <div className="w-5 h-5 bg-gradient-to-br from-orange-400 to-red-500 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center">
                            {store.logo_url ? (
                                <img src={store.logo_url} className="w-full h-full object-cover" alt="" />
                            ) : (
                                <Store className="w-2.5 h-2.5 text-white" />
                            )}
                        </div>
                        <span className="text-xs font-semibold text-gray-700 truncate">{store.name}</span>
                    </div>
                )}

                {/* Price & Action */}
                <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                    <div>
                        <span className="text-xl font-black text-orange-600">
                            R$ {price.toFixed(2).replace(".", ",")}
                        </span>
                        {store?.store_stats.ratings_avg && (
                            <div className="flex items-center gap-1 mt-0.5">
                                <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                                <span className="text-xs text-gray-600">{store.store_stats.ratings_avg.toFixed(1)}</span>
                            </div>
                        )}
                    </div>
                    <button className="w-9 h-9 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white rounded-xl flex items-center justify-center transition-all group-hover:scale-110 shadow-md">
                        <Plus className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    )
}