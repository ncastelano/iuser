// Grava campos do PRÓPRIO perfil (profiles) pelo navegador.
//
// Por que não `.upsert()`: desde a trava de dados privados (Etapa 2.7.1, migration 20261105), `anon`/`authenticated` não têm SELECT nas colunas
// privadas (endereço, e-mail, CPF/CNPJ, telefone, coordenadas...) e `INSERT ... ON CONFLICT DO UPDATE` exige SELECT nelas: o upsert devolve
// 403 "permission denied for table profiles". `UPDATE` e `INSERT` simples, nas colunas liberadas (publicColumns / lista de escrita da migration),
// funcionam. Também não peça de volta (`.select()`) coluna privada depois de gravar: leia pela view `my_profile`.
//
// O cadastro cria a linha do perfil por gatilho no banco, então o caminho normal é o UPDATE; o INSERT cobre o caso de a linha ainda não existir.
import type { SupabaseClient } from '@supabase/supabase-js'

export async function saveOwnProfile(
    client: SupabaseClient,
    userId: string,
    fields: Record<string, unknown>,
): Promise<{ error: { message: string; code?: string } | null }> {
    const { id: _ignored, ...values } = fields
    const { data, error } = await client.from('profiles').update(values).eq('id', userId).select('id')
    if (error) return { error }
    if (data && data.length > 0) return { error: null }
    const { error: insertError } = await client.from('profiles').insert({ ...values, id: userId })
    return { error: insertError }
}
