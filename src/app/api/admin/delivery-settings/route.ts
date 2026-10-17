// app/api/admin/delivery-settings/route.ts
//
// Salva as configurações globais da entrega iUser (Admin → Entregas). Só o administrador geral. A validação de coerência
// é do módulo delivery-settings (a mesma da tela) e o banco ainda tem constraints equivalentes; a escrita e a auditoria
// (admin_config_audit) acontecem juntas na RPC admin_update_delivery_settings.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'
import { validateDeliverySettings } from '@/modules/delivery-settings'

export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

    const body = await req.json().catch(() => ({}))
    const result = validateDeliverySettings(body && typeof body === 'object' ? body : {})
    if (!result.ok) {
        return NextResponse.json({ error: 'Configuração inválida', fields: result.errors }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin.rpc('admin_update_delivery_settings', { p_admin: admin.id, p_changes: result.values })
    if (error) {
        // constraint do banco (última barreira) ou chave não editável
        const status = error.code === '23514' || error.code === '22023' ? 400 : 500
        return NextResponse.json({ error: status === 400 ? 'Configuração inválida' : error.message, detail: error.message }, { status })
    }
    return NextResponse.json({ success: true, settings: data })
}
