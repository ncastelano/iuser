// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'
import { processLock } from '@supabase/supabase-js'
import { trackEgressBytes, trackRealtimeMessage } from '@/lib/usageTelemetry'
import { optimizeImageForUpload } from '@/lib/optimizeImage'
import { checkPhotoUpload } from '@/lib/uploadLimits'
import { registerMediaAsset } from '@/lib/mediaAssets'
import { authorizeUpload, uploadBodyInfo, uploadDeniedStatus } from '@/lib/uploadAuthorization'
import { proxyImageUrl } from '@/lib/imageProxy'
import { isLocalDevOnly } from '@/lib/devOnly'
import { clearMaintenance, getMaintenance, reportMaintenance } from '@/lib/maintenance'

// Fetch customizado só pra medir o tamanho de cada resposta que volta do
// Supabase (Egress próprio — ver usageTelemetry.ts) — não muda nada no
// comportamento da chamada, só espia o tamanho via content-length (ou o
// blob, se não vier esse header) depois que a resposta já foi devolvida
// pra quem chamou, sem bloquear nada.
const trackedFetch: typeof fetch = (...args) => {
    return fetch(...args).then((response) => {
        // 402 = projeto restringido pela cota do Supabase: liga o aviso de manutenção (ver lib/maintenance.ts); resposta boa desliga
        try {
            if (response.status === 402) reportMaintenance()
            else if (response.ok && getMaintenance()) clearMaintenance()
        } catch { /* o aviso nunca quebra a chamada */ }
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

// Todo upload de IMAGEM para o Storage passa por aqui: reduz a foto antes de enviar (ver optimizeImage.ts) e dá cache longo
// ao arquivo (o nome carrega timestamp, então não muda). Envolve .storage.from() uma única vez, como o .channel() acima:
// os ~30 pontos de upload do app já saem otimizados sem tocar em nenhum deles. Se algo falhar, envia o arquivo original.
const originalStorageFrom = supabase.storage.from.bind(supabase.storage)
supabase.storage.from = ((bucket: string) => {
  const api = originalStorageFrom(bucket)
  const originalUpload = api.upload.bind(api)
  api.upload = (async (path: string, body: any, options?: any) => {
    let nextBody = body
    let nextOptions = options
    if (typeof Blob !== 'undefined' && body instanceof Blob) {
      const optimized = await optimizeImageForUpload(body, bucket)
      if (optimized !== body) {
        nextBody = optimized
        nextOptions = { ...(options || {}), contentType: optimized.type }
      }
      // Aviso claro ANTES de enviar (o Storage recusa o mesmo no servidor: migration 20261130000018). Arquivo sem tipo recebe o da extensão.
      const check = checkPhotoUpload(bucket, { size: nextBody.size, type: nextBody.type, name: (body as File).name }, path)
      if (!check.ok) return { data: null, error: Object.assign(new Error(check.message), { statusCode: check.reason === 'size' ? '413' : '415' }) } as any
      if (!nextBody.type && !nextOptions?.contentType) nextOptions = { ...(nextOptions || {}), contentType: check.contentType }
    }
    // Autorização no BANCO (migration 20261130000020): login, bloqueios, tipo, tamanho, plano, ritmo e cotas por pessoa. Se o banco não responde, o envio segue direto e a política do Storage decide.
    const info = uploadBodyInfo(nextBody, nextOptions)
    if (info) {
      const auth = await authorizeUpload(supabase, { bucket, path, bytes: info.bytes, mime: info.mime, upsert: !!nextOptions?.upsert })
      if (auth.status === 'denied') return { data: null, error: Object.assign(new Error(auth.message), { statusCode: uploadDeniedStatus(auth.code), code: auth.code }) } as any
    }
    // cache de 1 ano só quando não é troca no mesmo caminho (upsert); senão fica o padrão
    if (!nextOptions?.cacheControl && !nextOptions?.upsert) nextOptions = { ...(nextOptions || {}), cacheControl: '31536000' }
    const result = await originalUpload(path, nextBody, nextOptions)
    // Contabilidade (media_assets): anota o arquivo enviado SEM esperar e sem nunca atrapalhar o envio (falha é engolida; ver lib/mediaAssets.ts)
    if (!result.error) void registerMediaAsset(supabase, bucket, result.data?.path || path)
    return result
  }) as typeof api.upload
  // Links públicos saem pelo endereço de imagens do próprio site (cache da Vercel; ver imageProxy.ts). Cobre os ~175 pontos
  // que chamam getPublicUrl sem tocar em nenhum, inclusive o link que o app grava no banco ao enviar uma foto nova.
  const originalGetPublicUrl = api.getPublicUrl.bind(api)
  api.getPublicUrl = ((path: string, options?: any) => {
    const r = originalGetPublicUrl(path, options)
    return { data: { publicUrl: proxyImageUrl(r.data.publicUrl) } }
  }) as typeof api.getPublicUrl
  return api
}) as typeof supabase.storage.from

// Gancho de verificação: só em desenvolvimento com o Supabase LOCAL (lib/devOnly.ts; em produção, staging e preview não existe). No console: `__supabase.storage.from('avatars').upload(...)`.
if (typeof window !== 'undefined' && isLocalDevOnly()) (window as unknown as { __supabase?: typeof supabase }).__supabase = supabase
