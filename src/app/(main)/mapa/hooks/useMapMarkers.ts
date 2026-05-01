import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import { Mode } from './useMapData'

function parseCoords(location: any): [number, number] | null {
    if (!location) return null

    if (typeof location === 'string' && (location.startsWith('{') || location.startsWith('['))) {
        try {
            const parsed = JSON.parse(location)
            if (parsed && typeof parsed === 'object') location = parsed
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

export function useMapMarkers(
    map: mapboxgl.Map | null,
    mapReady: boolean,
    filtered: any[],
    mode: Mode,
    stores: any[],
    onItemClick: (item: any) => void,
    onClusterClick: (items: any[], location: { lng: number; lat: number; name: string }) => void
) {
    const markersRef = useRef<mapboxgl.Marker[]>([])
    const isFirstRun = useRef(true)

    useEffect(() => {
        // Só executa quando o mapa estiver pronto
        if (!mapReady || !map) {
            console.log('[useMapMarkers] Aguardando mapa ficar pronto...', { mapReady, hasMap: !!map })
            return
        }

        console.log('[useMapMarkers] Renderizando marcadores para modo:', mode, 'items:', filtered.length)

        // Limpa marcadores existentes
        markersRef.current.forEach(m => {
            try {
                m.remove()
            } catch (e) {
                console.warn('[useMapMarkers] Erro ao remover marcador:', e)
            }
        })
        markersRef.current = []

        if (filtered.length === 0) {
            console.log('[useMapMarkers] Nenhum item para marcar')
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
                console.warn('[useMapMarkers] Sem coordenadas para item:', item.name)
                return
            }

            const key = `${coords[0].toFixed(4)},${coords[1].toFixed(4)}`
            if (!coordGroups[key]) coordGroups[key] = []
            coordGroups[key].push({ item, coords })
        })

        console.log('[useMapMarkers] Grupos de coordenadas:', Object.keys(coordGroups).length)

        Object.values(coordGroups).forEach(group => {
            group.forEach((entry, index) => {
                const { item, coords } = entry
                const [lng, lat] = coords

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
                        onClusterClick(
                            group.map(g => g.item),
                            { lng, lat, name: `${group.length} estabelecimentos nesta localização` }
                        )
                        map.flyTo({ center: [lng, lat], zoom: 18, duration: 600 })
                    }
                    el.appendChild(badge)
                }

                el.onclick = () => {
                    onItemClick(item)
                    map.flyTo({ center: [lng, lat], zoom: 16, duration: 600 })
                }

                const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
                    .setLngLat([lng, lat])
                    .addTo(map)

                markersRef.current.push(marker)
            })
        })

        console.log('[useMapMarkers] Marcadores criados:', markersRef.current.length)
    }, [filtered, mode, stores, mapReady, map, onItemClick, onClusterClick])

    return { markersRef }
}