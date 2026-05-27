// src/components/vitrine/StoreCard.tsx

import { StoreType } from '@/app/(main)/hooks/useVitrineData'
import { RatingStars } from '@/components/ratings/RatingStars'
import { MapPin, Award, ShoppingBag, ChevronRight, Building2, Sparkles, Flame } from 'lucide-react'

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
    const stats = store.store_stats ?? {
        ratings_avg: 0,
        ratings_count: 0,
        price_min: null,
        price_max: null,
    }
    const distanceFormatted = formatDistance(distance)
    const ratingAvg = Number(stats.ratings_avg ?? 0)
    const ratingCount = Number(stats.ratings_count ?? 0)

    return (
        <div
            onClick={onNavigate}
            className="group relative bg-white rounded-2xl overflow-hidden transition-all duration-300 cursor-pointer hover:shadow-lg hover:-translate-y-0.5 border border-orange-100/40 hover:border-orange-300/50 flex flex-row h-[140px]"
        >
            {/* Imagem da Loja - Lado esquerdo */}
            <div className="relative w-[120px] min-w-[120px] h-full overflow-hidden">
                {store.logo_url ? (
                    <img
                        src={store.logo_url}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        alt={store.name}
                    />
                ) : (
                    <div className="w-full h-full bg-gradient-to-br from-orange-400 via-red-400 to-yellow-500 flex items-center justify-center">
                        <Building2 className="w-10 h-10 text-white/30" />
                    </div>
                )}

                {/* Status - Canto superior esquerdo da imagem */}
                <div className="absolute top-2 left-2">
                    <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full shadow-md ${store.is_open ? "bg-green-500/90" : "bg-red-500/90"}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${store.is_open ? "bg-white animate-pulse" : "bg-white"}`} />
                        <span className="text-[8px] font-black uppercase tracking-wider text-white">
                            {store.is_open ? "Aberto" : "Fechado"}
                        </span>
                    </div>
                </div>

                {/* Distância - Canto inferior esquerdo */}
                {distanceFormatted && (
                    <div className="absolute bottom-2 left-2">
                        <div className="flex items-center gap-1 px-2 py-0.5 bg-white/90 backdrop-blur-sm rounded-full shadow-md">
                            <MapPin className="w-2.5 h-2.5 text-orange-500" />
                            <span className="text-[9px] font-black text-gray-700">{distanceFormatted}</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Conteúdo - Lado direito */}
            <div className="flex-1 flex flex-col justify-between p-3 min-w-0">
                {/* Nome + Badge Top */}
                <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-black text-gray-900 group-hover:text-orange-600 transition-colors tracking-tight line-clamp-1 flex-1">
                        {store.name}
                    </h3>
                    {ratingAvg >= 4.5 && (
                        <div className="flex items-center gap-0.5 px-1.5 py-0.5 bg-yellow-100 rounded-full flex-shrink-0">
                            <Award className="w-2.5 h-2.5 text-yellow-600" />
                            <span className="text-[7px] font-black text-yellow-700 uppercase">Top</span>
                        </div>
                    )}
                </div>

                {/* Descrição - 1 linha só */}
                {store.description && (
                    <p className="text-[10px] text-gray-400 font-medium line-clamp-1 mt-0.5">
                        {store.description}
                    </p>
                )}

                {/* Ratings + Preço */}
                <div className="flex items-center gap-3 mt-1.5">
                    <div className="flex items-center gap-1">
                        <RatingStars value={ratingAvg} size={9} className="pointer-events-none" />
                        <span className="text-[11px] font-black text-orange-600">{ratingAvg > 0 ? ratingAvg.toFixed(1) : "—"}</span>
                        <span className="text-[9px] font-bold text-gray-300">({ratingCount})</span>
                    </div>

                    {(stats.price_min || stats.price_max) && (
                        <span className="text-[10px] font-black text-gray-500">
                            {stats.price_min && `R$${Math.round(stats.price_min)}`}
                            {stats.price_min && stats.price_max && "—"}
                            {stats.price_max && `R$${Math.round(stats.price_max)}`}
                        </span>
                    )}
                </div>

                {/* Produtos + Itens */}
                <div className="flex items-center justify-between mt-2">
                    {/* Miniaturas dos produtos - sem container com borda */}
                    <div className="flex items-center">
                        <div className="flex -space-x-2">
                            {store.top_products && store.top_products.length > 0 ? (
                                store.top_products.slice(0, 3).map((product, i) => (
                                    <div key={product.id} className="relative" style={{ zIndex: 3 - i }}>
                                        {/* Avatar do produto */}
                                        <div
                                            className="w-9 h-9 rounded-full bg-white ring-2 ring-white flex items-center justify-center shadow-md hover:scale-110 transition-all overflow-hidden"
                                            title={product.name}
                                        >
                                            {product.image_url ? (
                                                <img src={product.image_url} className="w-full h-full object-cover rounded-full" alt="" />
                                            ) : (
                                                <div className="w-full h-full bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center text-[10px] font-black text-white">
                                                    {product.name.charAt(0)}
                                                </div>
                                            )}
                                        </div>

                                        {/* Flame apenas na primeira imagem (i === 0) */}
                                        {i === 0 && (
                                            <Flame className="absolute -top-1 -left-1 w-4 h-4 text-orange-500 fill-orange-500 drop-shadow-sm z-10" />
                                        )}
                                    </div>
                                ))
                            ) : (
                                [1, 2, 3].map((i) => (
                                    <div
                                        key={i}
                                        className="w-9 h-9 rounded-full bg-white ring-2 ring-orange-100 flex items-center justify-center shadow-sm"
                                        style={{ zIndex: 3 - i }}
                                    >
                                        <Sparkles className="w-4 h-4 text-orange-200" />
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Botão de ação */}
                    <div className="flex items-center gap-1.5 ml-2">
                        <div className="flex items-center gap-1 bg-orange-500 text-white px-2 py-1 rounded-full shadow-md group-hover:shadow-lg transition-all group-hover:scale-105">
                            <ShoppingBag className="w-3 h-3" />
                            <span className="text-[8px] font-black uppercase tracking-wider">{productCount}</span>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-orange-400 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                </div>
            </div>

            {/* Efeito de brilho no hover */}
            <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/5 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none rounded-2xl" />
        </div>
    )
}