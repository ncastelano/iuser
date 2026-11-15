// src/lib/myUploadLimits.ts — lê do banco os limites de envio de CADA tipo e quanto quem está logado já usou (get_my_upload_limits). Só o app/navegador usa.
import { supabase } from '@/lib/supabase/client'
import { limitFromRow, type UploadLimit } from '@/modules/uploads/limits'

/** Todos os tipos, indexados pelo `kind` (ex.: limits.digital_music). Falha = null (a tela esconde o cartão; o servidor continua decidindo). */
export async function fetchMyUploadLimits(): Promise<Record<string, UploadLimit> | null> {
    const { data, error } = await supabase.rpc('get_my_upload_limits')
    if (error || !data) return null
    return Object.fromEntries((data as Record<string, any>[]).map((r) => [r.kind, limitFromRow(r)]))
}
