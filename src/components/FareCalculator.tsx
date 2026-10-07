// src/components/FareCalculator.tsx
//
// Calculadora de tarifa do /painel-motorista (aba Tarifa): distância ↔ tempo ↔ valor ↔
// rendimento por hora, sempre a 40 km/h (fixo). Usa a tarifa que o motorista escolheu na
// própria aba (Tarifa da plataforma ou Tarifa Personalizada) e recalcula na hora a cada
// digitação. As contas ficam em src/lib/fareCalculator.ts (puras e testadas); aqui é só tela.
'use client'

import { useMemo, useState } from 'react'
import { Calculator, Clock, Route, Target, ChevronDown, ChevronUp, Info } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import {
    VELOCIDADE_MEDIA_KMH,
    calculateDistanceFromTime,
    calculateFare,
    calculateGoalComparison,
    calculateHourlyEarning,
    calculateSimulationTable,
    calculateTimeFromDistance,
    formatBRL,
    formatDuration,
    formatKm,
    validateDistanceInput,
    validateGoalInput,
    validateMinutesInput,
    type FareTariff,
} from '@/lib/fareCalculator'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

type Mode = 'distancia' | 'tempo' | 'meta'

const MODES: { id: Mode; label: string; icon: typeof Route }[] = [
    { id: 'distancia', label: 'Distância', icon: Route },
    { id: 'tempo', label: 'Tempo', icon: Clock },
    { id: 'meta', label: 'Meta/hora', icon: Target },
]

interface FareCalculatorProps {
    tariff: FareTariff
    /** "Tarifa da plataforma" ou "Tarifa Personalizada" — só pra mostrar qual está sendo usada */
    tariffLabel: string
    /** A outra tarifa (plataforma ↔ personalizada), pra mostrar o mesmo cálculo nas duas */
    compare?: { label: string; tariff: FareTariff }
}

