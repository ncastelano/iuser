// app/api/admin/delivery-settings/load/route.ts
//
// Lê as configurações globais da entrega e o histórico de alterações. Só o administrador geral:
// a tabela não é legível pelo app (a policy de leitura foi removida na migration 20261096).
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'

export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

    const [{ data: settings, error }, { data: audit }, { data: tariffs }] = await Promise.all([
        supabaseAdmin.from('delivery_dispatch_settings').select('*').eq('id', true).maybeSingle(),
        supabaseAdmin.from('admin_config_audit').select('id, setting, old_value, new_value, changed_by, changed_at')
            .eq('scope', 'delivery_dispatch_settings').order('changed_at', { ascending: false }).limit(30),
        supabaseAdmin.from('platform_tariffs').select('vehicle_kind, base_distance_km, base_fee, price_per_km, extra_fee_objeto').eq('vehicle_kind', 'moto').maybeSingle(),
    ])
    if (error || !settings) return NextResponse.json({ error: error?.message || 'Configuração não encontrada' }, { status: 500 })

    const ids = Array.from(new Set((audit || []).map((a) => a.changed_by).filter(Boolean))) as string[]
    const { data: profiles } = ids.length ? await supabaseAdmin.from('profiles').select('id, name, profileSlug').in('id', ids) : { data: [] as { id: string; name: string | null; profileSlug: string | null }[] }
    const who = new Map((profiles || []).map((p) => [p.id, p.profileSlug ? `@${p.profileSlug}` : p.name || 'Administrador']))

    return NextResponse.json({
        settings,
        tariff: tariffs || null,
        audit: (audit || []).map((a) => ({ ...a, changed_by_label: a.changed_by ? who.get(a.changed_by) || 'Administrador' : 'Sistema' })),
    })
}
