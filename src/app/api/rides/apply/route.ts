// app/api/rides/apply/route.ts
//
// Candidatura do motorista a uma corrida direto da notificação push (o
// service worker não tem o token do Supabase, mas o fetch dele leva os
// cookies de sessão do site). Insere como o próprio usuário, então as
// políticas de RLS de ride_applications (plano de motorista, limite de
// candidatos, não se candidatar à própria corrida) continuam valendo.
import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

export async function POST(req: Request) {
    const { rideId, price } = await req.json().catch(() => ({}))
    const value = Number(price)
    if (typeof rideId !== 'string' || !rideId || !Number.isFinite(value) || value <= 0 || value > 100000) {
        return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
    }

    const supabase = await createServerSupabase()
    // getSession renova o token se a sessão expirou enquanto o app estava fechado.
    await supabase.auth.getSession()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const { error } = await supabase.from('ride_applications').insert({
        ride_request_id: rideId,
        applicant_id: user.id,
        proposed_price: Math.round(value * 100) / 100,
    })
    if (error) {
        const code = error.code || ''
        if (code === '23505') return NextResponse.json({ error: 'Você já se candidatou a essa corrida.', code }, { status: 409 })
        if (code === '42501' || code === 'PGRST301') return NextResponse.json({ error: 'Essa corrida já atingiu o limite de candidatos (ou você não tem o plano de motorista).', code }, { status: 403 })
        return NextResponse.json({ error: error.message, code }, { status: 500 })
    }

    // Mesmo efeito de submitRideApplication (client): o passageiro precisa
    // ver o motorista ao vivo assim que ele vira candidato.
    await supabase.from('driver_pricing').update({ live_location_sync: true }).eq('driver_id', user.id)

    return NextResponse.json({ success: true })
}
