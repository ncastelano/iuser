// src/lib/placeSearch.ts
//
// Busca de LUGARES e endereços enquanto a pessoa escreve (antes morava no LocationPicker; agora também na página de chamar um motorista).

// ===== SUGESTÕES ENQUANTO ESCREVE (um campo só) =====
// O campo de endereço é UM só, livre ("Av. Calama 1234, Porto Velho", "Hospital 9 de Julho", "Porto Velho Shopping"); enquanto a pessoa escreve aparecem lugares e endereços sugeridos.
// Fonte principal: Mapbox SEARCH BOX (mesmo token do resto do app; conhece estabelecimentos — hospitais, mercados, lojas, shoppings — o que o Geocoding comum não faz em Porto Velho).
// A busca vira uma "sessão" (o token de sessão liga as sugestões à escolha final; é assim que o Mapbox cobra). Se o Search Box falhar, cai no Geocoding de sempre.
export type PlaceKind = 'poi' | 'address' | 'area'
export interface PlaceSuggestion {
    id: string
    /** nome do lugar (o estabelecimento, a rua, o bairro) */
    title: string
    /** o resto do endereço (bairro, cidade, estado) */
    sub: string
    label: string
    kind: PlaceKind
    /** o Search Box só dá a posição ao escolher (retrieve); o Geocoding de reserva já traz */
    lat?: number
    lng?: number
}

const kindOf = (t: string): PlaceKind => (t === 'poi' ? 'poi' : t === 'address' || t === 'street' ? 'address' : 'area')
const cleanBR = (v: string) => v.replace(/,\s*Brasil$/i, '')

async function fetchGeocodingSuggestions(q: string, token: string, near?: { lat: number; lng: number } | null): Promise<PlaceSuggestion[]> {
    try {
        const prox = near ? `&proximity=${near.lng},${near.lat}` : ''
        const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${token}&language=pt&limit=6&country=br&autocomplete=true&types=address,poi,neighborhood,locality,place${prox}`)
        if (!res.ok) return []
        const data = await res.json()
        return (data.features || []).map((f: any, i: number): PlaceSuggestion => {
            const title = String(f.text || '')
            const full = String(f.place_name || title)
            const sub = full.startsWith(title) ? full.slice(title.length).replace(/^,\s*/, '') : full
            const type = String((f.place_type || [])[0] || '')
            return { id: `g-${f.id}-${i}`, title, sub: cleanBR(sub), label: full, kind: type === 'poi' ? 'poi' : type === 'address' ? 'address' : 'area', lng: f.center?.[0], lat: f.center?.[1] }
        }).filter((x: PlaceSuggestion) => Number.isFinite(x.lat) && Number.isFinite(x.lng) && x.title)
    } catch {
        return []
    }
}

/** Sugestões para o que foi escrito. `near` puxa os resultados para perto de onde a pessoa está. Falha = lista vazia, nunca erro na tela. */
export async function fetchPlaceSuggestions(text: string, near: { lat: number; lng: number } | null | undefined, session: string): Promise<PlaceSuggestion[]> {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    const q = text.trim()
    if (!token || q.length < 3) return []
    try {
        const prox = near ? `&proximity=${near.lng},${near.lat}` : ''
        const res = await fetch(`https://api.mapbox.com/search/searchbox/v1/suggest?q=${encodeURIComponent(q)}&access_token=${token}&session_token=${session}&language=pt&country=br&limit=8&types=poi,address,street,neighborhood,locality,place${prox}`)
        if (!res.ok) return fetchGeocodingSuggestions(q, token, near)
        const data = await res.json()
        const list: PlaceSuggestion[] = (data.suggestions || []).map((s: any): PlaceSuggestion => {
            const kind = kindOf(String(s.feature_type || ''))
            const where = cleanBR(String(s.place_formatted || ''))
            // estabelecimento: "rua, número, bairro, cidade"; o resto: só bairro, cidade e estado
            const sub = kind === 'poi' ? cleanBR(String(s.full_address || [s.address, s.place_formatted].filter(Boolean).join(', '))) : where
            return { id: String(s.mapbox_id), title: String(s.name || ''), sub, label: cleanBR(String(s.full_address || `${s.name}, ${where}`)), kind }
        }).filter((x: PlaceSuggestion) => x.id && x.title)
        return list.length > 0 ? list : fetchGeocodingSuggestions(q, token, near)
    } catch {
        return fetchGeocodingSuggestions(q, token, near)
    }
}

/** Ao escolher uma sugestão do Search Box: a posição e o nome final (fecha a sessão de busca) */
export async function retrievePlace(sg: PlaceSuggestion, session: string): Promise<{ lat: number; lng: number; label: string } | null> {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!token) return null
    try {
        const res = await fetch(`https://api.mapbox.com/search/searchbox/v1/retrieve/${encodeURIComponent(sg.id)}?access_token=${token}&session_token=${session}&language=pt`)
        if (!res.ok) return null
        const f = (await res.json()).features?.[0]
        const [lng, lat] = f?.geometry?.coordinates || []
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
        const p = f.properties || {}
        const full = cleanBR(String(p.full_address || [p.address, p.place_formatted].filter(Boolean).join(', ') || sg.label))
        // estabelecimento mostra o nome na frente do endereço ("Hospital de Base Dr. Ary Pinheiro, Rua ..., Porto Velho")
        const label = sg.kind === 'poi' && p.name && !full.startsWith(String(p.name)) ? `${p.name}, ${full}` : full
        return { lat, lng, label }
    } catch {
        return null
    }
}

/** Um token de sessão novo para a busca (liga as sugestões à escolha, é assim que o Mapbox cobra) */
export const newSearchSession = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `s-${Date.now()}-${Math.random().toString(36).slice(2)}`)
