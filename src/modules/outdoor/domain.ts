// src/modules/outdoor/domain.ts — regras puras do OUTDOOR (vitrine por pontuação, igual em todas as telas).
// Sem React nem rede; testado em scripts/test-outdoor.mjs (npm run test:outdoor).
// Cada tipo tem a sua regra de pontos NO BANCO (get_outdoor / outdoor_rules); aqui só ficam nomes, cores, destinos e formatação.

export type OutdoorKind = 'lojas' | 'pessoas' | 'servicos' | 'produtos' | 'digitais' | 'imoveis' | 'motoristas'
export const OUTDOOR_KINDS: OutdoorKind[] = ['lojas', 'pessoas', 'servicos', 'produtos', 'digitais', 'imoveis', 'motoristas']

export interface OutdoorItem {
    id: string
    slug: string
    /** serviço e produto: o @ ou slug de quem vende (loja ou pessoa), para montar o endereço */
    ownerSlug: string | null
    name: string
    /** caminho ou link da imagem (logo da loja, foto da pessoa, foto do imóvel...) */
    image: string | null
    points: number
    /** colocação (1 = primeiro) */
    rank: number
    /** nível da loja (só no Outdoor de lojas; 0 = sem moldura) */
    level: number
}

export interface OutdoorKindInfo {
    /** "Outdoor Lojas" */
    title: string
    /** o que está por baixo, em uma frase */
    subtitle: string
    /** cor de destaque do tipo */
    color: string
    /** bucket onde mora a imagem quando ela é só um caminho */
    bucket: string
    /** página com a lista completa, quando existe */
    seeAll: string | null
    /** letra do círculo quando não há imagem */
    shape: 'circle' | 'square'
}

export const OUTDOOR_INFO: Record<OutdoorKind, OutdoorKindInfo> = {
    lojas:    { title: 'Outdoor Lojas',    subtitle: 'As lojas com mais pontos do iUser',   color: '#f97316', bucket: 'store-logos',    seeAll: '/lojas',     shape: 'circle' },
    pessoas:  { title: 'Outdoor iUser',    subtitle: 'Os perfis com mais pontos do iUser',  color: '#8b5cf6', bucket: 'avatars',        seeAll: '/social',    shape: 'circle' },
    servicos: { title: 'Outdoor Serviços', subtitle: 'Os serviços mais bem pontuados',      color: '#0d9488', bucket: 'product-images', seeAll: '/servicos-disponiveis', shape: 'square' },
    produtos: { title: 'Outdoor Produtos', subtitle: 'Os produtos mais bem pontuados',      color: '#ef4444', bucket: 'product-images', seeAll: '/produtos',  shape: 'square' },
    digitais: { title: 'Outdoor Digitais', subtitle: 'Os cursos, músicas e programas mais bem pontuados', color: '#7c3aed', bucket: 'product-images', seeAll: '/digitais', shape: 'square' },
    imoveis:  { title: 'Outdoor Imóveis',  subtitle: 'Os imóveis mais bem pontuados',       color: '#2563eb', bucket: 'product-images', seeAll: null,         shape: 'square' },
    motoristas: { title: 'Outdoor Motoristas', subtitle: 'Os motoristas mais bem pontuados', color: '#16a34a', bucket: 'avatars',        seeAll: null,         shape: 'circle' },
}

/** A linha de get_outdoor → item. Linha sem id, sem nome ou sem slug é descartada. */
export function outdoorFromRow(r: Record<string, any> | null | undefined): OutdoorItem | null {
    if (!r || !r.id || !r.slug || !r.name) return null
    return {
        id: String(r.id), slug: String(r.slug), ownerSlug: r.owner_slug ? String(r.owner_slug) : null, name: String(r.name),
        image: r.image ? String(r.image) : null, points: Math.max(0, Math.round(Number(r.points) || 0)), rank: Math.max(1, Math.round(Number(r.rank) || 0)),
        level: Math.max(0, Math.round(Number(r.level) || 0)),
    }
}

/** Para onde leva tocar no item. Serviço/produto sem dono conhecido não leva a lugar nenhum. */
export function outdoorHref(kind: OutdoorKind, item: OutdoorItem): string | null {
    switch (kind) {
        case 'lojas':
        case 'pessoas':
        case 'motoristas': return `/${item.slug}`   // motorista: o @ do veículo (a página pública do motorista)
        case 'imoveis': return `/imoveis/${item.slug}`
        case 'servicos':
        case 'produtos':
        case 'digitais': return item.ownerSlug ? `/${item.ownerSlug}/${item.slug}` : null
    }
}

/** 1º ouro, 2º prata, 3º bronze; o resto sem medalha */
export type Medal = 'gold' | 'silver' | 'bronze'
export function medalOf(rank: number): Medal | null {
    return rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : null
}

/** "6.384 pts" (milhar com ponto; a partir de 100 mil vira "100 mil") */
export function pointsLabel(points: number): string {
    const n = Math.max(0, Math.round(points || 0))
    if (n >= 100000) return `${Math.round(n / 1000)} mil pts`
    return `${n.toLocaleString('pt-BR')} pts`
}

/** Mapa id → pontos, para telas que já têm a própria lista e só precisam ordenar por pontuação */
export function pointsById(items: OutdoorItem[]): Record<string, number> {
    const out: Record<string, number> = {}
    for (const i of items) out[i.id] = i.points
    return out
}
