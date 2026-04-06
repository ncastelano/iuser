'use client'

import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Store as StoreIcon, Navigation, Box, Search } from 'lucide-react'

// Fix generic icon issue with react-leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface MapItem {
  id: string
  type: 'loja' | 'produto'
  name: string
  slug: string // slug para produto, ou usar storeSlug mesmo pra loja
  storeSlug: string // para compor a url /storeSlug/produtoSlug
  image_url: string | null
  description: string | null
  is_open: boolean
  price?: number
  lat: number
  lng: number
  distanceKm?: string | null
}

// O PostgreSQL (PostGIS via Supabase API) frequentemente retorna dados Geography em Hex WKB (ex: 0101000020E61...).
// Esse helper lê diretamente a latitude e longitude binária para plotarmos perfeitamente na tela.
const parseLocation = (locStr: string | null) => {
   if (!locStr) return null;
   if (locStr.startsWith('POINT(')) {
       const match = locStr.match(/POINT\((-?\d+\.?\d*)\s+(-?\d+\.?\d*)\)/i);
       if (match) return { lng: parseFloat(match[1]), lat: parseFloat(match[2]) };
       return null;
   }
   if (locStr.length >= 50 && /^[0-9a-fA-F]+$/.test(locStr)) {
       try {
           const data = new Uint8Array(locStr.match(/[\da-fA-F]{2}/g)!.map(h => parseInt(h, 16)));
           const view = new DataView(data.buffer);
           const littleEndian = data[0] === 1;
           return { lng: view.getFloat64(9, littleEndian), lat: view.getFloat64(17, littleEndian) };
       } catch (e) {
           return null;
       }
   }
   return null;
}

function SetMapCenter({ coords }: { coords: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (coords) {
      map.flyTo(coords, 12, { animate: true, duration: 1.5 });
    }
  }, [coords, map]);
  return null;
}

