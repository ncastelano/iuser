// src/components/AdminDashboard/PointsSection.tsx
//
// Admin → Pontuação: o motor único. Uma aba por Outdoor (Pessoas, Lojas, Serviços, Produtos, Digitais, Imóveis, Motoristas) e o "Perfil total".
//  • Pessoas: as TAREFAS (regras de evento) e a "Nova tarefa" — pontos, limite por dia/total, vigência, penalidade.
//  • Os demais: os SINAIS de cada Outdoor (peso × número) e quais deles também somam no total do dono.
//  • Perfil total: bônus de diversidade, simulador e o ranking de hoje × com o total novo (a chave que liga o total novo no app fica aqui).
// Os pontos definem a ordem dos Outdoors e de "Melhores perfis". A hierarquia (user_statuses) não entra nessa conta.
'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from '@/lib/toast'
import { callAdminApi } from '@/lib/callAdminApi'
import { Spinner } from '@/components/Spinner'
import type { ThemeColors } from '@/app/contexts/theme'
import { AREA_INFO, POINTS_AREAS, type PointsArea } from '@/modules/points'
import RulesPanel from './points/RulesPanel'
import SignalsPanel from './points/SignalsPanel'
import TotalPanel from './points/TotalPanel'
import type { Overview } from './points/shared'

type Tab = PointsArea | 'total'

export default function PointsSection({ cardStyle, colors }: { cardStyle: React.CSSProperties; colors: ThemeColors }) {
    const [data, setData] = useState<Overview | null>(null)
    const [tab, setTab] = useState<Tab>('pessoa')

    const load = useCallback(async () => {
        try { setData(await callAdminApi<Overview>('/api/admin/points', { action: 'overview' })) }
        catch (err: any) { toast.error(err.message || 'Erro ao carregar a pontuação') }
    }, [])
    useEffect(() => { void load() }, [load])

    if (!data) return <div style={cardStyle} className="flex justify-center py-8"><Spinner size={24} color={colors.accent} /></div>

    const tabs: { id: Tab; label: string; color: string }[] = [
        ...POINTS_AREAS.map((a) => ({ id: a as Tab, label: a === 'pessoa' ? 'Pessoas' : AREA_INFO[a].label, color: AREA_INFO[a].color })),
        { id: 'total', label: 'Perfil total', color: '#f97316' },
    ]
    const panelProps = { colors, cardStyle, reload: load }

    return (
        <div className="space-y-4">
            <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" role="tablist" aria-label="Pontuação por tipo">
                {tabs.map((t) => {
                    const on = tab === t.id
                    return (
                        <button key={t.id} role="tab" aria-selected={on} onClick={() => setTab(t.id)} className="flex-shrink-0 h-9 px-4 rounded-full text-xs font-black transition active:scale-95"
                            style={on ? { background: t.color, color: '#fff' } : { background: `${colors.border}40`, color: colors.textPrimary }}>
                            {t.label}
                        </button>
                    )
                })}
            </div>

            {tab === 'pessoa' && <RulesPanel events={data.events} rules={data.rules} ranking={data.ranking} {...panelProps} />}
            {tab !== 'pessoa' && tab !== 'total' && <SignalsPanel key={tab} kind={tab} signals={data.signals} {...panelProps} />}
            {tab === 'total' && data.settings && <TotalPanel key={data.settings.refreshed_at || 'x'} settings={data.settings} {...panelProps} />}
        </div>
    )
}
