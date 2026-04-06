'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { getMockStores, MockStore } from '@/lib/mockData'

export default function Vitrine() {
  const router = useRouter()

  const [stores, setStores] = useState<MockStore[]>([])
  const [loading, setLoading] = useState(true)
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [hasMore, setHasMore] = useState(true)

  const PAGE_SIZE = 20
  const pageRef = useRef(0)
  const isFetchingRef = useRef(false)
  const allMockStoresRef = useRef<MockStore[]>([])

  // 🔥 INIT
  useEffect(() => {
    const init = async () => {
      setStores([])
      setLoading(true)
      setHasMore(true)
      pageRef.current = 0
      isFetchingRef.current = false

      // Inicializa os dados mock apenas uma vez
      allMockStoresRef.current = getMockStores()

      // localização
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          pos => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          () => { }
        )
      }

      // Simulando delay de rede
      setTimeout(() => {
        const initialData = allMockStoresRef.current.slice(0, PAGE_SIZE)
        setStores(initialData)
        if (initialData.length < PAGE_SIZE || initialData.length === allMockStoresRef.current.length) {
            setHasMore(false)
        }
        setLoading(false)
      }, 500)
    }

    init()
  }, [])

  // 🔥 SCROLL INFINITO
  useEffect(() => {
    const handleScroll = () => {
      if (loading) return

      const { scrollTop, scrollHeight, clientHeight } = document.documentElement

      if (
        scrollHeight > clientHeight &&
        scrollTop + clientHeight + 100 >= scrollHeight &&
        !isFetchingRef.current &&
        hasMore
      ) {
        isFetchingRef.current = true

        const nextPage = pageRef.current + 1
        const start = nextPage * PAGE_SIZE
        const end = start + PAGE_SIZE

        // Simulando rede
        setTimeout(() => {
            const nextData = allMockStoresRef.current.slice(start, end)
            
            setStores(prev => [...prev, ...nextData])

            if (nextData.length < PAGE_SIZE || [...stores, ...nextData].length >= allMockStoresRef.current.length) {
                setHasMore(false)
            }
            
            pageRef.current = nextPage
            isFetchingRef.current = false
        }, 500)
      }
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [loading, hasMore, stores.length])

  // Mocked image / logo handle
  const getLogoUrl = (logoPath: string | null) => ''

  const calcDistanceKm = (storeLocation: string | null) => {
    if (!userLocation || !storeLocation) return null

    const match = storeLocation.match(/POINT\((-?\d+\.?\d*) (-?\d+\.?\d*)\)/)
    if (!match) return null

    const lon = parseFloat(match[1])
    const lat = parseFloat(match[2])

    const toRad = (v: number) => (v * Math.PI) / 180
    const R = 6371

    const dLat = toRad(lat - userLocation.lat)
    const dLon = toRad(lon - userLocation.lng)

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(userLocation.lat)) *
      Math.cos(toRad(lat)) *
      Math.sin(dLon / 2) ** 2

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return (R * c).toFixed(1)
  }

  const renderStoreCard = (store: MockStore, idx: number) => {
    const stats = store.store_stats

    return (
      <div
        key={store.id + idx}
        onClick={() => router.push(`/${store.storeSlug}`)}
        className="glass-glow-card shadow-lg group hover:shadow-[0_10px_30px_rgba(249,115,22,0.15)] hover:border-orange-500/50 hover:-translate-y-1 transition-all duration-300 cursor-pointer"
      >
        <div className="relative h-56 w-full bg-neutral-950 flex flex-col items-center justify-center border-b border-neutral-800">
          <span className="text-neutral-600 font-medium">Sem Logo (Mock)</span>

          {/* status */}
          <div className={`absolute top-4 left-4 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider backdrop-blur-md border ${store.is_open ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-red-500/20 text-red-500 border-red-500/30'
            }`}>
            {store.is_open ? 'Aberto' : 'Fechado'}
          </div>

          {/* distância */}
          {userLocation && store.location && (
            <div className="absolute top-4 right-4 px-3 py-1.5 rounded-lg text-xs font-bold bg-neutral-900/80 backdrop-blur-md text-white border border-neutral-700">
              {calcDistanceKm(store.location)} km
            </div>
          )}
        </div>

        <div className="p-5 flex flex-col gap-2 text-white">
          <h3 className="font-bold text-xl tracking-tight line-clamp-1">{store.name}</h3>

          {store.description && (
            <p className="text-sm text-neutral-400 line-clamp-2 mt-1 leading-relaxed">
              {store.description}
            </p>
          )}

          {/* rating */}
          <div className="flex items-center gap-1 text-orange-500 text-sm mt-3 pt-3 border-t border-neutral-800">
            {Array.from({ length: 5 }).map((_, i) => (
              <span key={i}>
                {i < Math.round(stats.ratings_avg) ? '★' : '☆'}
              </span>
            ))}
            <span className="text-neutral-500 text-xs ml-1 font-medium">
              ({stats.ratings_count})
            </span>
          </div>

          {/* infos */}
          <div className="flex items-center gap-3 mt-1">
            {(stats.prep_time_min !== null && stats.prep_time_max !== null) && (
              <p className="text-xs font-medium text-neutral-500 bg-neutral-950 px-2 py-1 rounded-md border border-neutral-800">
                {stats.prep_time_min}-{stats.prep_time_max} min
              </p>
            )}

            {(stats.price_min !== null && stats.price_max !== null) && (
              <p className="text-xs font-medium text-neutral-500 bg-neutral-950 px-2 py-1 rounded-md border border-neutral-800">
                R${stats.price_min}-{stats.price_max}
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        Carregando...
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 text-white bg-black min-h-screen">

      {/* 🔥 HEADER */}
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight">Vitrine (Modo Mock)</h1>

        <button
          onClick={() => router.push('/criar-loja')}
          className="px-5 py-2.5 bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-black font-bold rounded-xl transition-all shadow-[0_0_15px_rgba(249,115,22,0.2)] hover:shadow-[0_0_20px_rgba(249,115,22,0.3)] transform hover:-translate-y-0.5 active:scale-95"
        >
          + Criar Loja
        </button>
      </div>

      {/* LOJAS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {stores.map((store, idx) => renderStoreCard(store, idx))}
      </div>

      {!hasMore && stores.length > 0 && (
        <p className="text-center text-neutral-600 font-medium mt-12 pb-8">
          Você chegou ao fim.
        </p>
      )}
    </div>
  )
}
