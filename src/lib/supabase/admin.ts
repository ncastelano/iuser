// lib/supabase/admin.ts
// Server-only client (service role). Never import this from a 'use client' file.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Criado sob demanda (não no escopo do módulo): o passo de "collect page
// data" do `next build` importa toda rota de API pra ler seus metadados,
// sem que a env SUPABASE_SERVICE_ROLE_KEY precise estar disponível nesse
// momento - só quando uma rota de fato roda (em runtime) é que o client é
// instanciado. Sem isso, criar o client no import quebrava o build inteiro
// (toda rota que importa supabaseAdmin) assim que essa env faltasse no
// ambiente de build.
let cachedClient: SupabaseClient | null = null

function getSupabaseAdmin(): SupabaseClient {
  if (!cachedClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      throw new Error('Supabase admin: defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.')
    }
    cachedClient = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  }
  return cachedClient
}

export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getSupabaseAdmin(), prop, receiver)
  },
})
