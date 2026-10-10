// Como mostrar uma pessoa: sempre pelo @ do perfil (nomes podem ser enormes e repetidos); o nome só aparece quando
// a pessoa não tem @ conhecido.
export function profileLabel(p?: { profileSlug?: string | null; profile_slug?: string | null; name?: string | null } | null, fallback = 'Usuário'): string {
    const slug = p?.profileSlug || p?.profile_slug
    if (slug) return `@${slug}`
    return p?.name?.trim() || fallback
}
