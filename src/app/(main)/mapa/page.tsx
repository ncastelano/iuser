//app/(main)/mapa/page.tsx

'use client'

import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Search, Store, ShoppingBag, X, MapPin, Star, Briefcase, Layers, Flame, Navigation, Crosshair, Home, Compass, Plus, Edit2, Save, XCircle, Building2, Map as MapIcon, ChevronRight, CheckCircle2, Loader2 } from 'lucide-react'
import { useAppModeStore } from '@/store/useAppModeStore'
import { toast } from 'sonner'
import { LoadingSpinner } from '@/components/vitrine/LoadingSpinner'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!

type Mode = 'lojas' | 'servicos' | 'produtos'

// Função para parsear coordenadas
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

    if (typeof location === 'string' && location.length >= 42 && /^[0-9A-F]+$/i.test(location)) {
        try {
            const hexToDouble = (hex: string) => {
                const bytes = new Uint8Array(hex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)))
                const view = new DataView(bytes.buffer)
                return view.getFloat64(0, true)
            }

            if (location.length === 50) {
                const lng = hexToDouble(location.substring(18, 34))
                const lat = hexToDouble(location.substring(34, 50))
                return isFinite(lng) && isFinite(lat) ? [lng, lat] : null
            } else if (location.length === 42) {
                const lng = hexToDouble(location.substring(10, 26))
                const lat = hexToDouble(location.substring(26, 42))
                return isFinite(lng) && isFinite(lat) ? [lng, lat] : null
            }
        } catch (e) { console.error('[Geo] WKB Error:', e) }
    }

    return null
}

