// src/modules/points/load.ts — lê o Placar do perfil no banco (get_profile_scoreboard: só números, só logado).
import { supabase } from '@/lib/supabase/client'
import { scoreboardFromRow, type Scoreboard } from './domain'

/** `null` = não deu para carregar ou não há placar (a tela esconde o bloco, nunca mostra zeros inventados) */
export async function loadScoreboard(profileId?: string): Promise<Scoreboard | null> {
    const { data, error } = await supabase.rpc('get_profile_scoreboard', { p_profile: profileId ?? null })
    if (error) return null
    return scoreboardFromRow(data)
}
