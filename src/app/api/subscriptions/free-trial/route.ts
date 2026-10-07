// app/api/subscriptions/free-trial/route.ts
//
// Resgata o brinde do plano Pré-pago (90 dias por padrão, configurável no Admin → Brinde), contado a partir de agora. Vale pra
// quem já está no Pós-pago (o pós-pago fica guardado e volta a cobrar quando o teste
// acabar) e pra quem está chegando. Uma vez por pessoa: CPF/CNPJ e aparelho únicos.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getAuthedUser } from '@/lib/adminAuth'

const DEFAULT_TRIAL_DAYS = 90

export async function POST(req: Request) {
    try {
        const user = await getAuthedUser(req)
        if (!user) {
            return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
        }

        const { cpfCnpj, deviceId } = await req.json()

        // O admin pode desligar o brinde ou mudar a duração (Admin → Brinde)
        const { data: settings } = await supabaseAdmin
            .from('free_trial_settings')
            .select('enabled, duration_days')
            .eq('id', 1)
            .maybeSingle()
        if (settings && !settings.enabled) {
            return NextResponse.json({ error: 'O brinde não está disponível agora.' }, { status: 403 })
        }
        const trialDays = settings?.duration_days || DEFAULT_TRIAL_DAYS

        // Já resgatou antes? (vale pra sempre, mesmo depois de acabar)
        const { data: ownClaim } = await supabaseAdmin
            .from('free_trial_claims')
            .select('ends_at')
            .eq('profile_id', user.id)
            .maybeSingle()
        if (ownClaim) {
            return NextResponse.json({ error: 'Você já resgatou o brinde.' }, { status: 409 })
        }

        const { data: plan } = await supabaseAdmin
            .from('plans')
            .select('id, code, is_active')
            .eq('code', 'pre_pago')
            .maybeSingle()
        if (!plan || !plan.is_active) {
            return NextResponse.json({ error: 'O plano Pré-pago não está disponível agora.' }, { status: 404 })
        }

        // Pré-pago já em aberto (pago ou com Pix pendente): não faz sentido resgatar por cima.
        const { data: existing } = await supabaseAdmin
            .from('subscriptions')
            .select('id, status, current_period_end')
            .eq('user_id', user.id)
            .eq('plan_id', plan.id)
            .in('status', ['pending', 'active'])
            .maybeSingle()
        if (existing?.status === 'active' && existing.current_period_end && new Date(existing.current_period_end).getTime() > Date.now()) {
            return NextResponse.json({ error: 'Você já tem o plano Pré-pago ativo.' }, { status: 409 })
        }
        if (existing?.status === 'pending') {
            return NextResponse.json({ error: 'Você tem um pagamento do Pré-pago pendente. Conclua ou cancele antes de resgatar.' }, { status: 409 })
        }

        // CPF/CNPJ e aparelho únicos (igual ao pós-pago)
        const { data: profile } = await supabaseAdmin.from('profiles').select('cpf_cnpj').eq('id', user.id).maybeSingle()
        const cleanCpf = (cpfCnpj || '').replace(/\D/g, '')
        const resolvedCpf = profile?.cpf_cnpj || cleanCpf || null
        if (!resolvedCpf) {
            return NextResponse.json({ error: 'Informe seu CPF ou CNPJ pra continuar', needsCpf: true }, { status: 400 })
        }
        if (typeof deviceId !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(deviceId)) {
            return NextResponse.json({ error: 'Não foi possível identificar seu aparelho' }, { status: 400 })
        }

        const { data: clashes } = await supabaseAdmin
            .from('free_trial_claims')
            .select('profile_id')
            .or(`cpf_cnpj.eq.${resolvedCpf},device_id.eq.${deviceId}`)
            .neq('profile_id', user.id)
        if ((clashes || []).length > 0) {
            return NextResponse.json({ error: 'Este CPF/CNPJ ou aparelho já resgatou o brinde em outra conta.' }, { status: 409 })
        }

        if (cleanCpf && cleanCpf !== profile?.cpf_cnpj) {
            const { error: cpfError } = await supabaseAdmin.from('profiles').update({ cpf_cnpj: cleanCpf }).eq('id', user.id)
            if (cpfError) {
                return NextResponse.json({ error: 'Este CPF/CNPJ já está cadastrado em outra conta.' }, { status: 409 })
            }
        }

        // N dias a partir de hoje
        const endsAt = new Date()
        endsAt.setDate(endsAt.getDate() + trialDays)

        const { data: sub, error: subError } = await supabaseAdmin
            .from('subscriptions')
            .insert({ user_id: user.id, plan_id: plan.id, status: 'active', source: 'free_trial', current_period_end: endsAt.toISOString() })
            .select('id')
            .single()
        if (subError || !sub) {
            return NextResponse.json({ error: 'Erro ao ativar o plano' }, { status: 500 })
        }

        const { error: claimError } = await supabaseAdmin
            .from('free_trial_claims')
            .insert({ profile_id: user.id, cpf_cnpj: resolvedCpf, device_id: deviceId, subscription_id: sub.id, ends_at: endsAt.toISOString() })
        if (claimError) {
            // Não deixa um teste ativo sem registro de resgate (daria pra repetir)
            await supabaseAdmin.from('subscriptions').delete().eq('id', sub.id)
            return NextResponse.json({ error: 'Este CPF/CNPJ ou aparelho já resgatou o brinde.' }, { status: 409 })
        }

        return NextResponse.json({ activated: true, endsAt: endsAt.toISOString(), days: trialDays })
    } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Erro ao resgatar' }, { status: 500 })
    }
}
