// app/api/push/unsubscribe/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function POST(req: Request) {
    try {
        const authHeader = req.headers.get('authorization') || ''
        const token = authHeader.replace('Bearer ', '')
        if (!token) {
            return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
        }

        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
        if (authError || !user) {
            return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
        }

        const { endpoint } = await req.json()
        if (!endpoint) {
            return NextResponse.json({ error: 'endpoint é obrigatório' }, { status: 400 })
        }

        const { error } = await supabaseAdmin
            .from('push_subscriptions')
            .delete()
            .eq('user_id', user.id)
            .eq('endpoint', endpoint)

        if (error) throw error

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error('Erro ao remover push subscription:', error)
        return NextResponse.json({ error: 'Erro ao remover subscription' }, { status: 500 })
    }
}
