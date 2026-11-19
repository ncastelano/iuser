// src/lib/postpaid.ts — o LIMITE DE DÍVIDA do plano Pós-pago (quando chega nele, a pessoa precisa quitar para continuar).
// A regra de verdade mora no banco (`postpaid_settings.debt_limit`, lida por `get_postpaid_debt_limit()`; migration 20261130000057) e trava
// todas as ações. As TELAS leem esse número do próprio banco (`usePostpaidLimit`), então nunca mostram um valor diferente do que trava:
//   · banco já com a migration → o valor dele (hoje 100);
//   · banco AINDA sem a migration (função não existe) → 50, que é o que ele de fato aplica — o código novo pode ir ao ar antes da migration
//     sem mostrar um limite errado nem travar ninguém por engano;
//   · falha de rede → o padrão (POSTPAID_DEBT_LIMIT) só para o texto; nada é bloqueado pela tela.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { POSTPAID_DEBT_LIMIT, POSTPAID_LEGACY_LIMIT, interpretLimit, limitText, salesUntilLimit } from '@/lib/postpaidRules'

let cached: number | null = null
let inflight: Promise<number> | null = null

export function loadPostpaidLimit(): Promise<number> {
    if (cached != null) return Promise.resolve(cached)
    if (!inflight) {
        inflight = Promise.resolve(supabase.rpc('get_postpaid_debt_limit'))
            .then(({ data, error }) => {
                const n = interpretLimit(data, error)
                if (n != null) cached = n
                return n ?? POSTPAID_DEBT_LIMIT
            })
            .catch(() => POSTPAID_DEBT_LIMIT)
            .finally(() => { inflight = null })
    }
    return inflight
}

/** o limite em vigor (começa no valor guardado ou no padrão e se acerta assim que o banco responde) */
export function usePostpaidLimit(): number {
    const [limit, setLimit] = useState<number>(cached ?? POSTPAID_DEBT_LIMIT)
    useEffect(() => {
        let alive = true
        loadPostpaidLimit().then((n) => { if (alive) setLimit(n) })
        return () => { alive = false }
    }, [])
    return limit
}

export { POSTPAID_DEBT_LIMIT, POSTPAID_LEGACY_LIMIT, interpretLimit, limitText, salesUntilLimit }

// ===== TETO MENSAL do Pós-pago (migration 20261130000075): R$ 0,50 por uso, nunca mais que isto no mês =====
let capCached: number | null | undefined
/** o teto do mês (hoje R$ 100); null = sem teto OU banco ainda sem a migration (aí o texto simplesmente não fala de teto) */
export function loadPostpaidCap(): Promise<number | null> {
    if (capCached !== undefined) return Promise.resolve(capCached)
    return Promise.resolve(supabase.rpc('get_postpaid_monthly_cap'))
        .then(({ data, error }) => { const n = error ? null : Number(data); capCached = n && Number.isFinite(n) && n > 0 ? n : null; return capCached })
        .catch(() => null)
}
export function usePostpaidCap(): number | null {
    const [cap, setCap] = useState<number | null>(capCached ?? null)
    useEffect(() => { let alive = true; loadPostpaidCap().then((n) => { if (alive) setCap(n) }); return () => { alive = false } }, [])
    return cap
}
