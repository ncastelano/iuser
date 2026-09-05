// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'
import { processLock } from '@supabase/supabase-js'

// processLock evita o bug do supabase-js com a Navigator LockManager API
// ("AbortError: Lock broken by another request with the 'steal' option"),
// que trava TODAS as chamadas ao Supabase (lojas, produtos, etc.) quando
// duas abas do site disputam o mesmo lock de refresh de sessão.
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      lock: processLock,
    },
  }
)