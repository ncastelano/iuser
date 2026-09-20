// components/LiderMotoristaDashboard/LiderMotoristaDashboard.tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { hexToRgb } from '@/lib/color'
import { getAvatarUrl } from '@/lib/avatar'
import { toast } from 'sonner'
import { Spinner } from '@/components/Spinner'
import { Crown, Check } from 'lucide-react'
import InviteButton from '@/components/InviteButton'

interface DownlineRow {
    downline_id: string
    name: string | null
    avatar_url: string | null
    profile_slug: string | null
    joined_at: string
    driver_plan_active: boolean
    driver_plan_code: string | null
    driver_plan_source: string | null
    driver_plan_expires_at: string | null
}

const GRANTABLE_PLANS = [
    { code: 'motorista', label: 'Motorista' },
    { code: 'motorista_beta', label: 'Motorista Beta (até fim do ano)' },
]

// 31/12 23:59:59 no horário de Brasília, em dias a partir de agora — mesma
// conta usada na concessão via admin (AdminDashboard.tsx).
function daysUntilEndOfYear(): number {
    const now = new Date()
    const endOfYearBrasilia = new Date(Date.UTC(now.getUTCFullYear(), 11, 32, 2, 59, 59))
    return Math.max(1, Math.ceil((endOfYearBrasilia.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))
}

// Painel do "Líder de Motoristas": vê quem ele mesmo convidou (upline_id)
// e pode conceder o plano motorista sem cobrar pra essas pessoas — nunca
// pra quem não foi indicado por ele (a RPC grant_driver_plan_as_leader
// trava isso no banco, esse painel só reflete a mesma regra na UI).
export default function LiderMotoristaDashboard() {
    const { colors } = useTheme()
    const surfaceRgb = hexToRgb(colors.surface)

    const [loading, setLoading] = useState(true)
    const [downline, setDownline] = useState<DownlineRow[]>([])
    const [grantingFor, setGrantingFor] = useState<string | null>(null)
    const [planByRow, setPlanByRow] = useState<Record<string, string>>({})
    const [daysByRow, setDaysByRow] = useState<Record<string, string>>({})

    const cardStyle = {
        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
        border: `1px solid ${colors.border}`,
        borderRadius: 20,
        padding: 16,
    }

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const { data, error } = await supabase.rpc('get_driver_leader_downline')
            if (error) throw error
            setDownline((data as DownlineRow[]) || [])
        } catch (err: any) {
            toast.error(err.message || 'Erro ao carregar sua lista de convidados')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { load() }, [load])

    const planFor = (id: string) => planByRow[id] ?? 'motorista'
    const daysFor = (id: string) => daysByRow[id] ?? '30'

    const handlePlanChange = (id: string, code: string) => {
        setPlanByRow((prev) => ({ ...prev, [id]: code }))
        if (code === 'motorista_beta') {
            setDaysByRow((prev) => ({ ...prev, [id]: String(daysUntilEndOfYear()) }))
        }
    }

    const grant = async (row: DownlineRow) => {
        setGrantingFor(row.downline_id)
        try {
            const { error } = await supabase.rpc('grant_driver_plan_as_leader', {
                p_profile_slug: row.profile_slug,
                p_plan_code: planFor(row.downline_id),
                p_days: Number(daysFor(row.downline_id)),
            })
            if (error) throw error
            toast.success(`Plano concedido a @${row.profile_slug}!`)
            await load()
        } catch (err: any) {
            toast.error(err.message || 'Erro ao conceder plano')
        } finally {
            setGrantingFor(null)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-16">
                <Spinner size={32} color={colors.accent} />
            </div>
        )
    }

    return (
        <div className="space-y-5">
            <div style={cardStyle} className="flex items-center gap-3">
                <div
                    className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg, #f97316, #dc2626)', color: '#fff' }}
                >
                    <Crown size={20} />
                </div>
                <div>
                    <h2 className="text-base font-black" style={{ color: colors.textPrimary }}>Líder de Motoristas</h2>
                    <p className="text-xs" style={{ color: colors.textSecondary }}>
                        Conceda o plano motorista sem cobrar pra quem você mesmo convidou
                    </p>
                </div>
            </div>

            <InviteButton />

            <div className="space-y-2">
                <p className="text-xs font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                    Seus convidados ({downline.length})
                </p>
                {downline.length === 0 ? (
                    <div className="text-sm" style={{ ...cardStyle, color: colors.textSecondary }}>
                        Ninguém entrou pelo seu link de convite ainda.
                    </div>
                ) : downline.map((row) => {
                    const avatarUrl = getAvatarUrl(supabase, row.avatar_url)
                    return (
                        <div key={row.downline_id} style={cardStyle} className="flex flex-col gap-3">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0" style={{ background: `${colors.border}30` }}>
                                    {avatarUrl && <img src={avatarUrl} className="w-full h-full object-cover" alt="" />}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-bold truncate" style={{ color: colors.textPrimary }}>
                                        {row.name || (row.profile_slug ? `@${row.profile_slug}` : 'Usuário')}
                                    </p>
                                    <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                                        Entrou em {new Date(row.joined_at).toLocaleDateString('pt-BR')}
                                    </p>
                                </div>
                                {row.driver_plan_active ? (
                                    <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full flex-shrink-0" style={{ background: '#22c55e20', color: '#22c55e' }}>
                                        Motorista ativo
                                    </span>
                                ) : (
                                    <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full flex-shrink-0" style={{ background: `${colors.border}30`, color: colors.textSecondary }}>
                                        Sem plano
                                    </span>
                                )}
                            </div>

                            {!row.driver_plan_active && row.profile_slug && (
                                <div className="flex flex-wrap items-center gap-2 pt-2" style={{ borderTop: `1px solid ${colors.border}` }}>
                                    <select
                                        value={planFor(row.downline_id)}
                                        onChange={(e) => handlePlanChange(row.downline_id, e.target.value)}
                                        className="text-xs rounded-full px-3 py-2"
                                        style={{ background: colors.background, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                                    >
                                        {GRANTABLE_PLANS.map((p) => (
                                            <option key={p.code} value={p.code}>{p.label}</option>
                                        ))}
                                    </select>
                                    <input
                                        type="number"
                                        min={1}
                                        value={daysFor(row.downline_id)}
                                        onChange={(e) => setDaysByRow((prev) => ({ ...prev, [row.downline_id]: e.target.value }))}
                                        placeholder="dias"
                                        className="text-xs rounded-full px-3 py-2 w-20"
                                        style={{ background: colors.background, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                                    />
                                    <button
                                        onClick={() => grant(row)}
                                        disabled={grantingFor === row.downline_id}
                                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-black text-white disabled:opacity-50"
                                        style={{ background: 'linear-gradient(135deg, #f97316, #dc2626)' }}
                                    >
                                        {grantingFor === row.downline_id ? <Spinner size={12} /> : <Check size={12} />}
                                        Conceder
                                    </button>
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
