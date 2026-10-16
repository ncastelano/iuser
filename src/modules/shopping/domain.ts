// src/modules/shopping/domain.ts
//
// Regras puras da página de compras ("Comprar"): o que dá pra pôr no carrinho com um toque, como a busca casa um
// produto/loja e como o "em alta" é ordenado. Sem React e sem rede — testável com `npm run test:shopping`.

export interface ShopProduct {
    id: string
    name: string
    slug: string
    imageUrl: string | null
    price: number | null
    category: string | null
    createdAt: string
    viewCount: number
    hasAddons: boolean
    /** null = sem controle de estoque */
    stock: number | null
    storeId: string
    storeSlug: string
    storeName: string
    storeLogo: string | null
    storeOpen: boolean
    storeCategorySlug: string | null
    storeRating: number | null
    delivery: string | null
    time: string | null
    /** quantas vezes a loja vendeu (peso do "em alta") */
    storeOrders: number
}

/**
 * Dá pra adicionar ao carrinho com um toque: tem preço, não pede adicionais (a pessoa precisa escolher na página do
 * produto), tem estoque e a loja está aberta. Os demais abrem a página do produto.
 */
export function isQuickAddable(p: Pick<ShopProduct, 'price' | 'hasAddons' | 'stock' | 'storeOpen'>): boolean {
    return p.price != null && p.price > 0 && !p.hasAddons && (p.stock == null || p.stock > 0) && p.storeOpen
}

export const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** Busca por produto, loja ou categoria do produto, sem acento e sem maiúscula; todas as palavras precisam aparecer. */
export function matchesQuery(haystack: (string | null | undefined)[], query: string): boolean {
    const words = normalize(query).split(/\s+/).filter(Boolean)
    if (words.length === 0) return true
    const text = normalize(haystack.filter(Boolean).join(' '))
    return words.every((w) => text.includes(w))
}

/** "Em alta": visualizações do produto + vendas da loja (pesa mais). Loja aberta vem sempre antes de fechada. */
export function trendingScore(p: Pick<ShopProduct, 'viewCount' | 'storeOrders'>): number {
    return p.viewCount + p.storeOrders * 5
}

export function sortTrending<T extends Pick<ShopProduct, 'viewCount' | 'storeOrders' | 'storeOpen'>>(items: T[]): T[] {
    return [...items].sort((a, b) => Number(b.storeOpen) - Number(a.storeOpen) || trendingScore(b) - trendingScore(a))
}

/** Evita uma fileira dominada por uma loja só: no máximo `perStore` de cada, mantendo a ordem. */
export function limitPerStore<T extends { storeId: string }>(items: T[], perStore: number): T[] {
    const seen = new Map<string, number>()
    return items.filter((it) => {
        const n = seen.get(it.storeId) || 0
        if (n >= perStore) return false
        seen.set(it.storeId, n + 1)
        return true
    })
}

/** Da lista de itens já comprados (mais recente primeiro) pros ids de produto, sem repetir. */
export function distinctRecent(productIds: (string | null | undefined)[], max = 12): string[] {
    const out: string[] = []
    for (const id of productIds) {
        if (id && !out.includes(id)) out.push(id)
        if (out.length >= max) break
    }
    return out
}
