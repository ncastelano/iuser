// src/lib/courierLink.ts
import type { SupabaseClient } from '@supabase/supabase-js'

// Garante que o funcionário tem um link permanente pra ver as entregas dele
// (gera na hora se ainda não tiver - cobre quem foi cadastrado antes desse
// recurso existir).
export async function ensureEmployeeAccessToken(
    supabase: SupabaseClient,
    employeeId: string,
    currentToken?: string | null
): Promise<string> {
    if (currentToken) return currentToken
    const token = crypto.randomUUID()
    const { error } = await supabase.from('employees').update({ access_token: token }).eq('id', employeeId)
    if (error) throw error
    return token
}

export function buildCourierRouteMessage(employeeName: string, storeName: string, url: string): string {
    return `Oi ${employeeName}! Você tem entregas da ${storeName} pra fazer. Veja a rota e marque o progresso aqui: ${url}`
}