export default function MapComponent() {
  const router = useRouter()
  const supabase = createClient()

  const [items, setItems] = useState<MapItem[]>([])
  const [userLoc, setUserLoc] = useState<[number, number] | null>(null)
  const [centerLoc, setCenterLoc] = useState<[number, number]>([-8.76116, -63.90043]) // Porto Velho RO default

  const [loading, setLoading] = useState(true)
  const [selectedItem, setSelectedItem] = useState<MapItem | null>(null)
  const [activeFilter, setActiveFilter] = useState<'lojas' | 'produtos'>('lojas')

  const [searchQuery, setSearchQuery] = useState('')

  // 1. Obter Localização do Usuário
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc: [number, number] = [pos.coords.latitude, pos.coords.longitude]
          setUserLoc(loc)
          setCenterLoc(loc)
        },
        (err) => {
          console.error("Erro de GPS", err)
          setLoading(false)
        }
      )
    } else {
      setLoading(false)
    }
  }, [])

  // 2. Buscar LOJAS e PRODUTOS com localização cadastrada
  useEffect(() => {
    const fetchAllItems = async () => {
      setLoading(true)
      let mapItems: MapItem[] = []

      // Buscar Lojas
      const { data: storesD, error: errS } = await supabase
        .from('stores')
        .select(`id, name, "storeSlug", logo_url, description, is_open, location`)
        .not('location', 'is', null)

      // Buscar Produtos (e pegar o slug da loja mãe via join pra poder navegar)
      const { data: productsD, error: errP } = await supabase
        .from('products')
        .select(`id, name, slug, description, price, image_url, location, stores("storeSlug")`)
        .not('location', 'is', null)
        .eq('is_active', true)

      if (!errS && storesD) {
        storesD.forEach(st => {
           const parsed = parseLocation(st.location);
           if (parsed && parsed.lat !== 0) {
              mapItems.push({
                 id: st.id,
                 type: 'loja',
                 name: st.name,
                 slug: st.storeSlug,
                 storeSlug: st.storeSlug,
                 image_url: st.logo_url,
                 description: st.description,
                 is_open: st.is_open,
                 lat: parsed.lat, 
                 lng: parsed.lng
              })
           }
        })
      }

      if (!errP && productsD) {
        productsD.forEach(pr => {
           const parsed = parseLocation(pr.location);
           const storeSlug = pr.stores && typeof pr.stores === 'object' && 'storeSlug' in pr.stores 
              ? String(pr.stores.storeSlug) : ''

           if (parsed && parsed.lat !== 0) {
              mapItems.push({
                 id: pr.id,
                 type: 'produto',
                 name: pr.name,
                 slug: pr.slug,
                 storeSlug: storeSlug,
                 image_url: pr.image_url,
                 description: pr.description,
                 is_open: true, 
                 price: pr.price,
                 lat: parsed.lat, 
                 lng: parsed.lng
              })
           }
        })
      }

      // Calcular a distância do usuário para ORDENAR a lista horizontal
      if (userLoc) {
          const calcDistance = (slat: number, slng: number) => {
              const toRad = (v: number) => (v * Math.PI) / 180
              const R = 6371
              const dLat = toRad(slat - userLoc[0])
              const dLon = toRad(slng - userLoc[1])
              const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(userLoc[0])) * Math.cos(toRad(slat)) * Math.sin(dLon / 2) ** 2
              const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
              return (R * c).toFixed(1)
          }
          mapItems.forEach(item => {
             item.distanceKm = calcDistance(item.lat, item.lng)
          })
          mapItems.sort((a, b) => parseFloat(a.distanceKm || '0') - parseFloat(b.distanceKm || '0'))
      }

      if (errS) {
         console.error("Erro ao buscar Lojas no Mapa:", errS)
      }
      if (errP) {
         console.error("Erro ao buscar Produtos no Mapa:", errP)
      }

      setItems(mapItems)
      setLoading(false)
    }

    fetchAllItems()
  }, [userLoc])

  const getImageUrl = (item: MapItem) => {
    if (!item.image_url) return ''
    const bucket = item.type === 'loja' ? 'store-logos' : 'product-images'
    return supabase.storage.from(bucket).getPublicUrl(item.image_url).data.publicUrl
  }

  // 3. Fabrica o Marcador Visual Personalizado
  const createAvatarIcon = (item: MapItem) => {
    const src = getImageUrl(item);
    const isStore = item.type === 'loja';

    // Loja (Circle) / Produto (Square Rounded-xl)
    const borderRadius = isStore ? '50%' : '12px';
    const tag = isStore ? 'LOJA' : 'PROD';

    const html = `
      <div style="width: 50px; height: 50px; background-color: #171717; border-radius: ${borderRadius}; display: flex; align-items: center; justify-content: center; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -4px rgba(0, 0, 0, 0.5);">
        ${src ? `<img src="${src}" style="width: 100%; height: 100%; object-fit: cover;" />` : `<span style="color: #f97316; font-size: 11px; font-weight: 900;">${tag}</span>`}
      </div>
    `;

    return L.divIcon({
      html,
      className: '',
      iconSize: [50, 50],
      iconAnchor: [25, 50],
      popupAnchor: [0, -50]
    });
  }

  const handleItemClick = (item: MapItem) => {
    if (item.lat && item.lng) {
      setCenterLoc([item.lat, item.lng])
    }
    setSelectedItem(item)
  }

  const navigateTo = (item: MapItem) => {
    if (item.type === 'loja') {
      router.push(`/${item.storeSlug}`)
    } else {
      router.push(`/${item.storeSlug}/${item.slug}`)
    }
  }

  const filteredItems = items.filter(item => {
    if (activeFilter === 'lojas' && item.type !== 'loja') return false
    if (activeFilter === 'produtos' && item.type !== 'produto') return false
    
    if (searchQuery.trim() !== '') {
        return item.name.toLowerCase().includes(searchQuery.toLowerCase())
    }
    
    return true
  })

  return (
    <div className="relative w-full h-full flex flex-col flex-1 isolate bg-black">

      {/* O MAPA */}
      <div className="absolute inset-0 z-0">
        <MapContainer
          center={centerLoc}
          zoom={12}
          zoomControl={false}
          className="w-full h-full"
        >
          <TileLayer
            url={`https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/256/{z}/{x}/{y}@2x?access_token=${process.env.NEXT_PUBLIC_MAPBOX_TOKEN}`}
            attribution='Map data &copy; <a href="https://www.mapbox.com/">Mapbox</a>'
          />
          <SetMapCenter coords={centerLoc} />

          {/* Marcador do Usuário */}
          {userLoc && (
            <Marker position={userLoc}>
              <Popup>
                <span className="text-black font-bold">Você está aqui</span>
              </Popup>
            </Marker>
          )}

          {/* Marcadores das Lojas e Produtos (Aplicando o filtro) */}
          {filteredItems.map((item, idx) => (
            <Marker
              key={`${item.type}-${item.id}-${idx}`}
              position={[item.lat, item.lng]}
              icon={createAvatarIcon(item)}
              eventHandlers={{
                click: () => handleItemClick(item)
              }}
            >
              <Popup>
                <div className="flex flex-col items-center p-2 min-w-[150px]">
                  <span className="text-[10px] font-bold text-orange-500 mb-1">{item.type.toUpperCase()}</span>
                  <h3 className="font-bold text-neutral-900 text-center">{item.name}</h3>
                  {item.price && <p className="text-sm font-bold text-neutral-800">R$ {item.price}</p>}
                  <button
                    onClick={() => navigateTo(item)}
                    className="bg-orange-500 text-white font-bold text-xs px-4 py-2 mt-2 rounded shadow transition hover:bg-orange-600"
                  >
                    Abrir Detalhes
                  </button>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* OVERLAY: CARROSSEL MESCLADO E BUSCA NO TOPO */}
      <div className="absolute top-0 left-0 w-full z-10 p-4 pointer-events-none flex flex-col gap-3">
        <div className="pointer-events-auto w-full max-w-5xl mx-auto flex flex-col gap-2">

          <div className="flex flex-col sm:flex-row sm:items-center justify-between mx-2 gap-3 mt-2">
            <div className="flex flex-col sm:flex-row gap-2 w-full">
              {/* Input de Busca */}
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Search size={16} className="text-neutral-400" />
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={activeFilter === 'lojas' ? 'Procurar lojas...' : 'Procurar produtos...'}
                  className="bg-neutral-900/80 backdrop-blur-xl border border-neutral-800 text-white text-sm rounded-full pl-11 pr-4 py-3 w-full focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors shadow-lg placeholder:text-neutral-500"
                />
              </div>

              {/* Sistema de Filtros */}
              <div className="flex bg-neutral-900/80 backdrop-blur-xl border border-neutral-800 rounded-full p-1.5 shadow-lg shrink-0">
                <button
                  onClick={() => setActiveFilter('lojas')}
                  className={`flex-1 sm:flex-none px-6 py-2 text-sm font-bold rounded-full transition-colors ${activeFilter === 'lojas' ? 'bg-orange-500 text-black shadow-md' : 'text-neutral-400 hover:text-white'}`}
                >
                  Lojas
                </button>
                <button
                  onClick={() => setActiveFilter('produtos')}
                  className={`flex-1 sm:flex-none px-6 py-2 text-sm font-bold rounded-full transition-colors ${activeFilter === 'produtos' ? 'bg-orange-500 text-black shadow-md' : 'text-neutral-400 hover:text-white'}`}
                >
                  Produtos
                </button>
              </div>
            </div>
          </div>

          <div className="flex overflow-x-auto gap-4 pb-4 px-2 mt-2 snap-x no-scrollbar scroll-smooth">
            {loading ? (
              <div className="min-w-[250px] h-32 bg-neutral-900/80 rounded-2xl animate-pulse backdrop-blur-lg"></div>
            ) : filteredItems.length === 0 ? (
              <div className="w-full p-4 bg-black/60 backdrop-blur-xl border border-neutral-800 rounded-2xl text-center text-sm text-neutral-400">
                Nenhum item localizado no mapa para este filtro.
              </div>
            ) : (
              filteredItems.map((item, idx) => (
                <div
                  key={`${item.type}-${item.id}-${idx}`}
                  onClick={() => handleItemClick(item)}
                  className="snap-start min-w-[280px] max-w-[280px] bg-neutral-950/80 backdrop-blur-3xl border border-neutral-800 rounded-3xl p-3 flex gap-4 items-center cursor-pointer hover:border-orange-500/50 transition-all shadow-xl hover:-translate-y-1 relative group"
                >
                  {/* Imagem */}
                  <div className={`w-20 h-20 ${item.type === 'loja' ? 'rounded-full' : 'rounded-xl'} bg-neutral-900 overflow-hidden flex-shrink-0 border-2 border-neutral-800 group-hover:border-orange-500 transition-colors`}>
                    {item.image_url ? (
                      <img src={getImageUrl(item)} onError={(e) => e.currentTarget.style.display = 'none'} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-neutral-800 flex items-center justify-center">
                        {item.type === 'loja' ? <StoreIcon size={24} className="text-neutral-500" /> : <Box size={24} className="text-neutral-500" />}
                      </div>
                    )}
                  </div>

                  {/* Textos */}
                  <div className="flex-1 overflow-hidden flex flex-col justify-center">
                    <span className="text-[9px] uppercase tracking-wider font-bold text-orange-500">{item.type}</span>
                    <h4 className="text-white font-bold text-base line-clamp-1">{item.name}</h4>

                    {item.type === 'produto' && item.price && (
                      <span className="text-white text-sm font-bold mt-0.5">R$ {item.price}</span>
                    )}

                    {item.type === 'loja' && (
                      <div className="flex items-center gap-1 mt-1">
                        <span className={`w-2 h-2 rounded-full ${item.is_open ? 'bg-green-500' : 'bg-red-500'}`}></span>
                        <span className="text-xs font-semibold text-neutral-400">{item.is_open ? 'Aberto' : 'Fechado'}</span>
                      </div>
                    )}

                    {item.distanceKm && (
                      <span className="flex items-center gap-1 text-[11px] text-orange-500 font-bold mt-2 bg-orange-500/10 w-max px-2 py-0.5 rounded">
                        <Navigation size={10} /> {item.distanceKm} km
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* CARD DETALHE FLUTUANTE AO CLICAR NO MARCADOR */}
      {selectedItem && (
        <div className="absolute bottom-24 md:bottom-10 left-1/2 -translate-x-1/2 w-full max-w-sm z-20 pointer-events-auto px-4">
          <div className="glass-glow-card bg-neutral-950/90 backdrop-blur-3xl border border-neutral-800 shadow-[0_20px_50px_rgba(0,0,0,0.8)] rounded-3xl p-6 flex flex-col relative overflow-hidden group hover:border-orange-500/30 transition-colors">

            <button
              onClick={() => setSelectedItem(null)}
              className="absolute top-4 right-4 text-neutral-500 hover:text-white bg-neutral-900 rounded-full w-8 h-8 flex items-center justify-center"
            >
              ✕
            </button>

            <span className="text-[10px] uppercase font-bold text-orange-500 mb-2 truncate block max-w-[80%]">{selectedItem.type}</span>

            <div className="flex items-center gap-4 mb-4">
              <div className={`w-16 h-16 ${selectedItem.type === 'loja' ? 'rounded-full' : 'rounded-xl'} overflow-hidden border-2 border-orange-500 bg-neutral-900 flex-shrink-0 shadow-lg shadow-orange-500/20`}>
                {selectedItem.image_url ? (
                  <img src={getImageUrl(selectedItem)} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    {selectedItem.type === 'loja' ? <StoreIcon className="text-neutral-500" /> : <Box className="text-neutral-500" />}
                  </div>
                )}
              </div>
              <div className="flex-1 pr-4">
                <h2 className="text-xl font-extrabold text-white leading-tight line-clamp-2">{selectedItem.name}</h2>
                {selectedItem.type === 'produto' && selectedItem.price && (
                  <p className="text-lg text-white font-bold mt-1">R$ {selectedItem.price}</p>
                )}
              </div>
            </div>

            {selectedItem.description && (
              <p className="text-sm text-neutral-400 line-clamp-2 mb-6">
                {selectedItem.description}
              </p>
            )}

            <button
              onClick={() => navigateTo(selectedItem)}
              className="w-full bg-orange-500 text-black py-3 rounded-xl font-bold text-sm shadow-lg hover:bg-orange-600 transition"
            >
              Abrir Detalhes
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
