// lib/callAdminApi.ts
'use client'

import { supabase } from '@/lib/supabase/client'

// Chama uma rota /api/admin/* autenticada. Usa refreshSession() em vez de
// getSession() de propósito: getSession() pode devolver um access_token
// que ainda parece válido localmente (o `exp` não bateu), mas cuja sessão
// já foi invalidada no servidor - acontece quando o refresh token é
// rotacionado em outra aba/dispositivo logado na mesma conta. Isso fazia o
// whoami sempre responder "não autenticado" (e a aba Admin sumir, ou abrir
// e mostrar "Sem permissão") mesmo pra conta certa. refreshSession() força
// a troca por um token que o próprio servidor do Supabase acabou de validar.
export async function callAdminApi<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    const { data: { session: refreshed } } = await supabase.auth.refreshSession()
    let token = refreshed?.access_token

    if (!token) {
        const { data: { session } } = await supabase.auth.getSession()
        token = session?.access_token
    }

    const res = await fetch(path, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body || {}),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Erro na requisição')
    return json as T
}
