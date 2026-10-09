// src/components/AdminDashboard/PointsSection.tsx
//
// Admin → Pontuação: quanto vale cada ação (convidar, seguir, publicar um serviço...), o limite por dia e o ranking de pontos.
// Os pontos entram em "Melhores perfis" (nível de hierarquia primeiro, depois pontos). Mudar um peso vale daqui pra frente.
'use client'

import { useCallback, useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import { toast } from 'sonner'
import { callAdminApi } from '@/lib/callAdminApi'
import { Spinner } from '@/components/Spinner'
import type { ThemeColors } from '@/app/contexts/theme'

interface Rule { action: string; label: string; description: string | null; points: number; daily_limit: number | null; is_active: boolean }
interface RankRow { profile_id: string; total: number; name: string | null; slug: string | null }

export default function PointsSection({ cardStyle, colors }: { cardStyle: React.CSSProperties; colors: ThemeColors }) {
    const [loading, setLoading] = useState(true)
    const [rules, setRules] = useState<Rule[]>([])
    const [ranking, setRanking] = useState<RankRow[]>([])
    const [saving, setSaving] = useState<string | null>(null)

    const load = useCallback(async () => {
        try {
            const res = await callAdminApi<{ rules: Rule[]; ranking: RankRow[] }>('/api/admin/points', { action: 'list' })
            setRules(res.rules)
            setRanking(res.ranking)
        } catch (err: any) { toast.error(err.message || 'Erro ao carregar a pontuação') }
        setLoading(false)
    }, [])
    useEffect(() => { load() }, [load])

    const update = (action: string, patch: Partial<Rule>) => setRules((prev) => prev.map((r) => (r.action === action ? { ...r, ...patch } : r)))

    const save = async (r: Rule) => {
        setSaving(r.action)
        try {
            await callAdminApi('/api/admin/points', { action: 'save', rule: r.action, points: r.points, daily_limit: r.daily_limit, is_active: r.is_active })
            toast.success('Pontuação salva!')
        } catch (err: any) { toast.error(err.message || 'Erro ao salvar') }
        setSaving(null)
    }

    const input: React.CSSProperties = { background: colors.background, border: `1px solid ${colors.border}`, color: colors.textPrimary, borderRadius: 12, padding: '8px 12px', fontSize: 13, width: '100%' }

    if (loading) return <div style={cardStyle} className="flex justify-center py-8"><Spinner size={24} color={colors.accent} /></div>

    return (
        <div className="space-y-5">
            <div style={cardStyle} className="space-y-1">
                <p className="text-sm font-black" style={{ color: colors.textPrimary }}>Pontuação dos perfis</p>
                <p className="text-xs" style={{ color: colors.textSecondary }}>
                    Cada ação vale uma quantidade de pontos. Em "Melhores perfis" a ordem é: nível de hierarquia primeiro e, dentro do nível, quem tem mais pontos.
                    Mudar um valor vale a partir de agora — o que já foi ganho fica com o valor da época. O limite por dia evita ganhar ponto em série.
                </p>
            </div>

            {rules.map((r) => (
                <div key={r.action} style={cardStyle} className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <p className="text-sm font-black" style={{ color: colors.textPrimary }}>{r.label}</p>
                            {r.description && <p className="text-[11px]" style={{ color: colors.textSecondary }}>{r.description}</p>}
                        </div>
                        <label className="flex items-center gap-2 text-xs font-bold flex-shrink-0 cursor-pointer" style={{ color: colors.textPrimary }}>
                            <input type="checkbox" checked={r.is_active} onChange={(e) => update(r.action, { is_active: e.target.checked })} className="w-4 h-4 accent-orange-500" />
                            Valendo
                        </label>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-0.5">
                            <span className="text-[10px] font-bold" style={{ color: colors.textSecondary }}>Pontos por ação</span>
                            <input type="number" min={0} value={r.points} onChange={(e) => update(r.action, { points: Number(e.target.value) })} style={input} />
                        </div>
                        <div className="flex flex-col gap-0.5">
                            <span className="text-[10px] font-bold" style={{ color: colors.textSecondary }}>Máximo por dia (vazio = sem limite)</span>
                            <input type="number" min={1} value={r.daily_limit ?? ''} onChange={(e) => update(r.action, { daily_limit: e.target.value === '' ? null : Number(e.target.value) })} style={input} />
                        </div>
                    </div>
                    <button onClick={() => save(r)} disabled={saving !== null} className="flex items-center gap-1.5 px-5 py-2 rounded-full text-xs font-black text-white disabled:opacity-50" style={{ background: colors.accent }}>
                        {saving === r.action ? <Spinner size={14} color="#fff" /> : <Save size={14} />} Salvar
                    </button>
                </div>
            ))}

            <div style={cardStyle} className="space-y-2">
                <p className="text-sm font-black" style={{ color: colors.textPrimary }}>Quem mais tem pontos</p>
                {ranking.length === 0 ? (
                    <p className="text-xs" style={{ color: colors.textSecondary }}>Ainda ninguém pontuou.</p>
                ) : ranking.map((row, i) => (
                    <div key={row.profile_id} className="flex items-center justify-between gap-3 text-xs">
                        <span style={{ color: colors.textPrimary }}><b>{i + 1}.</b> {row.name || 'Perfil'} {row.slug && <span style={{ color: colors.textSecondary }}>@{row.slug}</span>}</span>
                        <span className="font-black" style={{ color: '#f97316' }}>{row.total} pts</span>
                    </div>
                ))}
            </div>
        </div>
    )
}
