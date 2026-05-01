import { useState } from 'react'
import { MapPin, Search, X, Map as MapIcon } from 'lucide-react'

interface LocationDialogProps {
    isOpen: boolean
    editingLocation: boolean
    initialAddress: string
    onClose: () => void
    onSave: (lng: number, lat: number, address: string) => Promise<void>
}

export function LocationDialog({ isOpen, editingLocation, initialAddress, onClose, onSave }: LocationDialogProps) {
    const [searchAddress, setSearchAddress] = useState(initialAddress)
    const [addressSuggestions, setAddressSuggestions] = useState<any[]>([])
    const [searchingAddress, setSearchingAddress] = useState(false)

    if (!isOpen) return null

    const searchAddressHandler = async () => {
        if (!searchAddress.trim()) return
        setSearchingAddress(true)
        try {
            const response = await fetch(
                `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(searchAddress)}.json?access_token=${process.env.NEXT_PUBLIC_MAPBOX_TOKEN}&language=pt&limit=5`
            )
            const data = await response.json()
            setAddressSuggestions(data.features || [])
        } catch (error) {
            console.error('Erro na busca:', error)
        } finally {
            setSearchingAddress(false)
        }
    }

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity" onClick={onClose} />
            <div className="relative bg-white rounded-2xl w-full max-w-md shadow-2xl transform transition-all duration-300 animate-in zoom-in-95 overflow-hidden">
                <div className="bg-gradient-to-r from-orange-500 to-red-500 p-5">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <MapPin className="w-5 h-5 text-white" />
                            <h3 className="text-xl font-bold text-white">
                                {editingLocation ? 'Editar endereço' : 'Adicionar localização'}
                            </h3>
                        </div>
                        <button onClick={onClose} className="p-1 rounded-lg bg-white/20 hover:bg-white/30 transition-colors">
                            <X className="w-5 h-5 text-white" />
                        </button>
                    </div>
                </div>

                <div className="p-5">
                    <div className="relative mb-4">
                        <input
                            type="text"
                            placeholder="Digite seu endereço, rua, cidade..."
                            value={searchAddress}
                            onChange={(e) => setSearchAddress(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && searchAddressHandler()}
                            className="w-full pl-4 pr-12 py-3 border-2 border-orange-200 rounded-xl text-gray-700 placeholder:text-gray-400 text-sm focus:outline-none focus:border-orange-500 transition-all"
                        />
                        <button
                            onClick={searchAddressHandler}
                            disabled={searchingAddress}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-lg hover:opacity-90 transition-all disabled:opacity-50"
                        >
                            {searchingAddress ? (
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <Search className="w-4 h-4" />
                            )}
                        </button>
                    </div>

                    {addressSuggestions.length > 0 && (
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                            {addressSuggestions.map((suggestion, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => onSave(suggestion.center[0], suggestion.center[1], suggestion.place_name)}
                                    className="w-full text-left p-3 rounded-xl hover:bg-orange-50 transition-all border border-transparent hover:border-orange-200"
                                >
                                    <div className="flex items-start gap-3">
                                        <MapPin className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
                                        <div>
                                            <p className="text-sm font-medium text-gray-900">{suggestion.text}</p>
                                            <p className="text-xs text-gray-500">{suggestion.place_name}</p>
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}

                    {addressSuggestions.length === 0 && searchAddress && !searchingAddress && (
                        <div className="text-center py-8">
                            <MapIcon className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                            <p className="text-gray-500 text-sm">Digite um endereço para buscar</p>
                        </div>
                    )}

                    <button
                        onClick={onClose}
                        className="w-full mt-4 py-3 bg-gray-100 text-gray-600 rounded-xl font-medium hover:bg-gray-200 transition-all"
                    >
                        Cancelar
                    </button>
                </div>
            </div>
        </div>
    )
}