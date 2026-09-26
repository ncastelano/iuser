// app/api/courier/[token]/route.ts
//
// Endpoint público (sem login) pro link "minhas entregas" de um entregador
// próprio da loja (funcionário ou freelancer/bico) - mesmo modelo do
// acompanhamento de corrida (/api/ride-share/[id]): só quem tem o link (o
// access_token, imprevisível) consegue ver. Nunca expõe telefone nem linha
// crua do banco.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
    const { token } = await params
    if (!token) {
        return NextResponse.json({ error: 'Link inválido' }, { status: 400 })
    }

    const { data: employee } = await supabaseAdmin
        .from('employees')
        .select('id, name, store_id')
        .eq('access_token', token)
        .eq('is_active', true)
        .maybeSingle()

    if (!employee) {
        return NextResponse.json({ error: 'Link inválido ou expirado' }, { status: 404 })
    }

    const { data: store } = await supabaseAdmin
        .from('stores')
        .select('name, address, store_lat, store_lng')
        .eq('id', employee.store_id)
        .maybeSingle()

    // Só o que ainda está em aberto, mais o que foi entregue hoje (senão a
    // página de um entregador antigo acumula meses de histórico entregue).
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)

    const { data: assignments } = await supabaseAdmin
        .from('delivery_assignments')
        .select('id, checkout_id, sequence_order, status, picked_up_at, delivered_at')
        .eq('employee_id', employee.id)
        .order('sequence_order')

    const relevant = (assignments || []).filter(
        (a) => a.status !== 'delivered' || (a.delivered_at && new Date(a.delivered_at) >= startOfToday)
    )

    const checkoutIds = [...new Set(relevant.map((a) => a.checkout_id))]
    let ordersByCheckoutId = new Map<string, any>()
    if (checkoutIds.length > 0) {
        const { data: orders } = await supabaseAdmin
            .from('orders')
            .select('checkout_id, buyer_name, status, payment_method, cash_change_for, total_amount, delivery_fee, delivery_address, delivery_lat, delivery_lng, order_items(product_name, quantity)')
            .in('checkout_id', checkoutIds)
        ordersByCheckoutId = new Map((orders || []).map((o) => [o.checkout_id, o]))
    }

    const stops = relevant
        .map((a) => {
            const order = ordersByCheckoutId.get(a.checkout_id)
            if (!order) return null
            return {
                assignmentId: a.id,
                sequence: a.sequence_order,
                status: a.status,
                orderStatus: order.status,
                address: order.delivery_address,
                lat: order.delivery_lat,
                lng: order.delivery_lng,
                buyerName: order.buyer_name,
                paymentMethod: order.payment_method,
                cashChangeFor: order.cash_change_for,
                totalAmount: order.total_amount,
                deliveryFee: order.delivery_fee,
                items: (order.order_items || []).map((i: any) => ({ productName: i.product_name, quantity: i.quantity })),
                pickedUpAt: a.picked_up_at,
                deliveredAt: a.delivered_at,
            }
        })
        .filter((s): s is NonNullable<typeof s> => s !== null)

    return NextResponse.json({
        employee: { name: employee.name },
        store: {
            name: store?.name || 'Loja',
            address: store?.address || null,
            lat: store?.store_lat ?? null,
            lng: store?.store_lng ?? null,
        },
        stops,
    })
}
