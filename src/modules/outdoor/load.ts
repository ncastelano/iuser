// src/modules/outdoor/load.ts — busca o Outdoor no banco (get_outdoor) com um cache curto por tipo.
import { supabase } from '@/lib/supabase/client'
import { proxyImageUrl } from '@/lib/imageProxy'
import { OUTDOOR_INFO, outdoorFromRow, type OutdoorItem, type OutdoorKind } from './domain'

const TTL_MS = 60_000
const cache = new Map<string, { at: number; items: OutdoorItem[] }>()
const inflight = new Map<string, Promise<OutdoorItem[] | null>>()

/** Os melhores do tipo, do maior pro menor ponto. `null` = não deu para carregar (a tela esconde o Outdoor, nunca mostra "vazio"). */
export async function loadOutdoor(kind: OutdoorKind, limit = 12): Promise<OutdoorItem[] | null> {
    const key = `${kind}:${limit}`
    const hit = cache.get(key)
    if (hit && Date.now() - hit.at < TTL_MS) return hit.items
    const running = inflight.get(key)
    if (running) return running
    const p = (async () => {
        const { data, error } = await supabase.rpc('get_outdoor', { p_kind: kind, p_limit: limit })
        if (error || !Array.isArray(data)) return null
        const items = data.map(outdoorFromRow).filter((i): i is OutdoorItem => !!i)
        cache.set(key, { at: Date.now(), items })
        return items
    })().finally(() => inflight.delete(key))
    inflight.set(key, p)
    return p
}

/** Link público da imagem de um item do Outdoor (a coluna guarda o caminho no bucket do tipo, ou já um link) */
export function outdoorImageUrl(kind: OutdoorKind, image: string | null): string | null {
    if (!image) return null
    if (image.startsWith('http')) return proxyImageUrl(image)
    return supabase.storage.from(OUTDOOR_INFO[kind].bucket).getPublicUrl(image).data.publicUrl
}

/** Como o tipo pontua (para a folha "Como pontua"): lojas/serviços/produtos/imóveis vêm de outdoor_rules; pessoas, de point_rules */
export async function loadOutdoorRules(kind: OutdoorKind): Promise<{ label: string; points: number }[] | null> {
    const { data, error } = await supabase.rpc('get_outdoor_rules', { p_kind: kind })
    if (error || !Array.isArray(data)) return null
    return data.map((r: any) => ({ label: String(r.label), points: Number(r.points) || 0 }))
}
