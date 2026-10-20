// Redes sociais de um perfil/loja: transforma o que a pessoa digitou (@usuario, usuario ou o link inteiro) num link seguro.
// Só aceita endereços https dos sites certos de cada rede (nunca `javascript:` nem outro domínio). No banco existem `instagram`, `youtube`, `facebook` e `x`
// (migration 20261109); `github` já funciona aqui e entra quando houver coluna (nasce PRIVADA: ver "Exposição de dados" no CLAUDE.md).
export type SocialKind = 'instagram' | 'youtube' | 'facebook' | 'x' | 'github'

export interface SocialLink {
    kind: SocialKind
    label: string
    url: string
}

export const SOCIAL_ORDER: SocialKind[] = ['instagram', 'youtube', 'facebook', 'x', 'github']
export const SOCIAL_LABELS: Record<SocialKind, string> = { instagram: 'Instagram', youtube: 'YouTube', facebook: 'Facebook', x: 'X', github: 'GitHub' }

const HOSTS: Record<SocialKind, RegExp> = {
    instagram: /^(www\.)?instagram\.com$/i,
    youtube: /^((www|m)\.)?youtube\.com$|^youtu\.be$/i,
    facebook: /^((www|m|web)\.)?facebook\.com$|^fb\.com$/i,
    x: /^((www|mobile)\.)?(x|twitter)\.com$/i,
    github: /^(www\.)?github\.com$/i,
}
const HANDLE = /^[A-Za-z0-9._-]{1,50}$/

function fromUrl(kind: SocialKind, raw: string): string | null {
    let u: URL
    try { u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`) } catch { return null }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    if (!HOSTS[kind].test(u.hostname)) return null
    u.protocol = 'https:'
    u.hash = ''
    return u.toString().replace(/\/$/, '')
}

/** Aceita "@usuario", "usuario", "instagram.com/usuario" ou o link completo. Devolve null se não der para montar um link seguro. */
export function normalizeSocialUrl(kind: SocialKind, value: string | null | undefined): string | null {
    const v = (value || '').trim()
    if (!v) return null
    // link (com ou sem https://): precisa ser do site da rede
    if (/^https?:\/\//i.test(v) || /^(www\.|m\.|mobile\.)?[a-z0-9-]+\.[a-z]{2,}\//i.test(v)) return fromUrl(kind, v)
    const handle = v.replace(/^@/, '')
    if (!HANDLE.test(handle)) return null
    switch (kind) {
        case 'instagram': return `https://instagram.com/${handle}`
        case 'youtube': return `https://youtube.com/@${handle}`
        case 'facebook': return `https://facebook.com/${handle}`
        case 'x': return `https://x.com/${handle}`
        case 'github': return `https://github.com/${handle}`
    }
}

export function buildSocialLinks(fields: Partial<Record<SocialKind, string | null | undefined>>): SocialLink[] {
    const out: SocialLink[] = []
    for (const kind of SOCIAL_ORDER) {
        const url = normalizeSocialUrl(kind, fields[kind])
        if (url) out.push({ kind, label: SOCIAL_LABELS[kind], url })
    }
    return out
}
