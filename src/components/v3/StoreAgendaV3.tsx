// src/components/v3/StoreAgendaV3.tsx
//
// "Agenda" da página de uma loja de atendimento (3.0): os dias com vaga e os horários disponíveis, direto na página. Tocar num horário
// livre abre o agendador já com o dia e a hora escolhidos. Quem quiser pode ligar "Mostrar ocupados" para ver também os horários já
// tomados (sem dizer por quem). Só leitura: vagas = configuração da loja (stores.opening_hours) menos get_store_busy_slots.
'use client'

import { useEffect, useMemo, useState } from 'react'
import { Calendar, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { DEFAULT_OPENING, daySlots, dateKey, freeCount, type BusySlot, type OpeningConfig } from '@/lib/storeSlots'

const ORANGE = '#f97316'
const DAYS = 14

const weekdayShort = (d: Date) => d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
const longDay = (d: Date) => {
    const t = d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
    return t.charAt(0).toUpperCase() + t.slice(1)
}

export default function StoreAgendaV3({ storeId, colors, durationMin, onPick }: {
    storeId: string
    colors: any
    /** duração usada para ver o que cabe: a do serviço mais curto da loja */
    durationMin: number
    onPick: (date: Date, time: string) => void
}) {
    const soft = `${colors.border}30`
    const [cfg, setCfg] = useState<OpeningConfig | null | undefined>(undefined)
    const [busy, setBusy] = useState<BusySlot[] | null>(null)
    const [showBusy, setShowBusy] = useState(false)
    const [picked, setPicked] = useState<string | null>(null) // dateKey do dia aberto

    useEffect(() => {
        let cancelled = false
        const from = new Date()
        const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + DAYS)
        const ymd = (d: Date) => dateKey(d)
        supabase.from('stores').select('opening_hours').eq('id', storeId).maybeSingle().then(({ data }) => {
            if (!cancelled) setCfg((data as { opening_hours?: OpeningConfig | null } | null)?.opening_hours || null)
        })
        supabase.rpc('get_store_busy_slots', { p_store_id: storeId, p_from: ymd(from), p_to: ymd(to) }).then(({ data, error }) => {
            if (cancelled) return
            setBusy(error || !data ? [] : (data as { slot_date: string; slot_time: string; duration_minutes: number }[]).map((r) => ({ date: r.slot_date, time: r.slot_time, duration: r.duration_minutes })))
        })
        return () => { cancelled = true }
    }, [storeId])

    const days = useMemo(() => {
        if (cfg === undefined || busy === null) return null
        const now = new Date()
        return Array.from({ length: DAYS }, (_, i) => {
            const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i)
            const slots = daySlots(cfg || DEFAULT_OPENING, date, durationMin, busy, now)
            return { date, key: dateKey(date), slots, free: freeCount(slots) }
        })
    }, [cfg, busy, durationMin])

    // abre no primeiro dia com vaga
    useEffect(() => {
        if (!days || picked) return
        const first = days.find((d) => d.free > 0)
        if (first) setPicked(first.key)
    }, [days, picked])

    if (!days) {
        return (
            <section className="mt-6" aria-hidden>
                <div className="h-5 w-48 rounded animate-pulse" style={{ background: colors.border }} />
                <div className="mt-3 flex gap-2 overflow-hidden">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="w-[58px] h-[78px] rounded-2xl flex-shrink-0 animate-pulse" style={{ background: colors.border }} />)}</div>
            </section>
        )
    }
    const noAgenda = (cfg || DEFAULT_OPENING).is_active === false
    if (noAgenda) return null
    const current = days.find((d) => d.key === picked)
    const anyFree = days.some((d) => d.free > 0)

    return (
        <section className="mt-6">
            <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-black flex items-center gap-2" style={{ color: colors.textPrimary }}><Calendar size={17} style={{ color: ORANGE }} /> Horários livres</h3>
                <button onClick={() => setShowBusy((v) => !v)} role="switch" aria-checked={showBusy} className="flex items-center gap-2 text-[11px] font-bold" style={{ color: colors.textSecondary }}>
                    Ver ocupados
                    <span className="relative w-9 h-5 rounded-full transition-colors" style={{ background: showBusy ? ORANGE : 'rgba(120,120,120,0.35)' }}>
                        <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all" style={{ left: showBusy ? 18 : 2 }} />
                    </span>
                </button>
            </div>

            {!anyFree ? (
                <p className="mt-3 text-sm rounded-2xl p-4" style={{ background: soft, color: colors.textSecondary }}>Sem horários livres nos próximos {DAYS} dias. Fale com a loja.</p>
            ) : (
                <>
                    <div className="mt-3 flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
                        {days.map((d) => {
                            const on = picked === d.key
                            const closed = d.free === 0
                            return (
                                <button
                                    key={d.key}
                                    onClick={() => !closed && setPicked(d.key)}
                                    disabled={closed}
                                    className="flex-shrink-0 w-[58px] py-2.5 rounded-2xl flex flex-col items-center gap-0.5 transition active:scale-95 disabled:cursor-not-allowed"
                                    style={on ? { background: ORANGE, color: '#fff' } : { background: soft, color: closed ? colors.textSecondary : colors.textPrimary, opacity: closed ? 0.5 : 1 }}
                                >
                                    <span className="text-[11px] font-bold capitalize">{weekdayShort(d.date)}</span>
                                    <span className="text-lg font-black leading-none">{d.date.getDate()}</span>
                                    <span className="text-[10px] font-bold" style={{ color: on ? 'rgba(255,255,255,0.9)' : closed ? colors.textSecondary : '#16a34a' }}>{closed ? '—' : `${d.free} ${d.free === 1 ? 'vaga' : 'vagas'}`}</span>
                                </button>
                            )
                        })}
                    </div>

                    {current && (
                        <>
                            <p className="mt-3.5 text-[11px] font-black" style={{ color: colors.textSecondary }}>{longDay(current.date)}</p>
                            <div className="mt-1.5 grid grid-cols-4 gap-2">
                                {current.slots.filter((s) => showBusy || s.status === 'free').map((s) => {
                                    const free = s.status === 'free'
                                    return (
                                        <button
                                            key={s.time}
                                            onClick={() => free && onPick(current.date, s.time)}
                                            disabled={!free}
                                            className="h-11 rounded-full text-[13px] font-black transition active:scale-95 disabled:cursor-not-allowed"
                                            style={free ? { background: soft, color: colors.textPrimary } : { background: 'transparent', color: colors.textSecondary, opacity: 0.5, textDecoration: 'line-through' }}
                                        >
                                            {s.time}
                                        </button>
                                    )
                                })}
                            </div>
                            {showBusy && <p className="mt-2 text-[10px] flex items-center gap-1" style={{ color: colors.textSecondary }}><Check size={11} /> Os riscados já estão reservados.</p>}
                        </>
                    )}
                </>
            )}
        </section>
    )
}
