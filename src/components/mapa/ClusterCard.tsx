import { Mode } from '@/app/(main)/mapa/hooks/useMapData';
import { parseCoords } from '@/lib/geoUtils';
import { Building2, XCircle, ChevronRight } from 'lucide-react'

interface ClusterCardProps {
    items: any[]
    location: { lng: number; lat: number; name: string } | null
    mode: Mode
    stores: any[]
    onClose: () => void
    onItemSelect: (item: any, map: any) => void
    map: any
}

export function ClusterCard({ items, location, mode, stores, onClose, onItemSelect, map }: ClusterCardProps) {
    if (!items || !location) return null

    return (
        <div className="absolute top-36 left-1/2 -translate-x-1/2 w-[95%] max-w-2xl z-30">
            <div className="bg-yellow-500 rounded-2xl px-4 py-3 shadow-lg flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-white" />
                    <div>
                        <p className="text-xs font-bold text-white">{location.name}</p>
                        <p className="text-[10px] text-white/80">{items.length} estabelecimentos</p>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="p-1.5 bg-white/20 rounded-xl hover:bg-white/30 transition-colors"
                >
                    <XCircle className="w-5 h-5 text-white" />
                </button>
            </div>
            <div className="mt-2 bg-white rounded-2xl shadow-xl overflow-hidden max-h-80 overflow-y-auto">
                {items.map((item, idx) => (
                    <button
                        key={idx}
                        onClick={() => {
                            let loc = null
                            if (mode === 'lojas') {
                                loc = item.location
                            } else {
                                const store = stores.find(s => s.id === item.store_id)
                                loc = store?.location
                            }
                            const coords = parseCoords(loc)
                            if (coords && map) {
                                map.flyTo({ center: coords, zoom: 18, duration: 1000 })
                            }
                            onItemSelect(item, map)
                            onClose()
                        }}
                        className="w-full p-3 flex items-center gap-3 border-b border-gray-100 hover:bg-orange-50 transition-all"
                    >
                        <div className="w-10 h-10 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
                            {(mode === 'lojas' ? item.logo_url : item.image_url) ? (
                                <img src={mode === 'lojas' ? item.logo_url : item.image_url} className="w-full h-full object-cover" alt="" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-lg font-bold text-gray-400">
                                    {item.name?.charAt(0)}
                                </div>
                            )}
                        </div>
                        <div className="flex-1 text-left">
                            <p className="text-sm font-semibold text-gray-900">{item.name}</p>
                            <p className="text-xs text-gray-500">
                                {mode === 'lojas' && (item.is_open ? 'Aberto' : 'Fechado')}
                            </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                    </button>
                ))}
            </div>
        </div>
    )
}