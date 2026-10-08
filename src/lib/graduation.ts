// src/lib/graduation.ts
//
// GRADUAÇÃO (níveis de comissão) — tipos, matemática e visual no cliente.
// A REGRA mora no banco (get_effective_commission, check_and_upgrade_user_level, record_referral_commission);
// este arquivo só formata o que o banco devolve e repete a conta em centavos pra mostrar exemplos.
// Dinheiro sempre em CENTAVOS e percentual em PONTOS-BASE (50% = 5000), sem ponto flutuante nas contas.
// Arquivo puro (sem imports do app) pra poder rodar em `node --test` (npm run test:graduation).

export type PlanType = 'prepaid' | 'postpaid'
export type CommissionSource = 'custom' | 'manual_level' | 'achieved_level' | 'initial_level'

export type BorderStyle = 'solid' | 'double' | 'dashed' | 'gradient' | 'glow' | 'diamond'
export type BackgroundStyle = 'none' | 'soft' | 'glass' | 'gradient'
export type BadgeStyle = 'pill' | 'shield' | 'ribbon' | 'plain'

export interface NetworkLevel {
    id: string
    name: string
    level_order: number
    commission_prepaid_bp: number
    commission_postpaid_bp: number
    min_direct_referrals: number
    requirements: Record<string, unknown>
    is_active: boolean
    border_style: BorderStyle
    border_color: string
    border_colors: string[]
    background_style: BackgroundStyle
    badge_style: BadgeStyle
    icon: string | null
    description: string | null
    /** Só na visão do admin: quantas pessoas estão neste nível */
    users?: number
}

/** O mínimo de um nível pra desenhar o selo/borda (vem de get_levels_for e das árvores) */
export type LevelVisual = Pick<NetworkLevel, 'name' | 'border_style' | 'border_color' | 'border_colors' | 'background_style' | 'badge_style' | 'icon'>

export interface EffectiveCommission {
    level_id: string
    level: string
    level_order: number
    standard_rate_bp: number
    commission_rate_bp: number
    commission_rate_percent: number
    commission_source: CommissionSource
    is_custom: boolean
}

export interface GraduationHistoryItem {
    type: 'automatic_upgrade' | 'manual_grant' | 'admin_change'
    reason: string | null
    at: string
    previous: string | null
    new: string | null
    by?: string | null
}

export interface MyGraduation {
    level: NetworkLevel
    highest_level: NetworkLevel
    level_achieved_at: string | null
    direct_referrals: number
    total_network: number
    standard_prepaid_bp: number
    standard_postpaid_bp: number
    has_custom: boolean
    custom_prepaid_bp: number | null
    custom_postpaid_bp: number | null
    effective_prepaid: EffectiveCommission
    effective_postpaid: EffectiveCommission
    next_level: NetworkLevel | null
    progress_percent: number
    levels: NetworkLevel[]
    prepaid_price_cents: number | null
    postpaid_reference_cents: number
    history: GraduationHistoryItem[]
}

export interface NetworkChild {
    id: string
    name: string | null
    profile_slug: string | null
    avatar_url: string | null
    joined_at: string
    is_valid: boolean
    direct_count: number
    level_id: string
    level_name: string
    level_order: number
    border_style: BorderStyle
    border_color: string
    border_colors: string[]
    background_style: BackgroundStyle
    badge_style: BadgeStyle
    icon: string | null
    rate_prepaid_bp: number
    rate_postpaid_bp: number
    is_custom: boolean
    total_count: number
}

// ===== Dinheiro e percentual =====

/** Comissão em centavos, arredondando meio pra cima, só com inteiros (igual ao banco: commission_cents) */
export function commissionCents(baseCents: number, rateBp: number): number {
    if (!Number.isInteger(baseCents) || !Number.isInteger(rateBp)) throw new Error('Use centavos e pontos-base inteiros')
    return Math.floor((baseCents * rateBp + 5000) / 10000)
}

/** 5000 -> 50 ; 5550 -> 55.5 */
export function bpToPercent(bp: number): number {
    return Math.round(bp) / 100
}

/** "62" / "62,5" / 62.5 -> 6250 (inteiro; NaN se inválido) */
export function percentToBp(value: string | number): number {
    const n = typeof value === 'number' ? value : Number(String(value).trim().replace(',', '.'))
    if (!Number.isFinite(n)) return NaN
    return Math.round(n * 100)
}

/** 5000 -> "50%" ; 5550 -> "55,5%" */
export function formatPercent(bp: number): string {
    const p = bpToPercent(bp)
    return `${Number.isInteger(p) ? p : p.toFixed(2).replace(/0+$/, '').replace('.', ',')}%`
}

/** 5000 -> "R$ 50,00" */
export function formatCents(cents: number): string {
    return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ===== Visual do nível =====

const DEFAULT_COLOR = '#94a3b8'

/** Gradiente da borda (níveis 'gradient'/'diamond' usam border_colors; os outros, a cor única) */
export function levelGradient(level: Pick<LevelVisual, 'border_color' | 'border_colors'>): string {
    const colors = level.border_colors && level.border_colors.length >= 2 ? level.border_colors : [level.border_color || DEFAULT_COLOR, level.border_color || DEFAULT_COLOR]
    return `linear-gradient(135deg, ${colors.join(', ')})`
}

/** Estilo CSS do contorno de um cartão/selo conforme o nível (sem nomes fixos: tudo vem da configuração do admin) */
export function levelBorderCss(level: LevelVisual, width = 2): React.CSSProperties {
    const color = level.border_color || DEFAULT_COLOR
    switch (level.border_style) {
        case 'double':
            return { border: `${Math.max(width, 3) + 1}px double ${color}` }
        case 'dashed':
            return { border: `${width}px dashed ${color}` }
        case 'glow':
            return { border: `${width}px solid ${color}`, boxShadow: `0 0 12px ${color}66, 0 0 2px ${color}` }
        case 'gradient':
        case 'diamond':
            // Borda em degradê: o fundo do cartão pinta o miolo, o gradiente aparece só no contorno
            return {
                border: `${width}px solid transparent`,
                backgroundImage: `linear-gradient(var(--level-fill, #ffffff), var(--level-fill, #ffffff)), ${levelGradient(level)}`,
                backgroundOrigin: 'border-box',
                backgroundClip: 'padding-box, border-box',
                ...(level.border_style === 'diamond' ? { boxShadow: `0 0 14px ${(level.border_colors?.[0] || color)}55` } : {}),
            }
        default:
            return { border: `${width}px solid ${color}` }
    }
}

/** Fundo suave do cartão conforme o background_style do nível */
export function levelBackground(level: LevelVisual): string | undefined {
    const color = level.border_color || DEFAULT_COLOR
    switch (level.background_style) {
        case 'soft': return `${color}14`
        case 'glass': return 'rgba(255,255,255,0.35)'
        case 'gradient': return `linear-gradient(135deg, ${(level.border_colors?.[0] || color)}18, ${(level.border_colors?.[1] || color)}18)`
        default: return undefined
    }
}

export const SOURCE_LABELS: Record<CommissionSource, string> = {
    custom: 'Comissão personalizada',
    manual_level: 'Nível concedido',
    achieved_level: 'Nível conquistado',
    initial_level: 'Nível inicial',
}
