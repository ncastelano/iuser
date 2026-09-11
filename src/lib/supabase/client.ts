// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'
import { processLock } from '@supabase/supabase-js'

// processLock evita o bug do supabase-js com a Navigator LockManager API
// ("AbortError: Lock broken by another request with the 'steal' option"),
// que trava TODAS as chamadas ao Supabase (lojas, produtos, etc.) quando
// duas abas do site disputam o mesmo lock de refresh de sessão.
//
// Só que processLock enfileira TODAS as chamadas de auth (getUser, getSession,
// signIn...) de uma mesma aba numa fila única por nome de lock - e muitos
// componentes independentes chamam supabase.auth.getUser()/getSession() no
// mount (em vez de reaproveitar o ProfileContext), então numa página com
// várias seções essas chamadas se acumulam na fila. O timeout padrão de 5s
// é curto demais pra essa fila esvaziar, daí o erro
// "Acquiring process lock... timed out". Timeout maior dá mais fôlego pra
// fila sem trazer de volta o bug do lock cross-tab que o processLock evita.
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      lock: processLock,
      // @supabase/ssr ainda não atualizou o tipo de `auth` pra incluir esta
      // opção (que o GoTrueClient de @supabase/auth-js já aceita em runtime),
      // daí o `as any` - só nessa chave, não no restante da config.
      lockAcquireTimeout: 20000,
    } as any,
  }
)