// Função para buscar endereço a partir de coordenadas (reverse geocoding)
async function reverseGeocode(lng: number, lat: number): Promise<string> {
    try {
        const response = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${mapboxgl.accessToken}&language=pt&types=address,place,locality`
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

export default function MapPage() {
    const mapRef = useRef<mapboxgl.Map | null>(null)
    const mapContainerRef = useRef<HTMLDivElement | null>(null)
    const markersRef = useRef<mapboxgl.Marker[]>([])
    const userMarkerRef = useRef<mapboxgl.Marker | null>(null)
    const profileMarkerRef = useRef<mapboxgl.Marker | null>(null)
    const clusterMarkersRef = useRef<mapboxgl.Marker[]>([])

    const [mode, setMode] = useState<Mode>('lojas')
    const [stores, setStores] = useState<any[]>([])
    const [products, setProducts] = useState<any[]>([])
    const [filtered, setFiltered] = useState<any[]>([])
    const [selectedItem, setSelectedItem] = useState<any | null>(null)
    const [search, setSearch] = useState('')
    const [mapReady, setMapReady] = useState(false)
    const [deviceLocation, setDeviceLocation] = useState<{ lat: number; lng: number } | null>(null)
    const [profileLocation, setProfileLocation] = useState<{ lat: number; lng: number } | null>(null)
    const [overrideList, setOverrideList] = useState<any[] | null>(null)
    const [showFilters, setShowFilters] = useState(false)
    const [mapStyle, setMapStyle] = useState<'streets' | 'satellite'>('streets')
    const [loadingLocation, setLoadingLocation] = useState(true)
    const [userAddress, setUserAddress] = useState<string | null>(null)
    const [showLocationDialog, setShowLocationDialog] = useState(false)
    const [searchAddress, setSearchAddress] = useState('')
    const [searchingAddress, setSearchingAddress] = useState(false)
    const [addressSuggestions, setAddressSuggestions] = useState<any[]>([])
    const [editingLocation, setEditingLocation] = useState(false)
    const [clusterItems, setClusterItems] = useState<any[] | null>(null)
    const [clusterLocation, setClusterLocation] = useState<{ lng: number; lat: number; name: string } | null>(null)
    const [isLoggedIn, setIsLoggedIn] = useState(false)
    const [userId, setUserId] = useState<string | null>(null)
    const [userAvatar, setUserAvatar] = useState<string | null>(null)
    const [userName, setUserName] = useState<string>('')
    const [profileData, setProfileData] = useState<any>(null)
    const [mapInitialized, setMapInitialized] = useState(false)

    const router = useRouter()
    const { mode: appMode } = useAppModeStore()

    // Debug do modo atual
    useEffect(() => {
        console.log('[MapPage] Modo atual do mapa:', mode)
    }, [mode])

    // Função para carregar o perfil do usuário (REUSÁVEL)
    const loadUserProfile = async (userId: string) => {
        try {
            const supabase = createClient()
            console.log('[MapPage] 🔍 Carregando perfil para userId:', userId)

            const { data: profile, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single()

            if (error) {
                console.error('[MapPage] ❌ Erro ao carregar perfil:', error)
                return null
            }

            console.log('[MapPage] ✅ Perfil carregado:', profile)
            return profile
        } catch (error) {
            console.error('[MapPage] ❌ Erro inesperado ao carregar perfil:', error)
            return null
        }
    }

    // GET USER AND PROFILE LOCATION (inicial)
    useEffect(() => {
        const getUserAndLocation = async () => {
            setLoadingLocation(true)
            console.log('[MapPage] 🚀 Iniciando carregamento de localização...')

            try {
                const supabase = createClient()
                const { data: { user }, error: userError } = await supabase.auth.getUser()

                console.log('[MapPage] 👤 Usuário autenticado:', user ? 'Sim' : 'Não', user?.id)

                if (userError) {
                    console.error('[MapPage] ❌ Erro ao obter usuário:', userError)
                }

                setIsLoggedIn(!!user)
                setUserId(user?.id || null)

                if (user) {
                    const profile = await loadUserProfile(user.id)

                    if (profile) {
                        setProfileData(profile)

                        if (profile.location) {
                            console.log('[MapPage] 📍 Localização encontrada no perfil:', profile.location)
                            const coords = parseCoords(profile.location)

                            if (coords) {
                                const [lng, lat] = coords
                                console.log('[MapPage] 🗺️ Coordenadas parseadas:', { lng, lat })

                                setProfileLocation({ lat, lng })

                                if (profile.address) {
                                    console.log('[MapPage] 📝 Endereço do perfil:', profile.address)
                                    setUserAddress(profile.address)
                                } else {
                                    console.log('[MapPage] 🔄 Buscando endereço por coordenadas...')
                                    const address = await reverseGeocode(lng, lat)
                                    console.log('[MapPage] 📝 Endereço obtido:', address)
                                    setUserAddress(address)

                                    await supabase
                                        .from('profiles')
                                        .update({ address })
                                        .eq('id', user.id)
                                }
                            } else {
                                console.warn('[MapPage] ⚠️ Não foi possível parsear as coordenadas:', profile.location)
                                setProfileLocation(null)
                                setUserAddress(null)
                            }
                        } else {
                            console.log('[MapPage] 📍 Nenhuma localização salva no perfil')
                            setProfileLocation(null)
                            setUserAddress(null)
                        }

                        setUserAvatar(profile.avatar_url || null)
                        const displayName = profile.name || profile.full_name || 'Usuário'
                        setUserName(displayName)

                        setLoadingLocation(false)
                        return
                    } else {
                        console.warn('[MapPage] ⚠️ Perfil não encontrado para o usuário')
                        setProfileLocation(null)
                        setUserAddress(null)
                    }
                } else {
                    console.log('[MapPage] 👤 Usuário não está logado')
                }

                // Fallback para geolocalização do dispositivo
                console.log('[MapPage] 📱 Tentando geolocalização do dispositivo...')
                if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(
                        (pos) => {
                            const location = { lat: pos.coords.latitude, lng: pos.coords.longitude }
                            console.log('[MapPage] 📱 Localização do dispositivo:', location)
                            setDeviceLocation(location)
                            setLoadingLocation(false)
                        },
                        (error) => {
                            console.error('[MapPage] ❌ Erro na geolocalização:', error)
                            setLoadingLocation(false)
                            setDeviceLocation({ lat: -15.7939, lng: -47.8828 })
                        },
                        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
                    )
                } else {
                    console.warn('[MapPage] ⚠️ Geolocalização não suportada')
                    setLoadingLocation(false)
                    setDeviceLocation({ lat: -15.7939, lng: -47.8828 })
                }
            } catch (error) {
                console.error('[MapPage] ❌ Erro geral:', error)
                setLoadingLocation(false)
                setDeviceLocation({ lat: -15.7939, lng: -47.8828 })
            }
        }

        getUserAndLocation()
    }, [])

    // REALTIME: escuta mudanças no perfil do usuário logado
    useEffect(() => {
        if (!isLoggedIn || !userId) return

        const supabase = createClient()

        console.log('[MapPage] 🔄 Configurando listener Realtime para perfil, userId:', userId)

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
                    console.log('[MapPage] 📡 Mudança de perfil detectada via Realtime:', payload.new)
                    const newProfile = payload.new as any

                    setProfileData(newProfile)
                    setUserAvatar(newProfile.avatar_url || null)
                    setUserName(newProfile.name || newProfile.full_name || 'Usuário')

                    if (newProfile.location) {
                        const coords = parseCoords(newProfile.location)
                        if (coords) {
                            const [lng, lat] = coords
                            console.log('[MapPage] 📡 Atualizando localização via Realtime:', { lng, lat })
                            setProfileLocation({ lat, lng })

                            const address = newProfile.address || await reverseGeocode(lng, lat)
                            setUserAddress(address)

                            if (mapRef.current && mapInitialized) {
                                mapRef.current.flyTo({
                                    center: [lng, lat],
                                    zoom: 15,
                                    duration: 1000
                                })
                            }

                            toast.success('📍 Localização atualizada!', {
                                description: address.split(',')[0],
                                duration: 3000,
                            })
                        }
                    } else {
                        console.log('[MapPage] 📡 Localização removida via Realtime')
                        setProfileLocation(null)
                        setUserAddress(null)
                        toast.info('Localização removida do perfil')

                        if (profileMarkerRef.current) {
                            profileMarkerRef.current.remove()
                            profileMarkerRef.current = null
                        }
                    }
                }
            )
            .subscribe((status) => {
                console.log('[MapPage] 📡 Status do canal Realtime:', status)
            })

        return () => {
            console.log('[MapPage] 🧹 Removendo canal Realtime de perfil')
            supabase.removeChannel(channel)
        }
    }, [isLoggedIn, userId, mapInitialized])

    const referenceLocation = profileLocation || deviceLocation

    // INIT MAP - CORRIGIDO COM FALLBACK
    useEffect(() => {
        if (!mapContainerRef.current) return

        // Fallback para Brasília caso não tenha localização
        const centerLocation = referenceLocation || { lat: -15.7939, lng: -47.8828 }

        console.log('[MapPage]  Inicializando mapa em:', centerLocation)

        const map = new mapboxgl.Map({
            container: mapContainerRef.current,
            style: mapStyle === 'streets' ? 'mapbox://styles/mapbox/streets-v12' : 'mapbox://styles/mapbox/satellite-streets-v12',
            center: [centerLocation.lng, centerLocation.lat],
            zoom: 14,
            attributionControl: false
        })

        // Adiciona controles de navegação com opções completas
        map.addControl(new mapboxgl.NavigationControl({
            showCompass: true,
            showZoom: true,
            visualizePitch: true
        }), 'bottom-right')

        // Adiciona controle de geolocalização
        map.addControl(new mapboxgl.GeolocateControl({
            positionOptions: { enableHighAccuracy: true },
            trackUserLocation: true,
            showUserHeading: true,
            showAccuracyCircle: true
        }), 'bottom-right')

        map.on('load', () => {
            setMapReady(true)
            setMapInitialized(true)
            console.log('[MapPage] ✅ Mapa carregado e pronto')
        })

        map.on('error', (error) => {
            console.error('[MapPage] ❌ Erro no mapa:', error)
        })

        mapRef.current = map

        return () => {
            setMapReady(false)
            setMapInitialized(false)
            if (mapRef.current) {
                mapRef.current.remove()
                mapRef.current = null
            }
        }
    }, [referenceLocation?.lat, referenceLocation?.lng, mapStyle])

    // LOAD DATA
    useEffect(() => {
        const load = async () => {
            const supabase = createClient()

            const { data: storesData } = await supabase.from('stores').select('*')
            const { data: productsData } = await supabase.from('products').select('*')
            const { data: profilesList } = await supabase.from('profiles').select('id, profileSlug')

            const mappedStores = (storesData || []).map(s => ({
                ...s,
                profileSlug: (profilesList || []).find((profile) => profile.id === s.owner_id)?.profileSlug || 'loja',
                logo_url: s.logo_url
                    ? supabase.storage.from('store-logos').getPublicUrl(s.logo_url).data.publicUrl
                    : null,
                is_open: s.is_open ?? true
            }))

            const mappedProducts = (productsData || []).map(p => ({
                ...p,
                image_url: p.image_url
                    ? supabase.storage.from('product-images').getPublicUrl(p.image_url).data.publicUrl
                    : null
            }))

            setStores(mappedStores)
            setProducts(mappedProducts)
            console.log('[MapPage] 📦 Dados carregados:', { stores: mappedStores.length, products: mappedProducts.length })
        }

        load()
    }, [])

    // FILTER
    useEffect(() => {
        if (overrideList) {
            setFiltered(overrideList)
            return
        }
        let items = []
        if (mode === 'lojas') {
            items = stores
        } else if (mode === 'servicos') {
            items = products.filter(p => p.type === 'service')
        } else if (mode === 'produtos') {
            items = products.filter(p => p.type === 'physical')
        }

        const q = search.toLowerCase()
        const result = q ? items.filter(i => i.name?.toLowerCase().includes(q)) : items
        setFiltered(result)
        console.log('[MapPage] 🎯 Filtrados:', { mode, count: result.length, search: q })
    }, [search, mode, stores, products, overrideList])

    // Buscar endereço
    const searchAddressHandler = async () => {
        if (!searchAddress.trim()) return
        setSearchingAddress(true)
        try {
            const response = await fetch(
                `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(searchAddress)}.json?access_token=${mapboxgl.accessToken}&language=pt&limit=5`
            )
            const data = await response.json()
            setAddressSuggestions(data.features || [])
        } catch (error) {
            console.error('Erro na busca:', error)
            toast.error('Erro ao buscar endereço')
        } finally {
            setSearchingAddress(false)
        }
    }

    // Salvar localização no perfil
    const saveLocationToProfile = async (lng: number, lat: number, address: string) => {
        try {
            const supabase = createClient()
            const { data: { user } } = await supabase.auth.getUser()

            if (!user) {
                toast.error('Você precisa estar logado para salvar uma localização.')
                return false
            }

            const locationWKT = `POINT(${lng} ${lat})`

            console.log('[MapPage] 💾 Salvando localização:', { locationWKT, address, userId: user.id })

            const { error: updateError } = await supabase
                .from('profiles')
                .update({
                    location: locationWKT,
                    address: address,
                })
                .eq('id', user.id)

            if (updateError) {
                console.error('[MapPage] ❌ Erro no UPDATE:', updateError)

                const { data: existingProfile } = await supabase
                    .from('profiles')
                    .select('id')
                    .eq('id', user.id)
                    .single()

                if (!existingProfile) {
                    const { error: insertError } = await supabase
                        .from('profiles')
                        .insert({
                            id: user.id,
                            location: locationWKT,
                            address: address,
                        })

                    if (insertError) {
                        console.error('[MapPage] ❌ Erro no INSERT:', insertError)
                        toast.error(`Erro ao salvar: ${insertError.message}`)
                        return false
                    } else {
                        console.log('[MapPage] ✅ Perfil criado com sucesso!')
                    }
                } else {
                    toast.error(`Erro ao atualizar: ${updateError.message}`)
                    return false
                }
            } else {
                console.log('[MapPage] ✅ Localização atualizada com sucesso!')
            }

            setProfileLocation({ lat, lng })
            setUserAddress(address)

            if (user.id) {
                const freshProfile = await loadUserProfile(user.id)
                if (freshProfile) {
                    setProfileData(freshProfile)
                    setUserAvatar(freshProfile.avatar_url || null)
                    setUserName(freshProfile.name || freshProfile.full_name || 'Usuário')
                }
            }

            setShowLocationDialog(false)
            setEditingLocation(false)
            setSearchAddress('')
            setAddressSuggestions([])

            if (mapRef.current && mapInitialized) {
                mapRef.current.flyTo({ center: [lng, lat], zoom: 15, duration: 1000 })
            }

            toast.success('Localização salva com sucesso!', {
                description: address.split(',')[0],
                duration: 3000,
            })

            return true
        } catch (error) {
            console.error('[MapPage] ❌ Erro inesperado:', error)
            toast.error('Ocorreu um erro inesperado ao salvar a localização.')
            return false
        }
    }

    // Remover localização do perfil
    // Remover localização do perfil
    const removeLocation = async () => {
        try {
            const supabase = createClient()
            const { data: { user } } = await supabase.auth.getUser()

            if (!user) {
                toast.error('Você precisa estar logado para remover a localização.')
                return
            }

            console.log('[MapPage] 🗑️ Removendo localização do perfil')

            const { error } = await supabase
                .from('profiles')
                .update({ location: null, address: null })
                .eq('id', user.id)

            if (error) {
                console.error('[MapPage] ❌ Erro ao remover localização:', error)
                toast.error('Erro ao remover localização')
                return
            }

            console.log('[MapPage] ✅ Localização removida com sucesso')

            // Apenas remove o estado da localização, sem mover o mapa
            setProfileLocation(null)
            setUserAddress(null)

            // Remove o marcador do perfil
            if (profileMarkerRef.current) {
                profileMarkerRef.current.remove()
                profileMarkerRef.current = null
            }

            toast.success('Localização removida com sucesso!')
        } catch (error) {
            console.error('[MapPage] ❌ Erro ao remover:', error)
            toast.error('Erro ao remover localização')
        }
    }

    // MARKERS - CORRIGIDO COM LOGS
    useEffect(() => {
        if (!mapReady || !mapRef.current) {
            console.log('[MapPage] ⏳ Aguardando mapa ficar pronto para renderizar marcadores...', { mapReady, hasMap: !!mapRef.current })
            return
        }

        const map = mapRef.current
        console.log('[MapPage] 🎨 Renderizando marcadores...', { mode, filteredCount: filtered.length })

        markersRef.current.forEach(m => m.remove())
        markersRef.current = []

        if (filtered.length === 0) {
            console.log('[MapPage] 📭 Nenhum item para marcar')
            return
        }

        const coordGroups: Record<string, any[]> = {}

        filtered.forEach(item => {
            let coords: [number, number] | null = null

            if (mode === 'lojas') {
                coords = parseCoords(item.location)
            } else if (mode === 'produtos' || mode === 'servicos') {
                const store = stores.find(s => s.id === item.store_id)
                coords = parseCoords(item.location) || parseCoords(store?.location)
            }

            if (!coords) {
                console.warn('[MapPage] ⚠️ Sem coordenadas para item:', item.name)
                return
            }

            const key = `${coords[0].toFixed(4)},${coords[1].toFixed(4)}`
            if (!coordGroups[key]) coordGroups[key] = []
            coordGroups[key].push({ item, coords })
        })

        console.log('[MapPage] 📍 Grupos de coordenadas encontrados:', Object.keys(coordGroups).length)

        Object.values(coordGroups).forEach(group => {
            group.forEach((entry, index) => {
                const { item, coords } = entry

                let lng = coords[0]
                let lat = coords[1]

                const imageUrl = mode === 'lojas' ? item.logo_url : item.image_url

                const el = document.createElement('div')
                el.style.zIndex = (100 - index).toString()

                const inner = document.createElement('div')

                let borderColor = '#f97316'
                if (mode === 'lojas') {
                    borderColor = item.is_open ? '#22c55e' : '#ef4444'
                }

                inner.style.cssText = `
                    width: 48px;
                    height: 48px;
                    border-radius: 12px;
                    overflow: hidden;
                    border: 3px solid ${borderColor};
                    cursor: pointer;
                    background: white;
                    transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                    box-shadow: 0 4px 15px rgba(0,0,0,0.3);
                `

                inner.onmouseenter = () => {
                    inner.style.transform = 'scale(1.15) rotate(3deg)'
                    inner.style.boxShadow = '0 8px 25px rgba(249,115,22,0.4)'
                    el.style.zIndex = "999"
                }

                inner.onmouseleave = () => {
                    inner.style.transform = 'scale(1) rotate(0deg)'
                    inner.style.boxShadow = '0 4px 15px rgba(0,0,0,0.3)'
                    el.style.zIndex = (100 - index).toString()
                }

                const storeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 7 4.41-2.20a2 2 0 0 1 1.76 0l4.23 2.12a2 2 0 0 0 1.76 0L18.4 4.8a2 2 0 0 1 1.76 0L22 7"/><path d="M22 7v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7"/><path d="M2 11h20"/><path d="M16 11v9"/><path d="M8 11v9"/></svg>`

                if (imageUrl) {
                    const img = document.createElement('img')
                    img.src = imageUrl
                    img.style.cssText = 'width:100%;height:100%;object-fit:cover;'
                    img.onerror = () => {
                        inner.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;">${storeSvg}</div>`
                    }
                    inner.appendChild(img)
                } else {
                    inner.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;">${storeSvg}</div>`
                }

                el.appendChild(inner)

                if (index === 0 && group.length > 1) {
                    const badge = document.createElement('div')
                    badge.innerHTML = `${group.length}`
                    badge.style.cssText = `
                        position: absolute;
                        bottom: -8px;
                        right: -8px;
                        background: linear-gradient(135deg, #f97316, #ef4444);
                        color: white;
                        font-size: 10px;
                        font-weight: 900;
                        padding: 3px 8px;
                        border-radius: 20px;
                        border: 2px solid white;
                        z-index: 10;
                        cursor: pointer;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                    `
                    badge.onclick = (e) => {
                        e.stopPropagation()
                        setClusterItems(group.map(g => g.item))
                        setClusterLocation({
                            lng,
                            lat,
                            name: `${group.length} estabelecimentos nesta localização`
                        })
                        map.flyTo({ center: [lng, lat], zoom: 18, duration: 600 })
                    }
                    el.appendChild(badge)
                }

                el.onclick = async () => {
                    setSelectedItem(item)
                    map.flyTo({ center: [lng, lat], zoom: 16, duration: 600 })
                }

                const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
                    .setLngLat([lng, lat])
                    .addTo(map)

                markersRef.current.push(marker)
            })
        })

        console.log('[MapPage] ✅ Marcadores criados:', markersRef.current.length)
    }, [filtered, mode, stores, mapReady])

    // PROFILE MARKER
    // PROFILE MARKER
    useEffect(() => {
        if (!mapReady || !mapRef.current) return

        if (profileMarkerRef.current) {
            profileMarkerRef.current.remove()
        }

        if (profileLocation && isLoggedIn && (userAvatar || userName)) {
            // Criar container principal
            const el = document.createElement('div')
            el.style.cssText = `
            position: relative;
            width: 44px;
            height: 44px;
        `

            // Criar o círculo pulsante (efeito de onda)
            const pulseRing = document.createElement('div')
            pulseRing.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 44px;
            height: 44px;
            border-radius: 50%;
            border: 3px solid #f97316;
            animation: profilePulse 2s cubic-bezier(0.25, 0.46, 0.45, 0.94) infinite;
            pointer-events: none;
        `

            // Criar o avatar circular
            const avatarCircle = document.createElement('div')
            avatarCircle.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 44px;
            height: 44px;
            border-radius: 50%;
            overflow: hidden;
            background: white;
            border: 3px solid #f97316;
            box-shadow: 0 0 0 3px rgba(249,115,22,0.3), 0 8px 20px rgba(0,0,0,0.2);
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.3s;
            z-index: 1;
        `

            // Adicionar conteúdo do avatar
            if (userAvatar) {
                const img = document.createElement('img')
                img.src = userAvatar
                img.style.cssText = 'width:100%;height:100%;object-fit:cover;'
                img.onerror = () => {
                    avatarCircle.innerHTML = `
                    <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#f97316,#ef4444);color:white;font-weight:bold;font-size:20px">
                        ${userName.charAt(0).toUpperCase()}
                    </div>
                `
                }
                avatarCircle.appendChild(img)
            } else {
                avatarCircle.innerHTML = `
                <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#f97316,#ef4444);color:white;font-weight:bold;font-size:18px">
                    ${userName.charAt(0).toUpperCase()}
                </div>
            `
            }

            // Criar um segundo anel pulsante (para efeito mais suave)
            const pulseRing2 = document.createElement('div')
            pulseRing2.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 44px;
            height: 44px;
            border-radius: 50%;
            border: 3px solid #f97316;
            animation: profilePulse 2s cubic-bezier(0.25, 0.46, 0.45, 0.94) 0.5s infinite;
            pointer-events: none;
        `

            // Adicionar elementos ao container
            el.appendChild(pulseRing)
            el.appendChild(pulseRing2)
            el.appendChild(avatarCircle)

            // Eventos de hover
            avatarCircle.addEventListener('mouseenter', () => {
                avatarCircle.style.transform = 'translate(-50%, -50%) scale(1.1)'
                avatarCircle.style.boxShadow = '0 0 0 6px rgba(249,115,22,0.4), 0 12px 28px rgba(0,0,0,0.3)'
            })

            avatarCircle.addEventListener('mouseleave', () => {
                avatarCircle.style.transform = 'translate(-50%, -50%) scale(1)'
                avatarCircle.style.boxShadow = '0 0 0 3px rgba(249,115,22,0.3), 0 8px 20px rgba(0,0,0,0.2)'
            })

            // Evento de clique
            el.addEventListener('click', () => {
                if (mapRef.current && profileLocation) {
                    mapRef.current.flyTo({
                        center: [profileLocation.lng, profileLocation.lat],
                        zoom: 17,
                        duration: 800
                    })
                    setShowLocationDialog(true)
                    setEditingLocation(true)
                    setSearchAddress(userAddress || '')
                }
            })

            // Injetar a animação CSS
            const styleId = 'profile-pulse-animation'
            if (!document.getElementById(styleId)) {
                const style = document.createElement('style')
                style.id = styleId
                style.textContent = `
                @keyframes profilePulse {
                    0% {
                        transform: translate(-50%, -50%) scale(1);
                        opacity: 1;
                        border-color: #f97316;
                    }
                    50% {
                        transform: translate(-50%, -50%) scale(1.5);
                        opacity: 0.5;
                        border-color: #fb923c;
                    }
                    100% {
                        transform: translate(-50%, -50%) scale(1.8);
                        opacity: 0;
                        border-color: #fdba74;
                    }
                }
            `
                document.head.appendChild(style)
            }

            profileMarkerRef.current = new mapboxgl.Marker({
                element: el,
                anchor: 'center'
            })
                .setLngLat([profileLocation.lng, profileLocation.lat])
                .addTo(mapRef.current)

            console.log('[MapPage] 👤 Marcador de perfil adicionado com efeito pulsante')
        }
    }, [mapReady, profileLocation, userAvatar, userName, isLoggedIn, userAddress])


    const selectedStore = mode === 'produtos' || mode === 'servicos'
        ? stores.find(s => s.id === selectedItem?.store_id)
        : null

    const calcDistanceKm = (storeLocation: any): number | null => {
        const refPoint = referenceLocation
        if (!refPoint || !storeLocation) return null
        const coords = parseCoords(storeLocation)
        if (!coords) return null
        const [lon, lat] = coords
        const R = 6371
        const dLat = (lat - refPoint.lat) * Math.PI / 180
        const dLon = (lon - refPoint.lng) * Math.PI / 180
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(refPoint.lat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    }

    const formatDistance = (distance: number | null): string | null => {
        if (distance === null) return null
        return distance < 1 ? `${Math.round(distance * 1000)}m` : `${distance.toFixed(1)}km`
    }

    const distanceValue = selectedItem ? calcDistanceKm((mode === 'lojas' ? selectedItem : selectedStore)?.location) : null
    const distanceFormatted = formatDistance(distanceValue)

    const toggleMapStyle = () => {
        setMapStyle(prev => prev === 'streets' ? 'satellite' : 'streets')
    }

    return (
        <div className="fixed inset-0" style={{ zIndex: 0 }}>
            <style>{`
                .mapboxgl-ctrl-bottom-right,
                .mapboxgl-ctrl-bottom-left {
                    margin-bottom: 85px !important;
                }
                .mapboxgl-ctrl-group button {
                    background: white !important;
                    border-radius: 12px !important;
                    margin: 4px !important;
                }
                .mapboxgl-ctrl-group {
                    border-radius: 16px !important;
                    overflow: hidden;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.2) !important;
                }
            `}</style>

            <div
                ref={mapContainerRef}
                className="absolute inset-0 w-full h-full"
                style={{ background: '#111' }}
            />

            {(!mapReady || loadingLocation) && (
                <div className="absolute inset-0 z-10">
                    <LoadingSpinner />
                    {/* Overlay adicional com texto informativo */}
                    {loadingLocation && (
                        <div className="absolute bottom-32 left-1/2 -translate-x-1/2 bg-black/50 backdrop-blur-sm rounded-full px-4 py-2">
                            <p className="text-white text-sm font-medium">
                                Verificando endereço salvo...
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* TOP BAR UI */}
            <div className="absolute top-6 left-1/2 -translate-x-1/2 w-[95%] max-w-2xl z-20">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 flex-shrink-0 bg-gradient-to-br from-orange-500 to-red-500 rounded-full flex items-center justify-center shadow-xl border-2 border-white/50 cursor-pointer hover:scale-110 transition-transform" onClick={() => router.push('/')}>
                        <img src="/logo.png" alt="iUser" className="h-7 w-7 object-contain rounded-full" />
                    </div>

                    <div className="relative group flex-1">
                        <input
                            type="text"
                            placeholder={mode === 'lojas' ? "Procurar lojas" : mode === 'servicos' ? "Procurar serviços" : "Procurar produtos"}
                            value={search}
                            onChange={(e) => { setSearch(e.target.value); setOverrideList(null) }}
                            className="w-full pl-4 pr-10 py-3.5 bg-white/95 backdrop-blur-xl border-2 border-orange-200 focus:border-orange-500 rounded-2xl text-gray-700 placeholder:text-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all duration-300 shadow-2xl"
                        />
                        {search && (
                            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>

                    <button
                        onClick={() => setShowFilters(true)}
                        className="flex-shrink-0 flex items-center gap-2 px-5 py-3.5 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-2xl text-xs font-bold uppercase tracking-wider shadow-lg hover:shadow-xl hover:scale-105 transition-all"
                    >
                        {mode === 'lojas' ? <Store className="w-4 h-4" /> : mode === 'servicos' ? <Briefcase className="w-4 h-4" /> : <ShoppingBag className="w-4 h-4" />}
                        <span className="hidden sm:inline lowercase first-letter:uppercase">{mode}</span>
                    </button>
                </div>
            </div>

            {/* Location Banner */}
            <div className="absolute left-6 z-20" style={{ bottom: '85px', maxWidth: 'calc(100vw - 80px)' }}>
                <div className={`${profileLocation ? 'bg-gradient-to-r from-orange-500 to-red-500' : (isLoggedIn ? 'bg-orange-500' : 'bg-gray-500')} rounded-2xl px-4 py-2.5 shadow-xl flex items-center gap-2 backdrop-blur-md border border-white/20 w-fit`}>
                    {isLoggedIn ? (
                        profileLocation ? (
                            <>
                                <MapPin className="w-4 h-4 text-white" />
                                <span
                                    className="text-xs font-black text-white tracking-tight cursor-pointer hover:underline"
                                    onClick={() => {
                                        setEditingLocation(true)
                                        setShowLocationDialog(true)
                                        setSearchAddress(userAddress || '')
                                    }}
                                >
                                    {userAddress?.split(',').slice(0, 2).join(',') || 'Localização salva'}
                                </span>
                                <button
                                    onClick={() => {
                                        setEditingLocation(true)
                                        setShowLocationDialog(true)
                                        setSearchAddress(userAddress || '')
                                    }}
                                    className="ml-2 p-1 bg-transparent rounded-lg hover:bg-white/30 transition-colors"
                                    title="Editar localização"
                                >
                                    <Edit2 className="w-3 h-3 text-white" />
                                </button>
                                <button
                                    onClick={removeLocation}
                                    className="ml-1 p-1 bg-transparent rounded-lg hover:bg-red-300/30 transition-colors"
                                    title="Remover localização"
                                >
                                    <XCircle className="w-3 h-3 text-white" />
                                </button>
                            </>
                        ) : (
                            <>
                                <Compass className="w-4 h-4 text-white" />
                                <span
                                    className="text-xs font-bold text-white cursor-pointer hover:underline"
                                    onClick={() => {
                                        setEditingLocation(false)
                                        setShowLocationDialog(true)
                                        setSearchAddress('')
                                    }}
                                >
                                    Localização não definida
                                </span>
                                <button
                                    onClick={() => {
                                        setEditingLocation(false)
                                        setShowLocationDialog(true)
                                        setSearchAddress('')
                                    }}
                                    className="ml-2 px-2 py-1 bg-transparent rounded-lg hover:bg-white/30 transition-colors flex items-center gap-1"
                                >
                                    <Plus className="w-3 h-3 text-white" />
                                    <span className="text-[10px] font-bold text-white">Adicionar</span>
                                </button>
                            </>
                        )
                    ) : (
                        <>
                            <XCircle className="w-4 h-4 text-white" />
                            <span
                                className="text-xs font-bold text-white cursor-pointer hover:underline"
                                onClick={() => router.push('/login')}
                            >
                                Você não está logado
                            </span>
                            <button
                                onClick={() => router.push('/login')}
                                className="ml-2 px-2 py-1 bg-transparent rounded-lg hover:bg-white/30 transition-colors"
                            >
                                Entrar
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Location Dialog */}
            {showLocationDialog && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity" onClick={() => {
                        setShowLocationDialog(false)
                        setAddressSuggestions([])
                        setSearchAddress('')
                    }} />
                    <div className="relative bg-white rounded-2xl w-full max-w-md shadow-2xl transform transition-all duration-300 animate-in zoom-in-95 overflow-hidden">
                        <div className="bg-gradient-to-r from-orange-500 to-red-500 p-5">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <MapPin className="w-5 h-5 text-white" />
                                    <h3 className="text-xl font-bold text-white">
                                        {editingLocation ? 'Editar endereço' : 'Adicionar localização'}
                                    </h3>
                                </div>
                                <button onClick={() => {
                                    setShowLocationDialog(false)
                                    setAddressSuggestions([])
                                    setSearchAddress('')
                                }} className="p-1 rounded-lg bg-white/20 hover:bg-white/30 transition-colors">
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
                                            onClick={() => {
                                                const [lng, lat] = suggestion.center
                                                saveLocationToProfile(lng, lat, suggestion.place_name)
                                            }}
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
                                onClick={() => {
                                    setShowLocationDialog(false)
                                    setAddressSuggestions([])
                                    setSearchAddress('')
                                }}
                                className="w-full mt-4 py-3 bg-gray-100 text-gray-600 rounded-xl font-medium hover:bg-gray-200 transition-all"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Cluster Header */}
            {clusterItems && clusterLocation && (
                <div className="absolute top-36 left-1/2 -translate-x-1/2 w-[95%] max-w-2xl z-30">
                    <div className="bg-yellow-500 rounded-2xl px-4 py-3 shadow-lg flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Building2 className="w-5 h-5 text-white" />
                            <div>
                                <p className="text-xs font-bold text-white">{clusterLocation.name}</p>
                                <p className="text-[10px] text-white/80">{clusterItems.length} estabelecimentos</p>
                            </div>
                        </div>
                        <button
                            onClick={() => {
                                setClusterItems(null)
                                setClusterLocation(null)
                                setOverrideList(null)
                            }}
                            className="p-1.5 bg-white/20 rounded-xl hover:bg-white/30 transition-colors"
                        >
                            <XCircle className="w-5 h-5 text-white" />
                        </button>
                    </div>
                    <div className="mt-2 bg-white rounded-2xl shadow-xl overflow-hidden max-h-80 overflow-y-auto">
                        {clusterItems.map((item, idx) => (
                            <button
                                key={idx}
                                onClick={() => {
                                    setSelectedItem(item)
                                    setClusterItems(null)
                                    setClusterLocation(null)
                                    let loc = null
                                    if (mode === 'lojas') {
                                        loc = item.location
                                    } else {
                                        const store = stores.find(s => s.id === item.store_id)
                                        loc = store?.location
                                    }
                                    const coords = parseCoords(loc)
                                    if (coords && mapRef.current) {
                                        mapRef.current.flyTo({ center: coords, zoom: 18, duration: 1000 })
                                    }
                                }}
                                className="w-full p-3 flex items-center gap-3 border-b border-gray-100 hover:bg-orange-50 transition-all"
                            >
                                <div className="w-10 h-10 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
                                    {(mode === 'lojas' ? item.logo_url : item.image_url) ? (
                                        <img src={mode === 'lojas' ? item.logo_url : item.image_url} className="w-full h-full object-cover" alt="" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-lg font-bold text-gray-400">
                                            {item.name?.charAt(0)}
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 text-left">
                                    <p className="text-sm font-semibold text-gray-900">{item.name}</p>
                                    <p className="text-xs text-gray-500">
                                        {mode === 'lojas' && item.is_open ? 'Aberto' : mode === 'lojas' ? 'Fechado' : ''}
                                    </p>
                                </div>
                                <ChevronRight className="w-4 h-4 text-gray-400" />
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Horizontal List */}
            {filtered.length > 0 && !clusterItems && (
                <div className="absolute top-[78px] left-1/2 -translate-x-1/2 w-[95%] max-w-2xl z-20">
                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide snap-x">
                        {filtered.map(item => (
                            <button
                                key={item.id}
                                onClick={() => {
                                    setSelectedItem(item)
                                    let loc = null
                                    if (mode === 'lojas') loc = item.location
                                    else {
                                        const store = stores.find(s => s.id === item.store_id)
                                        loc = store?.location
                                    }
                                    const coords = parseCoords(loc)
                                    if (coords && mapRef.current) {
                                        mapRef.current.flyTo({ center: coords, zoom: 16, duration: 1000 })
                                    }
                                }}
                                className={`snap-center flex-shrink-0 transition-all duration-300 ${selectedItem?.id === item.id
                                    ? 'ring-4 ring-orange-500 scale-110 shadow-xl'
                                    : 'opacity-90 hover:scale-105'
                                    }`}
                                style={{ width: '52px', height: '52px' }}
                            >
                                <div className={`w-full h-full rounded-2xl overflow-hidden border-2 shadow-md ${mode === 'lojas'
                                    ? (item.is_open ? 'border-green-500' : 'border-red-500')
                                    : 'border-orange-200'
                                    } bg-white`}>
                                    {(mode === 'lojas' ? item.logo_url : item.image_url) ? (
                                        <img src={mode === 'lojas' ? item.logo_url : item.image_url} className="w-full h-full object-cover" alt="" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-xs font-black italic bg-gradient-to-br from-orange-100 to-red-100 text-orange-500">
                                            {item.name?.charAt(0)}
                                        </div>
                                    )}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Selected Item Card */}
            {selectedItem && !clusterItems && (
                <div className="absolute bottom-24 left-1/2 -translate-x-1/2 w-[92%] max-w-sm z-30 animate-in slide-in-from-bottom-5 duration-500">
                    <div className="bg-white rounded-2xl shadow-2xl overflow-hidden border-2 border-orange-200">
                        <button onClick={() => setSelectedItem(null)} className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-orange-100 hover:bg-orange-500 hover:text-white transition-all z-10 shadow-md">
                            <X className="w-4 h-4" />
                        </button>
                        <div className="p-4">
                            <div className="flex gap-4 items-center">
                                <div className={`w-20 h-20 rounded-2xl overflow-hidden bg-gradient-to-br from-orange-100 to-red-100 p-0.5 border-2 flex-shrink-0 shadow-lg ${mode === 'lojas' ? (selectedItem.is_open ? 'border-green-500' : 'border-red-500') : 'border-orange-500'}`}>
                                    {(mode === 'lojas' ? selectedItem.logo_url : selectedItem.image_url) ? (
                                        <img src={mode === 'lojas' ? selectedItem.logo_url : selectedItem.image_url} className="w-full h-full object-cover rounded-xl" alt="" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-2xl font-black italic text-orange-300">?</div>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0 space-y-1">
                                    <h3 className="text-lg font-black text-gray-900 truncate">{selectedItem.name}</h3>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        {mode === 'lojas' && (
                                            <span className={`text-[8px] font-black uppercase px-2 py-1 rounded-full ${selectedItem.is_open ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                                                {selectedItem.is_open ? 'Aberto' : 'Fechado'}
                                            </span>
                                        )}
                                        {distanceFormatted && (
                                            <span className="text-[10px] font-black uppercase text-gray-500 flex items-center gap-1">
                                                <MapPin className="w-3 h-3 text-orange-500" />
                                                {distanceFormatted}
                                            </span>
                                        )}
                                        {mode === 'lojas' && selectedItem.ratings_avg > 0 && (
                                            <div className="flex items-center gap-1 font-black text-[10px] text-yellow-500">
                                                <Star size={10} className="fill-yellow-500" />
                                                {selectedItem.ratings_avg.toFixed(1)}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                            {(mode === 'servicos' || mode === 'produtos') && selectedItem.price && (
                                <div className="mt-3 p-2 bg-gradient-to-r from-orange-50 to-red-50 rounded-xl">
                                    <p className="text-xl font-black text-orange-600">R$ {selectedItem.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                </div>
                            )}
                            {mode === 'lojas' && selectedItem.description && (
                                <p className="mt-2 text-xs text-gray-600 line-clamp-2">{selectedItem.description}</p>
                            )}
                        </div>
                        <button
                            onClick={() => {
                                if (mode === 'lojas') router.push(`/${selectedItem.profileSlug}/${selectedItem.storeSlug}`)
                                else {
                                    const store = stores.find(s => s.id === selectedItem.store_id)
                                    if (store) router.push(`/${store.profileSlug}/${store.storeSlug}/${selectedItem.slug || selectedItem.id}`)
                                }
                            }}
                            className="w-full py-3.5 bg-gradient-to-r from-orange-500 to-red-500 text-white font-black uppercase text-xs tracking-wider transition-all hover:shadow-lg active:scale-95 rounded-b-2xl"
                        >
                            Visitar Loja →
                        </button>
                    </div>
                </div>
            )}

            {/* Totals Badge */}
            <div className="absolute bottom-24 left-6 z-10 pointer-events-none sm:block hidden">
                <div className="bg-white/95 backdrop-blur-xl rounded-2xl px-4 py-2 shadow-2xl flex items-center gap-2 border border-orange-200">
                    <Flame className="w-4 h-4 text-orange-500" />
                    <span className="text-xs font-black text-gray-700">
                        {filtered.length} {mode === 'lojas' ? 'Lojas' : mode === 'servicos' ? 'Serviços' : 'Produtos'}
                    </span>
                </div>
            </div>

            {/* Map Style Toggle */}
            <div className="absolute z-50" style={{ bottom: '160px', left: '24px' }}>
                <button
                    onClick={toggleMapStyle}
                    className="group relative flex items-center gap-2 px-4 py-2.5 bg-white rounded-2xl shadow-2xl transition-all duration-300 hover:scale-105 hover:shadow-xl active:scale-95 border-2 border-orange-200"
                >
                    <Layers className="w-4 h-4 text-orange-500 transition-all duration-300 group-hover:rotate-180" />
                    <span className="text-[10px] font-black uppercase tracking-wider text-gray-700">
                        {mapStyle === 'streets' ? 'Mapa' : 'Satélite'}
                    </span>
                </button>
            </div>

            {/* Filter Modal */}
            {showFilters && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={() => setShowFilters(false)} />
                    <div className="relative bg-white rounded-2xl w-full sm:max-w-md shadow-2xl transform transition-all duration-300 animate-in zoom-in-95 overflow-hidden">
                        <div className="bg-gradient-to-r from-orange-500 to-red-500 p-5">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Compass className="w-5 h-5 text-white" />
                                    <h3 className="text-xl font-bold text-white">Explorar</h3>
                                </div>
                                <button onClick={() => setShowFilters(false)} className="p-1 rounded-lg bg-white/20 hover:bg-white/30 transition-colors">
                                    <X className="w-5 h-5 text-white" />
                                </button>
                            </div>
                        </div>
                        <div className="p-3 space-y-1">
                            {(['lojas', 'servicos', 'produtos'] as Mode[]).map(m => (
                                <button
                                    key={m}
                                    onClick={() => {
                                        setMode(m)
                                        setShowFilters(false)
                                        setSelectedItem(null)
                                        setOverrideList(null)
                                    }}
                                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${mode === m
                                        ? 'bg-gradient-to-r from-orange-50 to-red-50 border-2 border-orange-500'
                                        : 'text-gray-700 hover:bg-gray-50'
                                        }`}
                                >
                                    <div className={`p-2 rounded-lg ${mode === m ? 'bg-gradient-to-br from-orange-500 to-red-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                                        {m === 'lojas' ? <Store size={18} /> : m === 'servicos' ? <Briefcase size={18} /> : <ShoppingBag size={18} />}
                                    </div>
                                    <span className="flex-1 text-left font-bold text-sm lowercase first-letter:uppercase">{m}</span>
                                    {mode === m && (
                                        <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}