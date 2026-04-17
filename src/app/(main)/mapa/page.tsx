'use client'

import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Search, Store, ShoppingBag, X, MapPin, UserCircle } from 'lucide-react'
import { useAppModeStore } from '@/store/useAppModeStore'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!

type Mode = 'lojas' | 'produtos' | 'pessoas'

// Parseia location no formato WKT "POINT(lng lat)" OU GeoJSON {type:"Point", coordinates:[lng,lat]}
function parseCoords(location: any): [number, number] | null {
    if (!location) return null;

    // If location is a JSON string (legacy rows), try to parse it
    if (typeof location === 'string') {
        try {
            location = JSON.parse(location);
        } catch {
            // Not JSON – continue to other checks
        }
    }

    // Expected GeoJSON shape
    if (location?.type === 'Point' && Array.isArray(location.coordinates)) {
        const [lng, lat] = location.coordinates;
        return isFinite(lng) && isFinite(lat) ? [lng, lat] : null;
    }

    // Fallback to WKT string
    if (typeof location === 'string') {
        const match = location.match(/POINT\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/i);
        return match ? [parseFloat(match[1]), parseFloat(match[2])] : null;
    }

    return null;
}

export default function MapPage() {
    const mapRef = useRef<mapboxgl.Map | null>(null)
    const mapContainerRef = useRef<HTMLDivElement | null>(null)
    const markersRef = useRef<mapboxgl.Marker[]>([])
    const userMarkerRef = useRef<mapboxgl.Marker | null>(null)

    const [mode, setMode] = useState<Mode>('lojas')
    const [stores, setStores] = useState<any[]>([])
    const [products, setProducts] = useState<any[]>([])
    const [people, setPeople] = useState<any[]>([])
    const [filtered, setFiltered] = useState<any[]>([])
    const [selectedItem, setSelectedItem] = useState<any | null>(null)
    const [search, setSearch] = useState('')
    const [mapReady, setMapReady] = useState(false)
    const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
    const [overrideList, setOverrideList] = useState<any[] | null>(null)

    const router = useRouter()
    const { mode: appMode } = useAppModeStore()

    // Sync app mode with map local mode
    useEffect(() => {
        if (appMode === 'personal') {
            setMode('pessoas')
        } else {
            setMode('lojas')
        }
    }, [appMode])

    // ── INIT MAP ────────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!mapContainerRef.current) return

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                pos => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                () => { }
            )
        }

        const isDark = document.documentElement.classList.contains('dark')
        const initialStyle = isDark ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/streets-v12'

        const map = new mapboxgl.Map({
            container: mapContainerRef.current,
            style: initialStyle,
            center: [-63.9004, -8.7612], // Porto Velho, RO
            zoom: 12,
            attributionControl: false
        })

        map.addControl(new mapboxgl.NavigationControl(), 'bottom-right')
        map.addControl(new mapboxgl.GeolocateControl({
            positionOptions: { enableHighAccuracy: true },
            trackUserLocation: true,
            showUserHeading: true
        }), 'bottom-right')

        map.on('load', () => setMapReady(true))

        mapRef.current = map

        // Monitor theme changes to update map style
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'class') {
                    const isDarkNow = document.documentElement.classList.contains('dark')
                    const targetStyle = isDarkNow ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/streets-v12'
                    
                    if (mapRef.current) {
                        mapRef.current.setStyle(targetStyle)
                    }
                }
            })
        })
        observer.observe(document.documentElement, { attributes: true })

        return () => {
            map.remove()
            observer.disconnect()
        }
    }, [])

    // ── LOAD DATA ───────────────────────────────────────────────────────────────
    useEffect(() => {
        const load = async () => {
            const supabase = createClient()

            const { data: storesData } = await supabase.from('stores_geo').select('*')
            const { data: productsData } = await supabase.from('products_geo').select('*')
            const { data: profilesData } = await supabase.from('profiles_geo').select('id, profileSlug, name, avatar_url, location, show_location')

            // Debug: log fetched counts
            console.log('Fetched stores:', storesData?.length, 'products:', productsData?.length, 'people:', profilesData?.length)

            const mappedStores = (storesData || []).map(s => ({
                ...s,
                profileSlug: (profilesData || []).find((profile) => profile.id === s.owner_id)?.profileSlug || 'loja',
                logo_url: s.logo_url
                    ? supabase.storage.from('store-logos').getPublicUrl(s.logo_url).data.publicUrl
                    : null
            }))

            const mappedProducts = (productsData || []).map(p => ({
                ...p,
                image_url: p.image_url
                    ? supabase.storage.from('product-images').getPublicUrl(p.image_url).data.publicUrl
                    : null
            }))

            const { data: followsData } = await supabase.from('follows').select('follower_id, following_id')

            const mappedPeople = (profilesData || [])
                .filter(p => p.location && p.show_location)
                .map(p => {
                    const followsList = followsData || []
                    const followersCount = followsList.filter(f => f.following_id === p.id).length
                    const followingCount = followsList.filter(f => f.follower_id === p.id).length
                    const personStores = mappedStores.filter(s => s.owner_id === p.id)

                    return {
                        id: p.id,
                        name: p.name || 'iUser',
                        profileSlug: p.profileSlug,
                        avatar_url: p.avatar_url
                            ? supabase.storage.from('avatars').getPublicUrl(p.avatar_url).data.publicUrl
                            : null,
                        location: p.location,
                        is_person: true,
                        followersCount,
                        followingCount,
                        stores: personStores
                    }
                })

            setStores(mappedStores)
            setProducts(mappedProducts)
            setPeople(mappedPeople)
        }

        load()
    }, [])

    // ── FILTER ──────────────────────────────────────────────────────────────────
    useEffect(() => {
        if (overrideList) {
            setFiltered(overrideList)
            return
        }
        const items = mode === 'lojas' ? stores : mode === 'produtos' ? products : people
        const q = search.toLowerCase()
        setFiltered(q ? items.filter(i => i.name?.toLowerCase().includes(q)) : items)
    }, [search, mode, stores, products, people, overrideList])

    // ── MARKERS ─────────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!mapReady || !mapRef.current) return
        const map = mapRef.current

        // Limpar markers anteriores
        markersRef.current.forEach(m => m.remove())
        markersRef.current = []

        // Agrupar itens para espalhar (spiderify) quem está na MESMA coordenada
        const coordGroups: Record<string, any[]> = {}

        filtered.forEach(item => {
            let coords: [number, number] | null = null

            if (mode === 'lojas') {
                coords = parseCoords(item.location)
            } else if (mode === 'produtos') {
                const store = stores.find(s => s.id === item.store_id)
                coords = parseCoords(store?.location)
            } else {
                coords = parseCoords(item.location)
            }

            if (!coords) return

            // chave com precisão de 4 casas (aprox 11 metros)
            const key = `${coords[0].toFixed(4)},${coords[1].toFixed(4)}`
            if (!coordGroups[key]) coordGroups[key] = []
            coordGroups[key].push({ item, coords })
        })

        // Renderizar marcadores
        Object.values(coordGroups).forEach(group => {
            group.forEach((entry, index) => {
                const { item, coords } = entry

                let lng = coords[0]
                let lat = coords[1]

                // Deslocamento radial dinâmico removido por pedido
                // lng lat permanecem iguais

                const imageUrl = mode === 'lojas' ? item.logo_url : mode === 'produtos' ? item.image_url : item.avatar_url

                // O wrapper base que o mapbox controla
                const el = document.createElement('div')
                el.style.zIndex = (100 - index).toString() // Central fica em cima

                // O Elemento interno é o redondinho em formato de pino/avatar
                const inner = document.createElement('div')

                inner.style.cssText = `
                    width: 48px;
                    height: 48px;
                    border-radius: 12px;
                    overflow: hidden;
                    border: 2px solid ${index === 0 ? 'hsl(var(--primary))' : 'hsl(var(--foreground)/0.2)'};
                    cursor: pointer;
                    background: hsl(var(--card));
                    transition: transform 0.2s ease;
                `

                inner.onmouseenter = () => {
                    inner.style.transform = 'scale(1.2)'
                    el.style.zIndex = "999" // trás pra frente no hover
                }

                inner.onmouseleave = () => {
                    inner.style.transform = 'scale(1)'
                    el.style.zIndex = (100 - index).toString()
                }

                const storeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-foreground"><path d="m2 7 4.41-2.20a2 2 0 0 1 1.76 0l4.23 2.12a2 2 0 0 0 1.76 0L18.4 4.8a2 2 0 0 1 1.76 0L22 7"/><path d="M22 7v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7"/><path d="M2 11h20"/><path d="M16 11v9"/><path d="M8 11v9"/></svg>`
                const userSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-foreground"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`

                if (imageUrl) {
                    const img = document.createElement('img')
                    img.src = imageUrl
                    img.style.cssText = 'width:100%;height:100%;object-fit:cover;'
                    img.onerror = () => {
                        inner.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;">${mode === 'pessoas' ? userSvg : storeSvg}</div>`
                    }
                    inner.appendChild(img)
                } else {
                    inner.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;">${mode === 'pessoas' ? userSvg : storeSvg}</div>`
                }

                el.appendChild(inner)

                // Add indicator badge se tem mais de um no mesmo lugar, e este for o center
                if (index === 0 && group.length > 1) {
                    const badge = document.createElement('div')
                    badge.innerHTML = `+${group.length - 1}`
                    badge.style.cssText = `
                        position: absolute;
                        bottom: -5px;
                        right: -5px;
                        background: hsl(var(--primary));
                        color: hsl(var(--primary-foreground));
                        font-size: 10px;
                        font-weight: 900;
                        padding: 2px 6px;
                        border-radius: 10px;
                        border: 2px solid hsl(var(--background));
                        z-index: 10;
                        cursor: pointer;
                    `
                    badge.onclick = (e) => {
                        e.stopPropagation()
                        setOverrideList(group.map(g => g.item))
                        map.flyTo({ center: [lng, lat], zoom: 16, duration: 600 })
                    }
                    el.appendChild(badge)
                }

                el.onclick = () => {
                    setSelectedItem(item)
                    map.flyTo({ center: [lng, lat], zoom: 16, duration: 600 })
                }

                const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
                    .setLngLat([lng, lat])
                    .addTo(map)

                markersRef.current.push(marker)
            })
        })
    }, [filtered, mode, stores, mapReady])

    useEffect(() => {
        if (!mapReady || !mapRef.current || !userLocation) return

        if (userMarkerRef.current) {
            userMarkerRef.current.remove()
        }

        const pin = document.createElement('div')
        pin.style.cssText = `
            width: 22px;
            height: 22px;
            border-radius: 999px;
            background: hsl(var(--primary));
            border: 4px solid hsl(var(--background));
            box-shadow: 0 0 0 6px hsla(var(--primary)/0.2);
        `

        userMarkerRef.current = new mapboxgl.Marker({ element: pin })
            .setLngLat([userLocation.lng, userLocation.lat])
            .addTo(mapRef.current)
    }, [mapReady, userLocation])

    // ── SELECTED STORE (para produtos) ──────────────────────────────────────────
    const selectedStore = mode === 'produtos'
        ? stores.find(s => s.id === selectedItem?.store_id)
        : null

    const calcDistanceKm = (storeLocation: any): number | null => {
        if (!userLocation || !storeLocation) return null
        const coords = parseCoords(storeLocation)
        if (!coords) return null
        const [lon, lat] = coords
        const R = 6371
        const dLat = (lat - userLocation.lat) * Math.PI / 180
        const dLon = (lon - userLocation.lng) * Math.PI / 180
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(userLocation.lat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    }

    const formatDistance = (distance: number | null): string | null => {
        if (distance === null) return null
        return distance < 1 ? `${Math.round(distance * 1000)}m` : `${distance.toFixed(1)}km`
    }

    const distanceValue = selectedItem ? calcDistanceKm((mode === 'lojas' ? selectedItem : selectedStore)?.location) : null
    const distanceFormatted = formatDistance(distanceValue)

    return (
        // Full‑screen map container with a loading overlay
        <div className="fixed inset-0" style={{ zIndex: 0 }}>
            {/* Global style to shift Mapbox controls and logo above the bottom navbar */}
            <style>{`
                .mapboxgl-ctrl-bottom-right,
                .mapboxgl-ctrl-bottom-left {
                    margin-bottom: 85px !important;
                }
            `}</style>

            {/* MAP CANVAS */}
            <div
                ref={mapContainerRef}
                className="absolute inset-0 w-full h-full"
                style={{ background: '#111' }}
            />

            {/* Loading spinner while Mapbox initializes */}
            {!mapReady && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-xl">
                    <span className="text-white text-xl animate-pulse">Carregando mapa…</span>
                </div>
            )}

            {/* TOP BAR UI */}
            <div className="absolute top-6 left-1/2 -translate-x-1/2 w-[95%] max-w-xl z-20 space-y-4">
                <div className="backdrop-blur-3xl bg-background/60 border border-border rounded-[32px] p-2.5 shadow-2xl overflow-hidden relative group">
                    <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-secondary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    
                    <div className="relative flex flex-col gap-2.5">
                        {/* SEARCH INPUT */}
                        <div className="flex items-center gap-3 bg-secondary/50 rounded-2xl px-5 py-4 border border-border focus-within:border-primary/20 transition-all">
                            <Search className="w-5 h-5 text-muted-foreground" />
                            <input
                                value={search}
                                onChange={e => { setSearch(e.target.value); setOverrideList(null) }}
                                placeholder={mode === 'lojas' ? 'EXPLORAR LOJAS...' : mode === 'produtos' ? 'EXPLORAR PRODUTOS...' : 'CONECTAR PESSOAS...'}
                                className="flex-1 bg-transparent text-foreground text-sm font-black italic uppercase outline-none placeholder:text-muted-foreground/30 tracking-wider"
                            />
                            {search && (
                                <button onClick={() => setSearch('')} className="w-8 h-8 flex items-center justify-center rounded-xl bg-secondary/80 hover:bg-secondary transition">
                                    <X className="w-4 h-4 text-muted-foreground" />
                                </button>
                            )}
                        </div>

                        {/* TABS */}
                        <div className="flex gap-2">
                            {(['lojas', 'produtos', 'pessoas'] as Mode[]).map(m => (
                                <button
                                    key={m}
                                    onClick={() => { setMode(m); setSelectedItem(null); setOverrideList(null) }}
                                    className={`flex-1 py-4 rounded-2xl text-[10px] font-black uppercase italic tracking-[0.2em] transition-all flex items-center justify-center gap-3 ${mode === m
                                        ? 'bg-foreground text-background shadow-2xl'
                                        : 'bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary'
                                        }`}
                                >
                                    {m === 'lojas' ? <Store className="w-4 h-4" /> : m === 'produtos' ? <ShoppingBag className="w-4 h-4" /> : <UserCircle className="w-4 h-4" />}
                                    {m}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* HORIZONTAL CAROUSEL */}
                {filtered.length > 0 && (
                    <div className={`relative px-1 transition-all ${overrideList ? 'p-2 border border-blue-500/30 rounded-[28px] bg-blue-500/5 backdrop-blur-xl' : ''}`}>
                        {overrideList && (
                             <div className="flex items-center justify-between px-4 mb-2">
                                <span className="text-[9px] font-black uppercase text-blue-400 tracking-widest">Itens na Localização</span>
                                <button onClick={() => setOverrideList(null)} className="text-[9px] font-black uppercase text-white/40 hover:text-white underline tracking-widest">Limpar</button>
                             </div>
                        )}
                        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide snap-x">
                            {filtered.map(item => (
                                <button
                                    key={item.id}
                                    onClick={() => {
                                        setSelectedItem(item)
                                        const loc = mode === 'lojas' ? item.location : stores.find(s => s.id === item.store_id)?.location
                                        const coords = parseCoords(loc)
                                        if (coords && mapRef.current) {
                                            mapRef.current.flyTo({ center: coords, zoom: 16, duration: 1000 })
                                        }
                                    }}
                                    className={`snap-center flex-shrink-0 w-24 rounded-2xl overflow-hidden transition-all duration-500 ${selectedItem?.id === item.id 
                                        ? 'bg-white shadow-[0_20px_40px_rgba(255,255,255,0.1)] -translate-y-1' 
                                        : 'bg-black/40 backdrop-blur-xl border border-white/5'
                                    }`}
                                >
                                    <div className="aspect-square bg-neutral-900 flex items-center justify-center p-0.5">
                                        {(mode === 'lojas' ? item.logo_url : mode === 'produtos' ? item.image_url : item.avatar_url) ? (
                                            <img src={mode === 'lojas' ? item.logo_url : mode === 'produtos' ? item.image_url : item.avatar_url} className="w-full h-full object-cover rounded-xl" alt="" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-xs font-black italic">{item.name.charAt(0)}</div>
                                        )}
                                    </div>
                                    <div className="p-2 text-center">
                                        <p className={`text-[8px] font-black uppercase truncate tracking-tighter ${selectedItem?.id === item.id ? 'text-black' : 'text-neutral-500'}`}>{item.name}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* SELECTED ITEM CARD */}
            {selectedItem && (
                <div className="absolute bottom-24 left-1/2 -translate-x-1/2 w-[92%] max-w-md z-30 animate-in slide-in-from-bottom-5 duration-500">
                    <div className="backdrop-blur-3xl bg-card border border-border rounded-[40px] p-6 shadow-[0_40px_80px_rgba(0,0,0,0.6)] relative group">
                        <button onClick={() => setSelectedItem(null)} className="absolute top-6 right-6 w-10 h-10 flex items-center justify-center rounded-2xl bg-secondary/80 hover:bg-foreground hover:text-background transition-all shadow-xl z-10">
                            <X className="w-5 h-5" />
                        </button>

                        <div className="flex gap-6 items-center">
                            <div className="w-28 h-28 rounded-[32px] overflow-hidden bg-background p-1 border border-border flex-shrink-0 shadow-2xl">
                                {(mode === 'lojas' ? selectedItem.logo_url : mode === 'produtos' ? selectedItem.image_url : selectedItem.avatar_url) ? (
                                    <img src={mode === 'lojas' ? selectedItem.logo_url : mode === 'produtos' ? selectedItem.image_url : selectedItem.avatar_url} className="w-full h-full object-cover rounded-[28px]" alt="" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-4xl font-black italic text-muted-foreground/30">!</div>
                                )}
                            </div>

                            <div className="flex-1 min-w-0 space-y-2 relative">
                                <div className="space-y-0.5">
                                     <h3 className="text-2xl font-black italic uppercase tracking-tighter text-foreground truncate leading-tight">{selectedItem.name}</h3>
                                     {distanceFormatted && (
                                         <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--primary),0.5)]" />
                                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">{distanceFormatted}</span>
                                         </div>
                                     )}
                                </div>
                                {mode === 'produtos' && (
                                    <p className="text-2xl font-black italic tracking-tighter text-foreground">R$ {(selectedItem.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                )}
                                {mode === 'lojas' && selectedItem.description && (
                                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest line-clamp-1">{selectedItem.description}</p>
                                )}
                                {mode === 'pessoas' && (
                                    <div className="pt-2 space-y-3">
                                        <div className="flex gap-4 items-center">
                                            <div className="text-center">
                                                <p className="text-xl font-black italic tracking-tighter leading-none">{selectedItem.followersCount}</p>
                                                <p className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground">Seguidores</p>
                                            </div>
                                            <div className="w-px h-6 bg-border" />
                                            <div className="text-center">
                                                <p className="text-xl font-black italic tracking-tighter leading-none">{selectedItem.followingCount}</p>
                                                <p className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground">Seguindo</p>
                                            </div>
                                        </div>
                                        {selectedItem.stores?.length > 0 && (
                                            <div className="flex flex-col gap-2 pt-2 border-t border-border">
                                                <span className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground">Lojas que gerencia:</span>
                                                <div className="flex flex-wrap gap-2">
                                                    {selectedItem.stores.map((store: any) => (
                                                        <div key={store.id} className="flex items-center gap-2 p-1.5 pr-3 rounded-full bg-secondary/30 border border-white/5 group-hover:border-primary/20 transition-all cursor-pointer" onClick={(e) => { e.stopPropagation(); router.push(`/${store.profileSlug}/${store.storeSlug}`) }}>
                                                            <div className="w-5 h-5 rounded-full overflow-hidden bg-background">
                                                                {store.logo_url ? (
                                                                    <img src={store.logo_url} className="w-full h-full object-cover" alt="" />
                                                                ) : (
                                                                    <div className="w-full h-full flex items-center justify-center text-[8px] font-black">{store.name?.charAt(0)}</div>
                                                                )}
                                                            </div>
                                                            <span className="text-[9px] font-bold text-foreground uppercase truncate max-w-[100px]">{store.name}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        <button
                            onClick={() => {
                                if (mode === 'lojas') router.push(`/${selectedItem.profileSlug}/${selectedItem.storeSlug}`)
                                else if (mode === 'produtos') {
                                    const store = stores.find(s => s.id === selectedItem.store_id)
                                    if (store) router.push(`/${store.profileSlug}/${store.storeSlug}/${selectedItem.slug || selectedItem.id}`)
                                } else {
                                    router.push(`/${selectedItem.profileSlug}`)
                                }
                            }}
                            className="mt-6 w-full py-5 bg-foreground text-background rounded-[24px] font-black uppercase text-[11px] tracking-[0.3em] transition-all hover:opacity-90 shadow-2xl active:scale-[0.98]"
                        >
                            {mode === 'pessoas' ? 'Ver Perfil' : 'Ver Detalhes'} &rarr;
                        </button>
                    </div>
                </div>
            )}

            {/* TOTALS BADGE */}
            <div className="absolute bottom-24 left-6 z-10 pointer-events-none sm:block hidden">
                <div className="bg-background/60 backdrop-blur-xl border border-border rounded-2xl px-5 py-3 shadow-2xl flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--primary),0.5)]" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        {filtered.length} {mode === 'lojas' ? 'Centros de Distribuição' : mode === 'produtos' ? 'Itens Disponíveis' : 'Pessoas no Mural'}
                    </span>
                </div>
            </div>
        </div>
    )
}
