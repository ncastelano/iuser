// app/api/push/register-native-token/route.ts
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
        const { deviceToken, platform } = body

        if (!deviceToken || (platform !== 'ios' && platform !== 'android')) {
            return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
        }

        const { error } = await supabaseAdmin
            .from('native_push_tokens')
            .upsert({
                user_id: user.id,
                token: deviceToken,
                platform,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'token' })

        if (error) throw error

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error('Erro ao registrar push token nativo:', error)
        return NextResponse.json({ error: 'Erro ao registrar token' }, { status: 500 })
    }
}
