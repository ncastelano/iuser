// src/components/StoreDashboard/StoreMissions.tsx
//
// "Missões da loja" (2.0 e 3.0): a pontuação DIÁRIA da loja. Em cima, os pontos de hoje e como eles entram no OUTDOOR de lojas; no meio,
// as missões do dia (reiniciam toda manhã); embaixo, o cadastro da loja (passos que valem pontos enquanto estão feitos — cada um que falta
// é uma pílula que leva para onde se resolve). Quem confere se foi cumprido é o BANCO (`get_store_missions`, só o dono; migration
// 20261130000055): esta tela só mostra. Sem a migration (ou sem resposta) o quadro simplesmente não aparece.
'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, ChevronRight, Flame, Plus, Store, Trophy } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { levelLine, loadStoreMissions, missionPath, outdoorLine, splitMissions, streakLabel, todayRatio, type StoreMissions as Data } from '@/modules/missions'

const ORANGE = '#f97316', GREEN = '#22c55e', AMBER = '#f59e0b'
const REFRESH_MS = 60_000

export default function StoreMissions({ storeId, storeSlug }: { storeId: string; storeSlug: string }) {
    const { colors } = useTheme()
    const [data, setData] = useState<Data | null>(null)

    const load = useCallback(async () => { const d = await loadStoreMissions(storeId); if (d) setData(d) }, [storeId])
    useEffect(() => {
        load()
        const t = setInterval(() => { if (document.visibilityState === 'visible') load() }, REFRESH_MS)
        const onVis = () => { if (document.visibilityState === 'visible') load() }
        document.addEventListener('visibilitychange', onVis)
        return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis) }
    }, [load])

    if (!data) return null
    const { daily, cadastro, cadastroFeito, cadastroPendente } = splitMissions(data)
    const ratio = todayRatio(data)
    const card = { background: colors.surface, border: `1px solid ${colors.border}` }

    // o mesmo desenho da Editar loja: título pequeno em maiúsculas + uma frase, e um cartão só com uma linha por coisa
    const linha = (k: string, icon: React.ReactNode, cor: string, t: string, sub: string | null, direita: React.ReactNode, primeira: boolean) => (
        <div key={k} className="w-full flex items-center gap-3 px-3.5 py-3" style={{ borderTop: primeira ? undefined : `1px solid ${colors.border}` }}>
            <span className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: `${cor}26`, color: cor }}>{icon}</span>
            <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-black leading-tight" style={{ color: colors.textPrimary }}>{t}</span>
                {sub && <span className="block text-[11.5px] font-semibold leading-tight mt-0.5" style={{ color: colors.textSecondary }}>{sub}</span>}
            </span>
            {direita}
        </div>
    )
    const pts = (n: number, done?: boolean) => (
        <span className="text-[11.5px] font-black px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: done ? `${GREEN}22` : `${ORANGE}1f`, color: done ? '#16a34a' : ORANGE }}>+{n}</span>
    )

    return (
        <section aria-label="Missões da loja">
            <div className="mt-6 mb-1.5">
                <p className="text-[11px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>Missões</p>
                <p className="text-[11px]" style={{ color: colors.textSecondary }}>Pontos de hoje, as missões do dia e o cadastro da loja</p>
            </div>
            <div className="rounded-3xl overflow-hidden" style={card}>
                {linha('hoje', <Trophy size={18} />, ORANGE, `${data.todayPoints} de ${data.todayTotal} pts hoje`,
                    `${data.weekPoints} pts na semana · ${streakLabel(data.streakDays)}`,
                    <span className="text-[11.5px] font-black flex-shrink-0" style={{ color: ratio >= 1 ? GREEN : ORANGE }}>{Math.round(ratio * 100)}%</span>, true)}
                <div className="px-3.5 pb-3">
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: `${colors.border}60` }}>
                        <span className="block h-full rounded-full transition-all" style={{ width: `${ratio * 100}%`, background: ratio >= 1 ? GREEN : ORANGE }} />
                    </div>
                    <p className="text-[11px] font-semibold mt-1.5" style={{ color: colors.textSecondary }}>{outdoorLine(data.outdoor)}</p>
                    {levelLine(data.level) && <p className="text-[11px] font-black mt-0.5" style={{ color: ORANGE }}>{levelLine(data.level)}</p>}
                </div>
                {daily.map((m) => linha(m.code, m.done ? <Check size={18} /> : <Flame size={18} />, m.done ? GREEN : AMBER, m.title,
                    !m.done && m.hint ? m.hint : (m.done ? 'Feita hoje' : null), pts(m.points, m.done), false))}
                {cadastro.length > 0 && (cadastroPendente.length === 0
                    ? linha('cadastro', <Check size={18} />, GREEN, 'Cadastro da loja completo', `${cadastro.length} de ${cadastro.length} passos feitos`, null, false)
                    : <>
                        {linha('cadastro', <Store size={18} />, AMBER, 'Cadastro da loja', `${cadastroFeito} de ${cadastro.length} passos feitos`, null, false)}
                        {cadastroPendente.map((m) => (
                            <Link key={m.code} href={missionPath(storeSlug, m.dest)} title={m.hint ?? undefined} className="w-full flex items-center gap-3 px-3.5 py-3 active:opacity-70" style={{ borderTop: `1px solid ${colors.border}`, textDecoration: 'none' }}>
                                <span className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: `${AMBER}26`, color: '#b45309' }}><Plus size={18} /></span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-[13.5px] font-black leading-tight" style={{ color: colors.textPrimary }}>{m.title}</span>
                                    {m.hint && <span className="block text-[11.5px] font-semibold leading-tight mt-0.5" style={{ color: colors.textSecondary }}>{m.hint}</span>}
                                </span>
                                {pts(m.points)}
                                <ChevronRight size={16} style={{ color: colors.textSecondary }} />
                            </Link>
                        ))}
                    </>)}
            </div>
        </section>
    )
}
