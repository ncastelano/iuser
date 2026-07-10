'use client'

import { useState } from 'react'

interface LocationPickerProps {
    initialLocation: { lat: number; lng: number; address: string } | null
    onSave: (location: { lat: number; lng: number; address: string }) => void
    onClose: () => void
}

export default function LocationPicker({ initialLocation, onSave, onClose }: LocationPickerProps) {
    const [address, setAddress] = useState(initialLocation?.address || '')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const handleSave = async () => {
        if (!address.trim()) return
        setLoading(true)
        setError('')
        try {
            // Geocodificar endereço usando Nominatim
            const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`)
            const data = await res.json()
            if (data.length > 0) {
                const loc = {
                    lat: parseFloat(data[0].lat),
                    lng: parseFloat(data[0].lon),
                    address: data[0].display_name.split(',')[0] // nome simplificado
                }
                onSave(loc)
            } else {
                setError('Endereço não encontrado')
            }
        } catch {
            setError('Erro ao buscar localização')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
                <h3 className="text-lg font-bold mb-4">Sua localização</h3>
                <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Digite seu endereço"
                    className="w-full p-3 border rounded-xl mb-2"
                />
                {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
                <div className="flex gap-2 justify-end">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-xl">Cancelar</button>
                    <button
                        onClick={handleSave}
                        disabled={loading || !address.trim()}
                        className="px-4 py-2 bg-orange-500 text-white rounded-xl disabled:opacity-50"
                    >
                        {loading ? 'Buscando...' : 'Salvar'}
                    </button>
                </div>
            </div>
        </div>
    )
}