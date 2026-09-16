// app/api/admin/access-payments/review/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'

export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) {
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const { grantId, action } = await req.json()
    if (!grantId || (action !== 'approve' && action !== 'reject')) {
        return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 })
    }

    const { data: grant, error: grantError } = await supabaseAdmin
        .from('store_access_grants')
        .select('id, status, source, profile_id')
        .eq('id', grantId)
        .single()

    if (grantError || !grant) {
        return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })
    }
    if (grant.source !== 'manual_pix' || grant.status !== 'pending') {
        return NextResponse.json({ error: 'Esse pedido não está mais pendente' }, { status: 400 })
    }

    if (action === 'reject') {
        const { error } = await supabaseAdmin
            .from('store_access_grants')
            .update({ status: 'rejected', reviewed_by: admin.id, reviewed_at: new Date().toISOString() })
            .eq('id', grantId)

        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json({ success: true })
    }

    // Aprovação: os campos de valor/validade vêm do plano vigente agora, nunca
    // de algo que o pedido já trouxesse - o pedido só guarda "eu quero pagar".
    const { data: settings, error: settingsError } = await supabaseAdmin
        .from('store_access_settings')
        .select('price_cents, validity_days')
        .eq('id', 1)
        .single()

    if (settingsError || !settings) {
        return NextResponse.json({ error: 'Configuração de preço não encontrada' }, { status: 500 })
    }

    const { error } = await supabaseAdmin
        .from('store_access_grants')
        .update({
            status: 'approved',
            amount_cents: settings.price_cents,
            grant_type: settings.validity_days ? 'days' : 'lifetime',
            days: settings.validity_days,
            reviewed_by: admin.id,
            reviewed_at: new Date().toISOString(),
        })
        .eq('id', grantId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await creditReferralCommissionForStoreGrant({
        payingUserId: grant.profile_id,
        grantId: grant.id,
        amountCents: settings.price_cents,
    })

    return NextResponse.json({ success: true })
}

// Mesma regra do webhook da Asaas: 1 nível só, nunca em cascata — lê
// upline_id de quem pagou e para por aí.
async function creditReferralCommissionForStoreGrant(params: {
    payingUserId: string
    grantId: string
    amountCents: number
}) {
    const { data: payingProfile } = await supabaseAdmin
        .from('profiles')
        .select('upline_id')
        .eq('id', params.payingUserId)
        .maybeSingle()

    if (!payingProfile?.upline_id) return

    const { error } = await supabaseAdmin
        .from('wallet_transactions')
        .insert({
            user_id: payingProfile.upline_id,
            type: 'commission_credit',
            amount: (params.amountCents / 100) * 0.5,
            source_payment_id: `store-grant-${params.grantId}`,
            description: 'Comissão de indicação (50% do acesso de loja)',
        })

    if (error && error.code !== '23505') {
        console.error('Erro ao creditar comissão de indicação (loja):', error)
    }
}
