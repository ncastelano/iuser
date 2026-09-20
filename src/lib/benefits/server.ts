// src/lib/benefits/server.ts
// Server-only. Ponto único de autorização e concessão: cada função aqui é
// um invólucro fino sobre as funções SQL (fonte única de verdade), que só o
// service role executa. O `actorId` SEMPRE vem do token verificado no
// servidor (getAuthedUser), nunca do corpo da requisição.
import { supabaseAdmin } from '@/lib/supabase/admin'
import type { GrantResult, GrantablePlan } from './types'

export async function hasPermission(userId: string, permission: string): Promise<boolean> {
    const { data } = await supabaseAdmin.rpc('has_permission', { p_user: userId, p_permission: permission })
    return data === true
}

export async function canActOnUser(actorId: string, targetId: string, permission: string): Promise<boolean> {
    const { data } = await supabaseAdmin.rpc('can_act_on_user', { p_actor: actorId, p_target: targetId, p_permission: permission })
    return data === true
}

export async function canGrantPlan(actorId: string, planId: string): Promise<boolean> {
    const { data } = await supabaseAdmin.rpc('can_grant_plan', { p_actor: actorId, p_plan_id: planId })
    return data === true
}

export async function getGrantablePlans(actorId: string): Promise<GrantablePlan[]> {
    const { data } = await supabaseAdmin.rpc('get_grantable_plans', { p_actor: actorId })
    return (data as GrantablePlan[]) || []
}

// Operação central de concessão: autentica → status → permissões → plano →
// escopo → alvo → regras do plano/vagas → cria → audita. Tudo (inclusive a
// auditoria da tentativa negada) acontece dentro de grant_plan_internal.
export async function grantPlan(params: {
    actorId: string
    targetUserId: string
    planId: string
    days: number
    reason?: string | null
}): Promise<GrantResult> {
    const { data, error } = await supabaseAdmin.rpc('grant_plan_internal', {
        p_actor: params.actorId,
        p_target: params.targetUserId,
        p_plan_id: params.planId,
        p_days: params.days,
        p_reason: params.reason ?? null,
    })
    if (error || !data) {
        return { ok: false, code: 'internal_error', message: 'Erro ao conceder o benefício' }
    }
    return data as GrantResult
}

export async function setUserStatus(params: {
    actorId: string
    targetUserId: string
    statusSlug: string
}): Promise<{ ok: boolean; code?: string; message?: string }> {
    const { data, error } = await supabaseAdmin.rpc('set_user_status_internal', {
        p_actor: params.actorId,
        p_target: params.targetUserId,
        p_status_slug: params.statusSlug,
    })
    if (error || !data) return { ok: false, code: 'internal_error', message: 'Erro ao atualizar o status' }
    return data as { ok: boolean; code?: string; message?: string }
}
