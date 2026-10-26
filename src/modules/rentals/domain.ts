// src/modules/rentals/domain.ts
//
// Regras puras do aluguel de imóveis: tipos, rótulos, quanto custa de verdade (aluguel + condomínio + IPTU, e o que se paga para entrar),
// filtros da busca e a validação do anúncio. Sem React e sem rede — testável com `npm run test:rentals`. A regra que MANDA (cobrança,
// privacidade do endereço, selo de confiança) mora no banco (migration 20261126); aqui é só apresentação e conferência de entrada.

export type PropertyType = 'casa' | 'apartamento' | 'kitnet' | 'quarto' | 'sala_comercial' | 'loja' | 'galpao' | 'chacara' | 'terreno' | 'outro'
export type RentalKind = 'mensal' | 'temporada'
export type RentalStatus = 'active' | 'paused' | 'rented'

export const PROPERTY_TYPES: { id: PropertyType; label: string }[] = [
    { id: 'apartamento', label: 'Apartamento' },
    { id: 'casa', label: 'Casa' },
    { id: 'kitnet', label: 'Kitnet / Studio' },
    { id: 'quarto', label: 'Quarto' },
    { id: 'sala_comercial', label: 'Sala comercial' },
    { id: 'loja', label: 'Loja / Ponto comercial' },
    { id: 'galpao', label: 'Galpão' },
    { id: 'chacara', label: 'Chácara / Sítio' },
    { id: 'terreno', label: 'Terreno' },
    { id: 'outro', label: 'Outro' },
]
export const RENTAL_KINDS: { id: RentalKind; label: string; unit: string }[] = [
    { id: 'mensal', label: 'Aluguel mensal', unit: 'mês' },
    { id: 'temporada', label: 'Temporada (diárias)', unit: 'dia' },
]
export const AMENITIES = [
    'Wi-Fi', 'Ar-condicionado', 'Piscina', 'Churrasqueira', 'Academia', 'Portaria 24h', 'Elevador', 'Varanda',
    'Área de serviço', 'Garagem coberta', 'Cozinha equipada', 'Mobília planejada', 'Câmeras de segurança', 'Quintal',
]

export interface RentalListing {
    id: string
    slug: string
    ownerId: string
    storeId: string | null
    title: string
    description: string | null
    propertyType: PropertyType
    rentalKind: RentalKind
    price: number
    condoFee: number
    iptuFee: number
    depositAmount: number
    bedrooms: number | null
    bathrooms: number | null
    parking: number | null
    areaM2: number | null
    furnished: boolean
    petsAllowed: boolean
    amenities: string[]
    rules: string | null
    photos: string[]
    neighborhood: string
    city: string
    state: string | null
    approxLat: number | null
    approxLng: number | null
    availableFrom: string | null
    minStayDays: number | null
    maxGuests: number | null
    status: RentalStatus
    viewCount: number
    createdAt: string
}

export const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: n % 1 ? 2 : 0 })

export const propertyLabel = (t: PropertyType) => PROPERTY_TYPES.find((p) => p.id === t)?.label || 'Imóvel'

/** "R$ 1.800/mês" ou "R$ 120/dia". */
export function priceLabel(l: Pick<RentalListing, 'price' | 'rentalKind'>): string {
    return `${brl(l.price)}/${l.rentalKind === 'temporada' ? 'dia' : 'mês'}`
}

/** O que a pessoa paga todo mês de verdade: aluguel + condomínio + IPTU (só no aluguel mensal). */
export function monthlyTotal(l: Pick<RentalListing, 'price' | 'condoFee' | 'iptuFee' | 'rentalKind'>): number | null {
    return l.rentalKind === 'mensal' ? l.price + l.condoFee + l.iptuFee : null
}

/** O que se paga para ENTRAR: o primeiro mês completo + a caução. */
export function moveInCost(l: Pick<RentalListing, 'price' | 'condoFee' | 'iptuFee' | 'depositAmount' | 'rentalKind'>): number | null {
    const m = monthlyTotal(l)
    return m == null ? null : m + l.depositAmount
}

