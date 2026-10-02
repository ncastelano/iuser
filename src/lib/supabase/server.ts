// lib/supabase/server.ts
// Server-only: cliente Supabase que age COMO o usuário logado (sessão pelos
// cookies do navegador, RLS valendo) — diferente do supabaseAdmin, que
// ignora RLS. Usado por rotas chamadas pelo próprio navegador/service worker
// sem Authorization header (ex: candidatura direto da notificação push).
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createServerSupabase() {
    const store = await cookies()
    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll: () => store.getAll(),
                setAll: (list) => {
                    try {
                        list.forEach(({ name, value, options }) => store.set(name, value, options))
                    } catch {
                        // Chamado de um contexto onde cookies são só leitura — ignora.
                    }
                },
            },
        }
    )
}
