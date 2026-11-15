// components/ride/RideWaitBox.tsx
//
// TEMPO DE ESPERA da corrida, igual para o passageiro e para o motorista (mesmo cartão, só mudam os botões):
//  • o PASSAGEIRO pede ("Pedir tempo de espera": embarque antes de a corrida começar; parada ou desembarque depois, com um recado opcional);
//  • o MOTORISTA aprova (ou recusa) — só então o relógio começa, para os dois, com o valor subindo ao vivo;
//  • qualquer um dos dois encerra; as esperas da corrida se somam, cada uma com o seu valor inicial.
// O valor por minuto e os minutos grátis são SEMPRE do iUser (Admin → Tarifas) e a conta de verdade é do banco; aqui só se mostra
// (a mesma conta roda na tela para o valor subir a cada segundo — src/modules/ridewait). O iUser não movimenta esse dinheiro: soma-se ao valor da corrida.
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Clock, Hourglass, X } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { Spinner } from '@/components/Spinner'
import { toast } from '@/lib/toast'
import {
    WAIT_KIND_LABEL, WAIT_NOTE_MAX, centsToBrl, cleanNote, clock, endRideWait, graceLeft, kindsForPhase, loadRideWaits, openWait, requestRideWait, respondRideWait,
    ruleText, totalWaitCents, waitFeeNow, waitLine, waitSeconds, type RideWaitsView, type WaitKind,
    setRideWaitDiscount, discountProblem, hasDiscount, hasOwnRate, parseCents, ruleLine,
} from '@/modules/ridewait'

const ORANGE = '#f97316'
const GREEN = '#16a34a'
const POLL_MS = 4000

interface RideWaitBoxProps {
    rideId: string
    role: 'passenger' | 'driver'
    /** a corrida já começou (o passageiro entrou)? decide se vale embarque ou parada/desembarque */
    rideStarted: boolean
    /** a corrida está aceita e em andamento (fora disso o cartão some) */
    rideActive: boolean
    /** nome de quem pediu, para a frase do motorista */
    passengerName?: string | null
    /** o valor combinado da corrida: com espera correndo ou já feita a caixa mostra "Corrida R$ X + espera R$ Y = R$ Z" (a espera é cobrada DEPOIS, junto com a corrida) */
    basePrice?: number | null
}

