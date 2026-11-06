// components/NewRideAlertCard.tsx
//
// Conteúdo do aviso "Nova corrida disponível!" (DriverRideAlertListener), no mesmo espírito do card da home (RideSummaryCard), mas COMPACTO:
//  • a faixa de cima diz COMO a corrida paga, com a cor do nível (valorizada / paga muito bem / boa / paga o normal / abaixo do seu mínimo) e quanto rende por hora;
//  • o valor grande é o escolhido (começa no MELHOR) e as fichas mostram só as tarifas que existem (Tarifa iUser, Por km se for do motorista, Por tempo, oferta do passageiro),
//    com ★ na melhor — assim se vê de relance se vale mais pelo tempo, pela Tarifa iUser ou pelo quilômetro;
//  • candidata DESLIZANDO (não sai sem querer) e "Detalhes" leva à página da corrida (/aceitar-corridas?ride=<id>, já com os detalhes abertos).
// Nenhum valor abaixo do mínimo de uma corrida (R$ 8,00) chega aqui: o listener já sobe tudo ao piso.
'use client'

import { useMemo, useState } from 'react'
import { ArrowRight, Flame, Star, ThumbsUp, TrendingUp, Gauge, AlertTriangle, X } from 'lucide-react'
import { toast } from '@/lib/toast'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import SlideToConfirm from '@/components/SlideToConfirm'
import { submitRideApplication } from '@/lib/rideApplication'
import { rideGrade, type RideGrade } from '@/modules/negotiation/domain'

const GRADIENT = 'linear-gradient(90deg, #f97316, #ef4444)'
const GREEN = '#16a34a'

export type AlertOptionKey = 'offer' | 'platform' | 'km' | 'time'
export interface AlertOption { key: AlertOptionKey; label: string; value: number; tag?: string }

interface NewRideAlertCardProps {
    rideId: string
    originAddress?: string
    destinationAddress?: string
    /** as tarifas que EXISTEM (a oferta do passageiro, a Tarifa iUser, Por km só se for do motorista, Por tempo), já sem nada abaixo do mínimo da corrida */
    options: AlertOption[]
    /** frete fixo da loja: não há o que escolher, só aceitar */
    offeredPrice: number | null
    /** a Tarifa iUser (base para "valorizada") e se o valor escolhido é a oferta do passageiro */
    platformPrice: number
    /** minutos de trabalho estimados (ir buscar + corrida) e o resumo da corrida */
    minutes: number | null
    tripMin?: number | null
    tripKm?: number | null
    /** o mínimo por hora PRÓPRIO do motorista (null se não definiu) e o piso por hora da plataforma */
    ownMinHourly: number | null
    floorPerHour: number
    onClose: () => void
    onDetails: () => void
}

