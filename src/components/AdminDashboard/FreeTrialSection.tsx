// src/components/AdminDashboard/FreeTrialSection.tsx
//
// Admin → Brinde: liga/desliga o brinde de teste grátis do Pré-pago (90 dias por
// padrão, resgate único por conta) e mostra quem já resgatou. Mudar a duração só vale
// pra quem resgatar daqui pra frente.
'use client'

import { useCallback, useEffect, useState } from 'react'
import { Gift, Save } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase/client'
import { callAdminApi } from '@/lib/callAdminApi'
import { Spinner } from '@/components/Spinner'
import type { ThemeColors } from '@/app/contexts/theme'
import { DEFAULT_TRIAL_DAYS } from '@/hooks/useFreeTrial'

interface Claim {
    profileId: string
    name: string | null
    profileSlug: string | null
    claimedAt: string
    endsAt: string
}

const fmt = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

export default function FreeTrialSection({ cardStyle, colors }: { cardStyle: React.CSSProperties; colors: ThemeColors }) {
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [missingTable, setMissingTable] = useState(false)
    const [enabled, setEnabled] = useState(true)
    const [days, setDays] = useState(String(DEFAULT_TRIAL_DAYS))
    const [claims, setClaims] = useState<Claim[]>([])
    const [total, setTotal] = useState(0)

    const load = useCallback(async () => {
        setLoading(true)
        const { data, error } = await supabase.from('free_trial_settings').select('enabled, duration_days').eq('id', 1).maybeSingle()
        if (error) {
            setMissingTable(true)
        } else {
            setMissingTable(false)
            if (data) {
                setEnabled(!!data.enabled)
                setDays(String(data.duration_days))
            }
        }
        try {
            const res = await callAdminApi<{ total: number; claims: Claim[] }>('/api/admin/free-trial/claims')
            setClaims(res.claims)
            setTotal(res.total)
        } catch {
            setClaims([])
        }
        setLoading(false)
    }, [])

    useEffect(() => { load() }, [load])

    const save = async () => {
        setSaving(true)
        try {
            await callAdminApi('/api/admin/free-trial/settings', { enabled, durationDays: Number(days) })
            toast.success('Brinde atualizado!')
        } catch (err: any) {
            toast.error(err.message || 'Erro ao salvar o brinde')
        } finally {
            setSaving(false)
        }
    }

    if (loading) return <div style={cardStyle} className="flex justify-center py-8"><Spinner size={24} color={colors.accent} /></div>

    if (missingTable) {
        return (
            <div style={cardStyle}>
                <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>Configuração do brinde ainda não disponível</p>
                <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>
                    A tabela free_trial_settings não foi encontrada. Rode a migration 20261023000000_free_trial_settings.sql (supabase db push) e recarregue.
                </p>
            </div>
        )
    }

    const now = Date.now()
    const activeCount = claims.filter((c) => new Date(c.endsAt).getTime() > now).length

    return (
        <div className="space-y-5">
            <div style={cardStyle} className="space-y-4">
                <div className="flex items-center gap-2">
                    <Gift size={18} color={colors.accent} />
                    <p className="text-sm font-black" style={{ color: colors.textPrimary }}>Brinde: teste grátis do Pré-pago</p>
                </div>
                <p className="text-xs" style={{ color: colors.textSecondary }}>
                    Quem resgata ganha o plano Pré-pago de graça pelo tempo abaixo, contado a partir do resgate. Cada conta (CPF/CNPJ e aparelho) resgata uma vez só.
                    O card aparece no topo do Perfil e em Planos.
                </p>

                <label className="flex items-center justify-between gap-3 cursor-pointer">
                    <span className="text-sm font-bold" style={{ color: colors.textPrimary }}>Brinde disponível pros usuários</span>
                    <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="w-5 h-5 accent-orange-500" />
                </label>

                <div className="flex flex-col gap-0.5 max-w-[200px]">
                    <span className="text-[10px] font-bold" style={{ color: colors.textSecondary }}>Duração (dias)</span>
                    <input
                        type="text"
                        inputMode="numeric"
                        value={days}
                        onChange={(e) => setDays(e.target.value.replace(/\D/g, ''))}
                        style={{ background: colors.background, border: `1px solid ${colors.border}`, color: colors.textPrimary, borderRadius: 12, padding: '8px 12px', fontSize: 13, width: '100%' }}
                    />
                    <span className="text-[9px]" style={{ color: colors.textSecondary }}>Só vale pra quem resgatar daqui pra frente.</span>
                </div>

                <button
                    onClick={save}
                    disabled={saving || !days}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-black text-white disabled:opacity-50"
                    style={{ background: colors.accent }}
                >
                    {saving ? <Spinner size={14} color="#ffffff" /> : <Save size={14} />}
                    Salvar
                </button>
            </div>

            <div style={cardStyle} className="space-y-3">
                <p className="text-sm font-black" style={{ color: colors.textPrimary }}>
                    Quem já resgatou · {total} {total === 1 ? 'pessoa' : 'pessoas'} ({activeCount} com o brinde ativo)
                </p>
                {claims.length === 0 ? (
                    <p className="text-xs" style={{ color: colors.textSecondary }}>Ninguém resgatou ainda.</p>
                ) : (
                    <div className="flex flex-col divide-y" style={{ borderColor: colors.border }}>
                        {claims.map((c) => {
                            const active = new Date(c.endsAt).getTime() > now
                            return (
                                <div key={c.profileId} className="flex items-center justify-between gap-3 py-2" style={{ borderColor: colors.border }}>
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold truncate" style={{ color: colors.textPrimary }}>
                                            {c.name || 'Sem nome'}{c.profileSlug ? ` · @${c.profileSlug}` : ''}
                                        </p>
                                        <p className="text-[10px]" style={{ color: colors.textSecondary }}>
                                            Resgatou em {fmt(c.claimedAt)} · até {fmt(c.endsAt)}
                                        </p>
                                    </div>
                                    <span
                                        className="text-[10px] font-black px-2 py-0.5 rounded-full flex-shrink-0"
                                        style={active ? { background: '#22c55e20', color: '#16a34a' } : { background: `${colors.border}40`, color: colors.textSecondary }}
                                    >
                                        {active ? 'Ativo' : 'Acabou'}
                                    </span>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}
