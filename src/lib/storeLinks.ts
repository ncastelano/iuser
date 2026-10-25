// Links da loja: texto + endereço, escritos pelo dono e mostrados sob a descrição da página da loja (coluna `stores.links`, até 8).
// A mesma regra vale no banco (store_links_valid): só http(s), texto até 40 e endereço até 300 caracteres.
export interface StoreLink { label: string; url: string }

export const MAX_STORE_LINKS = 8
export const MAX_LABEL = 40
export const MAX_URL = 300

/** Aceita "meusite.com.br/menu" ou o link completo; devolve null se não der para montar um link http(s) seguro. */
export function normalizeStoreLink(label: string, url: string): StoreLink | null {
    const text = (label || '').replace(/\s+/g, ' ').trim()
    let raw = (url || '').trim()
    if (!text || !raw || text.length > MAX_LABEL) return null
    if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) raw = `https://${raw}`
    let u: URL
    try { u = new URL(raw) } catch { return null }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    if (!u.hostname.includes('.') || /\s/.test(raw)) return null
    const out = u.href
    if (out.length > MAX_URL) return null
    return { label: text, url: out }
}

/** Lê o que vem do banco (jsonb) com segurança: ignora o que não for um link válido. */
export function sanitizeStoreLinks(input: unknown): StoreLink[] {
    if (!Array.isArray(input)) return []
    const out: StoreLink[] = []
    for (const it of input) {
        if (out.length >= MAX_STORE_LINKS) break
        if (it && typeof it === 'object') {
            const l = normalizeStoreLink(String((it as any).label ?? ''), String((it as any).url ?? ''))
            if (l) out.push(l)
        }
    }
    return out
}

/** Linhas do formulário → links prontos. Linhas totalmente vazias são ignoradas; linha pela metade ou inválida devolve o erro. */
export function linksFromRows(rows: { label: string; url: string }[]): { ok: true; links: StoreLink[] } | { ok: false; error: string } {
    const links: StoreLink[] = []
    for (const [i, r] of rows.entries()) {
        if (!r.label.trim() && !r.url.trim()) continue
        const l = normalizeStoreLink(r.label, r.url)
        if (!l) return { ok: false, error: `Link ${i + 1}: escreva o texto (até ${MAX_LABEL} letras) e um endereço válido, como meusite.com.br.` }
        links.push(l)
    }
    if (links.length > MAX_STORE_LINKS) return { ok: false, error: `No máximo ${MAX_STORE_LINKS} links.` }
    return { ok: true, links }
}
