// app/api/stores/delete/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getAuthedUser } from '@/lib/adminAuth'
import { verifyUserPassword } from '@/lib/verifyPassword'

export async function POST(req: Request) {
    const user = await getAuthedUser(req)
    if (!user?.email) {
        return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const { storeId, password } = await req.json().catch(() => ({}))
    if (!storeId || !password) {
        return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 })
    }

    const { data: store } = await supabaseAdmin
        .from('stores')
        .select('id, owner_id')
        .eq('id', storeId)
        .maybeSingle()

    if (!store || store.owner_id !== user.id) {
        return NextResponse.json({ error: 'Loja não encontrada' }, { status: 404 })
    }

    if (!(await verifyUserPassword(user.email, password))) {
        return NextResponse.json({ error: 'Senha incorreta' }, { status: 403 })
    }

    const { count: activeOrders } = await supabaseAdmin
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('store_id', store.id)
        .in('status', ['pending', 'preparing', 'ready'])

    if ((activeOrders || 0) > 0) {
        return NextResponse.json(
            { error: 'Essa loja ainda tem pedidos em andamento. Finalize ou cancele antes de excluir.' },
            { status: 409 }
        )
    }

    const { error } = await supabaseAdmin.rpc('admin_delete_store', { p_store_id: store.id })
    if (error) {
        console.error('Erro ao excluir loja:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
}
