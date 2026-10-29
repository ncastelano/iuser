// app/api/admin/delivery-disputes/route.ts
//
// Admin → Disputas: as ENTREGAS CONTESTADAS pelos clientes (com as evidências guardadas no banco: código usado, hora, distância, foto) e os REPASSES contestados pelas lojas.
//   action 'list'          → contestações abertas (e as decididas há pouco) + repasses contestados
//   action 'decide'        → decide uma contestação (rejected | driver_at_fault | store_at_fault | redelivery) — o banco cria a dívida do entregador, o reembolso pendente e os avisos
//   action 'decide_due'    → resolve um repasse contestado (confirmed | waived)
// Só o administrador geral; as funções admin_* do banco só aceitam a chamada do servidor.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'

const UUID = /^[0-9a-f-]{36}$/i

export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    const body = await req.json().catch(() => ({}))

    if (body.action === 'decide') {
        const id = String(body.id || '')
        if (!UUID.test(id)) return NextResponse.json({ error: 'Contestação inválida' }, { status: 400 })
        const { error } = await supabaseAdmin.rpc('admin_decide_dispute', { p_dispute: id, p_outcome: String(body.outcome || ''), p_note: String(body.note || '').slice(0, 500), p_admin: admin.id })
        if (error) return NextResponse.json({ error: error.message }, { status: 400 })
        return NextResponse.json({ success: true })
    }
    if (body.action === 'decide_due') {
        const id = String(body.id || '')
        if (!UUID.test(id)) return NextResponse.json({ error: 'Pendência inválida' }, { status: 400 })
        const { error } = await supabaseAdmin.rpc('admin_decide_due', { p_due: id, p_decision: String(body.decision || ''), p_note: String(body.note || '').slice(0, 500), p_admin: admin.id })
        if (error) return NextResponse.json({ error: error.message }, { status: 400 })
        return NextResponse.json({ success: true })
    }

    // list
    const since = new Date(Date.now() - 14 * 86400000).toISOString()
    const [{ data: disputes, error }, { data: dues }] = await Promise.all([
        supabaseAdmin.from('delivery_disputes').select('*').or(`status.eq.open,decided_at.gte.${since}`).order('created_at', { ascending: false }).limit(100),
        supabaseAdmin.from('store_dues').select('id, kind, store_id, driver_id, order_id, amount, note, status, declared_at, declare_method, created_at').eq('status', 'disputed').order('created_at', { ascending: false }).limit(100),
    ])
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const ids = Array.from(new Set([...(disputes || []).flatMap((d: any) => [d.customer_id, d.driver_id]), ...(dues || []).map((d: any) => d.driver_id)].filter(Boolean)))
    const storeIds = Array.from(new Set([...(disputes || []).map((d: any) => d.store_id), ...(dues || []).map((d: any) => d.store_id)].filter(Boolean)))
    const [{ data: profs }, { data: stores }] = await Promise.all([
        ids.length ? supabaseAdmin.from('profiles').select('id, name, "profileSlug"').in('id', ids) : Promise.resolve({ data: [] as any[] }),
        storeIds.length ? supabaseAdmin.from('stores').select('id, name').in('id', storeIds) : Promise.resolve({ data: [] as any[] }),
    ])
    const who = new Map((profs || []).map((p: any) => [p.id, `${p.name || 'Perfil'}${p.profileSlug ? ` (@${p.profileSlug})` : ''}`]))
    const shop = new Map((stores || []).map((s: any) => [s.id, s.name]))
    const photoUrl = (path: string | null) => (path ? supabaseAdmin.storage.from('delivery-proofs').getPublicUrl(path).data.publicUrl : null)

    return NextResponse.json({
        disputes: (disputes || []).map((d: any) => ({
            id: d.id, orderId: d.order_id, reason: d.reason, note: d.note, status: d.status, createdAt: d.created_at,
            customer: who.get(d.customer_id) || 'Cliente', driver: d.driver_id ? who.get(d.driver_id) || 'Entregador' : null, store: shop.get(d.store_id) || 'Loja',
            evidence: d.evidence, photo: photoUrl(d.evidence?.proof_photo ?? null), storeReply: d.store_reply, driverReply: d.driver_reply,
            outcome: d.outcome, decisionNote: d.decision_note, decidedAt: d.decided_at, refundAmount: d.refund_amount, refundStatus: d.refund_status, refundContested: d.refund_contested,
        })),
        dues: (dues || []).map((d: any) => ({ id: d.id, kind: d.kind, amount: d.amount, note: d.note, createdAt: d.created_at, declaredAt: d.declared_at, method: d.declare_method, driver: who.get(d.driver_id) || 'Entregador', store: shop.get(d.store_id) || 'Loja' })),
    })
}
