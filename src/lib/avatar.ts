import { SupabaseClient } from '@supabase/supabase-js'

export function getAvatarUrl(supabase: SupabaseClient, avatarPath: string | null | undefined) {
    if (!avatarPath) return null
    if (avatarPath.startsWith('http')) return avatarPath
    return supabase.storage.from('avatars').getPublicUrl(avatarPath).data.publicUrl
}
