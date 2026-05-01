import { Mode } from "@/app/(main)/mapa/hooks/useMapData"
import { Flame } from "lucide-react"


interface MapTotalsBadgeProps {
    count: number
    mode: Mode
}

export function MapTotalsBadge({ count, mode }: MapTotalsBadgeProps) {
    const label = mode === 'lojas' ? 'Lojas' : mode === 'servicos' ? 'Serviços' : 'Produtos'

    return (
        <div className="absolute bottom-24 left-6 z-10 pointer-events-none sm:block hidden">
            <div className="bg-white/95 backdrop-blur-xl rounded-2xl px-4 py-2 shadow-2xl flex items-center gap-2 border border-orange-200">
                <Flame className="w-4 h-4 text-orange-500" />
                <span className="text-xs font-black text-gray-700">
                    {count} {label}
                </span>
            </div>
        </div>
    )
}