// src/versions/v3/atividade/domain.ts
//
// ATIVIDADE (a aba da barra da 3.0): "o que estou comprando?" — pedidos, carrinho e biblioteca num lugar só.
// Regra pura (sem React): UMA página só, /atividade?aba=pedidos|carrinho|biblioteca (o link antigo /carrinho continua valendo e leva para cá),
// e a barra decide para qual subaba levar. As CONVERSAS saíram daqui (17/11/2026, decisão do dono): são uma aba própria da barra e uma
// página própria (/conversas); o endereço antigo /atividade?aba=conversas leva para lá (conversasTarget). As NOTIFICAÇÕES DO PERFIL não são mais uma subaba: moram no painel do perfil
// (NOTIFICATIONS_PATH) e a barra chega a elas pelo SININHO, o 4º ícone do botão Atividade. Testes: scripts/test-atividade.mjs.

export type AtividadeAba = 'pedidos' | 'carrinho' | 'biblioteca'

export const ATIVIDADE_ABAS: { key: AtividadeAba; label: string; path: string }[] = [
    { key: 'pedidos', label: 'Pedidos', path: '/atividade?aba=pedidos' },
    { key: 'carrinho', label: 'Carrinho', path: '/atividade?aba=carrinho' },
    { key: 'biblioteca', label: 'Biblioteca', path: '/atividade?aba=biblioteca' },
]

/** As notificações do perfil moram no painel do perfil (o sininho da barra leva para lá; o antigo /atividade?aba=avisos também) */
export const NOTIFICATIONS_PATH = '/painel-perfil?secao=notificacoes'
/** O `?aba=` antigo das notificações: a tela redireciona para NOTIFICATIONS_PATH */
export const isLegacyAvisos = (abaParam?: string | null): boolean => abaParam === 'avisos'

export const pathOfAba = (aba: AtividadeAba): string => ATIVIDADE_ABAS.find((a) => a.key === aba)!.path

const clean = (pathname: string) => ((pathname || '').split('?')[0].replace(/\/+$/, '') || '/')

/** O endereço pertence à Atividade? (inclui o antigo /carrinho, que leva para /atividade) */
export function isActivityPath(pathname: string): boolean {
    const p = clean(pathname)
    return p === '/atividade' || p === '/carrinho'
}

/** O endereço antigo das conversas dentro da Atividade (/conversas?sala=...&c=...) vira /conversas, sem perder o resto. null = não é ele. */
export function conversasTarget(pathname: string, search: string): string | null {
    const q = new URLSearchParams((search || '').replace(/^\?/, ''))
    if (clean(pathname) !== '/atividade' || q.get('aba') !== 'conversas') return null
    q.delete('aba')
    const rest = q.toString()
    return `/conversas${rest ? `?${rest}` : ''}`
}

/** Qual subaba está aberta, pelo endereço e pelo `?aba=` (pedidos e avaliações = Pedidos; digital = Biblioteca). Sem `?aba=` (ou com um valor que não existe) a página
 *  Atividade não tem subaba escolhida: `null` — quem usa decide (a tela abre a que pede atenção). */
export function abaOfLocation(pathname: string, abaParam?: string | null): AtividadeAba | null {
    const p = clean(pathname)
    if (p === '/atividade' || p === '/carrinho') {
        if (abaParam === 'pedidos' || abaParam === 'avaliacoes') return 'pedidos'
        if (abaParam === 'biblioteca' || abaParam === 'digital') return 'biblioteca'
        if (abaParam === 'carrinho') return 'carrinho'
        return p === '/carrinho' ? 'carrinho' : null
    }
    return null
}

/** O `?aba=` que a tela do carrinho entende, para a subaba aberta */
export function carrinhoTabOf(aba: AtividadeAba | null, abaParam?: string | null): 'carrinho' | 'pedidos' | 'digital' | 'avaliacoes' {
    if (aba === 'pedidos') return abaParam === 'avaliacoes' ? 'avaliacoes' : 'pedidos'
    if (aba === 'biblioteca') return 'digital'
    return 'carrinho'
}

/** O endereço antigo /carrinho vira /atividade?aba=..., sem perder o resto. null = não é endereço antigo. (/conversas é página própria de novo desde 17/11/2026) */
export function legacyTarget(pathname: string, search: string): string | null {
    const p = clean(pathname)
    if (p !== '/carrinho') return null
    const q = new URLSearchParams((search || '').replace(/^\?/, ''))
    const old = q.get('aba')
    q.delete('aba')
    const aba: string = old === 'pedidos' ? 'pedidos' : old === 'avaliacoes' ? 'avaliacoes' : old === 'digital' ? 'biblioteca' : 'carrinho'
    const rest = q.toString()
    return `/atividade?aba=${aba}${rest ? `&${rest}` : ''}`
}

export interface ActivitySignals {
    orders: { pending: number; preparing: number; ready: number }
    cart: number
    /** a última subaba usada neste aparelho */
    last?: AtividadeAba | null
}

/** Para onde a aba Atividade leva: o que pede atenção primeiro — pedido em andamento (pronto antes), carrinho; senão a última subaba usada (ou Pedidos) */
export function smartAba(s: ActivitySignals): AtividadeAba {
    if (s.orders.ready + s.orders.pending + s.orders.preparing > 0) return 'pedidos'
    if (s.cart > 0) return 'carrinho'
    return s.last && ATIVIDADE_ABAS.some((a) => a.key === s.last) ? s.last : 'pedidos'
}

/** O selo de pedidos da aba Atividade na barra: pedidos em andamento (roxo quando há pedido pronto). As mensagens têm o selo da aba Conversas. */
export function activityBadge(orders: { pending: number; preparing: number; ready: number }): { count: number; color: string } {
    return { count: orders.pending + orders.preparing + orders.ready, color: orders.ready > 0 ? '#a855f7' : '#16a34a' }
}
