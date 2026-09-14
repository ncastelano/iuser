// app/api/push/send-order-notification/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendPushToUser } from '@/lib/serverPush'

const webhookSecret = process.env.SUPABASE_WEBHOOK_SECRET

interface OrderPayload {
    id: string
    store_id: string
    buyer_id: string
    buyer_profile_slug: string | null
    total_amount: number
    status: string
}

export async function POST(req: Request) {
    try {
        // Chamada confiável vinda do Supabase Database Webhook (dispara no INSERT
        // direto do Postgres — funciona mesmo se o navegador de quem fez o pedido
        // fechar/navegar antes da chamada client-side terminar).
        const isTrustedWebhook = webhookSecret && req.headers.get('x-webhook-secret') === webhookSecret

        let order: OrderPayload

        if (isTrustedWebhook) {
            const payload = await req.json()
            const record = payload?.record
            if (!record?.id) {
                return NextResponse.json({ error: 'record inválido' }, { status: 400 })
            }
            order = record
        } else {
            const authHeader = req.headers.get('authorization') || ''
            const token = authHeader.replace('Bearer ', '')
            if (!token) {
                return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
            }

            const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
            if (authError || !user) {
                return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
            }

            const { orderId } = await req.json()
            if (!orderId) {
                return NextResponse.json({ error: 'orderId é obrigatório' }, { status: 400 })
            }

            const { data: fetchedOrder, error: orderError } = await supabaseAdmin
                .from('orders')
                .select('id, store_id, buyer_id, buyer_profile_slug, total_amount, status')
                .eq('id', orderId)
                .single()

            if (orderError || !fetchedOrder) {
                return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })
            }

            // Só quem fez o pedido pode disparar a notificação dele
            if (fetchedOrder.buyer_id !== user.id) {
                return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
            }

            order = fetchedOrder
        }

        if (order.status !== 'pending') {
            return NextResponse.json({ success: true, skipped: true })
        }

        const { data: store, error: storeError } = await supabaseAdmin
            .from('stores')
            .select('owner_id, name')
            .eq('id', order.store_id)
            .single()

        if (storeError || !store) {
            return NextResponse.json({ error: 'Loja não encontrada' }, { status: 404 })
        }

        const { sent } = await sendPushToUser(store.owner_id, {
            title: `Novo pedido em ${store.name}`,
            body: `${order.buyer_profile_slug ? '@' + order.buyer_profile_slug : 'Um cliente'} fez um pedido de R$ ${Number(order.total_amount).toFixed(2)}`,
            url: '/',
            tag: `order-${order.id}`,
        })

        return NextResponse.json({ success: true, sent })
    } catch (error: any) {
        console.error('Erro ao enviar push de pedido:', error)
        return NextResponse.json({ error: 'Erro ao enviar notificação' }, { status: 500 })
    }
}
