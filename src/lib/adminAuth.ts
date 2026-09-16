// lib/adminAuth.ts
// Server-only: helpers de autenticação/autorização pras rotas /api/admin/*.
// O e-mail do administrador geral é checado aqui (rotas Next.js) e também
// hardcoded dentro da função Postgres get_active_plan_grants — os dois
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
