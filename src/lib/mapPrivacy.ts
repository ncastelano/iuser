// Perfis que NÃO querem aparecer no mapa (Radar): desligaram "Aparecer no mapa" ou "Mostrar no meu perfil".
// Se a pessoa não mostra a localização no perfil, ela não aparece em outros lugares também.
import { supabase } from '@/lib/supabase/client'

export async function getProfilesHiddenFromMap(ownerIds: (string | null | undefined)[]): Promise<Set<string>> {
    const ids = Array.from(new Set(ownerIds.filter((x): x is string => !!x)))
    if (ids.length === 0) return new Set()
    const { data } = await supabase
        .from('profiles')
        .select('id')
        .in('id', ids)
        .or('show_on_map.eq.false,show_location.eq.false')
    return new Set((data || []).map((p: any) => p.id))
}
