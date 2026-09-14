// Wrapper de geolocalização: usa o plugin nativo do Capacitor (GPS de verdade,
// prompts de permissão nativos) quando o app roda empacotado no iOS/Android,
// e cai pra Geolocation API do navegador quando roda no site normal.
// A assinatura imita a API nativa do navegador pra minimizar mudanças nos
// pontos de uso existentes.

import { Capacitor } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'

function toWebPosition(pos: { coords: { latitude: number; longitude: number; accuracy: number; altitude?: number | null; altitudeAccuracy?: number | null; heading?: number | null; speed?: number | null }; timestamp: number }): GeolocationPosition {
    return {
        coords: {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            altitude: pos.coords.altitude ?? null,
            altitudeAccuracy: pos.coords.altitudeAccuracy ?? null,
            heading: pos.coords.heading ?? null,
            speed: pos.coords.speed ?? null,
        },
        timestamp: pos.timestamp,
    } as GeolocationPosition
}

function toWebError(message: string, code: number = 2): GeolocationPositionError {
    return {
        code,
        message,
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
    } as GeolocationPositionError
}

export function getCurrentPosition(
    onSuccess: (position: GeolocationPosition) => void,
    onError?: (error: GeolocationPositionError) => void,
    options?: PositionOptions
): void {
    if (!Capacitor.isNativePlatform()) {
        if (!navigator.geolocation) {
            onError?.(toWebError('Geolocalização não suportada neste navegador'))
            return
        }
        navigator.geolocation.getCurrentPosition(onSuccess, onError, options)
        return
    }

    Geolocation.getCurrentPosition({
        enableHighAccuracy: options?.enableHighAccuracy,
        timeout: options?.timeout,
    })
        .then((pos) => onSuccess(toWebPosition(pos)))
        .catch((err) => onError?.(toWebError(err?.message || 'Erro ao obter localização')))
}

export interface GeoWatchHandle {
    clear: () => void
}

export function watchPosition(
    onSuccess: (position: GeolocationPosition) => void,
    onError?: (error: GeolocationPositionError) => void,
    options?: PositionOptions
): GeoWatchHandle {
    if (!Capacitor.isNativePlatform()) {
        if (!navigator.geolocation) return { clear: () => { } }
        const id = navigator.geolocation.watchPosition(onSuccess, onError, options)
        return { clear: () => navigator.geolocation.clearWatch(id) }
    }

    let callbackId: string | null = null
    let cleared = false

    Geolocation.watchPosition(
        { enableHighAccuracy: options?.enableHighAccuracy, timeout: options?.timeout },
        (pos, err) => {
            if (err) {
                onError?.(toWebError(err.message))
                return
            }
            if (pos) onSuccess(toWebPosition(pos))
        }
    ).then((id) => {
        callbackId = id
        if (cleared) Geolocation.clearWatch({ id })
    })

    return {
        clear: () => {
            cleared = true
            if (callbackId) Geolocation.clearWatch({ id: callbackId })
        },
    }
}
