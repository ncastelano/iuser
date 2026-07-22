// src/app/(main)/LocationPicker.tsx
'use client'

import { useState } from 'react'
import { useTheme } from '@/app/theme'
import { MapPin, X, Check, Navigation } from 'lucide-react'

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

    // Obter localização atual do GPS
    const handleGetCurrentLocation = () => {
        if (!navigator.geolocation) {
            setError('Geolocalização não suportada pelo seu navegador')
            return
        }

        setLoading(true)
        setError('')

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords
                const loc = {
                    lat: latitude,
                    lng: longitude,
                    address: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
                }
                setAddress(loc.address)
                console.log('[LocationPicker] ✅ GPS obtido:', loc)
                onSave(loc)
                setLoading(false)
            },
            (err) => {
                console.error('[LocationPicker] Erro GPS:', err)
                let errorMsg = 'Erro ao obter localização. '
                switch (err.code) {
                    case err.PERMISSION_DENIED:
                        errorMsg += 'Permissão negada.'
                        break
                    case err.POSITION_UNAVAILABLE:
                        errorMsg += 'Localização indisponível.'
                        break
                    case err.TIMEOUT:
                        errorMsg += 'Tempo esgotado.'
                        break
                }
                setError(errorMsg)
                setLoading(false)
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        )
    }

    // Salvar apenas com o endereço digitado
    const handleSaveAddressOnly = () => {
        if (!address.trim()) {
            setError('Digite um endereço')
            return
        }

        // Mantém coordenadas anteriores ou usa 0,0
        const loc = {
            lat: initialLocation?.lat || 0,
            lng: initialLocation?.lng || 0,
            address: address.trim()
        }

        console.log('[LocationPicker] ✅ Salvando endereço:', loc)
        onSave(loc)
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm">
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

                {/* Botão GPS */}
                <button
                    onClick={handleGetCurrentLocation}
                    disabled={loading}
                    className="w-full flex items-center gap-2 px-4 py-2.5 mb-3 rounded-full text-sm font-semibold transition-all duration-200 hover:opacity-80 disabled:opacity-50 active:scale-95"
                    style={{
                        background: `${colors.accent}22`,
                        color: colors.accent,
                        border: `1px solid ${colors.accent}44`,
                    }}
                >
                    <Navigation size={16} />
                    {loading ? 'Obtendo localização...' : 'Usar minha localização atual (GPS)'}
                </button>

                <div className="flex items-center gap-2 my-3">
                    <div className="flex-1 h-px" style={{ background: colors.border }} />
                    <span className="text-xs font-medium" style={{ color: colors.textSecondary }}>
                        ou digite o endereço
                    </span>
                    <div className="flex-1 h-px" style={{ background: colors.border }} />
                </div>

                {/* Campo de endereço */}
                <div className="flex items-center pl-0 pr-3 py-0.5 rounded-full text-xs sm:text-sm font-semibold mb-3"
                    style={{
                        background: `${colors.surface}88`,
                        backdropFilter: 'blur(10px)',
                        color: colors.textSecondary,
                        border: `1px solid ${colors.border}`,
                    }}
                >
                    <div
                        className="h-7 w-7 sm:h-9 sm:w-9 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ background: `${colors.surface}88`, backdropFilter: 'blur(10px)' }}
                    >
                        <MapPin size={14} color={colors.textSecondary} />
                    </div>
                    <input
                        type="text"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="Ex: Rua das Flores, 123 - Bairro"
                        className="flex-1 bg-transparent outline-none ml-1.5 sm:ml-2"
                        style={{ color: colors.textPrimary }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveAddressOnly()
                        }}
                    />
                </div>

                {error && (
                    <p className="text-red-500 text-xs font-medium mb-2 ml-2">{error}</p>
                )}

                <p className="text-xs mb-4 ml-2" style={{ color: colors.textSecondary }}>
                    💡 Use o GPS para coordenadas exatas ou digite seu endereço.
                </p>

                {/* Botões */}
                <div className="flex gap-2 justify-end mt-5">
                    <button
                        onClick={onClose}
                        className="flex items-center pl-0 pr-3 py-0.5 rounded-full text-xs sm:text-sm font-semibold transition-all duration-200 hover:opacity-80"
                        style={{
                            background: `${colors.surface}88`,
                            backdropFilter: 'blur(10px)',
                            color: colors.textSecondary,
                            border: `1px solid ${colors.border}`,
                        }}
                    >
                        <div
                            className="h-7 w-7 sm:h-9 sm:w-9 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ background: `${colors.surface}88`, backdropFilter: 'blur(10px)' }}
                        >
                            <X size={14} color={colors.textSecondary} />
                        </div>
                        <span className="ml-1.5 sm:ml-2">Cancelar</span>
                    </button>

                    <button
                        onClick={handleSaveAddressOnly}
                        disabled={loading || !address.trim()}
                        className="flex items-center pl-0 pr-3 py-0.5 rounded-full text-xs sm:text-sm font-semibold transition-all duration-200 hover:opacity-90 disabled:opacity-50 active:scale-95"
                        style={{
                            background: colors.accent,
                            backdropFilter: 'blur(10px)',
                            color: colors.accentText,
                        }}
                    >
                        <div
                            className="h-7 w-7 sm:h-9 sm:w-9 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ background: colors.accent, backdropFilter: 'blur(10px)' }}
                        >
                            <Check size={14} color={colors.accentText} />
                        </div>
                        <span className="ml-1.5 sm:ml-2">{loading ? 'Salvando...' : 'Salvar'}</span>
                    </button>
                </div>
            </div>
        </div>
    )
}