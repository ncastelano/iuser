// src/lib/mapCredits.ts — os CRÉDITOS dos mapas, do jeito que as regras pedem e sem atrapalhar a tela (decisão do dono, 17/11/2026).
//
// Mapbox: o logo do Mapbox fica visível no canto (o lugar padrão; os termos pedem o logo mesmo em plano pago, salvo acordo à parte)
// e o texto "© Mapbox © OpenStreetMap" fica no formato COMPACTO — um "i" pequeno que abre o texto ao tocar. Nunca esconda o logo
// nem tire os créditos (`attributionControl: false` sem `addMapboxCredits` fere os termos).
// Leaflet (os mapas de escolher local, com o mapa aberto do OpenStreetMap): o OSM exige o crédito "© OpenStreetMap" visível.
// Trocar de fornecedor (ex.: MapLibre GL JS com outro provedor de mapas) é decisão à parte e também exige os créditos de quem fornecer.
import type mapboxgl from 'mapbox-gl'

type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

/** Créditos do Mapbox no formato compacto ("i"), no canto pedido (padrão: embaixo à direita). */
export function addMapboxCredits(mb: typeof mapboxgl, map: mapboxgl.Map, corner: Corner = 'bottom-right'): void {
    map.addControl(new mb.AttributionControl({ compact: true }), corner)
}

export const OSM_ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>'

/** Crédito do OpenStreetMap nos mapas Leaflet (sem o prefixo "Leaflet", que não é obrigatório). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function addLeafletCredits(L: any, map: any): void {
    L.control.attribution({ prefix: false, position: 'bottomright' }).addAttribution(OSM_ATTRIBUTION).addTo(map)
}
