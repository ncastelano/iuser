// src/components/ProfileDashboard/MyGraduation.tsx
//
// "Minha graduação" — nível atual, comissão padrão / personalizada / atual (pré e pós-pago), progresso pro próximo
// nível, escada completa, minha rede (árvore paginada) e minhas comissões. Tudo vem do banco (get_my_graduation,
// get_network_children, get_my_commissions): aqui só se mostra. A graduação conquistada nunca se perde, e uma
// comissão personalizada NÃO muda o nome do nível — por isso as duas aparecem separadas.
'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { hexToRgb } from '@/lib/color'
import { Spinner } from '@/components/Spinner'
import LevelBadge from '@/components/Graduation/LevelBadge'
import NetworkTree, { TREE_PAGE_SIZE, type TreeLoader } from '@/components/Graduation/NetworkTree'
import DashboardSection from './DashboardSection'
import {
    commissionCents, formatCents, formatPercent, SOURCE_LABELS,
    type CommissionSource, type MyGraduation as MyGraduationData, type NetworkChild, type PlanType,
} from '@/lib/graduation'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

interface MyCommission {
    id: string
    created_at: string
    plan_type: PlanType
    base_amount_cents: number
    commission_rate_bp: number
    commission_amount_cents: number
    level_name: string | null
    is_custom: boolean
    commission_source: CommissionSource
    source_name: string | null
    source_slug: string | null
}

