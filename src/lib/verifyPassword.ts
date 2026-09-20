// lib/verifyPassword.ts
// Server-only: confere a senha da pessoa logada antes de uma ação
// destrutiva. Usa um client descartável (sem persistir sessão) pra não
// mexer na sessão real de ninguém.
import { createClient } from '@supabase/supabase-js'

export async function verifyUserPassword(email: string, password: string): Promise<boolean> {
    if (!email || !password) return false
    const client = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } }
    )
    const { error } = await client.auth.signInWithPassword({ email, password })
    return !error
}
