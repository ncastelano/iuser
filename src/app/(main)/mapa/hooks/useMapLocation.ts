import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

function parseCoords(location: any): [number, number] | null {
    if (!location) return null

    if (typeof location === 'string' && (location.startsWith('{') || location.startsWith('['))) {
        try {
            const parsed = JSON.parse(location)
            if (parsed && typeof parsed === 'object') {
                location = parsed
            }
        } catch { }
    }

    if (location?.type === 'Point' && Array.isArray(location.coordinates)) {
        const [lng, lat] = location.coordinates
        return isFinite(lng) && isFinite(lat) ? [lng, lat] : null
    }

    if (typeof location === 'string' && location.toUpperCase().includes('POINT')) {
        const match = location.match(/POINT\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/i)
        if (match) return [parseFloat(match[1]), parseFloat(match[2])]
    }

    return null
}

async function reverseGeocode(lng: number, lat: number, token: string): Promise<string> {
    try {
        const response = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}&language=pt&types=address,place,locality`
        )
        const data = await response.json()
        if (data.features && data.features[0]) {
            return data.features[0].place_name
        }
        return `${lat.toFixed(4)}, ${lng.toFixed(4)}`
    } catch (error) {
        console.error('Erro no reverse geocoding:', error)
        return `${lat.toFixed(4)}, ${lng.toFixed(4)}`
    }
}

export function useMapLocation() {
    const [deviceLocation, setDeviceLocation] = useState<{ lat: number; lng: number } | null>(null)
    const [profileLocation, setProfileLocation] = useState<{ lat: number; lng: number } | null>(null)
    const [userAddress, setUserAddress] = useState<string | null>(null)
    const [isLoggedIn, setIsLoggedIn] = useState(false)
    const [userId, setUserId] = useState<string | null>(null)
    const [userAvatar, setUserAvatar] = useState<string | null>(null)
    const [userName, setUserName] = useState<string>('')
    const [profileData, setProfileData] = useState<any>(null)
    const [loadingLocation, setLoadingLocation] = useState(true)

    const loadUserProfile = useCallback(async (id: string) => {
        try {
            const supabase = createClient()
            const { data: profile, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', id)
                .single()

            if (error) {
                console.error('[MapLocation] Erro ao carregar perfil:', error)
                return null
            }

            return profile
        } catch (error) {
            console.error('[MapLocation] Erro inesperado:', error)
            return null
        }
    }, [])

    const saveLocationToProfile = useCallback(async (lng: number, lat: number, address: string): Promise<void> => {
        try {
            const supabase = createClient()
            const { data: { user } } = await supabase.auth.getUser()

            if (!user) {
                toast.error('Você precisa estar logado para salvar uma localização.')
                return
            }

            const locationWKT = `POINT(${lng} ${lat})`

            const { error: updateError } = await supabase
                .from('profiles')
                .update({ location: locationWKT, address })
                .eq('id', user.id)

            if (updateError) {
                const { data: existingProfile } = await supabase
                    .from('profiles')
                    .select('id')
                    .eq('id', user.id)
                    .single()

                if (!existingProfile) {
                    const { error: insertError } = await supabase
                        .from('profiles')
                        .insert({ id: user.id, location: locationWKT, address })

                    if (insertError) {
                        toast.error(`Erro ao salvar: ${insertError.message}`)
                        return
                    }
                } else {
                    toast.error(`Erro ao atualizar: ${updateError.message}`)
                    return
                }
            }

            setProfileLocation({ lat, lng })
            setUserAddress(address)

            const freshProfile = await loadUserProfile(user.id)
            if (freshProfile) {
                setProfileData(freshProfile)
                setUserAvatar(freshProfile.avatar_url || null)
                setUserName(freshProfile.name || freshProfile.full_name || 'Usuário')
            }

            toast.success('📍 Localização salva com sucesso!', {
                description: address.split(',')[0],
                duration: 3000,
            })
        } catch (error) {
            console.error('[MapLocation] Erro ao salvar:', error)
            toast.error('Ocorreu um erro inesperado ao salvar a localização.')
        }
    }, [loadUserProfile])

    const removeLocation = useCallback(async () => {
        try {
            const supabase = createClient()
            const { data: { user } } = await supabase.auth.getUser()

            if (!user) {
                toast.error('Você precisa estar logado para remover a localização.')
                return
            }

            const { error } = await supabase
                .from('profiles')
                .update({ location: null, address: null })
                .eq('id', user.id)

            if (error) {
                toast.error('Erro ao remover localização')
                return
            }

            setProfileLocation(null)
            setUserAddress(null)
            toast.success('Localização removida com sucesso!')
        } catch (error) {
            console.error('[MapLocation] Erro ao remover:', error)
            toast.error('Erro ao remover localização')
        }
    }, [])

    useEffect(() => {
        const getUserAndLocation = async () => {
            setLoadingLocation(true)

            try {
                const supabase = createClient()
                const { data: { user }, error: userError } = await supabase.auth.getUser()

                setIsLoggedIn(!!user)
                setUserId(user?.id || null)

                if (user) {
                    const profile = await loadUserProfile(user.id)

                    if (profile) {
                        setProfileData(profile)
                        setUserAvatar(profile.avatar_url || null)
                        setUserName(profile.name || profile.full_name || 'Usuário')

                        if (profile.location) {
                            const coords = parseCoords(profile.location)
                            if (coords) {
                                const [lng, lat] = coords
                                setProfileLocation({ lat, lng })

                                if (profile.address) {
                                    setUserAddress(profile.address)
                                } else {
                                    const address = await reverseGeocode(lng, lat, process.env.NEXT_PUBLIC_MAPBOX_TOKEN!)
                                    setUserAddress(address)
                                    await supabase.from('profiles').update({ address }).eq('id', user.id)
                                }
                            }
                        }
                    }
                }

                // Fallback para geolocalização do dispositivo
                if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(
                        (pos) => {
                            setDeviceLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
                        },
                        () => {
                            setDeviceLocation({ lat: -15.7939, lng: -47.8828 })
                        },
                        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
                    )
                } else {
                    setDeviceLocation({ lat: -15.7939, lng: -47.8828 })
                }
            } catch (error) {
                console.error('[MapLocation] Erro geral:', error)
                setDeviceLocation({ lat: -15.7939, lng: -47.8828 })
            } finally {
                setLoadingLocation(false)
            }
        }

        getUserAndLocation()
    }, [loadUserProfile])

    // Realtime listener
    useEffect(() => {
        if (!isLoggedIn || !userId) return

        const supabase = createClient()
        const channel = supabase
            .channel('profile-updates-map')
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'profiles',
                    filter: `id=eq.${userId}`,
                },
                async (payload) => {
                    const newProfile = payload.new as any
                    setProfileData(newProfile)
                    setUserAvatar(newProfile.avatar_url || null)
                    setUserName(newProfile.name || newProfile.full_name || 'Usuário')

                    if (newProfile.location) {
                        const coords = parseCoords(newProfile.location)
                        if (coords) {
                            const [lng, lat] = coords
                            setProfileLocation({ lat, lng })
                            const address = newProfile.address || await reverseGeocode(lng, lat, process.env.NEXT_PUBLIC_MAPBOX_TOKEN!)
                            setUserAddress(address)
                            toast.success('📍 Localização atualizada!')
                        }
                    } else {
                        setProfileLocation(null)
                        setUserAddress(null)
                    }
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [isLoggedIn, userId])

    const referenceLocation = profileLocation || deviceLocation

    return {
        referenceLocation,
        profileLocation,
        deviceLocation,
        userAddress,
        isLoggedIn,
        userId,
        userAvatar,
        userName,
        profileData,
        loadingLocation,
        saveLocationToProfile,
        removeLocation,
        setProfileLocation,
        setUserAddress,
    }
}