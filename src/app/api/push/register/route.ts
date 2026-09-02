// app/api/push/register/route.ts
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase/client'

export async function POST(req: Request) {
    try {
        const body = await req.json()
        const { endpoint, keys } = body

        // Buscar o usuário atual
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json(
                { error: 'Usuário não autenticado' },
                { status: 401 }
            )
        }

        const { error } = await supabase
            .from('push_subscriptions')
            .upsert({
                user_id: user.id,
                endpoint,
                keys,
                updated_at: new Date().toISOString()
            })

        if (error) throw error

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Erro ao registrar push:', error)
        return NextResponse.json(
            { error: 'Erro ao registrar push' },
            { status: 500 }
        )
    }
}