export function RideWaitBox({ rideId, role, rideStarted, rideActive, passengerName, basePrice = null }: RideWaitBoxProps) {
    const { colors } = useTheme()
    const [view, setView] = useState<RideWaitsView | null>(null)
    const [loaded, setLoaded] = useState(false)
    const [now, setNow] = useState(() => Date.now())
    const [busy, setBusy] = useState<string | null>(null)
    const [asking, setAsking] = useState(false)
    const [kind, setKind] = useState<WaitKind>('stop')
    const [note, setNote] = useState('')
    // o motorista edita (só para baixo) o valor desta espera: dá um desconto
    const [editing, setEditing] = useState(false)
    const [eBase, setEBase] = useState('')
    const [eRate, setERate] = useState('')
    const alive = useRef(true)

    const refresh = useCallback(async () => {
        const v = await loadRideWaits(rideId)
        if (!alive.current) return
        if (v) setView(v)
        setLoaded(true)
    }, [rideId])

    // lê agora e a cada poucos segundos (só com a aba visível); o relógio na tela anda a cada segundo
    useEffect(() => {
        alive.current = true
        if (!rideActive) return
        refresh()
        const poll = setInterval(() => { if (document.visibilityState === 'visible') refresh() }, POLL_MS)
        const tick = setInterval(() => setNow(Date.now()), 1000)
        const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
        document.addEventListener('visibilitychange', onVisible)
        return () => { alive.current = false; clearInterval(poll); clearInterval(tick); document.removeEventListener('visibilitychange', onVisible) }
    }, [rideActive, refresh])

    // a fase mudou (a corrida começou): o tipo escolhido precisa valer nela
    const allowedKinds = useMemo(() => kindsForPhase(rideStarted), [rideStarted])
    useEffect(() => { if (!allowedKinds.includes(kind)) setKind(allowedKinds[0]) }, [allowedKinds, kind])

    const run = async (key: string, fn: () => Promise<void>, ok?: string) => {
        setBusy(key)
        try { await fn(); if (ok) toast.success(ok); await refresh() }
        catch (e: any) { toast.error(e?.message || 'Não deu certo. Tente de novo.'); await refresh() }
        finally { if (alive.current) setBusy(null) }
    }

    if (!rideActive || !loaded || !view) return null

    const open = openWait(view.waits)
    const closed = view.waits.filter((w) => w.status === 'ended')
    const total = totalWaitCents(view.waits, now, view.offsetMs)
    const frame = { background: `${colors.border}18`, border: `1px solid ${colors.border}` }

    // nada acontecendo e quem não pode pedir (motorista) não vê o cartão vazio
    if (!open && closed.length === 0 && role === 'driver') return null

    const secs = open?.status === 'active' ? waitSeconds(open, now, view.offsetMs) : 0
    const free = open?.status === 'active' ? graceLeft(secs, open.graceSeconds ?? 0) : 0

    return (
        <div className="rounded-2xl p-3 flex flex-col gap-2.5" style={frame} data-testid="ride-wait-box">
            <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${ORANGE}22`, color: ORANGE }}><Hourglass size={14} /></span>
                <p className="text-[13px] font-black flex-1" style={{ color: colors.textPrimary }}>Tempo de espera</p>
                {total > 0 && <span className="text-[12px] font-black tabular-nums" style={{ color: colors.textPrimary }}>{centsToBrl(total)}</span>}
            </div>
            {total > 0 && basePrice != null && basePrice > 0 && (
                <p className="text-[12px] font-bold -mt-1 tabular-nums" style={{ color: colors.textSecondary }}>
                    Corrida {centsToBrl(Math.round(basePrice * 100))} + espera {centsToBrl(total)} = <strong style={{ color: GREEN }}>{centsToBrl(Math.round(basePrice * 100) + total)}</strong>
                    <span className="font-semibold"> · cobrado depois, junto com a corrida</span>
                </p>
            )}

            {/* ===== EM ANDAMENTO: o relógio e o valor, para os dois ===== */}
            {open?.status === 'active' && (
                <div className="rounded-xl p-3 text-center" style={{ background: free > 0 ? `${GREEN}14` : `${ORANGE}14`, border: `1px solid ${free > 0 ? `${GREEN}55` : `${ORANGE}55`}` }}>
                    <p className="text-[11px] font-bold" style={{ color: colors.textSecondary }}>{WAIT_KIND_LABEL[open.kind]}{open.note ? ` · ${open.note}` : ''}</p>
                    <p className="text-[34px] font-black leading-none tabular-nums mt-1" style={{ color: colors.textPrimary }}>{clock(secs)}</p>
                    <p className="text-[12px] font-black mt-1.5" style={{ color: free > 0 ? GREEN : ORANGE }}>
                        {free > 0 ? `Já vale ${centsToBrl(waitFeeNow(open, now, view.offsetMs))} · cobre mais ${clock(free)}` : `Cobrando ${centsToBrl(waitFeeNow(open, now, view.offsetMs))}`}
                    </p>
                    {/* MEU VALOR DE TEMPO: o que está valendo nesta espera; o motorista edita PARA BAIXO (o valor do iUser é o teto) para dar um desconto */}
                    <div className="mt-2 rounded-xl px-3 py-2 text-left" style={{ background: `${colors.border}22`, border: `1px solid ${colors.border}` }}>
                        <div className="flex items-center gap-2">
                            <p className="text-[11px] font-bold flex-1 leading-snug" style={{ color: colors.textSecondary }}>
                                {role === 'driver' ? 'Meu valor de tempo' : 'Valor do tempo'}: <span style={{ color: colors.textPrimary }}>{ruleLine(open)}</span>
                                {hasDiscount(open) && <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-black text-white" style={{ background: GREEN }}>com desconto</span>}
                                {hasOwnRate(open) && <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-black text-white" style={{ background: ORANGE }}>valor do motorista</span>}
                            </p>
                            {role === 'driver' && !editing && (
                                <button onClick={() => { setEBase(((open.baseCents ?? 0) / 100).toFixed(2).replace('.', ',')); setERate(((open.rateCents ?? 0) / 100).toFixed(2).replace('.', ',')); setEditing(true) }}
                                    className="text-[11px] font-black underline flex-shrink-0" style={{ color: ORANGE }}>Editar</button>
                            )}
                        </div>
                        {role === 'driver' && editing && (() => {
                            const listBase = open.listBaseCents ?? open.baseCents ?? 0
                            const listRate = open.listRateCents ?? open.rateCents ?? 0
                            const nb = parseCents(eBase), nr = parseCents(eRate)
                            const problem = discountProblem(nb, nr, listBase, listRate)
                            const quick = (b: number, r: number) => { setEBase((b / 100).toFixed(2).replace('.', ',')); setERate((r / 100).toFixed(2).replace('.', ',')) }
                            return (
                                <div className="mt-2 flex flex-col gap-2">
                                    <div className="flex gap-2">
                                        <label className="flex-1 min-w-0">
                                            <span className="block text-[10px] font-bold mb-0.5" style={{ color: colors.textSecondary }}>Valor inicial (R$) · desconto</span>
                                            <input value={eBase} onChange={(e) => setEBase(e.target.value.replace(/[^\d.,]/g, '').slice(0, 6))} inputMode="decimal" className="w-full h-10 px-3 rounded-xl text-[14px] font-black outline-none" style={{ background: colors.background, border: `1.5px solid ${colors.border}`, color: colors.textPrimary }} />
                                        </label>
                                        <label className="flex-1 min-w-0">
                                            <span className="block text-[10px] font-bold mb-0.5" style={{ color: colors.textSecondary }}>Por minuto (R$) · mín. {centsToBrl(open.listRateCents ?? open.rateCents ?? 0)}</span>
                                            <input value={eRate} onChange={(e) => setERate(e.target.value.replace(/[^\d.,]/g, '').slice(0, 6))} inputMode="decimal" className="w-full h-10 px-3 rounded-xl text-[14px] font-black outline-none" style={{ background: colors.background, border: `1.5px solid ${colors.border}`, color: colors.textPrimary }} />
                                        </label>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        <button onClick={() => quick(listBase, listRate)} className="px-2.5 py-1 rounded-full text-[11px] font-black" style={{ border: `1px solid ${colors.border}`, color: colors.textPrimary }}>Valor do iUser</button>
                                        <button onClick={() => quick(Math.round(listBase / 2), listRate)} className="px-2.5 py-1 rounded-full text-[11px] font-black" style={{ border: `1px solid ${colors.border}`, color: colors.textPrimary }}>50% no inicial</button>
                                        <button onClick={() => quick(0, listRate)} className="px-2.5 py-1 rounded-full text-[11px] font-black" style={{ border: `1px solid ${colors.border}`, color: colors.textPrimary }}>Sem valor inicial</button>
                                    </div>
                                    <p className="text-[10px]" style={{ color: problem ? '#b45309' : colors.textSecondary }}>{problem ?? `O valor inicial pode ter desconto (até ${centsToBrl(listBase)}); o valor por minuto não fica abaixo de ${centsToBrl(listRate)} (mínimo do iUser) e pode ser o seu, maior. Vale para esta espera.`}</p>
                                    <div className="flex gap-2">
                                        <button onClick={() => setEditing(false)} className="h-9 px-4 rounded-full text-[12px] font-black" style={{ border: `1px solid ${colors.border}`, color: colors.textPrimary }}>Cancelar</button>
                                        <button disabled={!!problem || busy != null} onClick={() => run('disc', async () => { await setRideWaitDiscount(open.id, nb as number, nr as number); setEditing(false) }, 'Valor do tempo atualizado')}
                                            className="flex-1 h-9 rounded-full text-[12px] font-black text-white disabled:opacity-50 flex items-center justify-center" style={{ background: ORANGE }}>
                                            {busy === 'disc' ? <Spinner size={14} /> : 'Salvar valor do tempo'}
                                        </button>
                                    </div>
                                </div>
                            )
                        })()}
                    </div>
                    <button onClick={() => run('end', () => endRideWait(open.id), 'Espera encerrada')} disabled={busy != null}
                        className="mt-2.5 w-full h-11 rounded-full text-[13px] font-black flex items-center justify-center gap-1.5 active:scale-[0.98] transition disabled:opacity-60"
                        style={{ background: colors.textPrimary, color: colors.background }}>
                        {busy === 'end' ? <Spinner size={16} /> : <><Check size={15} /> Terminar espera</>}
                    </button>
                </div>
            )}

            {/* ===== PEDIDA: o motorista aprova; o passageiro espera ===== */}
            {open?.status === 'requested' && role === 'driver' && (
                <div className="rounded-xl p-3 flex flex-col gap-2" style={{ background: `${ORANGE}14`, border: `1px solid ${ORANGE}55` }}>
                    <p className="text-[13px] leading-snug" style={{ color: colors.textPrimary }}>
                        <strong>{passengerName || 'O passageiro'}</strong> pediu para você esperar · <strong>{WAIT_KIND_LABEL[open.kind]}</strong>{open.note ? ` (${open.note})` : ''}
                    </p>
                    <p className="text-[11px]" style={{ color: colors.textSecondary }}>{ruleText(view.graceSeconds, view.rateCents, view.baseCents)} Ao aprovar, o relógio começa para os dois.</p>
                    <div className="flex gap-2">
                        <button onClick={() => run('yes', () => respondRideWait(open.id, true), 'Espera aprovada: o relógio começou')} disabled={busy != null}
                            className="flex-1 h-11 rounded-full text-[13px] font-black text-white flex items-center justify-center gap-1.5 active:scale-[0.98] transition disabled:opacity-60" style={{ background: ORANGE }}>
                            {busy === 'yes' ? <Spinner size={16} /> : <><Check size={15} /> Aprovar e contar</>}
                        </button>
                        <button onClick={() => run('no', () => respondRideWait(open.id, false))} disabled={busy != null}
                            className="h-11 px-4 rounded-full text-[13px] font-black flex items-center justify-center gap-1 active:scale-[0.98] transition disabled:opacity-60" style={{ border: `1px solid ${colors.border}`, color: colors.textPrimary }}>
                            {busy === 'no' ? <Spinner size={14} /> : <><X size={14} /> Recusar</>}
                        </button>
                    </div>
                </div>
            )}
            {open?.status === 'requested' && role === 'passenger' && (
                <div className="rounded-xl p-3 flex items-center gap-2" style={{ background: `${ORANGE}14`, border: `1px solid ${ORANGE}55` }}>
                    <Clock size={15} style={{ color: ORANGE }} className="flex-shrink-0" />
                    <p className="text-[12.5px] leading-snug flex-1" style={{ color: colors.textPrimary }}>
                        Pedido enviado ({WAIT_KIND_LABEL[open.kind]}). <strong>Aguardando o motorista aprovar</strong> — o relógio só começa quando ele aprovar.
                    </p>
                    <button onClick={() => run('cancel', () => endRideWait(open.id))} disabled={busy != null} className="text-[12px] font-black underline flex-shrink-0 disabled:opacity-60" style={{ color: colors.textSecondary }}>
                        {busy === 'cancel' ? '…' : 'Cancelar'}
                    </button>
                </div>
            )}

            {/* ===== PASSAGEIRO sem espera aberta: pedir ===== */}
            {!open && role === 'passenger' && (
                asking ? (
                    <div className="flex flex-col gap-2">
                        {allowedKinds.length > 1 && (
                            <div className="flex gap-1.5">
                                {allowedKinds.map((k) => (
                                    <button key={k} onClick={() => setKind(k)} className="flex-1 h-9 rounded-full text-[12px] font-black transition"
                                        style={kind === k ? { background: ORANGE, color: '#fff' } : { border: `1px solid ${colors.border}`, color: colors.textPrimary }}>
                                        {WAIT_KIND_LABEL[k]}
                                    </button>
                                ))}
                            </div>
                        )}
                        <input value={note} onChange={(e) => setNote(e.target.value.slice(0, WAIT_NOTE_MAX))} maxLength={WAIT_NOTE_MAX}
                            placeholder={kind === 'pickup' ? 'Ex.: descendo do apartamento' : kind === 'dropoff' ? 'Ex.: pegando as sacolas' : 'Ex.: comprar água na farmácia'}
                            className="h-10 rounded-xl px-3 text-[13px] outline-none" style={{ background: colors.background, border: `1px solid ${colors.border}`, color: colors.textPrimary }} />
                        <p className="text-[11px]" style={{ color: colors.textSecondary }}>{ruleText(view.graceSeconds, view.rateCents, view.baseCents)} O motorista precisa aprovar.</p>
                        <div className="flex gap-2">
                            <button onClick={() => run('ask', async () => { await requestRideWait(rideId, kind, cleanNote(note)); setAsking(false); setNote('') }, 'Pedido enviado ao motorista')} disabled={busy != null}
                                className="flex-1 h-11 rounded-full text-[13px] font-black text-white flex items-center justify-center gap-1.5 active:scale-[0.98] transition disabled:opacity-60" style={{ background: ORANGE }}>
                                {busy === 'ask' ? <Spinner size={16} /> : 'Pedir ao motorista'}
                            </button>
                            <button onClick={() => setAsking(false)} className="h-11 px-4 rounded-full text-[13px] font-black" style={{ border: `1px solid ${colors.border}`, color: colors.textPrimary }}>Voltar</button>
                        </div>
                    </div>
                ) : (
                    <button onClick={() => setAsking(true)} className="h-11 rounded-full text-[13px] font-black flex items-center justify-center gap-1.5 active:scale-[0.98] transition" style={{ border: `1px solid ${ORANGE}`, color: ORANGE }}>
                        <Clock size={15} /> Pedir tempo de espera
                    </button>
                )
            )}

            {/* ===== as esperas que já terminaram ===== */}
            {closed.length > 0 && (
                <div className="flex flex-col gap-0.5">
                    {closed.map((w) => <p key={w.id} className="text-[11.5px] tabular-nums" style={{ color: colors.textSecondary }}>{waitLine(w, now, view.offsetMs)}</p>)}
                    <p className="text-[11px] mt-0.5" style={{ color: colors.textSecondary }}>Soma-se ao valor combinado da corrida. A espera é do iUser; o pagamento é feito entre vocês, como o resto da corrida.</p>
                </div>
            )}
        </div>
    )
}
