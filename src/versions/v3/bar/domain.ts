// src/versions/v3/bar/domain.ts
//
// A BARRA DE BAIXO POR MODO (3.0): Explorar fica sempre à esquerda e Eu sempre à direita; as três do meio acompanham o modo.
//   pessoa    → Perto · Social · Atividade
//   loja      → Painel · Pedidos · Conversas
//   motorista → Corridas · Entregas · Ganhos
// Regra pura (sem React): quais abas, para onde levam e qual está marcada. Testes: scripts/test-bar.mjs.

export type BarKey = 'home' | 'radar' | 'people' | 'activity' | 'panel' | 'orders' | 'chat' | 'rides' | 'deliveries' | 'earnings'
export type BarKind = 'pessoa' | 'loja' | 'motorista'

export interface BarTabDef { key: BarKey; label: string }

/** O modo guardado ('perfil' | 'prestador' | 'loja:<slug>' | 'motorista:<slug>') em "pessoa, loja ou motorista" (e o slug da loja) */
export function barKindOf(activeMode: string, knownStoreSlugs: string[] = []): { kind: BarKind; storeSlug: string | null } {
    if (activeMode.startsWith('loja:')) {
        const slug = activeMode.slice(5)
        // loja que a pessoa já não tem (ou ainda não carregou): a barra de pessoa, sem quebrar
        if (slug && knownStoreSlugs.includes(slug)) return { kind: 'loja', storeSlug: slug }
        return { kind: 'pessoa', storeSlug: null }
    }
    if (activeMode.startsWith('motorista:')) return { kind: 'motorista', storeSlug: null }
    return { kind: 'pessoa', storeSlug: null }
}

const HOME: BarTabDef = { key: 'home', label: 'Explorar' }
const MIDDLE: Record<BarKind, BarTabDef[]> = {
    pessoa: [{ key: 'radar', label: 'Perto' }, { key: 'people', label: 'Social' }, { key: 'activity', label: 'Atividade' }],
    loja: [{ key: 'panel', label: 'Painel' }, { key: 'orders', label: 'Pedidos' }, { key: 'chat', label: 'Conversas' }],
    motorista: [{ key: 'rides', label: 'Corridas' }, { key: 'deliveries', label: 'Entregas' }, { key: 'earnings', label: 'Ganhos' }],
}

/** As quatro abas que mudam (Explorar + as do meio); a quinta, Eu, é sempre a foto do modo */
export function barTabsFor(kind: BarKind): BarTabDef[] {
    return [HOME, ...MIDDLE[kind]]
}

const clean = (p: string) => ((p || '').split('?')[0].replace(/\/+$/, '') || '/')

/** Endereços (fora a Atividade, que decide sozinha) para onde cada aba leva */
export function barPathOf(key: BarKey, storeSlug: string | null): string | null {
    const s = storeSlug ? encodeURIComponent(storeSlug) : null
    switch (key) {
        case 'home': return '/'
        case 'radar': return '/radar'
        case 'people': return '/social'
        case 'panel': return s ? `/painel-loja/${s}` : null
        case 'orders': return s ? `/painel-loja/${s}/pedidos` : null
        case 'chat': return s ? `/atividade?aba=conversas&sala=${s}` : '/atividade?aba=conversas'
        case 'rides': return '/aceitar-corridas'
        case 'deliveries': return '/entregas'
        case 'earnings': return '/ganhos'
        default: return null   // 'activity': a barra escolhe a subaba (smartAba)
    }
}

/** Qual aba está marcada neste endereço (null = nenhuma das quatro). `aba` é o `?aba=` da página Atividade (a loja marca Conversas quando a Atividade está nas conversas) */
export function activeBarKey(kind: BarKind, shellPath: string, storeSlug: string | null, aba: string | null = null): BarKey | null {
    const p = clean(shellPath)
    if (p === '/') return 'home'
    if (kind === 'pessoa') {
        if (p === '/atividade' || p === '/carrinho' || p === '/conversas') return 'activity'
        if (p.startsWith('/radar')) return 'radar'
        if (p.startsWith('/flash') || p.startsWith('/social')) return 'people'
        return null
    }
    if (kind === 'loja') {
        const s = storeSlug ? encodeURIComponent(storeSlug) : null
        if (s && (p === `/painel-loja/${s}/pedidos` || p.startsWith(`/painel-loja/${s}/pedidos/`))) return 'orders'
        if (p.startsWith('/painel-loja/') || p.startsWith('/editar-loja/')) return 'panel'
        if (p === '/conversas' || (p === '/atividade' && aba === 'conversas')) return 'chat'
        return null
    }
    if (p === '/aceitar-corridas' || p.startsWith('/aceitar-corridas/')) return 'rides'
    if (p === '/entregas') return 'deliveries'
    if (p === '/ganhos') return 'earnings'
    return null
}

/**
 * A página DE UM MODO da própria pessoa também leva a barra, como o painel do perfil (/painel-perfil) e o da loja (/painel-loja/<slug>): a do modo MOTORISTA é a página pública do
 * veículo dela (/<vehicle_slug>), que é um endereço dinâmico e por isso não entra na lista de páginas com barra. Só os veículos DA PESSOA contam (o de outra pessoa abre sem barra).
 */
export function isOwnVehiclePage(shellPath: string, myVehicleSlugs: string[]): boolean {
    const p = clean(shellPath)
    if (!p.startsWith('/') || p.indexOf('/', 1) !== -1) return false   // só um segmento: /<slug>
    let slug = p.slice(1)
    try { slug = decodeURIComponent(slug) } catch { /* mantém */ }
    return !!slug && myVehicleSlugs.includes(slug)
}
