// src/components/ProfileDashboard/MyPoints.tsx
//
// "Minha pontuação": total de pontos, quanto cada ação já rendeu e como ganhar mais. Os pontos (e o peso de cada ação,
// ajustado pelo admin) somam em "Melhores perfis". Tudo vem do banco (get_my_points). Não é mais um cartão separado:
// o Commission (o cartão único "Minha pontuação e graduação", com abas) usa o hook e o corpo daqui.
'use client'

import { useEffect, useState } from 'react'
import { Trophy } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { AREA_INFO, POINTS_AREAS, areaShares, bonusLabel, loadScoreboard, type Scoreboard } from '@/modules/points'

interface Rule { action: string; label: string; description: string | null; points: number; daily_limit: number | null }
export interface MyPointsData { total: number; rules: Rule[]; by_action: { action: string; times: number; points: number }[] }

export function useMyPoints() {
    const [data, setData] = useState<MyPointsData | null>(null)
    useEffect(() => {
        let cancelled = false
        supabase.rpc('get_my_points').then(({ data: d }) => { if (!cancelled) setData((d as MyPointsData) || null) })
        return () => { cancelled = true }
    }, [])
    return data
}

/** PLACAR DO PERFIL: o que cada área (lojas, serviços, motorista...) rende, o bônus de diversidade e o total. Some se não houver nada. */
function ScoreboardCard() {
    const { colors } = useTheme()
    const [sb, setSb] = useState<Scoreboard | null>(null)
    useEffect(() => {
        let alive = true
        void loadScoreboard().then((r) => { if (alive) setSb(r) })
        return () => { alive = false }
    }, [])
    if (!sb) return null
    const shares = areaShares(sb.areas)
    // só vale mostrar quando há mais de uma área em jogo ou algo fora de "pessoa": quem só tem pontos de pessoa já vê o total logo acima
    if (shares.length === 0 || (shares.length === 1 && shares[0].area === 'pessoa' && sb.bonusPct === 0)) return null
    const idle = POINTS_AREAS.filter((a) => !(sb.areas[a] > 0))
    const bonus = bonusLabel(sb.bonusPct)
    return (
        <div className="flex flex-col gap-2.5 rounded-2xl p-4" style={{ border: `1px solid ${colors.border}` }} aria-label="Placar do perfil">
            <div className="flex items-baseline justify-between gap-3">
                <p className="text-xs font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>Placar do perfil</p>
                <p className="text-lg font-black leading-none" style={{ color: '#f97316' }}>{sb.total.toLocaleString('pt-BR')} <span className="text-[11px] font-bold">pts</span></p>
            </div>
            <div className="flex flex-col gap-1.5">
                {shares.map(({ area, points, share }) => (
                    <div key={area} className="flex items-center gap-2">
                        <span className="w-[74px] text-[11px] font-black flex-shrink-0" style={{ color: colors.textPrimary }}>{AREA_INFO[area].label}</span>
                        <span className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: `${colors.border}55` }}>
                            <span className="block h-full rounded-full" style={{ width: `${Math.max(4, Math.round(share * 100))}%`, background: AREA_INFO[area].color }} />
                        </span>
                        <span className="w-14 text-right text-[11px] font-bold flex-shrink-0" style={{ color: colors.textSecondary }}>{points.toLocaleString('pt-BR')}</span>
                    </div>
                ))}
            </div>
            <p className="text-[11px] leading-snug" style={{ color: colors.textSecondary }}>
                {bonus
                    ? <>Bônus de diversidade <b style={{ color: '#16a34a' }}>{bonus}</b> por usar várias áreas do iUser.</>
                    : <>Usar mais de uma área do iUser (lojas, serviços, motorista...) dá bônus de diversidade{idle.length > 0 ? ` — ainda sem pontos em ${idle.slice(0, 3).map((a) => AREA_INFO[a].label).join(', ')}${idle.length > 3 ? ' e outras' : ''}` : ''}.</>}
                {!sb.useTotal && <> Por enquanto o ranking público usa só os seus pontos de pessoa ({sb.rankingPoints.toLocaleString('pt-BR')}).</>}
            </p>
        </div>
    )
}

export function MyPointsBody({ data }: { data: MyPointsData }) {
    const { colors } = useTheme()
    const done = new Map(data.by_action.map((a) => [a.action, a]))
    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 rounded-2xl p-4 text-white" style={{ background: 'linear-gradient(135deg, #f97316, #dc2626)' }}>
                <Trophy size={30} />
                <div>
                    <p className="text-3xl font-black leading-none">{data.total}</p>
                    <p className="text-xs font-bold opacity-90 mt-1">pontos no total · sobem você em Melhores perfis</p>
                </div>
            </div>

            <ScoreboardCard />

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
        </div>
    )
}
