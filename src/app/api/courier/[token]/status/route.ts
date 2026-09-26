// app/api/courier/[token]/status/route.ts
//
// Marca o progresso de uma entrega (peguei/entreguei) a partir da página
// pública do entregador - autorização é só o token do link (o mesmo que
// resolve o entregador em GET /api/courier/[token]), sem login.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

const ALLOWED_STATUSES = ['in_transit', 'delivered'] as const
type AllowedStatus = (typeof ALLOWED_STATUSES)[number]

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
    const { token } = await params
    if (!token) {
        return NextResponse.json({ error: 'Link inválido' }, { status: 400 })
    }

    const { assignmentId, status } = await req.json().catch(() => ({}))
    if (!assignmentId || !ALLOWED_STATUSES.includes(status)) {
        return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 })
    }

    const { data: employee } = await supabaseAdmin
        .from('employees')
        .select('id')
        .eq('access_token', token)
        .eq('is_active', true)
        .maybeSingle()
    if (!employee) {
        return NextResponse.json({ error: 'Link inválido ou expirado' }, { status: 404 })
    }

    const { data: assignment } = await supabaseAdmin
        .from('delivery_assignments')
        .select('id, employee_id, checkout_id, picked_up_at, delivered_at')
        .eq('id', assignmentId)
        .maybeSingle()
    if (!assignment) {
        return NextResponse.json({ error: 'Entrega não encontrada' }, { status: 404 })
    }
    if (assignment.employee_id !== employee.id) {
        return NextResponse.json({ error: 'Essa entrega não é sua' }, { status: 403 })
    }

    const now = new Date().toISOString()
    const nextStatus = status as AllowedStatus

    // O entregador só pode "pegar" o pedido depois que a loja marcar como
    // pronto - senão ele sai da loja com um pedido que ainda nem foi
    // preparado. "Entregar" não tem essa trava (já está com ele de qualquer
    // forma nesse ponto).
    if (nextStatus === 'in_transit') {
        const { data: order } = await supabaseAdmin
            .from('orders')
            .select('status')
            .eq('checkout_id', assignment.checkout_id)
            .maybeSingle()
        if (order && order.status !== 'ready') {
            return NextResponse.json({ error: 'A loja ainda não marcou esse pedido como pronto.' }, { status: 409 })
        }
    }
    const update: Record<string, any> = { status: nextStatus }
    if (nextStatus === 'in_transit') {
        update.picked_up_at = assignment.picked_up_at || now
    } else if (nextStatus === 'delivered') {
        update.picked_up_at = assignment.picked_up_at || now
        update.delivered_at = now
    }

    const { error } = await supabaseAdmin.from('delivery_assignments').update(update).eq('id', assignmentId)
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, status: nextStatus, pickedUpAt: update.picked_up_at, deliveredAt: update.delivered_at || assignment.delivered_at || null })
}
