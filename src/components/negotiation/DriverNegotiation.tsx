// src/components/negotiation/DriverNegotiation.tsx
//
// Negociação do MOTORISTA numa corrida em que ele já se candidatou ("Me candidatei"): vê a oferta do passageiro (com o ganho por hora),
// aceita, recusa ou faz uma contraproposta (valores rápidos e outro valor), e vê a sugestão OPCIONAL do iUser. O ganho mínimo é privado
// dele: aparece só aqui, como aviso (ou bloqueio, se ele escolheu "não aceitar abaixo do mínimo").
'use client'

import { useCallback, useEffect, useState } from 'react'
import { Clock, Lightbulb } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { Spinner } from '@/components/Spinner'
import { toast } from '@/lib/toast'
import {
    belowMinimum, belowMinimumText, clock, currentOffer, driverCounter, loadOffers, midpoint, NegotiationError, parseMoney, perHour, quickValues,
    respondOffer, roundsLeft, secondsLeft, validateAmount, type PriceOffer,
} from '@/modules/negotiation'

const brl = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

export default function DriverNegotiation({ applicationId, myPrice, rideOffer, minutes, minHourly, protection, onChanged }: {
    applicationId: string
    /** o valor que o motorista está pedindo agora */
    myPrice: number | null
    /** a oferta geral do passageiro ao pedir (se fez) */
    rideOffer: number | null
    /** tempo total estimado (ir buscar + corrida), em minutos, do mapa */
    minutes: number | null
    minHourly: number | null
    protection: 'warn' | 'block'
    onChanged: () => void
}) {
    const { colors } = useTheme()
    const [offers, setOffers] = useState<PriceOffer[]>([])
    const [now, setNow] = useState(() => Date.now())
    const [open, setOpen] = useState(false)
    const [value, setValue] = useState('')
    const [busy, setBusy] = useState(false)

    const refresh = useCallback(async () => { setOffers(await loadOffers([applicationId])) }, [applicationId])
    useEffect(() => {
        void refresh()
        const id = setInterval(() => { setNow(Date.now()); void refresh() }, 4000)
        return () => clearInterval(id)
    }, [refresh])
    useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id) }, [])

    const pending = currentOffer(offers, now)
    const fromPassenger = pending?.authorRole === 'passenger' ? pending : null
    const mine = pending?.authorRole === 'driver' && offers.filter((o) => o.authorRole === 'driver').length > 1 ? pending : null   // contraproposta minha em espera
    const left = roundsLeft(offers, 'driver')
    const lastPassenger = [...offers].reverse().find((o) => o.authorRole === 'passenger')?.amount ?? rideOffer
    const suggestion = fromPassenger ? midpoint(fromPassenger.amount, myPrice) : midpoint(lastPassenger, myPrice)

    const hour = (v: number) => perHour(v, minutes)
    const isBelow = (v: number) => belowMinimum(hour(v), minHourly)
    const isBlocked = (v: number) => protection === 'block' && isBelow(v)

    const run = async (fn: () => Promise<unknown>, okMsg: string) => {
        setBusy(true)
        try { await fn(); toast.success(okMsg); setOpen(false); setValue(''); await refresh(); onChanged() }
        catch (e: any) { toast.error(e instanceof NegotiationError ? e.message : 'Não foi possível concluir'); await refresh() }
        finally { setBusy(false) }
    }

    const secs = pending ? secondsLeft(pending.expiresAt, now) : null
    const parsed = parseMoney(value)
    const anchor = fromPassenger?.amount ?? myPrice
    const quick = anchor != null ? quickValues(Math.max(anchor, myPrice ?? 0) * 0.95) : []

    const hourLine = (v: number) => hour(v) != null && (
        <span className="block text-[10px] font-bold leading-tight" style={{ color: isBelow(v) ? '#d97706' : colors.textSecondary }}>≈ R$ {Math.round(hour(v) as number)}/h</span>
    )

    return (
        <div className="flex flex-col gap-2" aria-label="Negociação com o passageiro">
            {fromPassenger && (
                <div className="rounded-2xl p-3 flex flex-col gap-2" style={{ background: '#16a34a14', border: '1px solid #16a34a40' }}>
                    <div className="flex items-end justify-between gap-2">
                        <div>
                            <span className="block text-[11px] font-semibold" style={{ color: colors.textSecondary }}>O passageiro ofereceu</span>
                            <span className="block text-[22px] font-black leading-tight" style={{ color: '#16a34a' }}>{brl(fromPassenger.amount)}</span>
                            {hourLine(fromPassenger.amount)}
                        </div>
                        {secs != null && <span className="flex items-center gap-1 text-[11px] font-black" style={{ color: secs < 30 ? '#dc2626' : colors.textSecondary }}><Clock size={11} />{clock(secs)}</span>}
                    </div>
                    {isBelow(fromPassenger.amount) && minHourly != null && hour(fromPassenger.amount) != null && (
                        <p className="text-[11px] font-bold leading-snug rounded-xl px-3 py-2" style={{ background: '#f59e0b1f', color: '#b45309' }}>
                            {belowMinimumText(hour(fromPassenger.amount) as number, minHourly)}{protection === 'block' ? ' Você ativou "não aceitar abaixo do mínimo".' : ''}
                        </p>
                    )}
                    <button onClick={() => run(() => respondOffer(fromPassenger.id, true, minutes), 'Corrida confirmada!')} disabled={busy || isBlocked(fromPassenger.amount)} className="w-full py-3 rounded-full text-[13px] font-black uppercase tracking-wide text-white disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: GRADIENT }}>
                        {busy ? <Spinner size={14} /> : `Aceitar oferta · ${brl(fromPassenger.amount)}`}
                    </button>
                    <div className="flex items-stretch gap-1.5">
                        {left > 0 && <button onClick={() => { setOpen((o) => !o); setValue('') }} disabled={busy} className="flex-1 py-2.5 rounded-full text-[12px] font-black uppercase tracking-wide" style={open ? { background: GRADIENT, color: '#fff' } : { background: `${colors.border}30`, color: colors.textPrimary }}>Fazer contraproposta</button>}
                        <button onClick={() => run(() => respondOffer(fromPassenger.id, false), 'Oferta recusada')} disabled={busy} className="px-4 py-2.5 rounded-full text-[12px] font-black uppercase tracking-wide" style={{ color: '#dc2626', border: '1.5px solid #dc262655' }}>Recusar</button>
                    </div>
                </div>
            )}

            {mine && (
                <p className="text-[12px] font-bold rounded-xl px-3 py-2 flex items-center gap-1.5" style={{ background: `${colors.border}30`, color: colors.textPrimary }}>
                    <Clock size={12} className="flex-shrink-0" />
                    <span>Sua contraproposta de <strong>{brl(mine.amount)}</strong> espera o passageiro{secs != null ? ` · ${clock(secs)}` : ''}</span>
                </p>
            )}

            {suggestion != null && left > 0 && !busy && (
                <button onClick={() => run(() => driverCounter(applicationId, suggestion, minutes), `Contraproposta de ${brl(suggestion)} enviada`)} disabled={isBlocked(suggestion)} className="text-left rounded-xl px-3 py-2 flex items-center gap-2 transition active:scale-[0.99] disabled:opacity-50" style={{ background: '#eab3081f', color: colors.textPrimary }}>
                    <Lightbulb size={13} className="flex-shrink-0" style={{ color: '#ca8a04' }} />
                    <span className="text-[11px] font-bold leading-snug min-w-0">O iUser sugere <strong>{brl(suggestion)}</strong> (opcional){hour(suggestion) != null ? ` · ≈ R$ ${Math.round(hour(suggestion) as number)}/h` : ''}. Toque para propor este valor.</span>
                </button>
            )}

            {!fromPassenger && left > 0 && (
                <button onClick={() => { setOpen((o) => !o); setValue('') }} disabled={busy} className="py-2 rounded-full text-[12px] font-black uppercase tracking-wide" style={open ? { background: GRADIENT, color: '#fff' } : { background: `${colors.border}30`, color: colors.textPrimary }}>Mudar minha proposta</button>
            )}
            {left === 0 && <p className="text-[10px] text-center" style={{ color: colors.textSecondary }}>Você já usou todas as propostas desta corrida.</p>}

            {open && left > 0 && (
                <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap gap-1.5">
                        {quick.map((q) => (
                            <button key={q} onClick={() => run(() => driverCounter(applicationId, q, minutes), `Contraproposta de ${brl(q)} enviada`)} disabled={busy || isBlocked(q)} className="flex-1 min-w-[64px] rounded-xl px-2 py-2 text-center transition active:scale-95 disabled:opacity-40" style={{ background: `${colors.border}30` }}>
                                <span className="block text-[14px] font-black leading-tight" style={{ color: colors.textPrimary }}>R$ {q}</span>
                                {hourLine(q)}
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center gap-2">
                        <input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.,]/g, '').slice(0, 9))} placeholder="Outro valor (R$)" className="flex-1 min-w-0 px-4 py-2.5 rounded-full text-sm font-semibold outline-none" style={{ background: colors.background, border: `1px solid ${colors.border}`, color: colors.textPrimary }} />
                        <button onClick={() => parsed != null && run(() => driverCounter(applicationId, parsed, minutes), `Contraproposta de ${brl(parsed)} enviada`)} disabled={busy || parsed == null || !!validateAmount(parsed) || isBlocked(parsed)} className="px-4 py-2.5 rounded-full text-xs font-black text-white disabled:opacity-50" style={{ background: GRADIENT }}>{busy ? <Spinner size={12} /> : 'Enviar'}</button>
                    </div>
                    {parsed != null && isBlocked(parsed) && minHourly != null && hour(parsed) != null && <p className="text-[11px] font-bold" style={{ color: '#b45309' }}>{belowMinimumText(hour(parsed) as number, minHourly, 'proposta')}</p>}
                    <p className="text-[10px]" style={{ color: colors.textSecondary }}>O passageiro tem 3 minutos para responder. Restam {left} proposta{left > 1 ? 's' : ''}.</p>
                </div>
            )}
        </div>
    )
}
