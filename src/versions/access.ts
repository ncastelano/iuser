// src/versions/access.ts
//
// Servidor: qual interface servir. DESDE 14/11/2026 A 3.0 É A ÚNICA: a 2.0 foi aposentada (a escolha por cookie/perfil, a
// liberação por perfil `ui_v3_access` e a chave `feature_flags.ui_v3` não decidem mais nada — ficam no banco só como histórico).
// Usado pelo proxy e pelo layout. Nunca importar de um arquivo 'use client'.
import { VERSION_COOKIE, type UiVersion } from './registry'

type CookieList = { name: string; value: string }[]

export async function resolveRequestVersion(cookies: CookieList, cookieValue: string | undefined): Promise<UiVersion> {
    void cookies; void cookieValue
    return 'v3'
}

export { VERSION_COOKIE }
