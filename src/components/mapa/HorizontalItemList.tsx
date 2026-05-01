import { parseCoords } from "@/lib/geoUtils"

interface HorizontalItemListProps {
    items: any[]
    mode: 'lojas' | 'servicos' | 'produtos'
    selectedId?: string
    stores: any[]
    onItemClick: (item: any, map: any) => void
    map: any
}

export function HorizontalItemList({ items, mode, selectedId, stores, onItemClick, map }: HorizontalItemListProps) {
    if (items.length === 0) return null

    return (
        <div className="absolute top-[78px] left-1/2 -translate-x-1/2 w-[95%] max-w-2xl z-20">
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide snap-x">
                {items.map(item => (
                    <button
                        key={item.id}
                        onClick={() => {
                            let loc = null
                            if (mode === 'lojas') loc = item.location
                            else {
                                const store = stores.find(s => s.id === item.store_id)
                                loc = store?.location
                            }
                            const coords = parseCoords(loc)
                            if (coords && map) {
                                map.flyTo({ center: coords, zoom: 16, duration: 1000 })
                            }
                            onItemClick(item, map)
                        }}
                        className={`snap-center flex-shrink-0 transition-all duration-300 ${selectedId === item.id
                            ? 'ring-4 ring-orange-500 scale-110 shadow-xl'
                            : 'opacity-90 hover:scale-105'
                            }`}
                        style={{ width: '52px', height: '52px' }}
                    >
                        <div className={`w-full h-full rounded-2xl overflow-hidden border-2 shadow-md ${mode === 'lojas'
                            ? (item.is_open ? 'border-green-500' : 'border-red-500')
                            : 'border-orange-200'
                            } bg-white`}>
                            {(mode === 'lojas' ? item.logo_url : item.image_url) ? (
                                <img
                                    src={mode === 'lojas' ? item.logo_url : item.image_url}
                                    className="w-full h-full object-cover"
                                    alt=""
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-xs font-black italic bg-gradient-to-br from-orange-100 to-red-100 text-orange-500">
                                    {item.name?.charAt(0)}
                                </div>
                            )}
                        </div>
                    </button>
                ))}
            </div>
        </div>
    )
}