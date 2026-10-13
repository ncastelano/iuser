// src/lib/trackProductView.ts
//
// Conta uma visualização da página de um serviço / produto / publicação (products.view_count) pela função do banco
// increment_product_view_count — a única forma de um visitante (inclusive sem conta) contar, já que o RLS de products
// só deixa o dono atualizar a linha. Devolve o novo total (pra tela já mostrar o número certo) ou null se não contou
// (repetida em menos de 60 s, ou erro).
import { supabase } from '@/lib/supabase/client'

const lastSent = new Map<string, number>()
const COOLDOWN_MS = 60_000

export async function trackProductView(productId: string | null | undefined): Promise<number | null> {
    if (!productId || typeof window === 'undefined') return null
    const now = Date.now()
    const last = lastSent.get(productId)
    if (last && now - last < COOLDOWN_MS) return null
    lastSent.set(productId, now)
    try {
        const { data, error } = await supabase.rpc('increment_product_view_count', { p_product_id: productId })
        if (error || typeof data !== 'number') return null
        return data
    } catch {
        return null
    }
}
