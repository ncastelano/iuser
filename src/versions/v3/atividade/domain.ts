// src/versions/v3/atividade/domain.ts
//
// ATIVIDADE (a aba da barra da 3.0): "o que está acontecendo comigo?" — conversas, pedidos, carrinho, biblioteca e avisos num lugar só.
// Regra pura (sem React): cada subaba tem o SEU endereço (os links antigos /carrinho e /conversas continuam valendo), e a barra decide
// para qual delas levar. Testes: scripts/test-atividade.mjs.

export type AtividadeAba = 'conversas' | 'pedidos' | 'carrinho' | 'biblioteca' | 'avisos'

export const ATIVIDADE_ABAS: { key: AtividadeAba; label: string; path: string }[] = [
    { key: 'conversas', label: 'Conversas', path: '/conversas' },
    { key: 'pedidos', label: 'Pedidos', path: '/carrinho?aba=pedidos' },
    { key: 'carrinho', label: 'Carrinho', path: '/carrinho' },
    { key: 'biblioteca', label: 'Biblioteca', path: '/carrinho?aba=digital' },
    { key: 'avisos', label: 'Avisos', path: '/atividade' },
]

export const pathOfAba = (aba: AtividadeAba): string => ATIVIDADE_ABAS.find((a) => a.key === aba)!.path

/** O endereço (sem barra no fim, sem ?consulta) pertence à Atividade? */
export function isActivityPath(pathname: string): boolean {
    const p = (pathname || '').split('?')[0].replace(/\/+$/, '') || '/'
    return p === '/atividade' || p === '/carrinho' || p === '/conversas'
}

/** Qual subaba está aberta, pelo endereço e pelo `?aba=` do carrinho (pedidos e avaliações = Pedidos; digital = Biblioteca) */
export function abaOfLocation(pathname: string, abaParam?: string | null): AtividadeAba | null {
    const p = (pathname || '').split('?')[0].replace(/\/+$/, '') || '/'
    if (p === '/conversas') return 'conversas'
    if (p === '/atividade') return 'avisos'
    if (p === '/carrinho') {
        if (abaParam === 'pedidos' || abaParam === 'avaliacoes') return 'pedidos'
        if (abaParam === 'digital') return 'biblioteca'
        return 'carrinho'
    }
    return null
}

/** O `?aba=` que a tela do carrinho entende, para a subaba aberta */
export function carrinhoTabOf(aba: AtividadeAba | null, abaParam?: string | null): 'carrinho' | 'pedidos' | 'digital' | 'avaliacoes' {
    if (aba === 'pedidos') return abaParam === 'avaliacoes' ? 'avaliacoes' : 'pedidos'
    if (aba === 'biblioteca') return 'digital'
    return 'carrinho'
}

export interface ActivitySignals {
    unread: number
    orders: { pending: number; preparing: number; ready: number }
    cart: number
    /** a última subaba usada neste aparelho */
    last?: AtividadeAba | null
}

/** Para onde a aba Atividade leva: o que pede atenção primeiro — pedido pronto, mensagem não lida, pedido em andamento, carrinho; senão a última subaba usada */
export function smartAba(s: ActivitySignals): AtividadeAba {
    if (s.orders.ready > 0) return 'pedidos'
    if (s.unread > 0) return 'conversas'
    if (s.orders.pending + s.orders.preparing > 0) return 'pedidos'
    if (s.cart > 0) return 'carrinho'
    return s.last && ATIVIDADE_ABAS.some((a) => a.key === s.last) ? s.last : 'conversas'
}

/** O selo da aba Atividade na barra: mensagens não lidas + pedidos em andamento (roxo quando há pedido pronto) */
export function activityBadge(unread: number, orders: { pending: number; preparing: number; ready: number }): { count: number; color: string } {
    return { count: Math.max(0, unread) + orders.pending + orders.preparing + orders.ready, color: orders.ready > 0 ? '#a855f7' : '#16a34a' }
}
