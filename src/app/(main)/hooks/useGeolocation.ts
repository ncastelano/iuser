import { useState, useEffect } from 'react'

export function useGeolocation() {
    const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!navigator.geolocation) {
            setError('Geolocalização não suportada')
            setLoading(false)
            return
        }

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setUserLocation({
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude
                })
                setLoading(false)
            },
            (err) => {
                console.warn('[Geolocation] Erro:', err.message)
                setError(err.message)
                setLoading(false)
            }
        )
    }, [])

    return { userLocation, loading, error }
}