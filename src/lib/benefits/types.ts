// src/lib/benefits/types.ts
// Tipos compartilhados (cliente e servidor) do sistema de status,
// permissões, escopo e concessão de benefícios.

export type PermissionScope = 'direct_invite' | 'direct_downline' | 'network' | 'all'

export interface MyPermission {
    slug: string
    name: string
    scope: PermissionScope
}

export interface MyStatus {
    slug: string
    name: string
    level: number
    description: string | null
    permissions: MyPermission[]
}

export interface GrantablePlan {
    id: string
    code: string
    name: string
    description: string | null
    price: number
    permission_used: string
    scope: PermissionScope
}

export interface GrantTarget {
    id: string
    name: string | null
    profile_slug: string | null
    avatar_url: string | null
}

export interface BenefitHistoryRow {
    id: string
    target_user_id: string | null
    target_name: string | null
    target_slug: string | null
    actor_user_id: string | null
    actor_name: string | null
    plan_code: string | null
    plan_name: string | null
    outcome: 'granted' | 'denied'
    denial_reason: string | null
    reason: string | null
    starts_at: string | null
    expires_at: string | null
    created_at: string
    is_active: boolean
    is_scheduled: boolean
}

export type GrantResult =
    | { ok: true; subscription_id: string; starts_at: string; expires_at: string }
    | { ok: false; code: string; message: string }

export const SCOPE_LABEL: Record<PermissionScope, string> = {
    direct_invite: 'Pessoas que você convidou',
    direct_downline: 'Seus indicados diretos',
    network: 'Sua estrutura',
    all: 'Toda a plataforma',
}

// Uma pessoa vê a área de gestão de benefícios se tiver qualquer permissão
// de concessão. Só decide o que MOSTRAR — a segurança está no banco.
export function hasAnyGrantPermission(status: MyStatus | null): boolean {
    return !!status?.permissions.some((p) => p.slug.startsWith('grant_'))
}
