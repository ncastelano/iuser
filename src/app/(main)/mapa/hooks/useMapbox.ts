import { useCallback, useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!

export function useMapbox(initialCenter: { lng: number; lat: number } | null, mapStyle: 'streets' | 'satellite') {
    const mapRef = useRef<mapboxgl.Map | null>(null)
    const mapContainerRef = useRef<HTMLDivElement | null>(null)
    const [mapReady, setMapReady] = useState(false)

    useEffect(() => {
        if (!mapContainerRef.current || !initialCenter) return

        console.log('[useMapbox] Inicializando mapa com centro:', initialCenter)

        const map = new mapboxgl.Map({
            container: mapContainerRef.current,
            style: mapStyle === 'streets' ? 'mapbox://styles/mapbox/streets-v12' : 'mapbox://styles/mapbox/satellite-streets-v12',
            center: [initialCenter.lng, initialCenter.lat],
            zoom: 14,
            attributionControl: false
        })

        // Adiciona controles de navegação (zoom, rotate, compass)
        map.addControl(new mapboxgl.NavigationControl({
            showCompass: true,
            showZoom: true,
            visualizePitch: true
        }), 'bottom-right')

        // Adiciona controle de geolocalização
        const geolocateControl = new mapboxgl.GeolocateControl({
            positionOptions: { enableHighAccuracy: true },
            trackUserLocation: true,
            showUserHeading: true,
            showAccuracyCircle: true
        })
        map.addControl(geolocateControl, 'bottom-right')

        map.on('load', () => {
            console.log('[useMapbox] Mapa carregado e pronto')
            setMapReady(true)
        })

        map.on('error', (error) => {
            console.error('[useMapbox] Erro no mapa:', error)
        })

        mapRef.current = map

        return () => {
            console.log('[useMapbox] Removendo mapa')
            setMapReady(false)
            if (mapRef.current) {
                mapRef.current.remove()
                mapRef.current = null
            }
        }
    }, [initialCenter, mapStyle])

    // Função para centralizar o mapa em uma localização
    const flyTo = useCallback((lng: number, lat: number, zoom: number = 15) => {
        if (mapRef.current) {
            mapRef.current.flyTo({ center: [lng, lat], zoom, duration: 1000 })
        }
    }, [])

    return { mapRef, mapContainerRef, mapReady, flyTo }
}