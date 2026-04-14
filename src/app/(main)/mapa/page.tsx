'use client'

import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Search, Store, ShoppingBag, X, MapPin } from 'lucide-react'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!

type Mode = 'lojas' | 'produtos'

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

    const [mode, setMode] = useState<Mode>('lojas')
    const [stores, setStores] = useState<any[]>([])
    const [products, setProducts] = useState<any[]>([])
    const [filtered, setFiltered] = useState<any[]>([])
    const [selectedItem, setSelectedItem] = useState<any | null>(null)
    const [search, setSearch] = useState('')
    const [mapReady, setMapReady] = useState(false)
    const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
    const [overrideList, setOverrideList] = useState<any[] | null>(null)

    const router = useRouter()

    // ── INIT MAP ────────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!mapContainerRef.current) return

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                pos => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                () => {}
            )
        }

        const map = new mapboxgl.Map({
            container: mapContainerRef.current,
            style: 'mapbox://styles/mapbox/dark-v11',
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
        return () => map.remove()
    }, [])

    // ── LOAD DATA ───────────────────────────────────────────────────────────────
    useEffect(() => {
        const load = async () => {
            const supabase = createClient()

            const { data: storesData } = await supabase.from('stores_geo').select('*')
            const { data: productsData } = await supabase.from('products_geo').select('*')

            // Debug: log fetched counts
            console.log('Fetched stores:', storesData?.length, 'products:', productsData?.length)

            const mappedStores = (storesData || []).map(s => ({
                ...s,
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
        const items = mode === 'lojas' ? stores : products
        const q = search.toLowerCase()
        setFiltered(q ? items.filter(i => i.name?.toLowerCase().includes(q)) : items)
    }, [search, mode, stores, products, overrideList])

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
            } else {
                const store = stores.find(s => s.id === item.store_id)
                coords = parseCoords(store?.location)
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

                const imageUrl = mode === 'lojas' ? item.logo_url : item.image_url

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
                    border: 2px solid ${index === 0 ? '#ffaa00' : '#ffffff'};
                    cursor: pointer;
                    background: #1a1a1a;
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

                const storeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 7 4.41-2.20a2 2 0 0 1 1.76 0l4.23 2.12a2 2 0 0 0 1.76 0L18.4 4.8a2 2 0 0 1 1.76 0L22 7"/><path d="M22 7v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7"/><path d="M2 11h20"/><path d="M16 11v9"/><path d="M8 11v9"/></svg>`

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

                // Add indicator badge se tem mais de um no mesmo lugar, e este for o center
                if (index === 0 && group.length > 1) {
                    const badge = document.createElement('div')
                    badge.innerHTML = `+${group.length - 1}`
                    badge.style.cssText = `
                        position: absolute;
                        bottom: -5px;
                        right: -5px;
                        background: #ffaa00;
                        color: black;
                        font-size: 10px;
                        font-weight: 900;
                        padding: 2px 6px;
                        border-radius: 10px;
                        border: 2px solid #000;
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
        const a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(userLocation.lat*Math.PI/180)*Math.cos(lat*Math.PI/180)*Math.sin(dLon/2)*Math.sin(dLon/2)
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
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

            {/* TOP BAR */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 w-[95%] max-w-xl z-10">

                <div className="backdrop-blur-xl bg-black/60 border border-white/10 rounded-2xl p-3 shadow-2xl">

                    {/* SEARCH */}
                    <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2 mb-3 border border-white/10 focus-within:border-white focus-within:shadow-[0_0_10px_rgba(255,255,255,0.15)] transition-all">
                        <Search className="w-4 h-4 text-neutral-400 group-focus-within:text-white" />
                        <input
                            value={search}
                            onChange={e => { setSearch(e.target.value); setOverrideList(null) }}
                            placeholder={mode === 'lojas' ? 'Buscar loja...' : 'Buscar produto...'}
                            className="flex-1 bg-transparent text-white text-base outline-none placeholder:text-neutral-500"
                        />
                        {search && (
                            <button onClick={() => setSearch('')} className="text-neutral-400 hover:text-white transition">
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>

                    {/* MODE TABS */}
                    <div className="flex gap-1">
                        {(['lojas', 'produtos'] as Mode[]).map(m => (
                            <button
                                key={m}
                                onClick={() => { setMode(m); setSelectedItem(null); setOverrideList(null) }}
                                className={`flex-1 py-1.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${mode === m
                                    ? 'bg-white text-black shadow-[0_0_15px_rgba(255,255,255,0.3)]'
                                    : 'text-neutral-400 hover:text-white'
                                    }`}
                            >
                                {m === 'lojas' ? <><Store className="w-4 h-4" /> Lojas</> : <><ShoppingBag className="w-4 h-4" /> Produtos</>}
                            </button>
                        ))}
                    </div>
                </div>

                {/* CAROUSEL */}
                {filtered.length > 0 && (
                    <div className={`relative mt-2 ${overrideList ? 'p-1.5 border-2 border-[#ffaa00] rounded-xl bg-black/60 shadow-lg' : ''}`}>
                        {overrideList && (
                            <button
                                onClick={() => setOverrideList(null)}
                                className="absolute -top-3 -right-2 z-20 w-6 h-6 flex items-center justify-center rounded-full bg-red-600 border border-black text-white shadow-2xl hover:scale-110 active:scale-95 transition-all"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                            {filtered.map(item => (
                            <button
                                key={item.id}
                                onClick={() => {
                                    setSelectedItem(item)
                                    const loc = mode === 'lojas'
                                        ? item.location
                                        : stores.find(s => s.id === item.store_id)?.location
                                    const coords = parseCoords(loc)
                                    if (coords && mapRef.current) {
                                        mapRef.current.flyTo({ center: coords, zoom: 15, duration: 800 })
                                    }
                                }}
                                className={`flex-shrink-0 w-[90px] min-w-[90px] max-w-[90px] backdrop-blur-xl border rounded-xl overflow-hidden cursor-pointer transition-all ${selectedItem?.id === item.id
                                    ? 'border-white shadow-[0_0_10px_rgba(255,255,255,0.4)]'
                                    : 'bg-black/60 border-white/10'
                                    }`}
                            >
                                <div className="w-full h-16 bg-neutral-900 flex items-center justify-center">
                                    {(mode === 'lojas' ? item.logo_url : item.image_url) ? (
                                        <img
                                            src={mode === 'lojas' ? item.logo_url : item.image_url}
                                            className="w-full h-full object-cover"
                                            alt={item.name}
                                        />
                                    ) : (
                                        <Store className="w-6 h-6 text-neutral-500" />
                                    )}
                                </div>
                                <p className="text-[10px] text-white px-1.5 py-1 truncate text-left">
                                    {item.name}
                                </p>
                            </button>
                        ))}
                        </div>
                    </div>
                )}
            </div>

            {/* SELECTED CARD */}
            {selectedItem && (
                <div className="absolute bottom-20 left-1/2 -translate-x-1/2 w-[92%] max-w-md z-10">
                    <div className="backdrop-blur-2xl bg-black/70 border border-white/10 rounded-2xl p-4 shadow-2xl">

                        <button
                            onClick={() => setSelectedItem(null)}
                            className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white text-xs transition"
                        >
                            ✕
                        </button>

                        {/* IMAGE */}
                        <div className="w-full h-36 rounded-xl overflow-hidden mb-3 bg-neutral-900 flex items-center justify-center">
                            {(mode === 'lojas' ? selectedItem.logo_url : selectedItem.image_url) ? (
                                <img
                                    src={mode === 'lojas' ? selectedItem.logo_url : selectedItem.image_url}
                                    className="w-full h-full object-cover"
                                    alt={selectedItem.name}
                                />
                            ) : (
                                <Store className="w-10 h-10 text-neutral-500" />
                            )}
                        </div>

                        {/* INFO */}
                        <div className="flex items-start justify-between gap-2">
                            <h3 className="text-white font-bold text-lg leading-tight">{selectedItem.name}</h3>
                            {distanceFormatted && (
                                <div className="px-2 py-1 text-[10px] font-bold bg-white/10 text-white rounded-md border border-white/20 whitespace-nowrap flex items-center gap-1 shadow-lg shrink-0 mt-1">
                                    <MapPin className="w-3 h-3" />
                                    <span>{distanceFormatted}</span>
                                </div>
                            )}
                        </div>

                        {mode === 'lojas' && selectedItem.description && (
                            <p className="text-neutral-400 text-sm mt-1 line-clamp-2">{selectedItem.description}</p>
                        )}

                        {mode === 'produtos' && (
                            <>
                                {selectedStore && (
                                    <p className="text-neutral-400 text-sm mt-1 flex items-center gap-1"><MapPin className="w-3 h-3" /> {selectedStore.name}</p>
                                )}
                                <p className="text-green-400 font-bold text-lg mt-1">
                                    R$ {(selectedItem.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </p>
                            </>
                        )}

                        <button
                            onClick={() => {
                                if (mode === 'lojas') {
                                    router.push(`/${selectedItem.storeSlug}`)
                                } else {
                                    const store = stores.find(s => s.id === selectedItem.store_id)
                                    router.push(`/${store?.storeSlug}/${selectedItem.slug || selectedItem.id}`)
                                }
                            }}
                            className="mt-3 w-full bg-white hover:bg-neutral-200 py-2.5 rounded-xl text-black font-bold transition shadow-[0_0_15px_rgba(255,255,255,0.3)]"
                        >
                            Ver detalhes →
                        </button>
                    </div>
                </div>
            )}

            {/* STATS BADGE */}
            <div className="absolute bottom-[88px] left-[8px] z-10">
                <div className="bg-black/60 backdrop-blur border border-white/10 rounded-xl px-3 py-1.5 text-xs text-neutral-300">
                    {filtered.length} {mode === 'lojas' ? 'lojas' : 'produtos'}
                </div>
            </div>

        </div>
    )
}