/** Temporada: o total de N diárias (a caução, se houver, vai à parte). */
export function stayTotal(l: Pick<RentalListing, 'price' | 'rentalKind' | 'minStayDays'>, nights?: number): number | null {
    if (l.rentalKind !== 'temporada') return null
    const n = Math.max(nights ?? l.minStayDays ?? 1, l.minStayDays ?? 1)
    return l.price * n
}

/** "2 quartos · 1 banheiro · 1 vaga · 65 m²" (só o que foi informado). */
export function specsLine(l: Pick<RentalListing, 'bedrooms' | 'bathrooms' | 'parking' | 'areaM2'>): string {
    const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
    return [
        l.bedrooms != null ? plural(l.bedrooms, 'quarto', 'quartos') : null,
        l.bathrooms != null ? plural(l.bathrooms, 'banheiro', 'banheiros') : null,
        l.parking != null && l.parking > 0 ? plural(l.parking, 'vaga', 'vagas') : null,
        l.areaM2 != null ? `${String(l.areaM2).replace('.', ',')} m²` : null,
    ].filter(Boolean).join(' · ')
}

/** Posição aproximada (~1 km): nunca a porta do imóvel. */
export const approxCoord = (n: number) => Math.round(n * 100) / 100

// ----- busca -----
export interface RentalFilters {
    kind: RentalKind | 'todos'
    types: PropertyType[]
    minPrice: number | null
    maxPrice: number | null
    minBedrooms: number | null
    minBathrooms: number | null
    minParking: number | null
    minArea: number | null
    pets: boolean
    furnished: boolean
    /** só os que têm TODAS essas comodidades */
    amenities: string[]
    /** só anúncios de imobiliária (em nome de uma loja) */
    agencyOnly: boolean
    /** bairro ou cidade */
    where: string
    sort: 'recentes' | 'menor_preco' | 'maior_preco'
}
export const EMPTY_FILTERS: RentalFilters = {
    kind: 'todos', types: [], minPrice: null, maxPrice: null, minBedrooms: null, minBathrooms: null, minParking: null, minArea: null,
    pets: false, furnished: false, amenities: [], agencyOnly: false, where: '', sort: 'recentes',
}

