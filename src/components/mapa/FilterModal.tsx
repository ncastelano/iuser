import { Mode } from '@/app/(main)/mapa/hooks/useMapData'
import { Store, ShoppingBag, Briefcase, X, Compass } from 'lucide-react'


interface FilterModalProps {
    isOpen: boolean
    mode: Mode
    onClose: () => void
    onModeChange: (mode: Mode) => void
}

const modes: Mode[] = ['lojas', 'servicos', 'produtos']

const modeIcons = {
    lojas: Store,
    servicos: Briefcase,
    produtos: ShoppingBag,
}

export function FilterModal({ isOpen, mode, onClose, onModeChange }: FilterModalProps) {
    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={onClose} />
            <div className="relative bg-white rounded-2xl w-full sm:max-w-md shadow-2xl transform transition-all duration-300 animate-in zoom-in-95 overflow-hidden">
                <div className="bg-gradient-to-r from-orange-500 to-red-500 p-5">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Compass className="w-5 h-5 text-white" />
                            <h3 className="text-xl font-bold text-white">Explorar</h3>
                        </div>
                        <button onClick={onClose} className="p-1 rounded-lg bg-white/20 hover:bg-white/30 transition-colors">
                            <X className="w-5 h-5 text-white" />
                        </button>
                    </div>
                </div>
                <div className="p-3 space-y-1">
                    {modes.map((m) => {
                        const Icon = modeIcons[m]
                        return (
                            <button
                                key={m}
                                onClick={() => {
                                    onModeChange(m)
                                    onClose()
                                }}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${mode === m
                                    ? 'bg-gradient-to-r from-orange-50 to-red-50 border-2 border-orange-500'
                                    : 'text-gray-700 hover:bg-gray-50'
                                    }`}
                            >
                                <div className={`p-2 rounded-lg ${mode === m ? 'bg-gradient-to-br from-orange-500 to-red-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                                    <Icon size={18} />
                                </div>
                                <span className="flex-1 text-left font-bold text-sm lowercase first-letter:uppercase">{m}</span>
                                {mode === m && (
                                    <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
                                )}
                            </button>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}