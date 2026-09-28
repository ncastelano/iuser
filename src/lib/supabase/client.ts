// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'
import { processLock } from '@supabase/supabase-js'
import { trackEgressBytes, trackRealtimeMessage } from '@/lib/usageTelemetry'

// Fetch customizado só pra medir o tamanho de cada resposta que volta do
// Supabase (Egress próprio — ver usageTelemetry.ts) — não muda nada no
// comportamento da chamada, só espia o tamanho via content-length (ou o
// blob, se não vier esse header) depois que a resposta já foi devolvida
// pra quem chamou, sem bloquear nada.
const trackedFetch: typeof fetch = (...args) => {
    return fetch(...args).then((response) => {
        try {
            const len = response.headers.get('content-length')
            if (len) {
                trackEgressBytes(Number(len))
            } else {
                response
                    .clone()
                    .blob()
                    .then((b) => trackEgressBytes(b.size))
                    .catch(() => {})
            }
        } catch {
            // Nunca deixa a telemetria quebrar a chamada de verdade.
        }
        return response
    })
}

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
    global: {
      fetch: trackedFetch,
    },
  }
)

// Conta Realtime Messages (Egress próprio ver acima) — envolve .channel()
// uma única vez aqui, então todo canal criado em qualquer lugar do app
// (localização do motorista, visitantes da loja, pedidos etc — são ~17
// arquivos diferentes) já sai contado, sem precisar tocar em nenhum deles.
// Só espiona a chamada do callback de cada .on(), não muda o retorno.
const originalChannel = supabase.channel.bind(supabase)
supabase.channel = ((name: string, opts?: any) => {
  const channel = originalChannel(name, opts)
  const originalOn = channel.on.bind(channel)
  channel.on = ((...onArgs: any[]) => {
    const last = onArgs.length - 1
    if (typeof onArgs[last] === 'function') {
      const originalCallback = onArgs[last]
      onArgs[last] = (...cbArgs: any[]) => {
        trackRealtimeMessage()
        return originalCallback(...cbArgs)
      }
    }
    return (originalOn as any)(...onArgs)
  }) as typeof channel.on
  return channel
}) as typeof supabase.channel