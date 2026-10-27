// GET /api/dev/observer — só no ambiente LOCAL de desenvolvimento: o que a página /tres-telas precisa para acompanhar a pizzaria:
// os motoboys (com o link "minhas entregas" de cada um e quantas entregas estão na mochila agora), a fila de entregas e as últimas linhas
// do log do simulador. Em qualquer outro ambiente: 404.
import { NextResponse } from 'next/server'
import { readFile } from 'node:fs/promises'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { DEV_STORE_SLUG, isLocalDevOnly } from '@/lib/devOnly'

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

    let log: string[] = []
    try {
        const raw = await readFile(process.env.PIZZARIA_SIM_LOG || '/tmp/sim-pizzaria.log', 'utf8')
        log = raw.split('\n').filter(Boolean).slice(-60)
    } catch { /* simulador ainda não rodou */ }

    return NextResponse.json({ store: store.name, couriers, readyWaiting: (ready || []).length, log })
}
