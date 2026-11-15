// src/modules/missions/load.ts — lê as missões da loja no banco (só o dono consegue; o banco confere e já grava o que foi cumprido).
import { supabase } from '@/lib/supabase/client'
import { missionsFromRow, type StoreMissions } from './domain'

/** `null` = não deu para carregar (sem permissão, banco sem a migration...): a tela esconde o quadro, nunca mostra zero. */
export async function loadStoreMissions(storeId: string): Promise<StoreMissions | null> {
    const { data, error } = await supabase.rpc('get_store_missions', { p_store: storeId })
    if (error) return null
    return missionsFromRow(data)
}