/** Quantos filtros estão ligados (a ordem e o texto de busca não contam): o número do botão "Filtros". */
export function activeFilterCount(f: RentalFilters): number {
    return [f.kind !== 'todos', f.types.length > 0, f.minPrice != null, f.maxPrice != null, f.minBedrooms != null, f.minBathrooms != null, f.minParking != null,
        f.minArea != null, f.pets, f.furnished, f.amenities.length > 0, f.agencyOnly].filter(Boolean).length
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export function filterListings<T extends Pick<RentalListing, 'rentalKind' | 'propertyType' | 'price' | 'bedrooms' | 'bathrooms' | 'parking' | 'areaM2' | 'petsAllowed' | 'furnished' | 'amenities' | 'storeId' | 'neighborhood' | 'city' | 'title' | 'createdAt'>>(items: T[], f: RentalFilters): T[] {
    const q = norm(f.where)
    const out = items.filter((l) => {
        if (f.kind !== 'todos' && l.rentalKind !== f.kind) return false
        if (f.types.length > 0 && !f.types.includes(l.propertyType)) return false
        if (f.minPrice != null && l.price < f.minPrice) return false
        if (f.maxPrice != null && l.price > f.maxPrice) return false
        if (f.minBedrooms != null && (l.bedrooms ?? 0) < f.minBedrooms) return false
        if (f.minBathrooms != null && (l.bathrooms ?? 0) < f.minBathrooms) return false
        if (f.minParking != null && (l.parking ?? 0) < f.minParking) return false
        if (f.minArea != null && (l.areaM2 ?? 0) < f.minArea) return false
        if (f.agencyOnly && !l.storeId) return false
        if (f.amenities.length > 0 && !f.amenities.every((a) => l.amenities.includes(a))) return false
        if (f.pets && !l.petsAllowed) return false
        if (f.furnished && !l.furnished) return false
        if (q && !norm(`${l.neighborhood} ${l.city} ${l.title}`).includes(q)) return false
        return true
    })
    if (f.sort === 'menor_preco') out.sort((a, b) => a.price - b.price)
    else if (f.sort === 'maior_preco') out.sort((a, b) => b.price - a.price)
    else out.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    return out
}

// ----- anúncio -----
export interface ListingInput {
    title: string
    propertyType: PropertyType | ''
    rentalKind: RentalKind
    price: number | null
    condoFee: number | null
    iptuFee: number | null
    depositAmount: number | null
    neighborhood: string
    city: string
    address: string
    bedrooms: number | null
    minStayDays: number | null
    maxGuests: number | null
    photos: number
}

/** Erros do formulário de anúncio (campo → mensagem). Vazio = pode enviar. */
export function validateListing(i: ListingInput): Record<string, string> {
    const e: Record<string, string> = {}
    if (i.title.trim().length < 3) e.title = 'Dê um título ao anúncio (ao menos 3 letras).'
    if (i.title.trim().length > 120) e.title = 'O título pode ter até 120 letras.'
    if (!i.propertyType) e.propertyType = 'Escolha o tipo de imóvel.'
    if (i.price == null || !(i.price >= 0)) e.price = 'Informe o valor do aluguel.'
    for (const [k, v] of [['condoFee', i.condoFee], ['iptuFee', i.iptuFee], ['depositAmount', i.depositAmount]] as const) {
        if (v != null && v < 0) e[k] = 'O valor não pode ser negativo.'
    }
    if (i.neighborhood.trim().length < 2) e.neighborhood = 'Informe o bairro.'
    if (i.city.trim().length < 2) e.city = 'Informe a cidade.'
    if (i.address.trim().length < 3) e.address = 'Informe o endereço (só quem tiver visita marcada vai vê-lo).'
    if (i.rentalKind === 'temporada') {
        if (i.minStayDays != null && i.minStayDays < 1) e.minStayDays = 'O mínimo é de 1 diária.'
        if (i.maxGuests != null && i.maxGuests < 1) e.maxGuests = 'Informe ao menos 1 hóspede.'
    }
    if (i.photos < 1) e.photos = 'Coloque ao menos 1 foto: anúncio com foto recebe muito mais visitas.'
    if (i.photos > 12) e.photos = 'No máximo 12 fotos.'
    return e
}

/** Selo de confiança do anunciante (vem calculado do banco: get_rental_host_trust). */
export interface HostTrust { rented_count: number; active_count: number; reviews_count: number; avg_rating: number; agency: boolean; since: string | null; badge: 'agency' | 'trusted' | null }
export function trustBadge(t: Pick<HostTrust, 'badge'> | null | undefined): { label: string; hint: string } | null {
    if (t?.badge === 'agency') return { label: 'Imobiliária', hint: 'Anuncia em nome de uma loja cadastrada no iUser.' }
    if (t?.badge === 'trusted') return { label: 'Anunciante confiável', hint: '2 ou mais imóveis alugados e 3 ou mais avaliações de visitantes, com média de 4,5 ou mais.' }
    return null
}

/** Texto curto de compartilhar. */
export const shareText = (l: Pick<RentalListing, 'title' | 'neighborhood' | 'city' | 'price' | 'rentalKind'>) =>
    `${l.title} — ${l.neighborhood}, ${l.city} · ${priceLabel(l)}`

/** Endereço do anúncio: "apartamento-2-quartos-centro-k3f9a" (o sufixo evita repetir e não revela nada do imóvel). */
export function listingSlug(title: string, neighborhood: string, rand: () => number = Math.random): string {
    const base = `${title} ${neighborhood}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48).replace(/-+$/, '')
    const suffix = Array.from({ length: 5 }, () => 'abcdefghjkmnpqrstuvwxyz23456789'[Math.floor(rand() * 31)]).join('')
    return `${base || 'imovel'}-${suffix}`
}
