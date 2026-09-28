// app/api/employee/my-tasks/route.ts
//
// Versão autenticada de /api/courier/[token] — em vez de um link mágico
// sem login, resolve o "entregador" pela própria conta iUser (employees.
// user_id). Uma pessoa pode ser funcionária de mais de uma loja, então
// devolve uma lista agrupada por loja, não um objeto só.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getAuthedUser } from '@/lib/adminAuth'

export async function GET(req: Request) {
    const user = await getAuthedUser(req)
    if (!user) {
        return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const { data: employeeRows } = await supabaseAdmin
        .from('employees')
        .select('id, name, store_id')
        .eq('user_id', user.id)
        .eq('is_active', true)

    if (!employeeRows || employeeRows.length === 0) {
        return NextResponse.json({ jobs: [] })
    }

    const storeIds = [...new Set(employeeRows.map((e) => e.store_id))]
    const { data: stores } = await supabaseAdmin
        .from('stores')
        .select('id, name, address, store_lat, store_lng')
        .in('id', storeIds)
    const storeById = new Map((stores || []).map((s) => [s.id, s]))

    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)

    const jobs = await Promise.all(
        employeeRows.map(async (employee) => {
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

            const store = storeById.get(employee.store_id)
            return {
                employeeId: employee.id,
                storeId: employee.store_id,
                storeName: store?.name || 'Loja',
                storeAddress: store?.address || null,
                storeLat: store?.store_lat ?? null,
                storeLng: store?.store_lng ?? null,
                stops,
            }
        })
    )

    return NextResponse.json({ jobs })
}
