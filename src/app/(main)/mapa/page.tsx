'use client'

import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Search, Store, ShoppingBag, X, MapPin, UserCircle, Star, Briefcase } from 'lucide-react'
import { useAppModeStore } from '@/store/useAppModeStore'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!

type Mode = 'lojas' | 'servicos' | 'produtos'

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
    const [filtered, setFiltered] = useState<any[]>([])
    const [selectedItem, setSelectedItem] = useState<any | null>(null)
    const [search, setSearch] = useState('')
    const [mapReady, setMapReady] = useState(false)
    const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
    const [overrideList, setOverrideList] = useState<any[] | null>(null)
    const [showFilters, setShowFilters] = useState(false)

    const router = useRouter()
    const { mode: appMode } = useAppModeStore()

    // Sync app mode with map local mode
    useEffect(() => {
        if (appMode === 'personal') {
            setMode('lojas')
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
            center: [-63.9004, -8.7612],
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
        }

        load()
    }, [])

    // ── FILTER ──────────────────────────────────────────────────────────────────
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
        setFiltered(q ? items.filter(i => i.name?.toLowerCase().includes(q)) : items)
    }, [search, mode, stores, products, overrideList])

    // ── MARKERS ─────────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!mapReady || !mapRef.current) return
        const map = mapRef.current

        markersRef.current.forEach(m => m.remove())
        markersRef.current = []

        const coordGroups: Record<string, any[]> = {}

        filtered.forEach(item => {
            let coords: [number, number] | null = null

            if (mode === 'lojas') {
                coords = parseCoords(item.location)
            } else if (mode === 'produtos' || mode === 'servicos') {
                const store = stores.find(s => s.id === item.store_id)
                coords = parseCoords(store?.location)
            }

            if (!coords) return

            const key = `${coords[0].toFixed(4)},${coords[1].toFixed(4)}`
            if (!coordGroups[key]) coordGroups[key] = []
            coordGroups[key].push({ item, coords })
        })

        Object.values(coordGroups).forEach(group => {
            group.forEach((entry, index) => {
                const { item, coords } = entry

                let lng = coords[0]
                let lat = coords[1]

                const imageUrl = mode === 'lojas' ? item.logo_url : item.image_url

                const el = document.createElement('div')
                el.style.zIndex = (100 - index).toString()

                const inner = document.createElement('div')

                let borderColor = 'hsl(var(--foreground)/0.2)'
                if (mode === 'lojas') {
                    borderColor = item.is_open ? '#22c55e' : '#ef4444'
                } else if (index === 0) {
                    borderColor = 'hsl(var(--primary))'
                }

                inner.style.cssText = `
                    width: 40px;
                    height: 40px;
                    border-radius: 12px;
                    overflow: hidden;
                    border: 2px solid ${borderColor};
                    cursor: pointer;
                    background: white;
                    transition: transform 0.2s ease;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.3);
                `

                inner.onmouseenter = () => {
                    inner.style.transform = 'scale(1.2)'
                    el.style.zIndex = "999"
                }

                inner.onmouseleave = () => {
                    inner.style.transform = 'scale(1)'
                    el.style.zIndex = (100 - index).toString()
                }

                const storeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-foreground"><path d="m2 7 4.41-2.20a2 2 0 0 1 1.76 0l4.23 2.12a2 2 0 0 0 1.76 0L18.4 4.8a2 2 0 0 1 1.76 0L22 7"/><path d="M22 7v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7"/><path d="M2 11h20"/><path d="M16 11v9"/><path d="M8 11v9"/></svg>`

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

    const selectedStore = mode === 'produtos' || mode === 'servicos'
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
        <div className="fixed inset-0" style={{ zIndex: 0 }}>
            <style>{`
                .mapboxgl-ctrl-bottom-right,
                .mapboxgl-ctrl-bottom-left {
                    margin-bottom: 85px !important;
                }
            `}</style>

            <div
                ref={mapContainerRef}
                className="absolute inset-0 w-full h-full"
                style={{ background: '#111' }}
            />

            {!mapReady && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-xl z-10">
                    <span className="text-white text-xl animate-pulse">Carregando mapa…</span>
                </div>
            )}

            {/* TOP BAR UI */}
            <div className="absolute top-6 left-1/2 -translate-x-1/2 w-[95%] max-w-2xl z-20">
                <div className="flex items-center gap-3">
                    <div className="bg-black p-2.5 rounded-2xl shadow-xl flex-shrink-0">
                        <img src="/logo.png" alt="iUser" className="h-7 w-auto object-contain brightness-0 invert" />
                    </div>

                    <div className="relative group flex-1">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder={mode === 'lojas' ? "Procurar lojas..." : mode === 'servicos' ? "Procurar serviços..." : "Procurar produtos..."}
                            value={search}
                            onChange={(e) => { setSearch(e.target.value); setOverrideList(null) }}
                            className="w-full pl-10 pr-10 py-3.5 bg-card/80 backdrop-blur-xl border border-border/50 rounded-[20px] text-foreground placeholder:text-muted-foreground/60 text-sm focus:outline-none focus:border-primary/50 transition-all duration-300 shadow-2xl shadow-black/20"
                        />
                        {search && (
                            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>

                    <button
                        onClick={() => setShowFilters(true)}
                        className="flex-shrink-0 flex items-center gap-2 px-4 py-3 bg-card border border-border rounded-xl text-xs font-bold uppercase tracking-widest text-foreground hover:bg-muted transition-all duration-300 shadow-sm"
                    >
                        {mode === 'lojas' ? <Store className="w-4 h-4" /> : mode === 'servicos' ? <Briefcase className="w-4 h-4" /> : <ShoppingBag className="w-4 h-4" />}
                        <span className="hidden sm:inline lowercase first-letter:uppercase">{mode}</span>
                    </button>
                </div>
            </div>

            {/* HORIZONTAL LISTA DE ITENS - DO TAMANHO DOS MARCADORES (48px) */}
            {filtered.length > 0 && (
                <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[95%] max-w-2xl z-20">
                    <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-hide snap-x">
                        {filtered.map(item => (
                            <button
                                key={item.id}
                                onClick={() => {
                                    setSelectedItem(item)
                                    let loc = null
                                    if (mode === 'lojas') {
                                        loc = item.location
                                    } else {
                                        const store = stores.find(s => s.id === item.store_id)
                                        loc = store?.location
                                    }
                                    const coords = parseCoords(loc)
                                    if (coords && mapRef.current) {
                                        mapRef.current.flyTo({ center: coords, zoom: 16, duration: 1000 })
                                    }
                                }}
                                className={`snap-center flex-shrink-0 transition-all duration-300 ${selectedItem?.id === item.id
                                    ? 'ring-2 ring-primary scale-110'
                                    : 'opacity-90 hover:scale-105'
                                    }`}
                                style={{ width: '40px', height: '40px' }}
                            >
                                <div className={`w-full h-full rounded-lg overflow-hidden border shadow-sm ${mode === 'lojas'
                                    ? (item.is_open ? 'border-green-500' : 'border-red-500')
                                    : 'border-border'
                                    } bg-white`}>
                                    {(mode === 'lojas' ? item.logo_url : item.image_url) ? (
                                        <img
                                            src={mode === 'lojas' ? item.logo_url : item.image_url}
                                            className="w-full h-full object-cover"
                                            alt=""
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-[10px] font-black italic bg-white text-muted-foreground">
                                            {item.name?.charAt(0)}
                                        </div>
                                    )}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* SELECTED ITEM CARD */}
            {selectedItem && (
                <div className="absolute bottom-20 left-1/2 -translate-x-1/2 w-[92%] max-w-sm z-30 animate-in slide-in-from-bottom-5 duration-500">
                    <div className="backdrop-blur-3xl bg-card border border-border/50 rounded-[28px] p-4 shadow-[0_40px_80px_rgba(0,0,0,0.4)] relative group">
                        <button onClick={() => setSelectedItem(null)} className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-secondary/80 hover:bg-foreground hover:text-background transition-all z-10">
                            <X className="w-4 h-4" />
                        </button>

                        <div className="flex gap-4 items-center">
                            <div className={`w-20 h-20 rounded-2xl overflow-hidden bg-background p-0.5 border-2 flex-shrink-0 shadow-lg ${mode === 'lojas' ? (selectedItem.is_open ? 'border-green-500' : 'border-red-500') : 'border-border'}`}>
                                {(mode === 'lojas' ? selectedItem.logo_url : selectedItem.image_url) ? (
                                    <img src={mode === 'lojas' ? selectedItem.logo_url : selectedItem.image_url} className="w-full h-full object-cover rounded-[14px]" alt="" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-2xl font-black italic text-muted-foreground/30">?</div>
                                )}
                            </div>

                            <div className="flex-1 min-w-0 space-y-1 relative">
                                <div className="space-y-0.5">
                                    <h3 className="text-lg font-black italic uppercase tracking-tighter text-foreground truncate leading-tight">{selectedItem.name}</h3>
                                    <div className="flex items-center gap-2">
                                        {mode === 'lojas' && (
                                            <span className={`text-[7px] font-black uppercase px-1.5 py-0.5 rounded-full ${selectedItem.is_open ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                                                {selectedItem.is_open ? 'Aberto' : 'Fechado'}
                                            </span>
                                        )}
                                        {distanceFormatted && (
                                            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{distanceFormatted}</span>
                                        )}
                                        {mode === 'lojas' && selectedItem.ratings_avg > 0 && (
                                            <div className="flex items-center gap-1 font-black text-[10px] text-yellow-500">
                                                <Star size={10} className="fill-yellow-500" />
                                                {selectedItem.ratings_avg.toFixed(1)}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                {(mode === 'servicos' || mode === 'produtos') && selectedItem.price && (
                                    <p className="text-lg font-black italic tracking-tighter text-foreground">R$ {selectedItem.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                )}
                                {mode === 'lojas' && selectedItem.description && (
                                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest line-clamp-1">{selectedItem.description}</p>
                                )}
                            </div>
                        </div>

                        <button
                            onClick={() => {
                                if (mode === 'lojas') {
                                    router.push(`/${selectedItem.profileSlug}/${selectedItem.storeSlug}`)
                                } else {
                                    const store = stores.find(s => s.id === selectedItem.store_id)
                                    if (store) {
                                        router.push(`/${store.profileSlug}/${store.storeSlug}/${selectedItem.slug || selectedItem.id}`)
                                    }
                                }
                            }}
                            className="mt-4 w-full py-3 bg-foreground text-background rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] transition-all hover:opacity-90 active:scale-[0.98]"
                        >
                            Visitar Loja &rarr;
                        </button>
                    </div>
                </div>
            )}

            {/* TOTALS BADGE */}
            <div className="absolute bottom-20 left-6 z-10 pointer-events-none sm:block hidden">
                <div className="bg-background/80 backdrop-blur-xl border border-border/50 rounded-2xl px-4 py-2 shadow-2xl flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                    <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground opacity-70">
                        {filtered.length} {mode === 'lojas' ? 'Lojas' : mode === 'servicos' ? 'Serviços' : 'Produtos'}
                    </span>
                </div>
            </div>

            {/* Filter Modal */}
            {showFilters && (
                <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity" onClick={() => setShowFilters(false)} />
                    <div className="relative bg-card rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md shadow-2xl transform transition-all duration-300 animate-in slide-in-from-bottom font-sans overflow-hidden border border-border">
                        <div className="flex items-center justify-between p-4 border-b border-border">
                            <h3 className="text-lg font-bold text-foreground">Explorar</h3>
                            <button onClick={() => setShowFilters(false)} className="p-1 rounded-lg hover:bg-muted transition-colors">
                                <X className="w-5 h-5 text-muted-foreground" />
                            </button>
                        </div>
                        <div className="p-2 space-y-1">
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
                                        ? 'bg-primary/10 text-primary'
                                        : 'text-foreground hover:bg-muted'
                                        }`}
                                >
                                    <div className={`p-2 rounded-lg ${mode === m ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                                        {m === 'lojas' ? <Store size={18} /> : m === 'servicos' ? <Briefcase size={18} /> : <ShoppingBag size={18} />}
                                    </div>
                                    <span className="flex-1 text-left font-bold text-sm lowercase first-letter:uppercase">{m}</span>
                                    {mode === m && <div className="w-2 h-2 rounded-full bg-primary" />}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}