const brl = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`

const GRADE_STYLE: Record<RideGrade, { strip: string; text: string; value: string; icon: typeof Flame; solid: boolean }> = {
    valued: { strip: GRADIENT, text: '#fff', value: '#ea580c', icon: Flame, solid: true },
    great: { strip: GREEN, text: '#fff', value: GREEN, icon: TrendingUp, solid: true },
    good: { strip: `${GREEN}22`, text: GREEN, value: GREEN, icon: ThumbsUp, solid: false },
    normal: { strip: '', text: '', value: '', icon: Gauge, solid: false },
    low: { strip: '#f59e0b24', text: '#b45309', value: '#b45309', icon: AlertTriangle, solid: false },
}

export function NewRideAlertCard({ rideId, originAddress, destinationAddress, options, offeredPrice, platformPrice, minutes, tripMin, tripKm, ownMinHourly, floorPerHour, onClose, onDetails }: NewRideAlertCardProps) {
    const { colors } = useTheme()
    const router = useRouter()
    const [sending, setSending] = useState(false)

    // a melhor tarifa (a de maior valor entre as tarifas; a oferta do passageiro não disputa: é o que ele quer pagar) começa escolhida
    const best = useMemo(() => options.filter((o) => o.key !== 'offer').reduce<AlertOption | null>((b, o) => (!b || o.value > b.value ? o : b), null), [options])
    const initial = options.find((o) => o.key === 'offer') ?? best
    const [pickedKey, setPickedKey] = useState<AlertOptionKey | null>(initial?.key ?? null)
    const picked = options.find((o) => o.key === pickedKey) ?? initial
    const price = offeredPrice ?? picked?.value ?? 0

    const grade = rideGrade({ price, minutes, platformPrice, fromPassenger: picked?.key === 'offer', ownMinHourly, floorPerHour })
    const gs = GRADE_STYLE[grade.grade]
    const Icon = gs.icon
    const short = (a?: string) => (a || '').split(',')[0]
    const valueColor = gs.value || colors.textPrimary

    const apply = async () => {
        if (!(price > 0)) { toast.error('Informe um valor válido'); return }
        setSending(true)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error('Entre na sua conta para se candidatar')
            const { count: vehicleCount } = await supabase.from('driver_vehicles').select('vehicle_kind', { count: 'exact', head: true }).eq('driver_id', user.id)
            if (!vehicleCount) {
                toast.error('Cadastre seu veículo pra se candidatar.', {
                    action: { label: 'Cadastrar', onClick: () => router.push('/painel-motorista?aba=veiculo&veiculo=carro') },
                })
                return
            }
            await submitRideApplication(user.id, rideId, price)
            toast.success(`Candidatura enviada por ${brl(price)}!`)
            onClose()
        } catch (err: any) {
            if (err?.code === '42501' || err?.code === 'PGRST301') toast.error('Essa corrida já atingiu o limite de candidatos.')
            else if (err?.code === '23505') toast.error('Você já se candidatou a essa corrida.')
            else toast.error('Erro ao se candidatar: ' + (err?.message || 'tente novamente'))
        } finally { setSending(false) }
    }

    const frame = { background: colors.surface, border: `1px solid ${grade.grade === 'valued' ? '#f9731666' : colors.border}`, boxShadow: grade.grade === 'valued' ? '0 10px 30px #f9731633' : colors.shadow }

    return (
        <div className="w-[min(94vw,400px)] rounded-3xl overflow-hidden" style={frame}>
            {/* COMO A CORRIDA PAGA, na cor do nível */}
            <div className="flex items-center gap-2 px-3.5 py-1.5 text-[12px] font-black" style={{ background: gs.solid || gs.strip ? gs.strip : `${colors.border}35`, color: gs.text || colors.textSecondary }}>
                <Icon size={14} />
                <span>{grade.label}</span>
                {grade.grade === 'valued' && grade.extra > 0 && <span className="font-bold opacity-90">· {brl(grade.extra)} a mais</span>}
                {grade.perHour != null && <span className="ml-auto font-bold opacity-90">≈ R$ {Math.round(grade.perHour)}/h</span>}
            </div>

            <div className="p-3.5 flex flex-col gap-2.5">
                <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: colors.textSecondary }}>Nova corrida disponível</p>
                        {originAddress && <p className="text-[13px] font-black leading-tight truncate" style={{ color: colors.textPrimary }}>{short(originAddress)} <span style={{ color: colors.textSecondary }}>→</span> {short(destinationAddress)}</p>}
                    </div>
                    <button onClick={onClose} aria-label="Fechar" className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${colors.border}35`, color: colors.textSecondary }}><X size={14} /></button>
                </div>

                <div className="flex items-end justify-between gap-3">
                    <span className="font-black leading-none tabular-nums" style={{ color: valueColor, fontSize: 34, letterSpacing: '-0.03em' }}>{brl(price)}</span>
                    <span className="text-[11px] font-bold text-right leading-tight" style={{ color: colors.textSecondary }}>
                        {offeredPrice != null ? 'frete da loja' : tripMin != null ? `${Math.round(tripMin)} min${tripKm != null ? ` · ${tripKm.toFixed(1).replace('.', ',')} km` : ''}` : ''}
                    </span>
                </div>

                {/* as tarifas que existem; a melhor leva a ★ */}
                {offeredPrice == null && options.length > 1 && (
                    <div className="flex gap-1.5">
                        {options.map((o) => {
                            const on = o.key === picked?.key
                            const isBest = best?.key === o.key
                            return (
                                <button
                                    key={o.key}
                                    onClick={() => setPickedKey(o.key)}
                                    className="flex-1 min-w-0 rounded-xl px-2 py-1.5 text-left active:scale-95 transition"
                                    style={{ background: on ? `${valueColor}1a` : `${colors.border}20`, border: `1.5px solid ${on ? valueColor : isBest ? `${GREEN}88` : colors.border}` }}
                                >
                                    <span className="flex items-center gap-1 text-[9.5px] font-black uppercase tracking-wide truncate" style={{ color: colors.textSecondary }}>
                                        {o.label}{isBest && <Star size={9} fill="#eab308" color="#eab308" />}
                                    </span>
                                    <span className="block text-[14px] font-black leading-tight" style={{ color: on ? valueColor : colors.textPrimary }}>{brl(o.value)}</span>
                                    {o.tag && <span className="block text-[9px] font-semibold leading-tight truncate" style={{ color: colors.textSecondary }}>{o.tag}</span>}
                                </button>
                            )
                        })}
                    </div>
                )}

                <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                        <SlideToConfirm
                            label={offeredPrice != null ? `Deslize para aceitar o frete` : `Deslize · ${brl(price)}`}
                            ariaLabel={`Candidatar por ${brl(price)}`}
                            busy={sending}
                            onConfirm={apply}
                        />
                    </div>
                    <button
                        onClick={onDetails}
                        className="h-[52px] px-3.5 rounded-full text-[12px] font-black flex items-center gap-1 flex-shrink-0 active:scale-95 transition"
                        style={{ background: `${colors.border}35`, color: colors.textPrimary, border: `1px solid ${colors.border}` }}
                    >
                        Detalhes <ArrowRight size={13} />
                    </button>
                </div>
            </div>
        </div>
    )
}
