// app/api/deliveries/reply/route.ts
//
// Resposta de um toque direto da notificação push ("Já estou descendo"): o service worker não tem o token do Supabase, mas o fetch dele leva os cookies de sessão.
// Roda como a própria pessoa: send_delivery_message confere que ela é o cliente da entrega e que o código vale para o papel dela.
import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

export async function POST(req: Request) {
    const { rideId, code } = await req.json().catch(() => ({}))
    if (typeof rideId !== 'string' || !rideId || typeof code !== 'string' || !/^[a-z_]{2,20}$/.test(code)) {
        return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
    }
    const supabase = await createServerSupabase()
    await supabase.auth.getSession()   // renova o token se a sessão expirou com o app fechado
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    const { error } = await supabase.rpc('send_delivery_message', { p_ride: rideId, p_code: code })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true })
}
