// src/versions/client.tsx
//
// Lado do navegador do sistema de versões: ler/gravar a escolha, trocar de versão (UM mecanismo, usado por qualquer
// seletor da interface), manter o perfil e o cookie em sintonia. As regras de decisão ficam em ./resolve.ts.
'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useProfile } from '@/app/contexts/ProfileContext'
import { useFeatureFlag } from '@/hooks/useFeatureFlag'
import {
    DEFAULT_VERSION, UI_VERSIONS, VERSION_COOKIE, VERSION_COOKIE_MAX_AGE, VERSION_FLAG_KEY, type UiVersion,
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

/** O admin deixou a versão 3.0 disponível? (feature_flags.ui_v3) */
export function useV3Offered(): boolean {
    return useFeatureFlag(VERSION_FLAG_KEY)
}

/** Rótulo de uma versão para a interface */
export function versionLabel(v: UiVersion): string {
    return UI_VERSIONS[v].label
}

/**
 * Mantém cookie e perfil em sintonia ao logar: sem cookie neste aparelho, adota a preferência salva (e recarrega uma
 * vez pra o proxy servir a versão certa); com cookie e sem preferência salva, salva a escolha no perfil.
 */
export function VersionSync() {
    const { userId } = useProfile()
    useEffect(() => {
        if (!userId) return
        let cancelled = false
        ;(async () => {
            let pref: UiVersion | null = null
            try {
                const { data } = await supabase.from('profiles').select('preferred_version').eq('id', userId).maybeSingle()
                pref = parseVersion((data as { preferred_version?: string } | null)?.preferred_version)
            } catch { return }
            if (cancelled) return
            const cookie = readVersionCookie()
            if (!cookie && pref && pref !== DEFAULT_VERSION) {
                writeVersionCookie(pref)
                // uma única vez por sessão: se o proxy não aplicar (oferta desligada), não entra em loop
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
    }, [userId])
    return null
}
