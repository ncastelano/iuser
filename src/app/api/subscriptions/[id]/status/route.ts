// app/api/subscriptions/[id]/status/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
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

        const { id } = await params
        const { data: subscription, error } = await supabaseAdmin
            .from('subscriptions')
            .select('id, status, user_id')
            .eq('id', id)
            .maybeSingle()

        if (error || !subscription || subscription.user_id !== user.id) {
            return NextResponse.json({ error: 'Assinatura não encontrada' }, { status: 404 })
        }

        return NextResponse.json({ status: subscription.status })
    } catch (err: any) {
        console.error('Erro ao consultar status da assinatura:', err)
        return NextResponse.json({ error: err.message || 'Erro ao consultar assinatura' }, { status: 500 })
    }
}
