import { Mode } from '@/app/(main)/mapa/hooks/useMapData'
import { X, MapPin, Star } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface SelectedItemCardProps {
    item: any
    mode: Mode
    distanceFormatted: string | null
    stores: any[]
    onClose: () => void
}

export function SelectedItemCard({ item, mode, distanceFormatted, stores, onClose }: SelectedItemCardProps) {
    const router = useRouter()

    const selectedStore = mode === 'produtos' || mode === 'servicos'
        ? stores.find(s => s.id === item?.store_id)
        : null

    const handleNavigate = () => {
        if (!item) return

        if (mode === 'lojas') {
            router.push(`/${item.profileSlug}/${item.storeSlug}`)
        } else {
            const store = stores.find(s => s.id === item.store_id)
            if (store) {
                router.push(`/${store.profileSlug}/${store.storeSlug}/${item.slug || item.id}`)
            }
        }
    }

    if (!item) return null

    return (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 w-[92%] max-w-sm z-30 animate-in slide-in-from-bottom-5 duration-500">
            <div className="bg-white rounded-2xl shadow-2xl overflow-hidden border-2 border-orange-200">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-orange-100 hover:bg-orange-500 hover:text-white transition-all z-10 shadow-md"
                >
                    <X className="w-4 h-4" />
                </button>
                <div className="p-4">
                    <div className="flex gap-4 items-center">
                        <div className={`w-20 h-20 rounded-2xl overflow-hidden bg-gradient-to-br from-orange-100 to-red-100 p-0.5 border-2 flex-shrink-0 shadow-lg ${mode === 'lojas'
                            ? (item.is_open ? 'border-green-500' : 'border-red-500')
                            : 'border-orange-500'
                            }`}>
                            {(mode === 'lojas' ? item.logo_url : item.image_url) ? (
                                <img
                                    src={mode === 'lojas' ? item.logo_url : item.image_url}
                                    className="w-full h-full object-cover rounded-xl"
                                    alt=""
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-2xl font-black italic text-orange-300">
                                    ?
                                </div>
                            )}
                        </div>
                        <div className="flex-1 min-w-0 space-y-1">
                            <h3 className="text-lg font-black text-gray-900 truncate">{item.name}</h3>
                            <div className="flex items-center gap-2 flex-wrap">
                                {mode === 'lojas' && (
                                    <span className={`text-[8px] font-black uppercase px-2 py-1 rounded-full ${item.is_open ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                                        }`}>
                                        {item.is_open ? 'Aberto' : 'Fechado'}
                                    </span>
                                )}
                                {distanceFormatted && (
                                    <span className="text-[10px] font-black uppercase text-gray-500 flex items-center gap-1">
                                        <MapPin className="w-3 h-3 text-orange-500" />
                                        {distanceFormatted}
                                    </span>
                                )}
                                {mode === 'lojas' && item.ratings_avg > 0 && (
                                    <div className="flex items-center gap-1 font-black text-[10px] text-yellow-500">
                                        <Star size={10} className="fill-yellow-500" />
                                        {item.ratings_avg.toFixed(1)}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                    {(mode === 'servicos' || mode === 'produtos') && item.price && (
                        <div className="mt-3 p-2 bg-gradient-to-r from-orange-50 to-red-50 rounded-xl">
                            <p className="text-xl font-black text-orange-600">
                                R$ {item.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </p>
                        </div>
                    )}
                    {mode === 'lojas' && item.description && (
                        <p className="mt-2 text-xs text-gray-600 line-clamp-2">{item.description}</p>
                    )}
                </div>
                <button
                    onClick={handleNavigate}
                    className="w-full py-3.5 bg-gradient-to-r from-orange-500 to-red-500 text-white font-black uppercase text-xs tracking-wider transition-all hover:shadow-lg active:scale-95 rounded-b-2xl"
                >
                    Visitar Loja →
                </button>
            </div>
        </div>
    )
}