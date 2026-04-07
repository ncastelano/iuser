'use client'

import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!

type Item = {
  id: string
  type: 'loja' | 'produto'
  name: string
  slug: string
  storeSlug: string
  image_url?: string | null
  price?: number
  lat: number
  lng: number
  isOpen?: boolean
  rating?: number
}

export default function MapaPage() {
  const router = useRouter()
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [selected, setSelected] = useState<Item | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'lojas' | 'produtos'>('lojas')
  const [mapLoaded, setMapLoaded] = useState(false)

  const defaultCenter: [number, number] = [-63.90043, -8.76116]

  const parseLocation = (locStr: string | null) => {
    if (!locStr) return null
    const match = locStr.match(/POINT\((-?\d+\.?\d*) (-?\d+\.?\d*)\)/)
    if (!match) return null
    return { lng: parseFloat(match[1]), lat: parseFloat(match[2]) }
  }

  // 🔥 LOAD DATA
  useEffect(() => {
    const loadFromDB = async () => {
      const supabase = createClient()
      
      const { data: storesList } = await supabase
        .from('stores')
        .select(`id, name, storeSlug, logo_url, location`)
        
      const { data: productsList } = await supabase
        .from('products')
        .select('*')

      const mapItems: Item[] = []

      ;(storesList || []).forEach((store) => {
        const parsed = parseLocation(store.location)
        if (!parsed) return
        
        const logoUrl = store.logo_url ? supabase.storage.from('store-logos').getPublicUrl(store.logo_url).data.publicUrl : null

        mapItems.push({
          id: store.id,
          type: 'loja',
          name: store.name,
          slug: store.storeSlug,
          storeSlug: store.storeSlug,
          image_url: logoUrl,
          lat: parsed.lat,
          lng: parsed.lng,
          isOpen: true,
          rating: 0
        })
      })

      ;(productsList || []).forEach((product) => {
        const store = (storesList || []).find((s) => s.id === product.store_id)
        if (!store) return
        const parsed = parseLocation(store.location)
        if (!parsed) return
        
        const imageUrl = product.image_url ? supabase.storage.from('product-images').getPublicUrl(product.image_url).data.publicUrl : null

        mapItems.push({
          id: product.id,
          type: 'produto',
          name: product.name,
          slug: product.id,
          storeSlug: store.storeSlug,
          price: product.price ?? undefined,
          lat: parsed.lat,
          lng: parsed.lng,
          image_url: imageUrl
        })
      })

      setItems(mapItems)
    }

    loadFromDB()
  }, [])

  // 🚀 INIT MAP
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    mapRef.current = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: defaultCenter,
      zoom: 12
    })

    mapRef.current.on('load', () => {
      if (!mapRef.current) return

      // Source
      mapRef.current.addSource('items', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50
      })

      // 🔵 Cluster
      mapRef.current.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'items',
        filter: ['has', 'point_count'],
        paint: {
          'circle-radius': 20,
          'circle-color': '#f97316'
        }
      })

      // 🔢 Count
      mapRef.current.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'items',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-size': 12
        }
      })

      // 📍 Points diferenciando lojas/produtos
      mapRef.current.addLayer({
        id: 'unclustered',
        type: 'circle',
        source: 'items',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': 8,
          'circle-color': [
            'match',
            ['get', 'type'],
            'loja', '#ffffff',
            'produto', '#10b981', // verde produtos
            '#ccc'
          ]
        }
      })

      // Click cluster
      mapRef.current.on('click', 'clusters', (e) => {
        if (!mapRef.current) return
        const features = mapRef.current.queryRenderedFeatures(e.point, { layers: ['clusters'] })
        const clusterId = features?.[0]?.properties?.cluster_id
        if (!clusterId) return
        const source = mapRef.current.getSource('items') as any
        source.getClusterExpansionZoom(clusterId, (err: any, zoom: number) => {
          if (err) return
          mapRef.current?.easeTo({
            center: (features?.[0].geometry as any).coordinates,
            zoom
          })
        })
      })

      // Click point
      mapRef.current.on('click', 'unclustered', (e) => {
        const props = e.features?.[0]?.properties
        if (!props) return
        const item = JSON.parse(props.item)
        setSelected(item)
        mapRef.current?.flyTo({ center: [item.lng, item.lat], zoom: 15 })
      })

      setMapLoaded(true)
    })
  }, [])

  // 🔎 FILTER + UPDATE SOURCE
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return

    const filtered = items.filter((item) => {
      if (filter === 'lojas' && item.type !== 'loja') return false
      if (filter === 'produtos' && item.type !== 'produto') return false
      if (search.trim() && !item.name.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })

    const geojson = {
      type: 'FeatureCollection',
      features: filtered.map((item) => ({
        type: 'Feature',
        properties: { item: JSON.stringify(item), type: item.type },
        geometry: { type: 'Point', coordinates: [item.lng, item.lat] }
      }))
    }

    const source = mapRef.current.getSource('items') as any
    if (source) source.setData(geojson)
  }, [items, search, filter, mapLoaded])

  const carouselStores = items.filter(
    (i) => i.type === 'loja' && (!search || i.name.toLowerCase().includes(search.toLowerCase()))
  )

  const carouselProducts = items.filter(
    (i) => i.type === 'produto' && (!search || i.name.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div className="w-full h-screen relative bg-black">
      {/* UI: Busca e Carousel */}
      <div className="absolute top-0 left-0 w-full z-10 p-4 pointer-events-none">
        <div className="max-w-4xl mx-auto flex flex-col gap-4 pointer-events-auto">
          
          <div className="flex flex-col md:flex-row gap-3">
            {/* Input de busca */}
            <div className="flex-1 bg-neutral-900/80 backdrop-blur-md border border-neutral-800 rounded-full flex items-center px-4 py-3 focus-within:border-orange-500 focus-within:shadow-[0_0_15px_rgba(249,115,22,0.2)] transition-all">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-neutral-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 100-15 7.5 7.5 0 000 15z" />
              </svg>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={filter === 'lojas' ? 'Procurar lojas no mapa...' : 'Procurar produtos no mapa...'}
                className="bg-transparent w-full text-white outline-none placeholder:text-neutral-500 text-sm"
              />
            </div>
            
            {/* Filtro Lojas/Produtos */}
            <div className="flex bg-neutral-900/80 backdrop-blur-md border border-neutral-800 rounded-full p-1 whitespace-nowrap">
              <button
                onClick={() => setFilter('lojas')}
                className={`px-6 py-2 rounded-full font-bold text-sm transition-all ${filter === 'lojas' ? 'bg-orange-500 text-black shadow-md' : 'text-neutral-400 hover:text-white'}`}
              >
                Lojas
              </button>
              <button
                onClick={() => setFilter('produtos')}
                className={`px-6 py-2 rounded-full font-bold text-sm transition-all ${filter === 'produtos' ? 'bg-orange-500 text-black shadow-md' : 'text-neutral-400 hover:text-white'}`}
              >
                Produtos
              </button>
            </div>
          </div>

          {/* Carousel Lojas (Glass Glow Card Design) */}
          {filter === 'lojas' && carouselStores.length > 0 && (
            <div className="w-full overflow-x-auto no-scrollbar py-2">
              <div className="flex gap-4">
                {carouselStores.slice(0, 15).map((store) => (
                  <div
                    key={'carousel-' + store.id}
                    onClick={() => {
                       setSelected(store)
                       mapRef.current?.flyTo({ center: [store.lng, store.lat], zoom: 15 })
                    }}
                    className="flex-shrink-0 w-64 bg-neutral-950/80 backdrop-blur-md border border-neutral-800 rounded-2xl p-3 cursor-pointer hover:border-orange-500/50 hover:-translate-y-1 hover:shadow-[0_4px_20px_rgba(249,115,22,0.15)] transition-all flex items-center gap-3"
                  >
                    <div className="w-14 h-14 bg-neutral-800 rounded-xl flex-shrink-0 flex items-center justify-center border border-neutral-700 shadow-inner overflow-hidden">
                      {store.image_url ? (
                         <img src={store.image_url} alt="Logo" className="w-full h-full object-cover" />
                      ) : (
                         <span className="text-[10px] text-neutral-500">Logo</span>
                      )}
                    </div>
                    <div className="flex flex-col flex-1 overflow-hidden">
                      <h3 className="text-white font-bold text-sm truncate">{store.name}</h3>
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-orange-400 text-xs">★ {store.rating?.toFixed(1) ?? 'N/A'}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-md ml-auto border ${store.isOpen ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-red-500/20 text-red-500 border-red-500/30'}`}>
                          {store.isOpen ? 'Aberto' : 'Fechado'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Carousel Produtos */}
          {filter === 'produtos' && carouselProducts.length > 0 && (
            <div className="w-full overflow-x-auto no-scrollbar py-2">
              <div className="flex gap-4">
                {carouselProducts.slice(0, 15).map((produto) => (
                  <div
                    key={'carousel-' + produto.id}
                    onClick={() => {
                       setSelected(produto)
                       mapRef.current?.flyTo({ center: [produto.lng, produto.lat], zoom: 15 })
                    }}
                    className="flex-shrink-0 w-64 bg-neutral-950/80 backdrop-blur-md border border-neutral-800 rounded-2xl p-3 cursor-pointer hover:border-orange-500/50 hover:-translate-y-1 hover:shadow-[0_4px_20px_rgba(249,115,22,0.15)] transition-all flex items-center gap-3"
                  >
                    <div className="w-14 h-14 bg-neutral-800 rounded-xl flex-shrink-0 flex items-center justify-center border border-neutral-700 shadow-inner overflow-hidden">
                      {produto.image_url ? (
                         <img src={produto.image_url} alt="Prod" className="w-full h-full object-cover" />
                      ) : (
                         <span className="text-[10px] text-neutral-500 px-1 text-center break-words">{produto.name.slice(0, 10)}</span>
                      )}
                    </div>
                    <div className="flex flex-col flex-1 overflow-hidden">
                      <h3 className="text-white font-bold text-sm truncate">{produto.name}</h3>
                      <div className="mt-1 font-bold text-green-400 text-sm">
                        R$ {produto.price?.toFixed(2).replace('.', ',')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MAP */}
      <div ref={containerRef} className="w-full h-full" />

      {/* CARD DETALHES INFERIOR */}
      {selected && (
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-full max-w-sm px-4 z-20">
          <div className="bg-neutral-950/90 backdrop-blur-lg border border-neutral-800 hover:border-orange-500/50 rounded-2xl p-5 shadow-[0_10px_40px_rgba(0,0,0,0.8)] transition-all">
            <button onClick={() => setSelected(null)} className="absolute right-4 top-4 text-neutral-500 hover:text-white transition-colors bg-neutral-900 rounded-full w-8 h-8 flex items-center justify-center">✕</button>
            <span className="text-orange-500 text-[10px] font-bold uppercase tracking-wider bg-orange-500/10 px-2 py-1 rounded-md">{selected.type}</span>
            <h2 className="text-white font-bold text-xl mt-2 line-clamp-1 pr-6">{selected.name}</h2>
            {selected.price && <p className="text-green-400 font-extrabold text-lg mt-1">R$ {selected.price.toFixed(2).replace('.', ',')}</p>}
            <button
              onClick={() => router.push(selected.type === 'loja' ? `/${selected.storeSlug}` : `/${selected.storeSlug}/${selected.slug}`)}
              className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-black mt-5 py-3.5 rounded-xl font-bold shadow-[0_4px_15px_rgba(249,115,22,0.3)] hover:shadow-[0_4px_25px_rgba(249,115,22,0.5)] transition-all flex items-center justify-center gap-2"
            >
              <span>{selected.type === 'loja' ? 'Visitar loja' : 'Comprar produto'}</span>
              <span>→</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
