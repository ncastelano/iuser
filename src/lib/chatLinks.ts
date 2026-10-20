// Links nas mensagens das comunidades: só valem dois tipos — link de IMAGEM (aparece a imagem) e link do iUser (loja, perfil, serviço,
// produto ou publicação: aparece o cartão). Qualquer outro endereço não é enviado. A checagem de quem envia está aqui; o que aparece
// para quem lê vem de `ChatLinkPreviews`.
import { supabase } from '@/lib/supabase/client'

const URL_RE = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi
const IMAGE_RE = /\.(png|jpe?g|gif|webp|avif)$/i

const clean = (raw: string) => raw.replace(/[.,;:!?)\]}]+$/, '')
const withProtocol = (u: string) => (/^https?:\/\//i.test(u) ? u : `https://${u}`)

/** Todos os links do texto (sem repetir), já com https://. */
export function urlsIn(text: string): string[] {
    const out: string[] = []
    URL_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = URL_RE.exec(text || '')) !== null) {
        const u = withProtocol(clean(m[0]))
        if (!out.includes(u)) out.push(u)
    }
    return out
}

export function isImageUrl(url: string): boolean {
    try {
        const u = new URL(url)
        return u.protocol === 'https:' && IMAGE_RE.test(u.pathname)
    } catch { return false }
}

function isIuserHost(host: string): boolean {
    const h = host.toLowerCase()
    if (h === 'iuser.com.br' || h.endsWith('.iuser.com.br')) return true
    return typeof window !== 'undefined' && h === window.location.host.toLowerCase()   // o próprio endereço do app (teste, local)
}

/** Caminho do link quando ele é do iUser (ex.: "/loja-teste/bolo"); senão null. */
export function iuserPath(url: string): string | null {
    try {
        const u = new URL(url)
        return (u.protocol === 'https:' || u.protocol === 'http:') && isIuserHost(u.host) ? u.pathname : null
    } catch { return null }
}

export const isAllowedChatLink = (url: string) => isImageUrl(url) || iuserPath(url) !== null

/** Primeiro link que NÃO é imagem nem do iUser (para recusar o envio), ou null se está tudo certo. */
export function firstDisallowedLink(text: string): string | null {
    return urlsIn(text).find((u) => !isAllowedChatLink(u)) ?? null
}

/** Texto sem os links (para saber se a mensagem é só imagem/cartão). */
export const withoutUrls = (text: string) => (text || '').replace(URL_RE, '').trim()

const cache = new Map<string, Promise<{ kind: 'store' | 'profile' | 'product'; id: string } | null>>()
/** O que um link do iUser é (loja, perfil ou item), pelo banco. */
export function resolveIuserLink(path: string) {
    let p = cache.get(path)
    if (!p) {
        p = Promise.resolve(supabase.rpc('resolve_share_link', { p_path: path })).then(({ data }) => (data as any) || null, () => null)
        cache.set(path, p)
    }
    return p
}
