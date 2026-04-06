'use client'

import dynamic from 'next/dynamic'

// Dynamically import the map to avoid SSR issues with Leaflet
const MapComponent = dynamic(() => import('./MapComponent'), {
    ssr: false,
    loading: () => (
        <div className="flex-1 w-full flex items-center justify-center bg-black">
            <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
    )
})

export default function Mapa() {
    return (
        <div className="w-full h-full flex flex-col min-h-screen bg-black">
            <MapComponent />
        </div>
    )
}
