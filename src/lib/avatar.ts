import { SupabaseClient } from '@supabase/supabase-js'

export function getAvatarUrl(supabase: SupabaseClient, avatarPath: string | null | undefined): string | undefined {
    if (!avatarPath) return undefined
    if (avatarPath.startsWith('http')) return avatarPath
    return supabase.storage.from('avatars').getPublicUrl(avatarPath).data.publicUrl
}

/** O arquivo da foto de perfil se chama `<id do perfil>-<timestamp>.<ext>`. Cópias de foto (ex: no agendamento)
 *  nem sempre são do `customer_id`; o dono real da foto — e portanto a borda que combina com ela — vem do nome. */
export function avatarOwnerIdFromUrl(url: string | null | undefined): string | null {
    if (!url) return null
    const m = url.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-\d+\.[a-z0-9]+(?:\?.*)?$/i)
    return m ? m[1] : null
}
