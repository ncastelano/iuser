// src/components/v3/DriverPanelHome.tsx
//
// A aba "Painel" de /painel-motorista na interface 3.0, separada por tema: (1) o modo motorista (liga/desliga e o que falta),
// (2) o que está acontecendo agora (corrida aceita, solicitações, candidaturas), (3) o seu cadastro de motorista (veículo, tarifa,
// avaliações, corridas feitas) e (4) as preferências (som, voz, raio das entregas). Só apresentação: o estado e as ações vêm da página.
'use client'

import type { ReactNode } from 'react'
import { Car, CheckCircle2, ChevronRight, Hand, Navigation2, Radar, Star, TrendingUp, Volume2, VolumeX, History } from 'lucide-react'
import { Spinner } from '@/components/Spinner'

const ORANGE = '#f97316'

type Tab = 'painel' | 'veiculo' | 'plano' | 'avaliacoes' | 'solicitacoes' | 'candidaturas' | 'aceita'

function Switch({ on, color = ORANGE, label, onClick, busy }: { on: boolean; color?: string; label: string; onClick: () => void; busy?: boolean }) {
    return (
        <button role="switch" aria-checked={on} aria-label={label} onClick={onClick} disabled={busy} className="relative flex-shrink-0 w-14 h-8 rounded-full transition-colors disabled:opacity-60" style={{ background: on ? color : 'rgba(120,120,120,0.35)' }}>
            <span className="absolute top-1 w-6 h-6 rounded-full bg-white shadow transition-all flex items-center justify-center" style={{ left: on ? 28 : 4 }}>{busy && <Spinner size={12} color={color} />}</span>
        </button>
    )
}

