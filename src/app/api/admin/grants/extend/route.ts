// app/api/admin/grants/extend/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'

// Soma dias ao fim de um plano concedido que ainda está ativo (Admin → Concedidos).
export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

    const { subscriptionId, days } = await req.json()
    const n = Math.round(Number(days))
    if (!Number.isFinite(n) || n < 1 || n > 3650) return NextResponse.json({ error: 'Dias inválidos (de 1 a 3650)' }, { status: 400 })

    const { data: sub } = await supabaseAdmin.from('subscriptions').select('id, source, status, current_period_end').eq('id', subscriptionId).maybeSingle()
    if (!sub) return NextResponse.json({ error: 'Concessão não encontrada' }, { status: 404 })
    if (sub.source === 'asaas') return NextResponse.json({ error: 'Esse plano é pago, não concedido' }, { status: 400 })
    if (sub.status !== 'active') return NextResponse.json({ error: 'Só dá pra estender uma concessão ativa' }, { status: 400 })

    const base = Math.max(Date.now(), sub.current_period_end ? new Date(sub.current_period_end).getTime() : 0)
    const newEnd = new Date(base + n * 86400000).toISOString()
    const { error } = await supabaseAdmin.from('subscriptions').update({ current_period_end: newEnd }).eq('id', subscriptionId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, endsAt: newEnd })
}
