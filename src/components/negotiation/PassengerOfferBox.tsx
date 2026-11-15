// src/components/negotiation/PassengerOfferBox.tsx
//
// No pedido de corrida: a Tarifa iUser sugerida (só a REFERÊNCIA) e, se o passageiro quiser, o valor que ele OFERECE.
// Padrão = deixar os motoristas proporem (o fluxo de sempre). Quem oferece ajusta com − / + ou toca num valor rápido; o valor nunca fecha a corrida sozinho:
// o motorista precisa aceitar (e o passageiro confirmar o motorista).
'use client'

import { Minus, Plus } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { MAX_AMOUNT, quickValues } from '@/modules/negotiation/domain'

const brl = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

export default function PassengerOfferBox({ reference, min = 0, mode, onMode, value, onValue }: {
    /** Tarifa iUser para este trajeto (null = não deu para calcular ainda) */
    reference: number | null
    /** mínimo da plataforma para este trajeto: a oferta não desce abaixo (0 = sem regra) */
    min?: number
    mode: 'drivers' | 'mine'
    onMode: (m: 'drivers' | 'mine') => void
    value: number | null
    onValue: (v: number) => void
}) {
    const { colors } = useTheme()
    const floor = Math.max(1, Math.ceil(min))
    const start = Math.max(floor, reference != null ? Math.round(reference) : 10)
    const current = Math.max(floor, value ?? start)
    const set = (v: number) => onValue(Math.min(MAX_AMOUNT, Math.max(floor, Math.round(v))))
    const seg = (on: boolean) => (on ? { background: GRADIENT, color: '#fff' } : { background: `${colors.border}30`, color: colors.textPrimary })

    return (
        <div className="w-full rounded-xl px-3.5 py-3 text-left flex flex-col gap-2.5" style={{ background: `${colors.border}30` }} aria-label="Valor da corrida">
            {reference != null && (
                <p className="text-[12px] leading-snug" style={{ color: colors.textSecondary }}>
                    Tarifa sugerida pelo iUser: <strong className="text-[14px]" style={{ color: colors.textPrimary }}>{brl(reference)}</strong>
                </p>
            )}
            <div className="grid grid-cols-2 gap-1.5">
                <button type="button" onClick={() => onMode('drivers')} className="py-2 rounded-xl text-[12px] font-black transition active:scale-95" style={seg(mode === 'drivers')}>Motoristas propõem</button>
                <button type="button" onClick={() => { onMode('mine'); if (value == null) onValue(start) }} className="py-2 rounded-xl text-[12px] font-black transition active:scale-95" style={seg(mode === 'mine')}>Eu ofereço um valor</button>
            </div>

            {mode === 'mine' ? (
                <>
                    <p className="text-[12px] font-bold" style={{ color: colors.textPrimary }}>Quanto deseja oferecer?</p>
                    <div className="flex items-center justify-center gap-3">
                        <button type="button" onClick={() => set(current - 1)} aria-label="Diminuir R$ 1" className="w-11 h-11 rounded-full flex items-center justify-center transition active:scale-90" style={{ background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }}><Minus size={18} /></button>
                        <span className="min-w-[120px] text-center text-[26px] font-black leading-none" style={{ color: '#16a34a' }}>{brl(current)}</span>
                        <button type="button" onClick={() => set(current + 1)} aria-label="Aumentar R$ 1" className="w-11 h-11 rounded-full flex items-center justify-center transition active:scale-90" style={{ background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }}><Plus size={18} /></button>
                    </div>
                    {reference != null && (
                        <div className="flex flex-wrap justify-center gap-1.5">
                            {quickValues(reference, { min: floor }).map((q) => (
                                <button key={q} type="button" onClick={() => set(q)} className="px-3 py-1.5 rounded-full text-[12px] font-black transition active:scale-95" style={current === q ? { background: GRADIENT, color: '#fff' } : { background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }}>R$ {q}</button>
                            ))}
                        </div>
                    )}
                    {min > 0 && <p className="text-[11px] leading-snug" style={{ color: colors.textSecondary }}>Valor mínimo para este trajeto: <strong>{brl(min)}</strong>.</p>}
                    <p className="text-[11px] leading-snug" style={{ color: colors.textSecondary }}>Os motoristas podem aceitar ou propor outro valor. A corrida só fecha quando você confirmar o motorista.</p>
                </>
            ) : (
                <p className="text-[11px] leading-snug" style={{ color: colors.textSecondary }}>Os motoristas vão propor o valor e você escolhe quem vai.</p>
            )}
        </div>
    )
}
