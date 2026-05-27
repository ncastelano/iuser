// lib/supabase/client.ts

import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  // Use createBrowserClient as it handles cookies implicitly on the client
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
