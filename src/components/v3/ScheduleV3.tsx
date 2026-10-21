// src/components/v3/ScheduleV3.tsx
//
// Agendar na loja, interface 3.0. Duas telas, uma coisa de cada vez:
//  1) "Agendar": escolher o(s) serviço(s), o dia (faixa dos próximos dias com vagas) e o horário (grade); atalhos para os próximos
//     horários livres. A barra de baixo mostra o que foi escolhido e leva para a próxima tela.
//  2) "Confirmar": resumo (serviços, dia, hora, duração, valor), um recado opcional e o botão de confirmar — ou "Entrar" para quem
//     não está logado (volta para cá já com o serviço escolhido).
// Só apresentação: as regras de horário, vagas e o envio ficam em StoreSchedule.tsx.
'use client'

import { ArrowRight, Check, Clock, Minus, Plus } from 'lucide-react'
import { Spinner } from '@/components/Spinner'

const ORANGE = '#f97316'

export interface V3Service { id: string; name: string; description?: string | null; price: number | null; duration_minutes: number | null }
export interface V3Item { product: V3Service; quantity: number }
export interface V3Slot { date: Date; time: string; dateStr: string }
export interface V3Day { date: Date; dateStr: string; free: number }

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const sameDay = (a: Date | null, b: Date) => !!a && a.toDateString() === b.toDateString()
const weekdayShort = (d: Date) => d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
const dayLong = (d: Date) => {
    const t = d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
    return t.charAt(0).toUpperCase() + t.slice(1)
}