export default function FareCalculator({ tariff, tariffLabel, compare }: FareCalculatorProps) {
    const { colors } = useTheme()
    const [mode, setMode] = useState<Mode>('distancia')
    const [distance, setDistance] = useState('15')
    const [minutes, setMinutes] = useState('30')
    const [goal, setGoal] = useState('100')
    const [showTable, setShowTable] = useState(false)

    const table = useMemo(() => calculateSimulationTable(tariff), [tariff])

    const dist = validateDistanceInput(distance)
    const mins = validateMinutesInput(minutes)
    const goalParsed = validateGoalInput(goal)

    const inputBase: React.CSSProperties = {
        background: colors.background,
        border: `1px solid ${colors.border}`,
        color: colors.textPrimary,
    }
    const card: React.CSSProperties = { background: colors.surface, border: `1px solid ${colors.border}` }

    const field = (label: string, value: string, setValue: (v: string) => void, unit: string, placeholder: string, parsed: ReturnType<typeof validateDistanceInput>) => (
        <div>
            <label className="text-[11px] font-bold block mb-1.5" style={{ color: colors.textSecondary }}>{label}</label>
            <div className="flex items-center gap-2 rounded-2xl px-4 py-2.5" style={inputBase}>
                <input
                    type="text"
                    inputMode="decimal"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder={placeholder}
                    className="flex-1 min-w-0 bg-transparent outline-none text-lg font-black"
                    style={{ color: colors.textPrimary }}
                />
                <span className="text-sm font-bold flex-shrink-0" style={{ color: colors.textSecondary }}>{unit}</span>
            </div>
            {'error' in parsed && <p className="text-[11px] mt-1.5 font-semibold" style={{ color: '#ef4444' }}>{parsed.error}</p>}
        </div>
    )

    const row = (label: string, value: string, strong = false) => (
        <div className="flex items-baseline justify-between gap-3 py-1.5">
            <span className="text-xs font-semibold" style={{ color: colors.textSecondary }}>{label}</span>
            <span className={strong ? 'text-xl font-black' : 'text-base font-black'} style={{ color: strong ? '#16a34a' : colors.textPrimary }}>{value}</span>
        </div>
    )

    // Resultado da corrida (modos distância e tempo): mesmo card, só muda de onde vem a distância
    const rideResult = (distanceKm: number, timeLabelFirst: boolean) => {
        const fare = calculateFare(distanceKm, tariff)
        const perHour = calculateHourlyEarning(distanceKm, fare)
        const duration = formatDuration(calculateTimeFromDistance(distanceKm))
        return (
            <div className="rounded-2xl p-4" style={card}>
                <p className="text-[10px] font-black uppercase tracking-wider mb-1" style={{ color: '#f97316' }}>Resultado da corrida</p>
                {timeLabelFirst ? (
                    <>
                        {row('Tempo', duration)}
                        {row('Distância estimada', formatKm(distanceKm))}
                    </>
                ) : (
                    <>
                        {row('Distância', formatKm(distanceKm))}
                        {row('Tempo estimado', duration)}
                    </>
                )}
                {row('Valor da corrida', formatBRL(fare))}
                <div className="h-px my-1.5" style={{ background: colors.border }} />
                {row('Rendimento', perHour != null ? `${formatBRL(perHour)}/h` : '—', true)}
                {compare && (() => {
                    const otherFare = calculateFare(distanceKm, compare.tariff)
                    const otherPerHour = calculateHourlyEarning(distanceKm, otherFare)
                    const diff = Math.round((otherFare - fare) * 100) / 100
                    return (
                        <div className="mt-2 rounded-xl px-3 py-2 text-[11px] font-semibold" style={{ background: `${colors.border}25`, color: colors.textSecondary }}>
                            Pela {compare.label}: <strong style={{ color: colors.textPrimary }}>{formatBRL(otherFare)}</strong>
                            {otherPerHour != null && ` · ${formatBRL(otherPerHour)}/h`}
                            {diff === 0 ? ' — o mesmo valor.' : ` — ${diff > 0 ? `${formatBRL(diff)} a mais` : `${formatBRL(-diff)} a menos`} que a ${tariffLabel}.`}
                        </div>
                    )
                })()}
            </div>
        )
    }

    const goalValue = 'value' in goalParsed ? goalParsed.value : null
    const comparison = goalValue != null ? calculateGoalComparison(tariff, goalValue) : null

    return (
        <div className="p-4 rounded-2xl border space-y-4" style={{ background: colors.surface, borderColor: colors.border }}>
            <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: GRADIENT, color: '#fff' }}>
                    <Calculator size={16} />
                </div>
                <div className="min-w-0">
                    <p className="text-sm font-black" style={{ color: colors.textPrimary }}>Calculadora de tarifa</p>
                    <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                        Quanto cobrar, quanto tempo leva e quanto rende por hora
                    </p>
                </div>
            </div>

            <p className="text-[11px] font-bold px-3 py-1.5 rounded-full w-fit max-w-full" style={{ background: `${colors.border}30`, color: colors.textSecondary }}>
                Usando a {tariffLabel}: até {formatKm(tariff.baseDistanceKm)} = {formatBRL(tariff.baseFee)}, acima + {formatBRL(tariff.pricePerKm)}/km
            </p>

            <div className="flex gap-1.5 p-1 rounded-full" style={{ background: `${colors.border}30` }}>
                {MODES.map((m) => {
                    const Icon = m.icon
                    const active = mode === m.id
                    return (
                        <button
                            key={m.id}
                            onClick={() => setMode(m.id)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-full text-xs font-black transition-all"
                            style={active ? { background: GRADIENT, color: '#fff', boxShadow: '0 2px 8px #f9731650' } : { color: colors.textSecondary }}
                        >
                            <Icon size={13} />
                            {m.label}
                        </button>
                    )
                })}
            </div>

            {mode === 'distancia' && (
                <>
                    {field('Qual a distância da corrida?', distance, setDistance, 'km', '15', dist)}
                    {'value' in dist && rideResult(dist.value, false)}
                </>
            )}

            {mode === 'tempo' && (
                <>
                    {field('Quanto tempo terá a corrida?', minutes, setMinutes, 'minutos', '30', mins)}
                    {'value' in mins && rideResult(calculateDistanceFromTime(mins.value), true)}
                </>
            )}

            {mode === 'meta' && (
                <>
                    {field('Quanto quero faturar por hora?', goal, setGoal, 'R$/h', '100', goalParsed)}
                    {comparison && (
                        <div className="space-y-3">
                            <div className="rounded-2xl p-4" style={card}>
                                <p className="text-[10px] font-black uppercase tracking-wider mb-1" style={{ color: '#f97316' }}>Para chegar nessa meta</p>
                                {row('Meta', `${formatBRL(comparison.goalPerHour)}/h`)}
                                {row('Valor necessário por km', `${formatBRL(comparison.requiredPricePerKm)}/km`, true)}
                                <p className="text-[11px] mt-1" style={{ color: colors.textSecondary }}>
                                    A {VELOCIDADE_MEDIA_KMH} km/h: {formatBRL(comparison.goalPerHour)}/h
                                </p>
                                <div className="grid grid-cols-4 gap-2 mt-3">
                                    {comparison.examples.map((e) => (
                                        <div key={e.distanceKm} className="rounded-xl py-2 text-center" style={{ background: `${colors.border}25` }}>
                                            <p className="text-[10px] font-bold" style={{ color: colors.textSecondary }}>{formatKm(e.distanceKm)}</p>
                                            <p className="text-xs font-black" style={{ color: colors.textPrimary }}>{formatBRL(e.fare)}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div
                                className="rounded-2xl p-4"
                                style={{
                                    background: comparison.reached ? '#22c55e14' : '#f9731614',
                                    border: `1px solid ${comparison.reached ? '#22c55e50' : '#f9731650'}`,
                                }}
                            >
                                <p className="text-[10px] font-black uppercase tracking-wider mb-2" style={{ color: comparison.reached ? '#16a34a' : '#ea580c' }}>
                                    Sua tarifa atual × sua meta
                                </p>
                                {[
                                    { label: 'Tarifa atual', value: comparison.currentPerHour, color: comparison.reached ? '#22c55e' : '#f97316' },
                                    { label: 'Meta', value: comparison.goalPerHour, color: colors.textPrimary },
                                ].map((b) => {
                                    const max = Math.max(comparison.currentPerHour, comparison.goalPerHour) || 1
                                    return (
                                        <div key={b.label} className="mb-2">
                                            <div className="flex justify-between text-[11px] font-bold mb-1" style={{ color: colors.textPrimary }}>
                                                <span>{b.label}</span>
                                                <span>{formatBRL(b.value)}/h</span>
                                            </div>
                                            <div className="h-2.5 rounded-full overflow-hidden" style={{ background: `${colors.border}55` }}>
                                                <div className="h-full rounded-full" style={{ width: `${Math.max(4, (b.value / max) * 100)}%`, background: b.color }} />
                                            </div>
                                        </div>
                                    )
                                })}
                                <p className="text-xs font-bold mt-3" style={{ color: colors.textPrimary }}>
                                    Com sua tarifa atual, o rendimento estimado é {formatBRL(comparison.currentPerHour)}/h.
                                </p>
                                <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>
                                    {comparison.reached
                                        ? `Você já atinge a meta de ${formatBRL(comparison.goalPerHour)}/h.`
                                        : `Para atingir ${formatBRL(comparison.goalPerHour)}/h, seria necessário aproximadamente ${formatBRL(comparison.requiredPricePerKm)}/km.`}
                                </p>
                            </div>
                            <p className="text-[10px]" style={{ color: colors.textSecondary }}>
                                Só uma simulação: sua tarifa cadastrada não muda.
                            </p>
                        </div>
                    )}
                </>
            )}

            <div className="flex items-start gap-1.5 text-[10px] leading-snug" style={{ color: colors.textSecondary }}>
                <Info size={12} className="flex-shrink-0 mt-0.5" />
                <span>
                    O rendimento por hora é uma estimativa matemática: o quanto você faturaria por hora se fizesse corridas seguidas nessa mesma proporção de distância e valor, sem tempo parado. O tempo é sempre calculado a {VELOCIDADE_MEDIA_KMH} km/h (1 km = 1 min 30 s) — não é a previsão do trânsito.
                </span>
            </div>

            <button
                onClick={() => setShowTable((v) => !v)}
                className="w-full flex items-center justify-between text-xs font-black px-3 py-2 rounded-xl"
                style={{ background: `${colors.border}25`, color: colors.textPrimary }}
            >
                Tabela de simulação
                {showTable ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {showTable && (
                <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead>
                            <tr style={{ color: colors.textSecondary }}>
                                <th className="text-left font-bold py-1.5">Distância</th>
                                <th className="text-left font-bold py-1.5">Tempo</th>
                                <th className="text-right font-bold py-1.5">Valor</th>
                                <th className="text-right font-bold py-1.5">R$/hora</th>
                            </tr>
                        </thead>
                        <tbody>
                            {table.map((r) => (
                                <tr key={r.distanceKm} style={{ borderTop: `1px solid ${colors.border}`, color: colors.textPrimary }}>
                                    <td className="py-1.5 font-bold">{formatKm(r.distanceKm)}</td>
                                    <td className="py-1.5">{formatDuration(r.minutes)}</td>
                                    <td className="py-1.5 text-right">{formatBRL(r.fare)}</td>
                                    <td className="py-1.5 text-right font-black" style={{ color: '#16a34a' }}>{r.perHour != null ? `${formatBRL(r.perHour)}/h` : '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}
