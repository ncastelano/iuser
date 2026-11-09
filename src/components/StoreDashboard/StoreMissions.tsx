// src/components/StoreDashboard/StoreMissions.tsx
//
// "Missões da loja" (2.0 e 3.0): a pontuação DIÁRIA da loja. Em cima, os pontos de hoje e como eles entram no OUTDOOR de lojas; no meio,
// as missões do dia (reiniciam toda manhã); embaixo, o cadastro da loja (passos que valem pontos enquanto estão feitos — cada um que falta
// é uma pílula que leva para onde se resolve). Quem confere se foi cumprido é o BANCO (`get_store_missions`, só o dono; migration
// 20261130000055): esta tela só mostra. Sem a migration (ou sem resposta) o quadro simplesmente não aparece.
'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, ChevronRight, Flame, Trophy } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { loadStoreMissions, missionPath, outdoorLine, splitMissions, streakLabel, todayRatio, type StoreMissions as Data } from '@/modules/missions'

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

    return (
        <section className="mb-6 rounded-3xl p-3.5" style={card} aria-label="Missões da loja">
            <div className="flex items-end justify-between">
                <p className="text-[26px] font-black leading-none">
                    {data.todayPoints}<span className="text-[14px] font-bold" style={{ color: colors.textSecondary }}> de {data.todayTotal} pts hoje</span>
                </p>
                <Trophy size={22} style={{ color: ORANGE }} />
            </div>
            <div className="h-2.5 rounded-full overflow-hidden mt-2.5" style={{ background: `${colors.border}60` }}>
                <span className="block h-full rounded-full transition-all" style={{ width: `${ratio * 100}%`, background: ratio >= 1 ? GREEN : ORANGE }} />
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2.5">
                <span className="h-7 px-2.5 rounded-full text-[11px] font-black flex items-center" style={{ background: `${ORANGE}1f`, color: ORANGE }}>{data.weekPoints} pts na semana</span>
                <span className="h-7 px-2.5 rounded-full text-[11px] font-black flex items-center gap-1" style={{ background: '#eab30826', color: '#a16207' }}><Flame size={12} />{streakLabel(data.streakDays)}</span>
            </div>
            <p className="text-[11.5px] font-semibold mt-2" style={{ color: colors.textSecondary }}>{outdoorLine(data.outdoor)}</p>

            {daily.length > 0 && (
                <>
                    <p className="text-[11px] font-black uppercase tracking-wider mt-4 mb-1.5" style={{ color: colors.textSecondary }}>Missões de hoje</p>
                    <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${colors.border}` }}>
                        {daily.map((m, i) => (
                            <div key={m.code} className="flex items-center gap-3 px-3 py-2.5" style={{ borderTop: i ? `1px solid ${colors.border}` : undefined, background: m.done ? `${GREEN}0f` : colors.background }}>
                                <span className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={m.done ? { background: GREEN, color: '#fff' } : { border: `2px solid ${colors.border}` }}>{m.done && <Check size={13} />}</span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-[13px] font-bold leading-tight" style={{ textDecoration: m.done ? 'line-through' : undefined, color: m.done ? colors.textSecondary : undefined }}>{m.title}</span>
                                    {!m.done && m.hint && <span className="block text-[11px] leading-snug mt-0.5" style={{ color: colors.textSecondary }}>{m.hint}</span>}
                                </span>
                                <span className="text-[11.5px] font-black px-2 py-0.5 rounded-full" style={{ background: m.done ? `${GREEN}22` : `${ORANGE}1f`, color: m.done ? '#16a34a' : ORANGE }}>+{m.points}</span>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {/* cadastro: completo = UMA linha (a lista de itens verdes só repetia o que já está certo); incompleto = só o que FALTA */}
            {cadastro.length > 0 && (cadastroPendente.length === 0 ? (
                <p className="text-[12px] font-bold mt-4 flex items-center gap-1.5" style={{ color: '#16a34a' }}><Check size={14} />Cadastro da loja completo · {cadastro.length} de {cadastro.length}</p>
            ) : (
                <>
                    <p className="text-[11px] font-black uppercase tracking-wider mt-4 mb-1.5 flex items-center gap-2" style={{ color: colors.textSecondary }}>
                        Falta no cadastro<span className="normal-case tracking-normal font-bold">{cadastroFeito} de {cadastro.length} feitos</span>
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                        {cadastroPendente.map((m) => (
                            <Link key={m.code} href={missionPath(storeSlug, m.dest)} title={m.hint ?? undefined} className="h-9 px-3 rounded-full text-[12px] font-black flex items-center gap-1.5 active:scale-95 transition"
                                style={{ background: `${AMBER}1f`, border: `1.5px solid ${AMBER}`, color: '#b45309', textDecoration: 'none' }}>
                                {m.title}<span className="text-[10.5px] px-1.5 rounded-full text-white" style={{ background: AMBER }}>+{m.points}</span><ChevronRight size={13} />
                            </Link>
                        ))}
                    </div>
                </>
            ))}
        </section>
    )
}
