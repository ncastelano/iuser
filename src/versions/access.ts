// src/versions/access.ts
//
// Servidor: quem pode usar a interface 3.0. Acesso = administrador geral OU perfil liberado pelo admin
// (`ui_v3_access`) OU a chave `ui_v3` ligada ("liberada para todos"). Usado pelo proxy e pelo layout (mesma regra).
// Nunca importar de um arquivo 'use client'.
import { createServerClient } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPER_ADMIN_EMAIL } from '@/lib/adminAuth'
import { VERSION_COOKIE, VERSION_FLAG_KEY, type UiVersion } from './registry'
import { parseVersion } from './resolve'

export interface RequestUser { id: string; email: string | null }
export interface V3Access { allowed: boolean; isAdmin: boolean }

type CookieList = { name: string; value: string }[]

let adminClient: SupabaseClient | null = null
function db(): SupabaseClient | null {
    if (adminClient) return adminClient
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return null
    adminClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    return adminClient
}

// Cache curto em memória: o proxy roda em toda navegação.
const TTL = 30_000
const cache = new Map<string, { v: unknown; at: number }>()
async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const hit = cache.get(key)
    if (hit && Date.now() - hit.at < TTL) return hit.v as T
    const v = await fn()
    if (cache.size > 500) cache.clear()
    cache.set(key, { v, at: Date.now() })
    return v
}

/** Quem está logado nesta requisição (valida o token no Supabase). null = visitante. */
export async function identifyUser(cookies: CookieList): Promise<RequestUser | null> {
    const authCookies = cookies.filter((c) => c.name.startsWith('sb-') && c.name.includes('auth-token'))
    if (authCookies.length === 0) return null
    const key = 'id:' + authCookies.map((c) => c.name + '=' + c.value).join('|')
    return cached<RequestUser | null>(key, async () => {
        try {
            const url = process.env.NEXT_PUBLIC_SUPABASE_URL
            const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
            if (!url || !anon) return null
            const supabase = createServerClient(url, anon, { cookies: { getAll: () => cookies, setAll: () => {} } })
            const { data } = await supabase.auth.getUser()
            return data.user ? { id: data.user.id, email: data.user.email ?? null } : null
        } catch {
            return null
        }
    })
}

export async function getV3Access(user: RequestUser | null): Promise<V3Access> {
    if (!user) return { allowed: false, isAdmin: false }
    const isAdmin = !!user.email && user.email === SUPER_ADMIN_EMAIL
    if (isAdmin) return { allowed: true, isAdmin: true }
    const client = db()
    if (!client) return { allowed: false, isAdmin: false }
    const forAll = await cached('flag', async () => {
        const { data } = await client.from('feature_flags').select('enabled').eq('key', VERSION_FLAG_KEY).maybeSingle()
        return !!(data as { enabled?: boolean } | null)?.enabled
    })
    if (forAll) return { allowed: true, isAdmin: false }
    const granted = await cached('grant:' + user.id, async () => {
        const { data } = await client.from('ui_v3_access').select('profile_id').eq('profile_id', user.id).maybeSingle()
        return !!data
    })
    return { allowed: granted, isAdmin: false }
}

/** A versão efetiva desta requisição: escolhida pelo cookie E permitida. Sem permissão, é sempre a v2. */
export async function resolveRequestVersion(cookies: CookieList, cookieValue: string | undefined): Promise<UiVersion> {
    const chosen = parseVersion(cookieValue)
    if (chosen !== 'v3') return 'v2'
    const access = await getV3Access(await identifyUser(cookies))
    return access.allowed ? 'v3' : 'v2'
}

export { VERSION_COOKIE }
