//app/(main)/mapa/page.tsx

'use client'

import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { Store, ShoppingBag, X, MapPin, Star, Briefcase, Layers, Flame, Navigation, Crosshair, Home, Save, XCircle, Building2, ChevronRight, CheckCircle2, Users, Calendar, MessageCircle, Eye, Clock } from 'lucide-react'
import { useAppModeStore } from '@/store/useAppModeStore'
import { toast } from 'sonner'
import { Spinner } from '@/components/Spinner'
import { isStoreOpenNow, getStoreStatusText, getNextOpeningInfo } from '@/lib/storeHours'
import { useProfile } from '@/app/contexts/ProfileContext'
import Header, { type Tab } from '@/app/Header'
import LocationPicker from '../LocationPicker'

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
    const { profileSlug, avatarUrl, loading: profileLoading } = useProfile()
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
    const [mapStyle, setMapStyle] = useState<'streets' | 'satellite'>('streets')
    const [loadingLocation, setLoadingLocation] = useState(true)
    const [userAddress, setUserAddress] = useState<string | null>(null)
    const [addressNumber, setAddressNumber] = useState('')
    const [addressComplement, setAddressComplement] = useState('')
    const [showLocationDialog, setShowLocationDialog] = useState(false)
    const [isSavingLocation, setIsSavingLocation] = useState(false)
    const [clusterItems, setClusterItems] = useState<any[] | null>(null)
    const [clusterLocation, setClusterLocation] = useState<{ lng: number; lat: number; name: string } | null>(null)
    const [isLoggedIn, setIsLoggedIn] = useState(false)
    const [userId, setUserId] = useState<string | null>(null)
    const [userAvatar, setUserAvatar] = useState<string | null>(null)
    const [userName, setUserName] = useState<string>('')
    const [profileData, setProfileData] = useState<any>(null)
    const [mapInitialized, setMapInitialized] = useState(false)
    const [storeDetails, setStoreDetails] = useState<any | null>(null)
    const [loadingStoreDetails, setLoadingStoreDetails] = useState(false)

    const router = useRouter()
    const { mode: appMode } = useAppModeStore()

    // Debug do modo atual
    useEffect(() => {
        console.log('[MapPage] Modo atual do mapa:', mode)
    }, [mode])

    // Função para carregar o perfil do usuário (REUSÁVEL)
    const loadUserProfile = async (userId: string) => {
        try {
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

                        if (profile.store_lat && profile.store_lng) {
                            console.log('[MapPage] 📍 Localização encontrada no perfil:', profile.store_lat, profile.store_lng)
                            setProfileLocation({ lat: profile.store_lat, lng: profile.store_lng })
                            setUserAddress(profile.address || 'Local salvo')
                            setAddressNumber(profile.address_number || '')
                            setAddressComplement(profile.address_complement || '')
                        } else {
                            console.log('[MapPage] 📍 Nenhuma localização salva no perfil')
                            setProfileLocation(null)
                            setUserAddress(null)
                            setAddressNumber('')
                            setAddressComplement('')
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

                    if (newProfile.store_lat && newProfile.store_lng) {
                        console.log('[MapPage] 📡 Atualizando localização via Realtime:', { lat: newProfile.store_lat, lng: newProfile.store_lng })
                        setProfileLocation({ lat: newProfile.store_lat, lng: newProfile.store_lng })
                        setUserAddress(newProfile.address || 'Local salvo')
                        setAddressNumber(newProfile.address_number || '')
                        setAddressComplement(newProfile.address_complement || '')
                    } else {
                        console.log('[MapPage] 📡 Localização removida via Realtime')
                        setProfileLocation(null)
                        setUserAddress(null)
                        setAddressNumber('')
                        setAddressComplement('')

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

        // Fallback caso não tenha localização / Porto Velho - RO
        const centerLocation = referenceLocation || {
            lat: -8.7612,
            lng: -63.9039
        }

        console.log('[MapPage] Inicializando mapa em:', centerLocation)

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
            const { data: storesData } = await supabase.from('stores').select('*')
            const { data: productsData } = await supabase.from('products').select('*')
            const { data: profilesList } = await supabase.from('profiles').select('id, profileSlug')

            const mappedStores = (storesData || []).map(s => ({
                ...s,
                profileSlug: (profilesList || []).find((profile) => profile.id === s.owner_id)?.profileSlug || 'loja',
                logo_url: s.logo_url
                    ? supabase.storage.from('store-logos').getPublicUrl(s.logo_url).data.publicUrl
                    : null,
                is_open: isStoreOpenNow(s.business_hours)
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

    // Buscar detalhes extras da loja selecionada (seguidores, whatsapp, produtos mais vistos, comentários)
    useEffect(() => {
        if (!selectedItem || mode !== 'lojas') {
            setStoreDetails(null)
            return
        }

        let cancelled = false

        const loadStoreDetails = async () => {
            setLoadingStoreDetails(true)
            try {
                const storeId = selectedItem.id

                let whatsapp = selectedItem.whatsapp || null
                if (!whatsapp && selectedItem.owner_id) {
                    const { data: ownerProfile } = await supabase
                        .from('profiles')
                        .select('whatsapp')
                        .eq('id', selectedItem.owner_id)
                        .single()
                    whatsapp = ownerProfile?.whatsapp || null
                }

                const [{ count: followersCount }, { data: topProducts }, { data: reviewsData }] = await Promise.all([
                    supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', storeId),
                    supabase
                        .from('products')
                        .select('id, name, slug, price, image_url, view_count')
                        .eq('store_id', storeId)
                        .eq('listing_type', 'sale')
                        .order('view_count', { ascending: false, nullsFirst: false })
                        .limit(4),
                    supabase
                        .from('product_reviews')
                        .select('id, rating, comment, is_anonymous, created_at, profiles(name, avatar_url, "profileSlug")')
                        .eq('store_id', storeId)
                        .not('comment', 'is', null)
                        .order('created_at', { ascending: false })
                        .limit(3),
                ])

                if (cancelled) return

                const mappedProducts = (topProducts || []).map((p: any) => ({
                    ...p,
                    image_url: p.image_url
                        ? supabase.storage.from('product-images').getPublicUrl(p.image_url).data.publicUrl
                        : null,
                }))

                const mappedReviews = (reviewsData || []).map((r: any) => ({
                    ...r,
                    profiles: Array.isArray(r.profiles) ? r.profiles[0] : r.profiles,
                }))

                setStoreDetails({
                    followersCount: followersCount || 0,
                    whatsapp,
                    topProducts: mappedProducts,
                    reviews: mappedReviews,
                })
            } catch (error) {
                console.error('[MapPage] Erro ao carregar detalhes da loja:', error)
                if (!cancelled) setStoreDetails(null)
            } finally {
                if (!cancelled) setLoadingStoreDetails(false)
            }
        }

        loadStoreDetails()

        return () => { cancelled = true }
    }, [selectedItem, mode])

    // Salvar localização no perfil (mesmo LocationPicker compartilhado do homepage,
    // gravando nos mesmos campos store_lat/store_lng/address*)
    const handleLocationSave = async (location: {
        lat: number
        lng: number
        address: string
        addressNumber?: string
        addressComplement?: string
    }) => {
        setIsSavingLocation(true)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                toast.error('Você precisa estar logado para salvar uma localização.')
                setShowLocationDialog(false)
                setIsSavingLocation(false)
                return
            }

            const { data, error } = await supabase
                .from('profiles')
                .upsert({
                    id: user.id,
                    address: location.address,
                    address_number: location.addressNumber || null,
                    address_complement: location.addressComplement || null,
                    store_lat: location.lat,
                    store_lng: location.lng,
                }, {
                    onConflict: 'id',
                    ignoreDuplicates: false
                })
                .select('address, address_number, address_complement, store_lat, store_lng')
                .single()

            if (error) {
                toast.error('Erro ao salvar: ' + error.message)
            } else if (data) {
                setProfileLocation({ lat: data.store_lat, lng: data.store_lng })
                setUserAddress(data.address || 'Local salvo')
                setAddressNumber(data.address_number || '')
                setAddressComplement(data.address_complement || '')

                if (mapRef.current && mapInitialized) {
                    mapRef.current.flyTo({ center: [data.store_lng, data.store_lat], zoom: 15, duration: 1000 })
                }

                toast.success('Localização salva com sucesso!', {
                    description: data.address?.split(',')[0],
                    duration: 3000,
                })
            }
        } catch (err) {
            toast.error('Erro: ' + (err as Error).message)
        } finally {
            setShowLocationDialog(false)
            setIsSavingLocation(false)
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
    useEffect(() => {
        if (!mapReady || !mapRef.current) return

        if (profileMarkerRef.current) {
            profileMarkerRef.current.remove()
        }

        if (profileLocation && isLoggedIn && (userAvatar || userName)) {
            // Criar container principal
            const el = document.createElement('div')
            // z-index bem acima do máximo usado pelos marcadores de loja/produto
            // (100 em repouso, 999 no hover) pra que meu avatar sempre apareça
            // por cima das marcações, nunca embaixo delas.
            el.style.zIndex = '1000'
            el.style.cssText += `
            position: relative;
            width: 34px;
            height: 34px;
        `

            // Criar o círculo pulsante (efeito de onda)
            const pulseRing = document.createElement('div')
            pulseRing.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 34px;
            height: 34px;
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
            width: 34px;
            height: 34px;
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
            width: 34px;
            height: 34px;
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

    const selectedStoreNextAvailable = mode === 'lojas' && selectedItem?.business_hours
        ? getNextOpeningInfo(selectedItem.business_hours)
        : null

    const selectedStoreStatusText = mode === 'lojas' && selectedItem?.business_hours
        ? getStoreStatusText(selectedItem.business_hours)
        : null

    const openStoreInMaps = () => {
        if (!selectedItem) return
        const coords = parseCoords(selectedItem.location)
        if (coords) {
            window.open(`https://www.google.com/maps/dir/?api=1&destination=${coords[1]},${coords[0]}`, '_blank')
        } else if (selectedItem.address) {
            window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedItem.address)}`, '_blank')
        }
    }

    // ===== TABS DO HEADER = FILTROS DO RADAR (lojas/serviços/produtos) =====
    const selectMode = (m: Mode) => {
        setMode(m)
        setSelectedItem(null)
        setOverrideList(null)
    }
    const radarTabs: Tab[] = [
        { id: 'lojas', label: 'Lojas', icon: Store, onClick: () => selectMode('lojas'), isActive: mode === 'lojas' },
        { id: 'servicos', label: 'Serviços', icon: Briefcase, onClick: () => selectMode('servicos'), isActive: mode === 'servicos' },
        { id: 'produtos', label: 'Produtos', icon: ShoppingBag, onClick: () => selectMode('produtos'), isActive: mode === 'produtos' },
    ]

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
                /* Os marcadores do mapa recebem z-index alto (até 999 no hover) pra
                   se empilharem entre si, mas isso é interno ao mapa: os controles
                   nativos do Mapbox (zoom/bússola) precisam ficar sempre acima de
                   qualquer marcador, mesmo em hover. */
                .mapboxgl-ctrl-top-left,
                .mapboxgl-ctrl-top-right,
                .mapboxgl-ctrl-bottom-left,
                .mapboxgl-ctrl-bottom-right {
                    z-index: 2000 !important;
                }
                /* Anel pulsante do logo no card de detalhes - mesmo efeito da
                   página da loja (Store.tsx), pra manter o cabeçalho consistente. */
                @keyframes radarPulseGlowOpen {
                    0%, 100% { box-shadow: 0 8px 24px rgba(16, 185, 129, 0.4), 0 0 0 6px rgba(16, 185, 129, 0.1); }
                    50% { box-shadow: 0 8px 24px rgba(16, 185, 129, 0.6), 0 0 0 12px rgba(16, 185, 129, 0); }
                }
                @keyframes radarPulseGlowClosed {
                    0%, 100% { box-shadow: 0 8px 24px rgba(239, 68, 68, 0.4), 0 0 0 6px rgba(239, 68, 68, 0.1); }
                    50% { box-shadow: 0 8px 24px rgba(239, 68, 68, 0.6), 0 0 0 12px rgba(239, 68, 68, 0); }
                }
                .animate-radar-pulse-glow-open {
                    animation: radarPulseGlowOpen 2s ease-in-out infinite;
                }
                .animate-radar-pulse-glow-closed {
                    animation: radarPulseGlowClosed 2s ease-in-out infinite;
                }
            `}</style>

            {/* O container do mapa isola seu próprio contexto de empilhamento
                (marcadores usam z-index de até 999 internamente pra se ordenar
                entre si) pra que esse z-index nunca vaze e apareça por cima do
                header, dos controles de zoom ou dos cards/diálogos da página -
                todos esses ficam de fora deste container, então continuam por
                cima independente do que acontece dentro do mapa. */}
            <div
                ref={mapContainerRef}
                className="absolute inset-0 w-full h-full"
                style={{ background: '#111', isolation: 'isolate' }}
            />

            {/* BOTÃO HOME - VOLTAR PARA O INÍCIO (CANTO INFERIOR DIREITO) */}
            <div className="absolute bottom-10 right-10 z-50">
                <button
                    onClick={() => router.push('/')}
                    className="w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-transform duration-200 hover:scale-110 active:scale-95"
                    style={{
                        background: 'linear-gradient(135deg, #f97316 0%, #dc2626 100%)',
                        color: '#ffffff',
                        border: `2px solid #f97316`,
                        boxShadow: `0 8px 24px #f9731660`,
                    }}
                    aria-label="Voltar ao início"
                >
                    <Home size={24} />
                </button>
            </div>

            {(!mapReady || loadingLocation) && (
                <div className="absolute inset-0 z-10 flex items-center justify-center">
                    <Spinner size={48} color="#f97316" />
                    {/* Overlay adicional com texto informativo */}
                    {loadingLocation && (
                        <div className="absolute bottom-32 left-1/2 -translate-x-1/2 z-20">
                            <div className="bg-gradient-to-r from-orange-500 to-red-500 rounded-full px-5 py-2.5 shadow-xl border border-white/20 flex items-center gap-2.5">
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin flex-shrink-0" />
                                <span className="text-white text-sm font-black tracking-wide whitespace-nowrap">
                                    Buscando localização...
                                </span>
                                <MapPin className="w-4 h-4 text-white/80 animate-bounce flex-shrink-0" />
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* HEADER - mesmo componente do homepage, com os filtros do radar nas tabs
                e a localização salva (LocationPicker compartilhado) no lugar do cart.
                Em posição absoluta (não relativa ao fluxo normal) porque o Mapbox GL
                força position:relative no próprio container do mapa via JS, o que
                empurraria um Header "sticky" pra fora da tela se ele viesse depois
                dele no DOM. */}
            <div className="absolute top-0 left-0 right-0 z-20">
                <Header
                    title="iUser"
                    showBack={false}
                    greeting={`Olá, ${profileLoading ? '...' : profileSlug ? `@${profileSlug}` : 'Visitante'}`}
                    avatarUrl={avatarUrl}
                    loading={profileLoading}
                    tabs={radarTabs}
                    showSearch={true}
                    searchPlaceholder={mode === 'lojas' ? 'Procurar lojas' : mode === 'servicos' ? 'Procurar serviços' : 'Procurar produtos'}
                    searchValue={search}
                    onSearch={(q) => { setSearch(q); setOverrideList(null) }}
                    locationElement={
                        isLoggedIn && (
                            <button
                                onClick={() => setShowLocationDialog(true)}
                                disabled={isSavingLocation}
                                className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-black/10 hover:bg-black/20 transition disabled:opacity-50"
                                style={{ color: '#fff' }}
                            >
                                <MapPin size={14} />
                                {isSavingLocation
                                    ? 'Salvando...'
                                    : userAddress
                                        ? userAddress.split(',').slice(0, 2).join(',')
                                        : 'Definir local'
                                }
                            </button>
                        )
                    }
                />
            </div>

            {/* Location Picker - mesmo componente compartilhado do homepage */}
            {isLoggedIn && showLocationDialog && (
                <LocationPicker
                    initialLocation={profileLocation ? {
                        lat: profileLocation.lat,
                        lng: profileLocation.lng,
                        address: userAddress || '',
                        addressNumber,
                        addressComplement,
                    } : null}
                    onSave={handleLocationSave}
                    onClose={() => setShowLocationDialog(false)}
                />
            )}

            {/* Cluster Header */}
            {clusterItems && clusterLocation && (
                <div className="absolute top-[210px] left-1/2 -translate-x-1/2 w-[95%] max-w-2xl z-30">
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
            {filtered.length > 0 && !clusterItems && !selectedItem && (
                <div className="absolute top-[190px] left-1/2 -translate-x-1/2 w-[95%] max-w-2xl z-20">
                    <div className="flex gap-2 overflow-x-auto pt-3 pb-3 scrollbar-hide snap-x">
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
                    <div className="bg-white rounded-2xl shadow-2xl overflow-hidden border-2 border-orange-200 flex flex-col max-h-[72vh]">
                        <button onClick={() => setSelectedItem(null)} className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-orange-100 hover:bg-orange-500 hover:text-white transition-all z-10 shadow-md">
                            <X className="w-4 h-4" />
                        </button>
                        <div className="overflow-y-auto">
                            <div className="p-4">
                                {/* Cabeçalho no mesmo estilo da página da loja (Store.tsx): logo
                                    com anel pulsante aberto/fechado + status com ícone de relógio. */}
                                <div className="flex items-center gap-4">
                                    <div className="flex-shrink-0">
                                        <div
                                            className={`w-20 h-20 rounded-2xl p-[4px] ${mode === 'lojas' ? (selectedItem.is_open ? 'animate-radar-pulse-glow-open' : 'animate-radar-pulse-glow-closed') : ''}`}
                                            style={{
                                                background: mode === 'lojas'
                                                    ? (selectedItem.is_open
                                                        ? 'linear-gradient(135deg, #10b981, #059669, #34d399)'
                                                        : 'linear-gradient(135deg, #ef4444, #dc2626, #f87171)')
                                                    : 'linear-gradient(135deg, #f97316, #dc2626)',
                                            }}
                                        >
                                            <div className="w-full h-full rounded-2xl overflow-hidden bg-white flex items-center justify-center">
                                                {(mode === 'lojas' ? selectedItem.logo_url : selectedItem.image_url) ? (
                                                    <img src={mode === 'lojas' ? selectedItem.logo_url : selectedItem.image_url} className="w-full h-full object-cover" alt="" />
                                                ) : (
                                                    <span className="text-2xl font-black italic text-orange-300">?</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex-1 min-w-0 space-y-1">
                                        <h3 className="text-lg font-black text-gray-900 truncate">{selectedItem.name}</h3>
                                        {mode === 'lojas' && selectedStoreStatusText && (
                                            <span className={`flex items-center gap-1 font-bold text-xs w-fit ${selectedItem.is_open ? 'text-green-600' : 'text-red-600'}`}>
                                                <Clock className="w-3.5 h-3.5" />
                                                <span className="truncate max-w-[160px]">{selectedStoreStatusText}</span>
                                            </span>
                                        )}
                                        <div className="flex items-center gap-2 flex-wrap">
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

                                {/* Pills de destaque (seguidores, agenda, whatsapp, localização) */}
                                {mode === 'lojas' && (
                                    <div className="flex flex-wrap items-center gap-2 mt-3">
                                        <span className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-700">
                                            <Users className="w-3 h-3 text-orange-500" />
                                            {loadingStoreDetails ? '···' : storeDetails?.followersCount ?? 0} seguidores
                                        </span>
                                        {selectedItem.allow_scheduling && (
                                            <span className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-bold bg-orange-50 text-orange-600">
                                                <Calendar className="w-3 h-3" />
                                                {selectedStoreNextAvailable
                                                    ? `Agenda · ${selectedStoreNextAvailable.dayLabel} ${selectedStoreNextAvailable.time}`
                                                    : 'Agenda disponível'}
                                            </span>
                                        )}
                                        {(selectedItem.address || parseCoords(selectedItem.location)) && (
                                            <button
                                                onClick={openStoreInMaps}
                                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                                            >
                                                <MapPin className="w-3 h-3 text-orange-500" />
                                                Localização
                                            </button>
                                        )}
                                        {storeDetails?.whatsapp && (
                                            <a
                                                href={`https://wa.me/${storeDetails.whatsapp.replace(/\D/g, '')}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                onClick={(e) => e.stopPropagation()}
                                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-bold text-white"
                                                style={{ background: '#25D366' }}
                                            >
                                                <MessageCircle className="w-3 h-3" />
                                                WhatsApp
                                            </a>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Produtos mais vistos */}
                            {mode === 'lojas' && storeDetails?.topProducts?.length > 0 && (
                                <div className="px-4 pb-3">
                                    <p className="text-[9px] font-black uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-1">
                                        <Eye className="w-3 h-3" /> Mais vistos
                                    </p>
                                    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                                        {storeDetails.topProducts.map((product: any) => (
                                            <button
                                                key={product.id}
                                                onClick={() => router.push(`/${selectedItem.profileSlug}/${selectedItem.storeSlug}/${product.slug || product.id}`)}
                                                className="flex-shrink-0 w-24 text-left rounded-xl overflow-hidden border border-gray-200 hover:border-orange-300 transition-colors"
                                            >
                                                <div className="w-full h-16 bg-gray-100">
                                                    {product.image_url ? (
                                                        <img src={product.image_url} className="w-full h-full object-cover" alt="" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-gray-300">
                                                            <ShoppingBag className="w-5 h-5" />
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="p-1.5">
                                                    <p className="text-[9px] font-bold text-gray-800 line-clamp-1">{product.name}</p>
                                                    <p className="text-[9px] font-black text-orange-600">R$ {(product.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Comentários recentes */}
                            {mode === 'lojas' && storeDetails?.reviews?.length > 0 && (
                                <div className="px-4 pb-4">
                                    <p className="text-[9px] font-black uppercase tracking-wider text-gray-400 mb-2">Comentários</p>
                                    <div className="space-y-2">
                                        {storeDetails.reviews.map((review: any) => (
                                            <div key={review.id} className="bg-gray-50 rounded-xl p-2.5">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-[10px] font-bold text-gray-700 truncate">
                                                        {review.is_anonymous ? 'Anônimo' : review.profiles?.name || 'Usuário'}
                                                    </span>
                                                    <div className="flex items-center gap-0.5 flex-shrink-0">
                                                        <Star size={9} className="fill-yellow-500 text-yellow-500" />
                                                        <span className="text-[9px] font-black text-yellow-600">{review.rating}</span>
                                                    </div>
                                                </div>
                                                <p className="text-[10px] text-gray-600 mt-0.5 line-clamp-2">"{review.comment}"</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        {/* Botão redondo (pill), mesmo estilo usado no resto do iUser
                            (ex: "Fechar" do modal de produto em Store.tsx) em vez da
                            barra reta que ocupava a borda inteira do card. */}
                        <div className="p-4 pt-0 flex-shrink-0">
                            <button
                                onClick={() => {
                                    if (mode === 'lojas') router.push(`/${selectedItem.profileSlug}/${selectedItem.storeSlug}`)
                                    else {
                                        const store = stores.find(s => s.id === selectedItem.store_id)
                                        if (store) router.push(`/${store.profileSlug}/${store.storeSlug}/${selectedItem.slug || selectedItem.id}`)
                                    }
                                }}
                                className="w-full py-3.5 rounded-full bg-gradient-to-r from-orange-500 to-red-500 text-white font-black uppercase text-xs tracking-wider shadow-lg transition-all hover:shadow-xl hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-1.5"
                            >
                                Visitar Loja
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
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

            {/* Map Style Toggle - mesmo visual dos controles nativos do Mapbox
                (grupo branco arredondado com sombra), posicionado logo acima
                deles pra parecer um botão a mais do mesmo conjunto. */}
            {mapReady && (
                <div className="absolute z-30" style={{ bottom: '267px', right: '10px' }}>
                    <div className="bg-white rounded-2xl shadow-[0_4px_15px_rgba(0,0,0,0.2)] overflow-hidden">
                        <button
                            onClick={toggleMapStyle}
                            className="flex items-center justify-center hover:bg-gray-50 active:bg-gray-100 transition-colors"
                            style={{ width: 32, height: 32, margin: 4 }}
                            title={mapStyle === 'streets' ? 'Ver satélite' : 'Ver mapa'}
                            aria-label={mapStyle === 'streets' ? 'Ver satélite' : 'Ver mapa'}
                        >
                            <Layers className="w-4 h-4 text-gray-700" />
                        </button>
                    </div>
                </div>
            )}

        </div>
    )
}