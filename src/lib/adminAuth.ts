// lib/adminAuth.ts
// Server-only: helpers de autenticação/autorização pras rotas /api/admin/*.
// O e-mail do administrador geral é checado aqui (rotas Next.js) e também
// hardcoded dentro da função Postgres create_store_with_access — os dois
// precisam apontar pro mesmo valor. Never import this from a 'use client' file.
import { supabaseAdmin } from '@/lib/supabase/admin'
import type { User } from '@supabase/supabase-js'

export const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'ncastelano@gmail.com'

export async function getAuthedUser(req: Request): Promise<User | null> {
    const authHeader = req.headers.get('authorization') || ''
    const token = authHeader.replace('Bearer ', '')
    if (!token) return null

    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
    if (error || !user) return null
    return user
}

export async function requireSuperAdmin(req: Request): Promise<User | null> {
    const user = await getAuthedUser(req)
    if (!user || user.email !== SUPER_ADMIN_EMAIL) return null
    return user
}

export interface CodeGeneratorAuth {
    user: User
    isSuperAdmin: boolean
}

// Super admin ou alguém que ele autorizou (profiles.can_generate_store_codes).
export async function requireCodeGenerator(req: Request): Promise<CodeGeneratorAuth | null> {
    const user = await getAuthedUser(req)
    if (!user) return null

    if (user.email === SUPER_ADMIN_EMAIL) {
        return { user, isSuperAdmin: true }
    }

    const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('can_generate_store_codes')
        .eq('id', user.id)
        .single()

    if (!profile?.can_generate_store_codes) return null
    return { user, isSuperAdmin: false }
}
