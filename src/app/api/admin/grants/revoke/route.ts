// app/api/admin/grants/revoke/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'

// Encerra agora um plano concedido de graça (Admin → Concedidos). Planos pagos (Asaas) não passam por aqui.
export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

    const { subscriptionId } = await req.json()
    const { data: sub } = await supabaseAdmin.from('subscriptions').select('id, source, status, granted_reason').eq('id', subscriptionId).maybeSingle()
    if (!sub) return NextResponse.json({ error: 'Concessão não encontrada' }, { status: 404 })
    if (sub.source === 'asaas') return NextResponse.json({ error: 'Esse plano é pago, não concedido' }, { status: 400 })

    const note = `[encerrado pelo admin em ${new Date().toLocaleDateString('pt-BR')}]`
    const { error } = await supabaseAdmin
        .from('subscriptions')
        .update({ status: 'canceled', current_period_end: new Date().toISOString(), granted_reason: [sub.granted_reason, note].filter(Boolean).join(' ') })
        .eq('id', subscriptionId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
}