export default function MyGraduation() {
    const { colors } = useTheme()
    const surfaceRgb = hexToRgb(colors.surface)
    const [data, setData] = useState<MyGraduationData | null>(null)
    const [loading, setLoading] = useState(true)
    const [commissions, setCommissions] = useState<MyCommission[] | null>(null)

    useEffect(() => {
        let cancelled = false
        supabase.rpc('get_my_graduation').then(({ data: d, error }) => {
            if (cancelled) return
            if (error) console.warn('[graduação]', error.message)
            setData((d as MyGraduationData) || null)
            setLoading(false)
        })
        supabase.rpc('get_my_commissions', { p_limit: 20 }).then(({ data: c }) => {
            if (!cancelled) setCommissions((c as MyCommission[]) || [])
        })
        return () => { cancelled = true }
    }, [])

    // A própria rede: o banco só deixa abrir a própria rede ou a de quem está abaixo de você
    const loader = useCallback<TreeLoader>(async (parentId, offset) => {
        const { data: rows, error } = await supabase.rpc('get_network_children', { p_parent: parentId, p_limit: TREE_PAGE_SIZE, p_offset: offset })
        if (error) throw new Error(error.message)
        const list = (rows || []) as NetworkChild[]
        return { children: list, total: Number(list[0]?.total_count ?? 0) }
    }, [])

    if (loading) {
        return <div className="flex justify-center py-6"><Spinner size={24} color={colors.accent} /></div>
    }
    if (!data) return null // ainda sem a migration/sem login: não atrapalha o painel

    const { level, highest_level: highest, next_level: next } = data
    const isManualAbove = highest.level_order < level.level_order
    const card: React.CSSProperties = {
        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
        backdropFilter: 'blur(12px)',
        border: `1px solid ${colors.border}`,
        boxShadow: colors.shadow,
        borderRadius: 16,
    }

    const line = (label: string, value: React.ReactNode, strong = false) => (
        <div className="flex items-baseline justify-between gap-3 text-xs">
            <span style={{ color: colors.textSecondary }}>{label}</span>
            <span className={strong ? 'font-black text-sm' : 'font-bold'} style={{ color: colors.textPrimary }}>{value}</span>
        </div>
    )

    const planColumn = (title: string, planType: PlanType, standardBp: number, customBp: number | null, effectiveBp: number, baseCents: number | null) => (
        <div className="rounded-xl p-3 space-y-1.5" style={{ background: `${colors.border}22`, border: `1px solid ${colors.border}` }}>
            <p className="text-[11px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>{title}</p>
            {line('Comissão padrão', formatPercent(standardBp))}
            {data.has_custom && customBp !== null && line('Comissão personalizada', formatPercent(customBp))}
            {line('Comissão atual', formatPercent(effectiveBp), true)}
            {baseCents ? (
                <p className="text-[11px] pt-1" style={{ color: colors.textSecondary }}>
                    {planType === 'prepaid' ? `Mensalidade de ${formatCents(baseCents)}` : `Quitação de ${formatCents(baseCents)}`}
                    {' → '}<b style={{ color: colors.textPrimary }}>{formatCents(commissionCents(baseCents, effectiveBp))}</b> pra você
                </p>
            ) : null}
        </div>
    )

    return (
        <div className="flex flex-col gap-3">
            <div style={card} className="p-4 flex flex-col gap-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                        <h3 className="text-sm font-black" style={{ color: colors.textPrimary }}>Minha graduação</h3>
                        <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                            {data.has_custom ? 'Você tem uma comissão personalizada — a graduação continua a mesma' : 'A graduação define quanto você ganha por cada indicado'}
                        </p>
                    </div>
                    <LevelBadge level={level} size="lg" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {planColumn('Pré-pago', 'prepaid', data.standard_prepaid_bp, data.custom_prepaid_bp, data.effective_prepaid.commission_rate_bp, data.prepaid_price_cents)}
                    {planColumn('Pós-pago', 'postpaid', data.standard_postpaid_bp, data.custom_postpaid_bp, data.effective_postpaid.commission_rate_bp, data.postpaid_reference_cents)}
                </div>

                {/* Progresso */}
                {next ? (
                    <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2 text-xs">
                            <span style={{ color: colors.textSecondary }}>Próximo nível</span>
                            <LevelBadge level={next} size="sm" />
                        </div>
                        <div className="flex items-center justify-between text-xs">
                            <span style={{ color: colors.textSecondary }}>Indicações</span>
                            <span className="font-black" style={{ color: colors.textPrimary }}>{data.direct_referrals} / {next.min_direct_referrals}</span>
                        </div>
                        <div className="h-2.5 rounded-full overflow-hidden" style={{ background: `${colors.border}40` }} role="progressbar" aria-valuenow={data.progress_percent} aria-valuemin={0} aria-valuemax={100}>
                            <div style={{ width: `${data.progress_percent}%`, background: GRADIENT, height: '100%', transition: 'width .4s' }} />
                        </div>
                        <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                            {data.progress_percent}% · faltam {Math.max(next.min_direct_referrals - data.direct_referrals, 0)} para {next.name} ({formatPercent(next.commission_prepaid_bp)} no pré-pago)
                        </p>
                    </div>
                ) : (
                    <p className="text-xs font-bold" style={{ color: colors.textPrimary }}>Você está no nível mais alto da graduação.</p>
                )}

                <div className="rounded-xl p-3 text-xs space-y-1" style={{ background: `${colors.border}22`, border: `1px solid ${colors.border}` }}>
                    <div className="flex items-center justify-between gap-2">
                        <span style={{ color: colors.textSecondary }}>Maior nível conquistado</span>
                        <LevelBadge level={highest} size="sm" />
                    </div>
                    {isManualAbove && (
                        <p style={{ color: colors.textSecondary }}>Seu nível atual foi concedido pela administração.</p>
                    )}
                    <p className="font-bold" style={{ color: colors.textPrimary }}>Você conquistou este nível e não poderá perdê-lo.</p>
                </div>

                <div className="flex gap-4 text-[11px]" style={{ color: colors.textSecondary }}>
                    <span><b style={{ color: colors.textPrimary }}>{data.direct_referrals}</b> indicados diretos</span>
                    <span><b style={{ color: colors.textPrimary }}>{data.total_network}</b> na rede toda</span>
                </div>
            </div>

            <DashboardSection storageKey="graduacao-escada" title="Escada de níveis" subtitle="Quanto cada nível paga e quantos indicados pede">
                <div className="flex flex-col gap-2">
                    {data.levels.map((l) => {
                        const current = l.id === level.id
                        return (
                            <div
                                key={l.id}
                                className="flex items-center justify-between gap-3 p-2.5 rounded-xl"
                                style={{ background: current ? `${colors.accent}18` : 'transparent', border: `1px solid ${current ? colors.accent : colors.border}` }}
                            >
                                <div className="min-w-0">
                                    <LevelBadge level={l} size="sm" />
                                    {l.description && <p className="text-[11px] mt-1" style={{ color: colors.textSecondary }}>{l.description}</p>}
                                </div>
                                <div className="text-right text-[11px] flex-shrink-0" style={{ color: colors.textSecondary }}>
                                    <p><b style={{ color: colors.textPrimary }}>{formatPercent(l.commission_prepaid_bp)}</b> pré · <b style={{ color: colors.textPrimary }}>{formatPercent(l.commission_postpaid_bp)}</b> pós</p>
                                    <p>{l.min_direct_referrals === 0 ? 'começa aqui' : `${l.min_direct_referrals} indicados`}{current ? ' · você' : ''}</p>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </DashboardSection>

            <DashboardSection storageKey="graduacao-rede" title="Minha rede" subtitle="Quem você indicou, a graduação de cada um e quem eles indicaram">
                <NetworkTree rootId={null} loader={loader} rootLabel="Você" />
            </DashboardSection>

            <DashboardSection storageKey="graduacao-ganhos" title="Minhas comissões" subtitle="O que você ganhou, com a taxa usada em cada venda">
                {commissions === null ? (
                    <div className="flex justify-center py-3"><Spinner size={18} color={colors.accent} /></div>
                ) : commissions.length === 0 ? (
                    <p className="text-xs" style={{ color: colors.textSecondary }}>Nenhuma comissão ainda. Quando um indicado pagar o Pré-pago ou quitar o Pós-pago, ela aparece aqui.</p>
                ) : (
                    <div className="flex flex-col gap-2">
                        {commissions.map((c) => (
                            <div key={c.id} className="p-2.5 rounded-xl flex items-center justify-between gap-3" style={{ border: `1px solid ${colors.border}` }}>
                                <div className="min-w-0">
                                    <p className="text-xs font-black truncate" style={{ color: colors.textPrimary }}>
                                        {c.source_name || (c.source_slug ? `@${c.source_slug}` : 'Indicado')} · {c.plan_type === 'prepaid' ? 'Pré-pago' : 'Pós-pago'}
                                    </p>
                                    <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                                        {new Date(c.created_at).toLocaleDateString('pt-BR')} · {formatCents(c.base_amount_cents)} × {formatPercent(c.commission_rate_bp)}
                                        {' '}({c.is_custom ? SOURCE_LABELS.custom : `${c.level_name || 'Nível'}`})
                                    </p>
                                </div>
                                <span className="text-sm font-black flex-shrink-0" style={{ color: '#10b981' }}>+ {formatCents(c.commission_amount_cents)}</span>
                            </div>
                        ))}
                    </div>
                )}
            </DashboardSection>

            {data.history.length > 0 && (
                <DashboardSection storageKey="graduacao-historico" title="Como cheguei até aqui" subtitle="Cada passo da sua graduação">
                    <div className="flex flex-col gap-1.5">
                        {data.history.map((h, i) => (
                            <div key={i} className="text-xs flex items-baseline justify-between gap-3">
                                <span style={{ color: colors.textPrimary }}>
                                    {h.type === 'manual_grant' ? 'Concedido: ' : h.type === 'admin_change' ? 'Ajustado: ' : 'Conquistou '}
                                    <b>{h.new}</b>{h.reason ? ` — ${h.reason}` : ''}
                                </span>
                                <span className="flex-shrink-0" style={{ color: colors.textSecondary }}>{new Date(h.at).toLocaleDateString('pt-BR')}</span>
                            </div>
                        ))}
                    </div>
                </DashboardSection>
            )}
        </div>
    )
}
