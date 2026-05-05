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
        prep_time_min: null,
        prep_time_max: null
    }
    const distanceFormatted = formatDistance(distance)
    const ratingAvg = Number(stats.ratings_avg ?? 0)
    const ratingCount = Number(stats.ratings_count ?? 0)


    return (
        <div
            onClick={onNavigate}
            className="group relative bg-white rounded-3xl overflow-hidden transition-all duration-500 cursor-pointer hover:shadow-2xl hover:-translate-y-1.5 border border-orange-100/40 hover:border-orange-300/50 flex flex-col h-full"
        >
            {/* Imagem da Loja - Maior e com mais destaque */}
            <div className="relative h-48 w-full overflow-hidden">
                {store.logo_url ? (
                    <img
                        src={store.logo_url}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                        alt={store.name}
                    />
                ) : (
                    <div className="w-full h-full bg-gradient-to-br from-orange-400 via-red-400 to-yellow-500 flex items-center justify-center overflow-hidden">
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.2)_0%,transparent_60%)]" />
                        <Building2 className="w-20 h-20 text-white/30" />
                    </div>
                )}

                {/* Overlay suave para contraste */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />

                {/* Badge de Distância - Sutil no canto superior direito */}
                {distanceFormatted && (
                    <div className="absolute top-4 right-4 z-10">
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white/90 backdrop-blur-sm rounded-full shadow-md">
                            <MapPin className="w-3 h-3 text-orange-500" />
                            <span className="text-[11px] font-black text-gray-700">{distanceFormatted}</span>
                        </div>
                    </div>
                )}

                {/* Status no canto inferior esquerdo */}
                <div className="absolute bottom-4 left-4 z-10">
                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full shadow-md backdrop-blur-sm ${store.is_open ? "bg-green-500/90" : "bg-red-500/90"}`}>
                        <div className={`w-2 h-2 rounded-full ${store.is_open ? "bg-white animate-pulse" : "bg-white"}`} />
                        <span className="text-[10px] font-black uppercase tracking-wider text-white">
                            {store.is_open ? "Aberto" : "Fechado"}
                        </span>
                    </div>
                </div>
            </div>

            {/* Conteúdo */}
            <div className="p-5 flex flex-col flex-1">
                {/* Nome da Loja - Destaque */}
                <h3 className="text-xl font-black text-gray-900 mb-2 group-hover:text-orange-600 transition-colors tracking-tight line-clamp-1">
                    {store.name}
                </h3>

                {/* Descrição */}
                {store.description && (
                    <p className="text-xs text-gray-500 font-medium line-clamp-2 leading-relaxed mb-4">
                        {store.description}
                    </p>
                )}

                {/* Ratings & Count */}
                <div className="flex items-center gap-3 mb-4">
                    <div className="flex items-center gap-1.5">
                        <span className="text-lg font-black text-orange-600">
                            {ratingAvg > 0 ? ratingAvg.toFixed(1) : "—"}
                        </span>
                        <RatingStars value={ratingAvg} size={11} className="pointer-events-none" />
                    </div>
                    <span className="text-[11px] font-bold text-gray-400">
                        ({ratingCount})
                    </span>
                    {ratingAvg >= 4.5 && (
                        <div className="flex items-center gap-1 px-2 py-0.5 bg-yellow-100 rounded-full">
                            <Award className="w-3 h-3 text-yellow-600" />
                            <span className="text-[9px] font-black text-yellow-700 uppercase">Top</span>
                        </div>
                    )}
                </div>

                {/* Faixa de Preço */}
                {(stats.price_min || stats.price_max) && (
                    <div className="mb-4 p-2.5 bg-orange-50/70 rounded-xl border border-orange-100/50">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black text-gray-500 uppercase tracking-wider">Preços</span>
                            <span className="text-xs font-black text-gray-800">
                                {stats.price_min && `R$${Math.round(stats.price_min)}`}
                                {stats.price_min && stats.price_max && " — "}
                                {stats.price_max && `R$${Math.round(stats.price_max)}`}
                            </span>
                        </div>
                    </div>
                )}

                {/* Mais Vendidos */}
                <div className="mt-auto">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <Flame className="w-4 h-4 text-orange-500 fill-orange-500" />
                            <span className="text-xs font-black text-gray-700 uppercase tracking-wider">
                                Mais vendidos
                            </span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-orange-400 group-hover:translate-x-1 transition-transform" />
                    </div>

                    {/* Miniaturas dos produtos reais */}
                    <div className="flex items-center gap-2">
                        <div className="flex -space-x-2">
                            {store.top_products && store.top_products.length > 0 ? (
                                store.top_products.map((product, i) => (
                                    <div
                                        key={product.id}
                                        className="w-10 h-10 rounded-xl bg-white border-2 border-white flex items-center justify-center shadow-md hover:scale-110 transition-all overflow-hidden relative group/prod"
                                        style={{ zIndex: 3 - i }}
                                        title={product.name}
                                    >
                                        {product.image_url ? (
                                            <img src={product.image_url} className="w-full h-full object-cover" alt={product.name} />
                                        ) : (
                                            <div className="w-full h-full bg-orange-100 flex items-center justify-center text-xs font-black text-orange-600">
                                                {product.name.charAt(0)}
                                            </div>
                                        )}
                                    </div>
                                ))
                            ) : (
                                // Fallback se não houver vendas
                                [1, 2, 3].map((_, i) => (
                                    <div
                                        key={i}
                                        className="w-10 h-10 rounded-xl bg-orange-50 border-2 border-white flex items-center justify-center shadow-sm z-0"
                                        style={{ zIndex: 3 - i }}
                                    >
                                        <Sparkles className="w-4 h-4 text-orange-200" />
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="flex-1 h-px bg-gradient-to-r from-orange-200 to-transparent" />

                        <div className="flex items-center gap-1 bg-orange-500 text-white px-3 py-1.5 rounded-full shadow-md group-hover:shadow-lg transition-all group-hover:scale-105">
                            <ShoppingBag className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-black uppercase tracking-wider">{productCount} itens</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Efeito de brilho no hover */}
            <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/10 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 pointer-events-none rounded-3xl" />
        </div>
    )
}