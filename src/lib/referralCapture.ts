import type { SupabaseClient } from '@supabase/supabase-js'

// Qualquer link de loja, perfil, produto/serviço ou publicação que alguém
// compartilha funciona como convite: se quem abre o link ainda não é
// usuário do iUser e se cadastra, vira indicado de quem é dono da página
// (loja ou perfil) - não só de quem manda um /convite explícito. "Primeiro
// link vale": /api/set-referral-cookie não sobrescreve um convite que a
// pessoa já carregava de uma visita anterior.
export async function captureReferral(
    supabase: SupabaseClient,
    owner: { profileSlug?: string | null; ownerId?: string | null }
) {
    try {
        let profileSlug = owner.profileSlug || null
        if (!profileSlug && owner.ownerId) {
            const { data } = await supabase
                .from('profiles')
                .select('profileSlug')
                .eq('id', owner.ownerId)
                .maybeSingle()
            profileSlug = data?.profileSlug || null
        }
        if (!profileSlug) return

        await fetch('/api/set-referral-cookie', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ referralSlug: profileSlug }),
        })
    } catch {
        // Nunca deve atrapalhar a navegação da pessoa por causa disso.
    }
}
