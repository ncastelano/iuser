import { Layers } from 'lucide-react'

interface MapStyleToggleProps {
    mapStyle: 'streets' | 'satellite'
    onToggle: () => void
}

export function MapStyleToggle({ mapStyle, onToggle }: MapStyleToggleProps) {
    return (
        <div className="absolute z-50" style={{ bottom: '140px', left: '24px' }}>
            <button
                onClick={onToggle}
                className="group relative flex items-center gap-2 px-4 py-2.5 bg-white rounded-2xl shadow-2xl transition-all duration-300 hover:scale-105 hover:shadow-xl active:scale-95 border-2 border-orange-200"
            >
                <Layers className="w-4 h-4 text-orange-500 transition-all duration-300 group-hover:rotate-180" />
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-700">
                    {mapStyle === 'streets' ? 'Mapa' : 'Satélite'}
                </span>
            </button>
        </div>
    )
}