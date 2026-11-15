// GET /api/dev/observer — só no ambiente LOCAL de desenvolvimento: o que a página /tres-telas precisa para acompanhar a pizzaria:
// os motoboys (com o link "minhas entregas" de cada um e quantas entregas estão na mochila agora), a fila de entregas e as últimas linhas
// do log do simulador. Em qualquer outro ambiente: 404.
import { NextResponse } from 'next/server'
import { readFile } from 'node:fs/promises'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { DEV_FEATURED_CLIENT_EMAIL, DEV_STORE_SLUG, isLocalDevOnly } from '@/lib/devOnly'

export async function GET() {
    if (!isLocalDevOnly()) return new NextResponse(null, { status: 404 })
    const { data: store } = await supabaseAdmin.from('stores').select('id, name').eq('storeSlug', DEV_STORE_SLUG).maybeSingle()
    if (!store) return NextResponse.json({ error: 'loja não encontrada' }, { status: 404 })

    const [{ data: emps }, { data: active }, { data: delivered }, { data: ready }] = await Promise.all([
        supabaseAdmin.from('employees').select('id, name, access_token').eq('store_id', store.id).eq('is_active', true).order('created_at'),
        supabaseAdmin.from('delivery_assignments').select('employee_id, status').eq('store_id', store.id).in('status', ['pending', 'in_transit']),
        supabaseAdmin.from('delivery_assignments').select('employee_id').eq('store_id', store.id).eq('status', 'delivered').gte('delivered_at', new Date(Date.now() - 3600_000).toISOString()),
        supabaseAdmin.from('orders').select('id').eq('store_id', store.id).eq('status', 'ready').eq('delivery_option', 'entrega'),
    ])
    const couriers = (emps || []).map((e: any) => ({
        id: e.id, name: e.name, token: e.access_token,
        stops: (active || []).filter((a: any) => a.employee_id === e.id).length,
        deliveredLastHour: (delivered || []).filter((a: any) => a.employee_id === e.id).length,
    }))

    // Motoristas iUser (seed-entregadores.mjs): quantas entregas da loja estão na mochila agora e quantas já fizeram na última hora
    const { data: authList } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 })
    const drvUsers = (authList?.users || []).filter((u) => /^entregador-[a-z]+@staging\.iuser\.test$/.test(u.email || ''))
    const drvIds = drvUsers.map((u) => u.id)
    const [{ data: veh }, { data: prof }, { data: rides }, { data: ridesDone }] = drvIds.length ? await Promise.all([
        supabaseAdmin.from('driver_vehicles').select('driver_id, delivery_capacity').in('driver_id', drvIds),
        supabaseAdmin.from('profiles').select('id, name').in('id', drvIds),
        supabaseAdmin.from('ride_requests').select('driver_id').in('driver_id', drvIds).eq('status', 'accepted').not('order_id', 'is', null),
        supabaseAdmin.from('ride_requests').select('driver_id').in('driver_id', drvIds).eq('status', 'completed').not('order_id', 'is', null).gte('ride_started_at', new Date(Date.now() - 3600_000).toISOString()),
    ]) : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }] as any
    const drivers = drvUsers.map((u) => ({
        id: u.id, key: (u.email || '').split('@')[0].replace('entregador-', ''), name: (prof || []).find((p: any) => p.id === u.id)?.name || u.email,
        capacity: (veh || []).find((v: any) => v.driver_id === u.id)?.delivery_capacity ?? 1,
        stops: (rides || []).filter((r: any) => r.driver_id === u.id).length,
        deliveredLastHour: (ridesDone || []).filter((r: any) => r.driver_id === u.id).length,
    }))

    // A cliente em destaque (Gabriela): os pedidos dela em andamento nesta loja, para o roteiro do TEATRO saber em que etapa estão
    const feat = (authList?.users || []).find((u) => u.email === DEV_FEATURED_CLIENT_EMAIL)
    const { data: featOrders } = feat ? await supabaseAdmin.from('orders').select('id, status, delivery_option, created_at').eq('store_id', store.id).eq('buyer_id', feat.id).in('status', ['pending', 'preparing', 'ready']).order('created_at') : { data: [] as any[] }

    const { count: openOffers } = await supabaseAdmin.from('ride_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending').not('order_id', 'is', null).eq('store_id', store.id)

    let log: string[] = []
    try {
        const raw = await readFile(process.env.PIZZARIA_SIM_LOG || '/tmp/sim-pizzaria.log', 'utf8')
        log = raw.split('\n').filter(Boolean).slice(-60)
    } catch { /* simulador ainda não rodou */ }

    return NextResponse.json({ store: store.name, couriers, drivers, openOffers: openOffers || 0, featured: featOrders || [], readyWaiting: (ready || []).length, log })
}