export default function ScheduleV3(p: {
    colors: any
    step: 'datetime' | 'confirm'
    storeName: string
    services: V3Service[]
    loadingServices: boolean
    items: V3Item[]
    onToggleService: (s: V3Service) => void
    onChangeQty: (id: string, delta: number) => void
    duration: number
    nextSlots: V3Slot[]
    days: V3Day[]
    selectedDate: Date | null
    onPickDate: (d: Date) => void
    slots: { time: string; status: 'free' | 'occupied' }[]
    selectedTime: string | null
    onPickTime: (t: string) => void
    onPickSuggestion: (s: V3Slot) => void
    onContinue: () => void
    note: string
    onNote: (v: string) => void
    isPublic: boolean
    onPublic: (v: boolean) => void
    authed: boolean
    onLogin: () => void
    submitting: boolean
    onConfirm: () => void
    error: string | null
}) {
    const { colors } = p
    const soft = `${colors.border}30`
    const hasService = p.items.length > 0
    const total = p.items.reduce((sum, i) => sum + (Number(i.product.price) || 0) * i.quantity, 0)
    const ready = !!p.selectedDate && !!p.selectedTime && hasService
    const qtyOf = (id: string) => p.items.find((i) => i.product.id === id)?.quantity || 0
    const summaryLine = p.selectedDate && p.selectedTime ? `${weekdayShort(p.selectedDate)}, ${p.selectedDate.getDate()}/${String(p.selectedDate.getMonth() + 1).padStart(2, '0')} · ${p.selectedTime} · ${p.duration} min` : ''

    const bar = (label: string, onClick: () => void, opts: { busy?: boolean; disabled?: boolean; line?: string; price?: string } = {}) => (
        <div className="sticky bottom-0 -mx-6 px-6 pt-3 pb-4 mt-6" style={{ background: `linear-gradient(to top, ${colors.background} 78%, transparent)` }}>
            {p.error && <p className="mb-2 text-xs font-bold text-center" style={{ color: '#ef4444' }}>{p.error}</p>}
            {(opts.line || opts.price) && (
                <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                    <span className="font-black min-w-0 truncate" style={{ color: colors.textPrimary }}>{opts.line}</span>
                    {opts.price && <span className="font-black flex-shrink-0" style={{ color: ORANGE }}>{opts.price}</span>}
                </div>
            )}
            <button onClick={onClick} disabled={opts.disabled || opts.busy} className="w-full h-12 rounded-full text-sm font-black text-white flex items-center justify-center gap-2 transition active:scale-[0.98] disabled:opacity-45" style={{ background: ORANGE }}>
                {opts.busy ? <Spinner size={18} color="#fff" /> : <>{label} <ArrowRight size={16} /></>}
            </button>
        </div>
    )

    // ===================== 2. CONFIRMAR =====================
    if (p.step === 'confirm') {
        return (
            <div>
                <div className="rounded-3xl p-4" style={{ background: soft }}>
                    <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: colors.textSecondary }}>{p.storeName}</p>
                    <div className="mt-2 flex flex-col gap-2">
                        {p.items.map((i) => (
                            <div key={i.product.id} className="flex items-center justify-between gap-3">
                                <span className="text-sm font-black min-w-0 truncate" style={{ color: colors.textPrimary }}>{i.quantity}× {i.product.name}</span>
                                <span className="text-sm font-bold flex-shrink-0" style={{ color: colors.textSecondary }}>{(Number(i.product.price) || 0) > 0 ? brl((Number(i.product.price) || 0) * i.quantity) : 'Sem custo'}</span>
                            </div>
                        ))}
                    </div>
                    {p.selectedDate && (
                        <div className="mt-3 pt-3 flex items-center gap-2" style={{ borderTop: `1px solid ${colors.border}60` }}>
                            <Clock size={15} style={{ color: ORANGE }} />
                            <span className="text-sm font-black min-w-0 flex-1" style={{ color: colors.textPrimary }}>{dayLong(p.selectedDate)} · {p.selectedTime}</span>
                            <span className="text-xs flex-shrink-0 whitespace-nowrap" style={{ color: colors.textSecondary }}>{p.duration} min</span>
                        </div>
                    )}
                    {total > 0 && (
                        <div className="mt-2 flex items-center justify-between">
                            <span className="text-xs font-bold" style={{ color: colors.textSecondary }}>Total</span>
                            <span className="text-base font-black" style={{ color: ORANGE }}>{brl(total)}</span>
                        </div>
                    )}
                </div>

                <label className="mt-5 block text-xs font-black" style={{ color: colors.textSecondary }}>Recado para a loja (opcional)</label>
                <textarea
                    value={p.note}
                    onChange={(e) => p.onNote(e.target.value)}
                    rows={2}
                    maxLength={300}
                    placeholder="Alguma observação?"
                    className="mt-1.5 w-full rounded-2xl px-4 py-3 text-sm resize-none focus:outline-none"
                    style={{ background: soft, color: colors.textPrimary }}
                />

                <button onClick={() => p.onPublic(!p.isPublic)} role="switch" aria-checked={p.isPublic} className="mt-3 w-full rounded-2xl px-4 py-3 flex items-center gap-3 text-left" style={{ background: soft }}>
                    <span className="min-w-0 flex-1">
                        <span className="block text-sm font-black" style={{ color: colors.textPrimary }}>Mostrar no meu perfil</span>
                        <span className="block text-xs" style={{ color: colors.textSecondary }}>Outras pessoas veem que você agendou.</span>
                    </span>
                    <span className="relative w-12 h-7 rounded-full flex-shrink-0 transition-colors" style={{ background: p.isPublic ? ORANGE : 'rgba(120,120,120,0.35)' }}>
                        <span className="absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all" style={{ left: p.isPublic ? 24 : 4 }} />
                    </span>
                </button>

                {!p.authed && <p className="mt-4 text-xs text-center" style={{ color: colors.textSecondary }}>Para confirmar você precisa entrar na sua conta. Volta para cá com tudo escolhido.</p>}
                {bar(p.authed ? 'Confirmar agendamento' : 'Entrar para confirmar', p.authed ? p.onConfirm : p.onLogin, { busy: p.submitting })}
            </div>
        )
    }

    // ===================== 1. AGENDAR =====================
    return (
        <div>
            {/* Serviço */}
            <h4 className="text-base font-black" style={{ color: colors.textPrimary }}>Qual serviço?</h4>
            <div id="service-selection" className="mt-2.5 flex flex-col gap-2">
                {p.loadingServices ? (
                    [0, 1].map((i) => <div key={i} className="h-16 rounded-2xl animate-pulse" style={{ background: colors.border }} />)
                ) : p.services.length === 0 ? (
                    <p className="text-sm rounded-2xl p-4" style={{ background: soft, color: colors.textSecondary }}>Esta loja ainda não tem serviços para agendar.</p>
                ) : p.services.map((s) => {
                    const qty = qtyOf(s.id)
                    const on = qty > 0
                    return (
                        <div
                            key={s.id}
                            onClick={() => !on && p.onToggleService(s)}
                            className="rounded-2xl p-3.5 flex items-center gap-3 transition"
                            style={{ background: on ? `${ORANGE}14` : soft, boxShadow: on ? `inset 0 0 0 2px ${ORANGE}` : undefined, cursor: on ? 'default' : 'pointer' }}
                        >
                            <span className="min-w-0 flex-1">
                                <span className="block text-sm font-black leading-snug" style={{ color: colors.textPrimary }}>{s.name}</span>
                                <span className="block text-xs mt-0.5" style={{ color: colors.textSecondary }}>
                                    {s.duration_minutes ? `${s.duration_minutes} min` : 'Duração a combinar'}{(Number(s.price) || 0) > 0 ? ` · ${brl(Number(s.price))}` : ' · Sem custo'}
                                </span>
                            </span>
                            {on ? (
                                <span className="flex items-center gap-1 flex-shrink-0">
                                    <button onClick={(e) => { e.stopPropagation(); p.onChangeQty(s.id, -1) }} aria-label="Menos um" className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: `${colors.border}70`, color: colors.textPrimary }}><Minus size={14} /></button>
                                    <span className="w-6 text-center text-sm font-black" style={{ color: colors.textPrimary }}>{qty}</span>
                                    <button onClick={(e) => { e.stopPropagation(); p.onChangeQty(s.id, 1) }} aria-label="Mais um" className="w-8 h-8 rounded-full flex items-center justify-center text-white" style={{ background: ORANGE }}><Plus size={14} /></button>
                                </span>
                            ) : (
                                <span className="h-9 px-4 rounded-full flex items-center text-xs font-black flex-shrink-0" style={{ background: `${colors.border}60`, color: colors.textPrimary }}>Escolher</span>
                            )}
                        </div>
                    )
                })}
            </div>

            {/* Quando */}
            <h4 className="mt-7 text-base font-black" style={{ color: colors.textPrimary }}>Quando?</h4>
            {!hasService ? (
                <p className="mt-2.5 text-sm rounded-2xl p-4" style={{ background: soft, color: colors.textSecondary }}>Escolha o serviço para ver os horários livres.</p>
            ) : (
                <>
                    {p.nextSlots.length > 0 && (
                        <div className="mt-2.5">
                            <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: colors.textSecondary }}>Próximos horários livres</p>
                            <div className="mt-1.5 flex gap-2 overflow-x-auto pb-1 -mx-6 px-6" style={{ scrollbarWidth: 'none' }}>
                                {p.nextSlots.map((s) => {
                                    const on = sameDay(p.selectedDate, s.date) && p.selectedTime === s.time
                                    return (
                                        <button key={s.dateStr + s.time} onClick={() => p.onPickSuggestion(s)} className="flex-shrink-0 h-10 px-4 rounded-full text-xs font-black whitespace-nowrap transition active:scale-95" style={on ? { background: ORANGE, color: '#fff' } : { background: soft, color: colors.textPrimary }}>
                                            {weekdayShort(s.date)} {s.date.getDate()} · {s.time}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    <p className="mt-4 text-[11px] font-black uppercase tracking-wide" style={{ color: colors.textSecondary }}>Escolha o dia</p>
                    <div className="mt-1.5 flex gap-2 overflow-x-auto pb-1 -mx-6 px-6" style={{ scrollbarWidth: 'none' }}>
                        {p.days.map((d) => {
                            const on = sameDay(p.selectedDate, d.date)
                            const closed = d.free === 0
                            return (
                                <button
                                    key={d.dateStr}
                                    onClick={() => !closed && p.onPickDate(d.date)}
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

                    {p.selectedDate && (
                        <>
                            <p className="mt-4 text-[11px] font-black tracking-wide" style={{ color: colors.textSecondary }}>Horários de {dayLong(p.selectedDate).toLowerCase()}</p>
                            {p.slots.length === 0 ? (
                                <p className="mt-1.5 text-sm rounded-2xl p-4" style={{ background: soft, color: colors.textSecondary }}>Sem horários neste dia.</p>
                            ) : (
                                <div className="mt-1.5 grid grid-cols-3 gap-2">
                                    {p.slots.map((s) => {
                                        const on = p.selectedTime === s.time
                                        const free = s.status === 'free'
                                        return (
                                            <button
                                                key={s.time}
                                                onClick={() => free && p.onPickTime(s.time)}
                                                disabled={!free}
                                                className="h-11 rounded-full text-sm font-black transition active:scale-95 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                                                style={on ? { background: ORANGE, color: '#fff' } : free ? { background: soft, color: colors.textPrimary } : { background: 'transparent', color: colors.textSecondary, opacity: 0.45, textDecoration: 'line-through' }}
                                            >
                                                {on && <Check size={14} strokeWidth={3} />}{s.time}
                                            </button>
                                        )
                                    })}
                                </div>
                            )}
                        </>
                    )}
                </>
            )}

            {bar('Continuar', p.onContinue, { disabled: !ready, line: ready ? summaryLine : hasService ? 'Escolha o dia e o horário' : 'Escolha o serviço', price: ready && total > 0 ? brl(total) : undefined })}
        </div>
    )
}
