// app/api/benefits/grant/route.ts
import { NextResponse } from 'next/server'
import { getAuthedUser } from '@/lib/adminAuth'
import { grantPlan } from '@/lib/benefits/server'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Única rota de concessão de benefício. O corpo só diz QUEM recebe, QUAL
// plano e por QUANTOS dias — quem concede vem do token, e toda a
// autorização (permissão, escopo, plano, vagas) é decidida no banco.
export async function POST(req: Request) {
    const user = await getAuthedUser(req)
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const { targetUserId, planId, days, reason, startsAt } = body as {
        targetUserId?: string; planId?: string; days?: number; reason?: string; startsAt?: string
    }

    if (!targetUserId || !UUID.test(targetUserId) || !planId || !UUID.test(planId) || !Number.isInteger(days)) {
        return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 })
    }

    let startsAtIso: string | null = null
    if (startsAt) {
        const d = new Date(startsAt)
        if (Number.isNaN(d.getTime())) return NextResponse.json({ error: 'Data de início inválida' }, { status: 400 })
        startsAtIso = d.toISOString()
    }

    const result = await grantPlan({
        actorId: user.id,
        targetUserId,
        planId,
        days: days as number,
        reason: typeof reason === 'string' ? reason.slice(0, 300) : null,
        startsAt: startsAtIso,
    })

    if (!result.ok) {
        const status = ['permission_denied', 'out_of_scope', 'self_grant_denied', 'plan_not_grantable'].includes(result.code)
            ? 403
            : result.code === 'internal_error' ? 500 : 409
        return NextResponse.json({ error: result.message, code: result.code }, { status })
    }
    return NextResponse.json({ success: true, expiresAt: result.expires_at })
}
