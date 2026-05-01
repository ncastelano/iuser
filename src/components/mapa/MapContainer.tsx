'use client'

import { forwardRef } from 'react'

interface MapContainerProps {
    mapContainerRef: React.RefObject<HTMLDivElement | null>
    mapReady: boolean
    loadingLocation: boolean
}

export const MapContainer = forwardRef<HTMLDivElement, MapContainerProps>(
    ({ mapContainerRef, mapReady, loadingLocation }, ref) => {
        return (
            <>
                <div
                    ref={(el) => {
                        if (mapContainerRef) {
                            (mapContainerRef as React.MutableRefObject<HTMLDivElement | null>).current = el
                        }
                        if (typeof ref === 'function') ref(el)
                        else if (ref) ref.current = el
                    }}
                    className="absolute inset-0 w-full h-full"
                    style={{ background: '#111' }}
                />

                {(!mapReady || loadingLocation) && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-orange-500/90 to-red-500/90 backdrop-blur-xl z-10">
                        <div className="text-center">
                            <div className="w-16 h-16 border-4 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-4" />
                            <span className="text-white text-xl font-black animate-pulse">
                                {loadingLocation ? 'Buscando sua localização...' : 'Carregando mapa...'}
                            </span>
                        </div>
                    </div>
                )}
            </>
        )
    }
)

MapContainer.displayName = 'MapContainer'