// src/versions/v3/atividade/domain.ts
//
// ATIVIDADE (a aba da barra da 3.0): "o que está acontecendo comigo?" — conversas, pedidos, carrinho, biblioteca e avisos num lugar só.
// Regra pura (sem React): UMA página só, /atividade?aba=conversas|pedidos|carrinho|biblioteca|avisos (os links antigos /carrinho e /conversas continuam valendo:
// na 3.0 levam para cá), e a barra decide para qual subaba levar. Testes: scripts/test-atividade.mjs.

export type AtividadeAba = 'conversas' | 'pedidos' | 'carrinho' | 'biblioteca' | 'avisos'

export const ATIVIDADE_ABAS: { key: AtividadeAba; label: string; path: string }[] = [
    { key: 'conversas', label: 'Conversas', path: '/atividade?aba=conversas' },
    { key: 'pedidos', label: 'Pedidos', path: '/atividade?aba=pedidos' },
    { key: 'carrinho', label: 'Carrinho', path: '/atividade?aba=carrinho' },
    { key: 'biblioteca', label: 'Biblioteca', path: '/atividade?aba=biblioteca' },
    { key: 'avisos', label: 'Avisos', path: '/atividade?aba=avisos' },
]

export const pathOfAba = (aba: AtividadeAba): string => ATIVIDADE_ABAS.find((a) => a.key === aba)!.path

const clean = (pathname: string) => ((pathname || '').split('?')[0].replace(/\/+$/, '') || '/')

/** O endereço pertence à Atividade? (inclui os antigos /carrinho e /conversas, que na 3.0 levam para /atividade) */
export function isActivityPath(pathname: string): boolean {
    const p = clean(pathname)
    return p === '/atividade' || p === '/carrinho' || p === '/conversas'
}

/** Qual subaba está aberta, pelo endereço e pelo `?aba=` (pedidos e avaliações = Pedidos; digital = Biblioteca; sem `?aba=` na página, Avisos) */
export function abaOfLocation(pathname: string, abaParam?: string | null): AtividadeAba | null {
    const p = clean(pathname)
    if (p === '/conversas') return 'conversas'
    if (p === '/atividade' || p === '/carrinho') {
        if (abaParam === 'conversas') return 'conversas'
        if (abaParam === 'pedidos' || abaParam === 'avaliacoes') return 'pedidos'
        if (abaParam === 'biblioteca' || abaParam === 'digital') return 'biblioteca'
        if (abaParam === 'carrinho') return 'carrinho'
        if (abaParam === 'avisos') return 'avisos'
        return p === '/carrinho' ? 'carrinho' : 'avisos'
    }
    return null
}

/** O `?aba=` que a tela do carrinho entende, para a subaba aberta */
export function carrinhoTabOf(aba: AtividadeAba | null, abaParam?: string | null): 'carrinho' | 'pedidos' | 'digital' | 'avaliacoes' {
    if (aba === 'pedidos') return abaParam === 'avaliacoes' ? 'avaliacoes' : 'pedidos'
    if (aba === 'biblioteca') return 'digital'
    return 'carrinho'
}

/** Os endereços antigos na 3.0: /conversas e /carrinho viram /atividade?aba=..., sem perder o resto (sala, conversa aberta...). null = não é endereço antigo. */
export function legacyTarget(pathname: string, search: string): string | null {
    const p = clean(pathname)
    if (p !== '/conversas' && p !== '/carrinho') return null
    const q = new URLSearchParams((search || '').replace(/^\?/, ''))
    const old = q.get('aba')
    q.delete('aba')
    const aba: string = p === '/conversas' ? 'conversas' : old === 'pedidos' ? 'pedidos' : old === 'avaliacoes' ? 'avaliacoes' : old === 'digital' ? 'biblioteca' : 'carrinho'
    const rest = q.toString()
    return `/atividade?aba=${aba}${rest ? `&${rest}` : ''}`
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
