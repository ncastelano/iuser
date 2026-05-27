import { SupabaseClient } from '@supabase/supabase-js'

export function getAvatarUrl(supabase: SupabaseClient, avatarPath: string | null | undefined): string | undefined {
    if (!avatarPath) return undefined
    if (avatarPath.startsWith('http')) return avatarPath
    return supabase.storage.from('avatars').getPublicUrl(avatarPath).data.publicUrl
}
