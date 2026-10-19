// Endereço próprio de imagens: `<site>/img/<bucket>/<caminho>`. A Vercel busca o arquivo no Storage do Supabase UMA vez
// (rewrite em next.config.js) e guarda a cópia no cache dela; as visualizações seguintes saem da Vercel e não contam
// no Cached Egress do Supabase (cota do plano gratuito). Os arquivos continuam no Supabase; nada muda no banco de arquivos.
//
// NEXT_PUBLIC_IMAGE_BASE vem do next.config.js (produção = https://www.iuser.com.br, preview = URL da branch, local = vazio).
// Vazio = devolve o link direto do Supabase (desenvolvimento local, ou se o proxy for desligado). O valor é SEMPRE absoluto:
// links de foto são gravados no banco e usados por push, e-mail e app nativo, onde um caminho relativo não funciona.
const BASE = (process.env.NEXT_PUBLIC_IMAGE_BASE || '').replace(/\/+$/, '')
const PUBLIC_PREFIX = '/storage/v1/object/public/'

/** Converte um link público do Storage do projeto atual em link do proxy. Qualquer outro link volta igual. */
export function proxyImageUrl(url: string, base: string = BASE, supabaseUrl: string = process.env.NEXT_PUBLIC_SUPABASE_URL || ''): string {
    if (!url || !base) return url
    const root = supabaseUrl.replace(/\/+$/, '') + PUBLIC_PREFIX
    if (!supabaseUrl || !url.startsWith(root)) return url
    return `${base.replace(/\/+$/, '')}/img/${url.slice(root.length)}`
}
