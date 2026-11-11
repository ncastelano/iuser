// src/lib/mediaAssets.ts
//
// Registro de uploads (migration 20261130000019): depois de cada envio ao Storage, o ponto central (lib/supabase/client.ts) avisa o banco, que anota o arquivo em
// media_assets com o tamanho e o tipo LIDOS DO STORAGE (nunca do que o navegador informa). É contabilidade: o envio NUNCA depende dela — qualquer falha é engolida.
// Recebe o cliente por argumento (não importa lib/supabase/client, para não criar ciclo).

type RpcClient = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }> }

/** O erro quer dizer "a função não existe neste banco" (migration ainda não aplicada)? Aí paramos de tentar nesta sessão. */
export function isMissingFunction(error: { code?: string; message?: string } | null | undefined): boolean {
    if (!error) return false
    return error.code === 'PGRST202' || error.code === '42883' || /could not find the function|function .* does not exist/i.test(error.message || '')
}

let disabled = false

/** Anota um arquivo recém-enviado. Devolve o id do registro, ou null (bucket fora do catálogo, falha, migration ausente). Nunca lança. */
export async function registerMediaAsset(client: RpcClient, bucket: string, path: string): Promise<string | null> {
    if (disabled || !bucket || !path) return null
    try {
        const { data, error } = await client.rpc('register_media_asset', { p_bucket: bucket, p_path: path })
        if (error) {
            if (isMissingFunction(error)) disabled = true
            return null
        }
        return typeof data === 'string' ? data : null
    } catch {
        return null
    }
}
