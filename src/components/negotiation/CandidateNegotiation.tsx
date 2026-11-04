// src/components/negotiation/CandidateNegotiation.tsx
//
// Negociação do PASSAGEIRO com um motorista que se candidatou: o que o motorista propôs, a oferta que ele mesmo fez (com a contagem
// regressiva), "fazer outra oferta" com valores rápidos e a sugestão OPCIONAL do iUser (o meio entre os dois valores públicos).
// Aceitar o motorista é o botão que já existe ao lado; aqui só se conversa o valor. Nada daqui revela o ganho mínimo do motorista.
'use client'

import { useEffect, useState } from 'react'
import { Clock, Handshake, Lightbulb } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { Spinner } from '@/components/Spinner'
import { toast } from '@/lib/toast'
import { clock, currentOffer, midpoint, parseMoney, passengerCounter, quickValues, roundsLeft, secondsLeft, validateAmount, NegotiationError, type PriceOffer } from '@/modules/negotiation'

const brl = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`

export default function CandidateNegotiation({ applicationId, proposedPrice, offers, rideOffer, onChanged }: {
    applicationId: string
    /** o valor que o motorista está pedindo agora */
    proposedPrice: number | null
    /** histórico de propostas desta candidatura */
    offers: PriceOffer[]
    /** a oferta geral que o passageiro fez ao pedir (se fez) */
    rideOffer: number | null
    /** depois de enviar uma oferta: a tela recarrega */
    onChanged: () => void
}) {
    const { colors } = useTheme()
    const [open, setOpen] = useState(false)
    const [value, setValue] = useState('')
    const [busy, setBusy] = useState(false)
    const [now, setNow] = useState(() => Date.now())

    const mine = offers.filter((o) => o.applicationId === applicationId)
    const pending = currentOffer(mine, now)
    const myPending = pending?.authorRole === 'passenger' ? pending : null
    const driverRounds = mine.filter((o) => o.authorRole === 'driver').length
    const lastPassengerAmount = [...mine].reverse().find((o) => o.authorRole === 'passenger')?.amount ?? rideOffer
    const left = roundsLeft(mine, 'passenger')
    const suggestion = midpoint(lastPassengerAmount, proposedPrice)

    // contagem regressiva da oferta que espera o motorista; quando zera, recarrega para mostrar "expirou"
    useEffect(() => {
        if (!myPending?.expiresAt) return
        const id = setInterval(() => {
            const t = Date.now()
            setNow(t)
            if ((secondsLeft(myPending.expiresAt, t) ?? 1) <= 0) { clearInterval(id); onChanged() }
        }, 1000)
        return () => clearInterval(id)
    }, [myPending?.expiresAt, myPending?.id, onChanged])

    const send = async (amount: number) => {
        const err = validateAmount(amount)
        if (err) { toast.error(err); return }
        setBusy(true)
        try {
            await passengerCounter(applicationId, amount)
            toast.success(`Oferta de ${brl(amount)} enviada ao motorista`)
            setOpen(false); setValue('')
            onChanged()
        } catch (e: any) {
            toast.error(e instanceof NegotiationError ? e.message : 'Não foi possível enviar a oferta')
        } finally { setBusy(false) }
    }

    if (proposedPrice == null) return null
    const parsed = parseMoney(value)
    const quick = quickValues(proposedPrice * 0.88).filter((q) => q < proposedPrice)
    const secs = myPending ? secondsLeft(myPending.expiresAt, now) : null

    return (
        <div className="w-full flex flex-col gap-1.5 mt-1" aria-label="Negociação com o motorista">
            {driverRounds > 1 && !myPending && (
                <p className="text-[11px] font-black leading-snug px-2 py-1 rounded-lg" style={{ background: '#f973161a', color: '#c2410c' }}>O motorista propôs {brl(proposedPrice)}.</p>
            )}
            {myPending && (
                <p className="text-[11px] font-bold leading-snug px-2 py-1.5 rounded-lg flex items-center gap-1.5" style={{ background: `${colors.border}30`, color: colors.textPrimary }}>
                    <Clock size={11} className="flex-shrink-0" />
                    <span className="min-w-0">Você ofereceu <strong>{brl(myPending.amount)}</strong>. Aguardando o motorista{secs != null ? ` · ${clock(secs)}` : ''}</span>
                </p>
            )}
            {suggestion != null && !myPending && left > 0 && (
                <button onClick={() => send(suggestion)} disabled={busy} className="text-left rounded-lg px-2 py-1.5 flex items-center gap-1.5 transition active:scale-[0.99] disabled:opacity-60" style={{ background: '#eab3081f', color: colors.textPrimary }}>
                    <Lightbulb size={12} className="flex-shrink-0" style={{ color: '#ca8a04' }} />
                    <span className="text-[11px] font-bold leading-snug min-w-0">O iUser sugere <strong>{brl(suggestion)}</strong> (opcional). Toque para oferecer este valor.</span>
                </button>
            )}
            {!myPending && left > 0 && (
                <button onClick={() => { setOpen((o) => !o); setValue('') }} className="h-8 rounded-full text-[11px] font-black flex items-center justify-center gap-1.5 transition active:scale-95" style={{ background: open ? '#f97316' : `${colors.border}30`, color: open ? '#fff' : colors.textPrimary }}>
                    <Handshake size={12} /> Fazer outra oferta
                </button>
            )}
            {!myPending && left === 0 && <p className="text-[10px] text-center" style={{ color: colors.textSecondary }}>Você já usou todas as ofertas para este motorista.</p>}
            {open && !myPending && (
                <div className="flex flex-col gap-1.5">
                    {quick.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {quick.map((q) => (
                                <button key={q} onClick={() => send(q)} disabled={busy} className="flex-1 min-w-[56px] h-8 rounded-full text-[12px] font-black transition active:scale-95 disabled:opacity-50" style={{ background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }}>R$ {q}</button>
                            ))}
                        </div>
                    )}
                    <div className="flex items-center gap-1.5">
                        <input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.,]/g, '').slice(0, 9))} placeholder="Outro valor (R$)" className="flex-1 min-w-0 h-8 px-3 rounded-full text-[12px] font-bold outline-none" style={{ background: colors.background, border: `1px solid ${colors.border}`, color: colors.textPrimary }} />
                        <button onClick={() => parsed != null && send(parsed)} disabled={busy || parsed == null || (parsed != null && parsed >= proposedPrice)} className="h-8 px-3 rounded-full text-[11px] font-black text-white disabled:opacity-40" style={{ background: 'linear-gradient(135deg, #f97316, #dc2626)' }}>{busy ? <Spinner size={11} /> : 'Oferecer'}</button>
                    </div>
                    <p className="text-[10px]" style={{ color: colors.textSecondary }}>Valor menor que {brl(proposedPrice)}. O motorista tem 3 minutos para aceitar ou responder. Restam {left} oferta{left > 1 ? 's' : ''}.</p>
                </div>
            )}
        </div>
    )
}
