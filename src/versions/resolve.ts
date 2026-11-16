// src/versions/resolve.ts
//
// Regras PURAS (sem React, sem rede) da moldura das páginas, usadas pelo proxy e pelo layout (`npm run test:versions`).
import { LEGACY_INTERNAL_PREFIX, SHELL_EXCLUDED } from './registry.ts'

/** A página abre dentro da casca (barra de baixo + menu)? Todas, menos as de SHELL_EXCLUDED. */
export function usesShell(pathname: string): boolean {
    const path = normalize(pathname)
    return !SHELL_EXCLUDED.some((p) => path === p || path.startsWith(p.endsWith('/') ? p : p + '/'))
}

/** `/v3/carrinho` → `/carrinho`, `/v3` → `/` (endereço interno antigo da 3.0); null se não for um deles */
export function canonicalFromLegacy(pathname: string): string | null {
    const prefix = LEGACY_INTERNAL_PREFIX
    if (pathname === prefix || pathname === prefix + '/') return '/'
    if (pathname.startsWith(prefix + '/')) return pathname.slice(prefix.length) || '/'
    return null
}

function normalize(p: string): string {
    if (!p) return '/'
    const q = p.split('?')[0].split('#')[0]
    return q.length > 1 && q.endsWith('/') ? q.slice(0, -1) : q
}
