// app/api/push/subscribe/route.ts
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

        const body = await req.json()
        const { endpoint, keys } = body

        if (!endpoint || !keys?.p256dh || !keys?.auth) {
            return NextResponse.json({ error: 'Subscription inválida' }, { status: 400 })
        }

        const { error } = await supabaseAdmin
            .from('push_subscriptions')
            .upsert({
                user_id: user.id,
                endpoint,
                p256dh: keys.p256dh,
                auth: keys.auth,
                user_agent: req.headers.get('user-agent') || null,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'endpoint' })

        if (error) throw error

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error('Erro ao registrar push subscription:', error)
        return NextResponse.json({ error: 'Erro ao registrar subscription' }, { status: 500 })
    }
}
