// src/modules/deliveries/cashTrust.ts — LIBERAÇÃO POR ETAPAS para entregas em dinheiro e maquininha (migration ...69).
// Regra PURA de apresentação (o banco decide quem pode: get_my_cash_trust / _cash_trust_check). Testes: npm run test:deliveries.

export type CashTrustLevel = 'new' | 'starter' | 'full'

export interface CashTrust {
    enabled: boolean
    level: CashTrustLevel
    missing: string[]
    deliveries: number
    min_deliveries: number
    full_after: number
    days: number
    min_days: number
    rating: number | null
    reviews: number
    min_rating: number
    has_pix: boolean
    has_selfie: boolean
    per_order_max: number | null
    open_max: number | null
    open_now: number
    starter_per_order?: number
    starter_open_max?: number
    favorite_stores?: number
}

const brl = (n: number) => `R$ ${Math.round(n)}`

/** O que falta, em frases curtas, na ordem em que a pessoa resolve */
export function missingSteps(t: CashTrust): string[] {
    const out: string[] = []
    for (const m of t.missing) {
        if (m === 'selfie') out.push('Pôr a sua foto (selfie) no cadastro do veículo')
        else if (m === 'pix') out.push('Cadastrar a sua chave Pix')
        else if (m === 'deliveries') {
            const left = Math.max(0, t.min_deliveries - t.deliveries)
            out.push(`Fazer mais ${left} entrega${left === 1 ? '' : 's'} com Pix (${t.deliveries} de ${t.min_deliveries})`)
        } else if (m === 'days') {
            const left = Math.max(0, t.min_days - t.days)
            out.push(`Esperar mais ${left} dia${left === 1 ? '' : 's'} de conta`)
        } else if (m === 'rating') out.push(`Subir a sua nota para ${String(t.min_rating).replace('.', ',')} ou mais`)
        else if (m === 'dispute') out.push('Ficar 90 dias sem entrega contestada contra você')
        else if (m === 'late') out.push('Ficar 90 dias sem repasse à loja atrasado')
    }
    return out
}

export interface CashTrustView {
    tone: 'locked' | 'starter' | 'free'
    title: string
    text: string
    steps: string[]
    /** 0..1: quanto já fez das entregas que faltam para a próxima etapa */
    progress: number | null
}

export function cashTrustView(t: CashTrust): CashTrustView {
    if (!t.enabled || t.level === 'full') {
        return { tone: 'free', title: 'Dinheiro e maquininha liberados', text: 'Você pode levar entregas pagas em dinheiro ou no cartão da loja. Repasse à loja no Caixa.', steps: [], progress: null }
    }
    const fav = t.favorite_stores && t.favorite_stores > 0
        ? ` Nas ${t.favorite_stores === 1 ? 'loja que te escolheu' : `${t.favorite_stores} lojas que te escolheram`} como favorito, já pode.` : ''
    if (t.level === 'new') {
        return {
            tone: 'locked',
            title: 'Dinheiro e maquininha ainda bloqueados',
            text: `Por segurança, quem está começando leva só pedidos pagos por Pix (você não toca no dinheiro).${fav}`,
            steps: missingSteps(t),
            progress: t.min_deliveries > 0 ? Math.min(1, t.deliveries / t.min_deliveries) : null,
        }
    }
    const left = Math.max(0, t.full_after - t.deliveries)
    return {
        tone: 'starter',
        title: `Dinheiro e maquininha: até ${brl(t.per_order_max ?? 0)} por entrega`,
        text: `E até ${brl(t.open_max ?? 0)} de lojas com você ao mesmo tempo (agora: ${brl(t.open_now)}). O limite sai depois de ${t.full_after} entregas: faltam ${left}.${fav}`,
        steps: [],
        progress: t.full_after > 0 ? Math.min(1, t.deliveries / t.full_after) : null,
    }
}
