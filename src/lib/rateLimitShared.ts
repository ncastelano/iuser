// src/lib/rateLimitShared.ts — SERVIDOR APENAS.
//
// Limite de tentativas contado no BANCO (rate_limit_hit, migration 20261130000083), uma conta só para todas as instâncias da Vercel
// (o lib/rateLimit.ts conta na memória de cada uma, e um ataque espalhado passava). Primeiro a conta barata em memória; depois o banco.
// Se o banco não responder (ou a função ainda não existir), vale só a memória: o limite nunca derruba a rota.
import { supabaseAdmin } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/rateLimit'

export async function rateLimitShared(key: string, max: number, windowMs: number): Promise<boolean> {
    if (!rateLimit(key, max, windowMs)) return false
    try {
        const { data, error } = await supabaseAdmin.rpc('rate_limit_hit', { p_key: key, p_max: max, p_window_s: Math.max(1, Math.round(windowMs / 1000)) })
        if (error) return true
        return data !== false
    } catch {
        return true
    }
}
