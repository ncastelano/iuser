// src/versions/resolve.ts
//
// Regras PURAS de resolução de versão (sem React, sem rede): fáceis de testar (`npm run test:versions`) e usadas
// pelo proxy (servidor) e pelo seletor (cliente), pra os dois decidirem sempre do mesmo jeito.
import {
    DEFAULT_VERSION, INTERNAL_PREFIX, UI_VERSIONS, V3_ONLY_PREFIXES, V3_ONLY_ROUTES, VERSION_ROUTES,
    type UiVersion,
} from './registry.ts'

export function parseVersion(raw: unknown): UiVersion | null {
    return typeof raw === 'string' && raw in UI_VERSIONS ? (raw as UiVersion) : null
}

/**
 * Qual versão a pessoa vê. Prioridade: escolha deste aparelho (cookie) > preferência salva no perfil > padrão.
 * Com a oferta da 3.0 desligada pelo admin, todo mundo cai na versão padrão (nenhuma outra é servida).
 */
export function resolveVersion(input: { cookie?: unknown; profilePref?: unknown; offerEnabled: boolean }): UiVersion {
    const chosen = parseVersion(input.cookie) ?? parseVersion(input.profilePref) ?? DEFAULT_VERSION
    if (!input.offerEnabled && chosen !== DEFAULT_VERSION) return DEFAULT_VERSION
    return chosen
}

/** Caminho interno que implementa `pathname` na versão `version`, ou null se a versão usa o próprio caminho */
export function internalPathFor(version: UiVersion, pathname: string): string | null {
    return VERSION_ROUTES[normalize(pathname)]?.[version] ?? null
}

/** `/v3/carrinho` → `/carrinho` (o endereço canônico); null se não for um caminho interno */
export function canonicalFromInternal(pathname: string): string | null {
    for (const prefix of Object.values(INTERNAL_PREFIX)) {
        if (!prefix) continue
        if (pathname === prefix) return '/'
        if (pathname.startsWith(prefix + '/')) return pathname.slice(prefix.length) || '/'
    }
    return null
}

/** Versão que o caminho interno `pathname` implementa (`/v3/...` → 'v3'), ou null */
export function versionOfInternalPath(pathname: string): UiVersion | null {
    for (const [v, prefix] of Object.entries(INTERNAL_PREFIX) as [UiVersion, string][]) {
        if (pathname === prefix || pathname.startsWith(prefix + '/')) return v
    }
    return null
}

/**
 * Para onde ir ao trocar de versão estando em `pathname`: a mesma página quando ela existe nas duas
 * (o proxy escolhe a implementação); senão, a página inicial equivalente — nunca um 404 nem um loop.
 */
export function equivalentPath(target: UiVersion, pathname: string): string {
    const path = normalize(canonicalFromInternal(pathname) ?? pathname)
    const v3Only = V3_ONLY_ROUTES.includes(path) || V3_ONLY_PREFIXES.some((p) => path.startsWith(p))
    if (target === 'v2') {
        // Caminhos que só a v3 tem não existem na v2: volta pra home da v2
        if (v3Only) return UI_VERSIONS.v2.home
        return path
    }
    // Indo para a v3: páginas da v2 sem versão 3.0 continuam abrindo como estão; a home vira a home da 3.0
    if (path === '/' || path === '') return UI_VERSIONS.v3.home
    return path
}

function normalize(p: string): string {
    if (!p) return '/'
    const q = p.split('?')[0].split('#')[0]
    return q.length > 1 && q.endsWith('/') ? q.slice(0, -1) : q
}
