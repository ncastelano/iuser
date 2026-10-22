// src/versions/client.tsx
//
// Lado do navegador do sistema de versões: ler/gravar a escolha, trocar de versão (UM mecanismo, usado por qualquer
// seletor da interface), manter o perfil e o cookie em sintonia. As regras de decisão ficam em ./resolve.ts.
'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useProfile } from '@/app/contexts/ProfileContext'
import {
    DEFAULT_VERSION, UI_VERSIONS, VERSION_COOKIE, VERSION_COOKIE_MAX_AGE, type UiVersion,
} from './registry'
import { equivalentPath, parseVersion } from './resolve'

export function readVersionCookie(): UiVersion | null {
    try {
        const m = document.cookie.match(new RegExp(`(?:^|; )${VERSION_COOKIE}=([^;]*)`))
        return m ? parseVersion(decodeURIComponent(m[1])) : null
    } catch {
        return null
    }
}

function writeVersionCookie(v: UiVersion) {
    try {
        document.cookie = `${VERSION_COOKIE}=${v}; path=/; max-age=${VERSION_COOKIE_MAX_AGE}; samesite=lax`
    } catch { /* sem cookies: a escolha só vale pro perfil */ }
}

/** Grava a preferência no perfil (só a coluna preferred_version, via RPC). Falha em silêncio: o cookie já vale. */
async function persistToProfile(v: UiVersion): Promise<void> {
    try {
        await supabase.rpc('set_my_ui_version', { p_version: v })
    } catch { /* migração ainda não aplicada ou sem sessão: segue só com o cookie */ }
}

/**
 * Troca a interface. Não mexe em sessão, permissões, plano nem dados: grava a escolha (cookie + perfil) e abre a
 * página equivalente na versão de destino (ou a home dela, se não existir lá). Recarregamento completo: o proxy
 * resolve a nova versão no servidor, sem estado misto entre servidor e cliente.
 */
export async function switchVersion(target: UiVersion, opts: { pathname: string; loggedIn: boolean; destination?: string }): Promise<void> {
    writeVersionCookie(target)
    if (opts.loggedIn) {
        // não prende a troca se a rede estiver lenta
        await Promise.race([persistToProfile(target), new Promise((r) => setTimeout(r, 1500))])
    }
    window.location.assign(opts.destination ?? equivalentPath(target, opts.pathname))
}

/** Versão em uso neste aparelho (a v2 até o navegador montar, pra servidor e cliente começarem iguais) */
export function useUiVersion(): UiVersion {
    const [v, setV] = useState<UiVersion>(DEFAULT_VERSION)
    useEffect(() => { setV(readVersionCookie() ?? DEFAULT_VERSION) }, [])
    return v
}

/**
 * Esta pessoa pode usar a 3.0? (liberada pelo admin, ou é o admin). A resposta vem do servidor — a mesma regra do
 * proxy —, então nada na interface mostra a 3.0 antes da liberação.
 */
const accessCache = new Map<string, { p: Promise<{ allowed?: boolean; isAdmin?: boolean; unknown?: boolean }>; at: number }>()

export function useV3Access(): { allowed: boolean; isAdmin: boolean; loading: boolean; /** a resposta não é confiável (erro de rede/servidor): não tratar como acesso revogado */ unknown: boolean } {
    const { userId } = useProfile()
    // A resposta vale para UMA pessoa (`forUser`). Quando o userId chega depois da 1ª renderização (carga completa da página),
    // o estado antigo ("sem acesso, já carregado", de quando não havia ninguém) não pode valer para ele: senão o VersionSync
    // lê "sem permissão" por um instante e apaga o cookie da 3.0 (a pessoa "sai da v3" ao navegar).
    const [state, setState] = useState<{ forUser: string | null; allowed: boolean; isAdmin: boolean; unknown: boolean }>({ forUser: null, allowed: false, isAdmin: false, unknown: false })
    useEffect(() => {
        if (!userId) { setState({ forUser: null, allowed: false, isAdmin: false, unknown: false }); return }
        let cancelled = false
        // uma consulta só por pessoa (a barra, o card e o botão do admin perguntam ao mesmo tempo)
        const hit = accessCache.get(userId)
        const request = hit && Date.now() - hit.at < 20_000
            ? hit.p
            : fetch('/api/ui-version/access', { cache: 'no-store' })
                .then((r) => (r.ok ? r.json() : { allowed: false, isAdmin: false, unknown: true }))
                .catch(() => ({ allowed: false, isAdmin: false, unknown: true }))
        if (!hit || request !== hit.p) accessCache.set(userId, { p: request, at: Date.now() })
        request.then((d: { allowed?: boolean; isAdmin?: boolean; unknown?: boolean }) => {
            if (!cancelled) setState({ forUser: userId, allowed: !!d.allowed, isAdmin: !!d.isAdmin, unknown: !!d.unknown })
        })
        return () => { cancelled = true }
    }, [userId])
    // sem usuário: nada a carregar; com usuário: carregando até a resposta DELE chegar
    const loading = !!userId && state.forUser !== userId
    if (loading || !userId) return { allowed: false, isAdmin: false, loading, unknown: false }
    return { allowed: state.allowed, isAdmin: state.isAdmin, loading: false, unknown: state.unknown }
}

/** Rótulo de uma versão para a interface */
export function versionLabel(v: UiVersion): string {
    return UI_VERSIONS[v].label
}

/**
 * Mantém cookie e perfil em sintonia ao logar: sem cookie neste aparelho, adota a preferência salva (e recarrega uma
 * vez pra o proxy servir a versão certa); com cookie e sem preferência salva, salva a escolha no perfil. A 3.0 só é
 * adotada/mantida com permissão do admin; sem ela o cookie da 3.0 é removido.
 */
export function VersionSync() {
    const { userId } = useProfile()
    const access = useV3Access()
    useEffect(() => {
        if (!userId || access.loading) return
        const cookie = readVersionCookie()
        if (!access.allowed) {
            // sem permissão (nunca teve, ou foi revogada): não fica preso a uma escolha que o servidor ignora.
            // Resposta duvidosa (erro/instabilidade): não mexe no cookie, senão a pessoa cairia na 2.0 por uma falha passageira.
            if (cookie === 'v3' && !access.unknown) {
                try { document.cookie = `${VERSION_COOKIE}=; path=/; max-age=0` } catch { /* ignora */ }
            }
            return
        }
        let cancelled = false
        ;(async () => {
            let pref: UiVersion | null = null
            try {
                const { data } = await supabase.from('my_profile').select('preferred_version').eq('id', userId).maybeSingle()
                pref = parseVersion((data as { preferred_version?: string } | null)?.preferred_version)
            } catch { return }
            if (cancelled) return
            if (!cookie && pref && pref !== DEFAULT_VERSION) {
                writeVersionCookie(pref)
                // uma única vez por sessão: se o proxy não aplicar, não entra em loop
                const guard = `iuser_ui_sync_${userId}`
                try {
                    if (!sessionStorage.getItem(guard)) {
                        sessionStorage.setItem(guard, '1')
                        window.location.reload()
                    }
                } catch { /* sem sessionStorage: não recarrega */ }
            } else if (cookie && !pref && cookie !== DEFAULT_VERSION) {
                void persistToProfile(cookie)
            }
        })()
        return () => { cancelled = true }
    }, [userId, access.allowed, access.loading, access.unknown])
    return null
}
