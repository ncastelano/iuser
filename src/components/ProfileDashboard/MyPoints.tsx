// src/components/ProfileDashboard/MyPoints.tsx
//
// "Minha pontuação": total de pontos, quanto cada ação já rendeu e como ganhar mais. Os pontos (e o peso de cada ação,
// ajustado pelo admin) somam em "Melhores perfis". Tudo vem do banco (get_my_points).
'use client'

import { useEffect, useState } from 'react'
import { Trophy } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import DashboardSection from './DashboardSection'

interface Rule { action: string; label: string; description: string | null; points: number; daily_limit: number | null }
interface MyPointsData { total: number; rules: Rule[]; by_action: { action: string; times: number; points: number }[] }

export default function MyPoints() {
    const { colors } = useTheme()
    const [data, setData] = useState<MyPointsData | null>(null)

    useEffect(() => {
        supabase.rpc('get_my_points').then(({ data: d }) => setData((d as MyPointsData) || null))
    }, [])

    if (!data) return null
    const done = new Map(data.by_action.map((a) => [a.action, a]))

    return (
        <DashboardSection
            storageKey="minha-pontuacao"
            title="Minha pontuação"
            subtitle="Pontos que sobem você em Melhores perfis"
            collapsedSummary={<span><b style={{ color: '#f97316' }}>{data.total}</b> pontos</span>}
        >
            <div className="flex items-center gap-3 rounded-2xl p-4 text-white" style={{ background: 'linear-gradient(135deg, #f97316, #dc2626)' }}>
                <Trophy size={30} />
                <div>
                    <p className="text-3xl font-black leading-none">{data.total}</p>
                    <p className="text-xs font-bold opacity-90 mt-1">pontos no total</p>
                </div>
            </div>

            <div className="flex flex-col gap-2">
                <p className="text-xs font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>Como ganhar mais</p>
                {data.rules.map((r) => {
                    const mine = done.get(r.action)
                    return (
                        <div key={r.action} className="flex items-center justify-between gap-3 p-3 rounded-2xl" style={{ border: `1px solid ${colors.border}` }}>
                            <div className="min-w-0">
                                <p className="text-sm font-black" style={{ color: colors.textPrimary }}>{r.label}</p>
                                <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                                    {mine ? `${mine.times}x · já rendeu ${mine.points} pts` : 'Ainda não fez'}
                                    {r.daily_limit ? ` · vale até ${r.daily_limit}x por dia` : ''}
                                </p>
                            </div>
                            <span className="text-sm font-black flex-shrink-0" style={{ color: '#f97316' }}>+{r.points}</span>
                        </div>
                    )
                })}
            </div>
        </DashboardSection>
    )
}
