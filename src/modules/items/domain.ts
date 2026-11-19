// src/modules/items/domain.ts — "Itens" (a aba da barra de pessoa, 19/11/2026): TUDO o que a pessoa já tem, separado por tipo.
// Produtos que comprou (pedidos pagos), Digitais (cursos, músicas, livros, programas liberados), Serviços (agendamentos confirmados e feitos)
// e o Histórico dos pedidos. Regras puras (sem React, sem banco); testadas em scripts/test-items.mjs.

export type ItemsView = 'tudo' | 'produtos' | 'digitais' | 'servicos' | 'historico'

export const ITEMS_VIEWS: { key: ItemsView; label: string }[] = [
    { key: 'tudo', label: 'Tudo' },
    { key: 'historico', label: 'Histórico' },
    { key: 'produtos', label: 'Produtos' },
    { key: 'servicos', label: 'Serviços' },
    { key: 'digitais', label: 'Digitais' },
]

export const isItemsView = (v: string | null | undefined): v is ItemsView => ITEMS_VIEWS.some((x) => x.key === v)

/** Uma linha comprada (item de um pedido pago) */
export interface BoughtLine {
    productId: string | null; name: string; quantity: number; unitPrice: number
    orderId: string; at: string; storeName: string | null; storeSlug: string | null
}

/** Um produto que a pessoa tem: as compras do mesmo produto viram UMA linha */
export interface OwnedProduct {
    key: string; productId: string | null; name: string; quantity: number; times: number; lastAt: string; lastPrice: number
    storeName: string | null; storeSlug: string | null
}

/** Junta as compras do mesmo produto (pelo id; sem id, pelo nome + loja), do mais recente ao mais antigo. */
export function groupOwned(lines: BoughtLine[]): OwnedProduct[] {
    const map = new Map<string, OwnedProduct & { orders: Set<string> }>()
    for (const l of lines) {
        const key = l.productId || `${l.storeSlug || ''}::${l.name.trim().toLowerCase()}`
        const cur = map.get(key)
        if (!cur) {
            map.set(key, { key, productId: l.productId, name: l.name, quantity: l.quantity, times: 1, lastAt: l.at, lastPrice: l.unitPrice, storeName: l.storeName, storeSlug: l.storeSlug, orders: new Set([l.orderId]) })
            continue
        }
        cur.quantity += l.quantity
        if (!cur.orders.has(l.orderId)) { cur.orders.add(l.orderId); cur.times += 1 }
        if (l.at > cur.lastAt) { cur.lastAt = l.at; cur.lastPrice = l.unitPrice; cur.name = l.name }
    }
    return [...map.values()].map(({ orders: _o, ...p }) => p).sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1))
}

/** O `?ver=` que vem dos endereços antigos: ?aba=pedidos/avaliacoes → Histórico; ?aba=biblioteca/digital → Digitais. */
export function viewFromLegacy(abaParam: string | null | undefined, verParam: string | null | undefined): ItemsView {
    if (isItemsView(verParam)) return verParam
    if (abaParam === 'pedidos' || abaParam === 'avaliacoes') return 'historico'
    if (abaParam === 'biblioteca' || abaParam === 'digital') return 'digitais'
    return 'tudo'
}
