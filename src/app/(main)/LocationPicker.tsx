'use client'

import { useState } from 'react'
import { useTheme } from '@/app/theme'
import { MapPin, X, Check } from 'lucide-react'

interface LocationPickerProps {
    initialLocation: { lat: number; lng: number; address: string } | null
    onSave: (location: { lat: number; lng: number; address: string }) => void
    onClose: () => void
}

export default function LocationPicker({ initialLocation, onSave, onClose }: LocationPickerProps) {
    const { colors } = useTheme()
    const [address, setAddress] = useState(initialLocation?.address || '')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const handleSave = async () => {
        if (!address.trim()) return
        setLoading(true)
        setError('')
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`)
            const data = await res.json()
            if (data.length > 0) {
                const loc = {
                    lat: parseFloat(data[0].lat),
                    lng: parseFloat(data[0].lon),
                    address: data[0].display_name.split(',')[0]
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm">
            {/* Modal com o mesmo visual das abas inativas */}
            <div
                className="rounded-2xl p-6 w-full max-w-md shadow-2xl"
                style={{
                    background: `${colors.surface}88`,
                    backdropFilter: 'blur(20px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                    border: `1px solid ${colors.border}`,
                    color: colors.textPrimary,
                }}
            >
                <h3 className="text-lg font-extrabold mb-4 tracking-tight">
                    Sua localização
                </h3>

                {/* Campo de endereço – estrutura igual a uma aba inativa */}
                <div className="flex items-center pl-0 pr-3 py-0.5 rounded-full text-xs sm:text-sm font-semibold mb-3"
                    style={{
                        background: `${colors.surface}88`,
                        backdropFilter: 'blur(10px)',
                        color: colors.textSecondary,
                        border: `1px solid ${colors.border}`,
                    }}
                >
                    {/* Círculo com ícone (idêntico ao das abas) */}
                    <div
                        className="h-7 w-7 sm:h-9 sm:w-9 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{
                            background: `${colors.surface}88`,
                            backdropFilter: 'blur(10px)',
                        }}
                    >
                        <MapPin size={14} color={colors.textSecondary} />
                    </div>
                    <input
                        type="text"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="Digite seu endereço"
                        className="flex-1 bg-transparent outline-none ml-1.5 sm:ml-2"
                        style={{ color: colors.textPrimary }}
                    />
                </div>

                {error && (
                    <p className="text-red-500 text-xs font-medium mb-2 ml-2">{error}</p>
                )}

                {/* Botões no estilo exato das abas do Header */}
                <div className="flex gap-2 justify-end mt-5">
                    {/* Cancelar (aba inativa) */}
                    <button
                        onClick={onClose}
                        className="flex items-center pl-0 pr-3 py-0.5 rounded-full text-xs sm:text-sm font-semibold transition-all duration-200"
                        style={{
                            background: `${colors.surface}88`,
                            backdropFilter: 'blur(10px)',
                            color: colors.textSecondary,
                            border: `1px solid ${colors.border}`,
                        }}
                    >
                        <div
                            className="h-7 w-7 sm:h-9 sm:w-9 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{
                                background: `${colors.surface}88`,
                                backdropFilter: 'blur(10px)',
                            }}
                        >
                            <X size={14} color={colors.textSecondary} />
                        </div>
                        <span className="ml-1.5 sm:ml-2">Cancelar</span>
                    </button>

                    {/* Salvar (aba ativa) */}
                    <button
                        onClick={handleSave}
                        disabled={loading || !address.trim()}
                        className="flex items-center pl-0 pr-3 py-0.5 rounded-full text-xs sm:text-sm font-semibold transition-all duration-200 disabled:opacity-50"
                        style={{
                            background: colors.accent,
                            backdropFilter: 'blur(10px)',
                            color: colors.accentText,
                        }}
                    >
                        <div
                            className="h-7 w-7 sm:h-9 sm:w-9 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{
                                background: colors.accent,
                                backdropFilter: 'blur(10px)',
                            }}
                        >
                            <Check size={14} color={colors.accentText} />
                        </div>
                        <span className="ml-1.5 sm:ml-2">
                            {loading ? 'Buscando...' : 'Salvar'}
                        </span>
                    </button>
                </div>
            </div>
        </div>
    )
}