export default function DriverPanelHome({
    colors, driverStatus, driverModeActive, togglingMode, onToggleMode, missingCount, onContinueSignup,
    rides, candidacies, hasAccepted, goTab,
    vehicleLabel, pricingLabel, reviewsAvg, reviewsCount, ridesDone,
    alertSound, onToggleAlert, voiceNav, onToggleVoice, deliveryRadius, onDeliveryRadius,
    debt, invite,
}: {
    colors: any
    driverStatus: 'inactive' | 'incomplete' | 'active'
    driverModeActive: boolean
    togglingMode: boolean
    onToggleMode: () => void
    missingCount: number
    onContinueSignup: () => void
    rides: number
    candidacies: number
    hasAccepted: boolean
    goTab: (t: Tab) => void
    vehicleLabel: string | null
    pricingLabel: string
    reviewsAvg: number | null
    reviewsCount: number
    ridesDone: number
    alertSound: boolean
    onToggleAlert: () => void
    voiceNav: boolean
    onToggleVoice: () => void
    deliveryRadius: number | null
    onDeliveryRadius: (km: number | null) => void
    debt?: ReactNode
    invite?: ReactNode
}) {
    const soft = `${colors.border}30`
    const stateColor = driverStatus === 'active' ? '#16a34a' : driverStatus === 'incomplete' ? '#ca8a04' : colors.textSecondary
    const stateText = driverStatus === 'active'
        ? (driverModeActive ? 'Você está recebendo corridas' : 'Pronto para receber corridas')
        : driverStatus === 'incomplete' ? `Falta completar o cadastro (${missingCount} ${missingCount === 1 ? 'item' : 'itens'})` : 'Desligado — complete o cadastro para aceitar corridas'

    const section = (title: string, children: ReactNode, sub?: string) => (
        <section>
            <h2 className="text-lg font-black leading-tight" style={{ color: colors.textPrimary }}>{title}</h2>
            {sub && <p className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>{sub}</p>}
            <div className="mt-3">{children}</div>
        </section>
    )
    const row = (icon: ReactNode, title: string, value: ReactNode, onClick: () => void, warn = false) => (
        <button onClick={onClick} className="w-full rounded-2xl p-3.5 flex items-center gap-3 text-left transition active:scale-[0.99]" style={{ background: soft }}>
            <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: warn ? '#eab30822' : `${ORANGE}1f`, color: warn ? '#ca8a04' : ORANGE }}>{icon}</span>
            <span className="min-w-0 flex-1">
                <span className="block text-sm font-black" style={{ color: colors.textPrimary }}>{title}</span>
                <span className="block text-xs mt-0.5 truncate" style={{ color: warn ? '#ca8a04' : colors.textSecondary }}>{value}</span>
            </span>
            <ChevronRight size={16} style={{ color: colors.textSecondary }} />
        </button>
    )
    const pref = (icon: ReactNode, title: string, sub: string, on: boolean, onClick: () => void) => (
        <div className="w-full rounded-2xl p-3.5 flex items-center gap-3" style={{ background: soft }}>
            <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: on ? `${ORANGE}1f` : `${colors.border}50`, color: on ? ORANGE : colors.textSecondary }}>{icon}</span>
            <span className="min-w-0 flex-1">
                <span className="block text-sm font-black" style={{ color: colors.textPrimary }}>{title}</span>
                <span className="block text-xs mt-0.5" style={{ color: colors.textSecondary }}>{sub}</span>
            </span>
            <Switch on={on} label={title} onClick={onClick} />
        </div>
    )

    return (
        <div className="flex flex-col gap-7">
            {debt}

            {/* 1. Modo motorista */}
            <section className="rounded-3xl p-4" style={{ background: driverStatus === 'active' ? '#16a34a14' : driverStatus === 'incomplete' ? '#eab30818' : soft }}>
                <div className="flex items-center gap-3">
                    <span className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 text-white" style={{ background: driverStatus === 'active' ? '#16a34a' : driverStatus === 'incomplete' ? '#eab308' : 'rgba(120,120,120,0.6)' }}><Car size={24} /></span>
                    <span className="min-w-0 flex-1">
                        <span className="block text-lg font-black leading-tight" style={{ color: colors.textPrimary }}>Modo motorista</span>
                        <span className="block text-xs mt-0.5 font-bold" style={{ color: stateColor }}>{stateText}</span>
                    </span>
                    <Switch on={driverModeActive} color="#16a34a" label="Modo motorista" onClick={onToggleMode} busy={togglingMode} />
                </div>
                {driverStatus === 'active' && driverModeActive && (
                    <p className="mt-3 text-xs leading-snug" style={{ color: colors.textSecondary }}>Você vê os pedidos em tempo real e aparece no mapa do passageiro assim que se candidata.</p>
                )}
                {driverStatus === 'incomplete' && (
                    <button onClick={onContinueSignup} className="mt-3 w-full h-11 rounded-full text-sm font-black text-white transition active:scale-[0.98]" style={{ background: ORANGE }}>Continuar cadastro</button>
                )}
            </section>

            {/* 2. Agora */}
            {section('Agora', (
                <div className="flex flex-col gap-2.5">
                    {hasAccepted && (
                        <button onClick={() => goTab('aceita')} className="w-full rounded-2xl p-3.5 flex items-center gap-3 text-left transition active:scale-[0.99]" style={{ background: '#16a34a18', border: '1.5px solid #16a34a66' }}>
                            <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-white" style={{ background: '#16a34a' }}><CheckCircle2 size={20} /></span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-sm font-black" style={{ color: colors.textPrimary }}>Você tem uma corrida aceita</span>
                                <span className="block text-xs" style={{ color: '#16a34a' }}>Toque para abrir e continuar</span>
                            </span>
                            <ChevronRight size={16} style={{ color: '#16a34a' }} />
                        </button>
                    )}
                    <div className="grid grid-cols-2 gap-2.5">
                        {([
                            { id: 'solicitacoes' as Tab, n: rides, label: 'Solicitações', hint: rides === 1 ? 'corrida esperando' : 'corridas esperando', icon: Radar },
                            { id: 'candidaturas' as Tab, n: candidacies, label: 'Me candidatei', hint: candidacies === 1 ? 'aguardando resposta' : 'aguardando resposta', icon: Hand },
                        ]).map((t) => {
                            const Icon = t.icon
                            return (
                                <button key={t.id} onClick={() => goTab(t.id)} className="rounded-2xl p-3.5 text-left transition active:scale-[0.98]" style={{ background: soft }}>
                                    <span className="flex items-center justify-between">
                                        <span className="text-3xl font-black leading-none" style={{ color: t.n > 0 ? ORANGE : colors.textPrimary }}>{t.n}</span>
                                        <Icon size={18} style={{ color: colors.textSecondary }} />
                                    </span>
                                    <span className="block text-sm font-black mt-2" style={{ color: colors.textPrimary }}>{t.label}</span>
                                    <span className="block text-[11px]" style={{ color: colors.textSecondary }}>{t.hint}</span>
                                </button>
                            )
                        })}
                    </div>
                </div>
            ))}

            {/* 3. Seu cadastro de motorista */}
            {section('Seu cadastro de motorista', (
                <div className="flex flex-col gap-2.5">
                    {row(<Car size={20} />, 'Veículo', driverStatus === 'incomplete' ? `Falta: ${missingCount} ${missingCount === 1 ? 'item' : 'itens'}` : (vehicleLabel || 'Cadastre seu veículo'), () => goTab('veiculo'), driverStatus === 'incomplete' || !vehicleLabel)}
                    {row(<TrendingUp size={20} />, 'Tarifa', pricingLabel, () => goTab('plano'))}
                    {row(<Star size={20} />, 'Avaliações', reviewsCount > 0 ? `${reviewsAvg != null ? reviewsAvg.toFixed(1).replace('.', ',') : '–'} ★ · ${reviewsCount} ${reviewsCount === 1 ? 'avaliação' : 'avaliações'}` : 'Ainda sem avaliações', () => goTab('avaliacoes'))}
                    {row(<History size={20} />, 'Corridas feitas', ridesDone > 0 ? `${ridesDone} ${ridesDone === 1 ? 'concluída' : 'concluídas'}` : 'Nenhuma concluída ainda', () => goTab('avaliacoes'))}
                </div>
            ))}

            {/* 4. Preferências */}
            {section('Preferências', (
                <div className="flex flex-col gap-2.5">
                    {pref(alertSound ? <Volume2 size={20} /> : <VolumeX size={20} />, 'Som do alerta', alertSound ? 'Toca quando chega uma corrida nova' : 'Silenciado', alertSound, onToggleAlert)}
                    {pref(<Navigation2 size={20} />, 'Orientação por voz', voiceNav ? 'Fala as manobras até a partida e a chegada' : 'Desligada', voiceNav, onToggleVoice)}
                    <div className="rounded-2xl p-3.5" style={{ background: soft }}>
                        <span className="block text-sm font-black" style={{ color: colors.textPrimary }}>Raio das entregas de loja</span>
                        <span className="block text-xs mt-0.5" style={{ color: colors.textSecondary }}>Você só vê e recebe aviso de entregas até essa distância de você.</span>
                        <div className="mt-2.5 flex gap-1.5 flex-wrap">
                            {([null, 3, 5, 10, 20] as (number | null)[]).map((km) => {
                                const on = deliveryRadius === km
                                return (
                                    <button key={km ?? 'none'} onClick={() => onDeliveryRadius(km)} className="h-9 px-4 rounded-full text-xs font-black transition active:scale-95" style={on ? { background: ORANGE, color: '#fff' } : { background: `${colors.border}55`, color: colors.textPrimary }}>
                                        {km == null ? 'Sem limite' : `${km} km`}
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                </div>
            ))}

            {invite}
        </div>
    )
}
