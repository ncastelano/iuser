// src/components/v3/DriverPanelHome.tsx
//
// A aba "Painel" de /painel-motorista na interface 3.0, separada por tema: (1) o modo motorista (liga/desliga e o que falta),
// (2) o que está acontecendo agora (corrida aceita, solicitações, candidaturas), (3) o seu cadastro de motorista (veículo, tarifa,
// avaliações, corridas feitas) e (4) as preferências (som, voz, raio das entregas). Só apresentação: o estado e as ações vêm da página.
'use client'

import { Fragment, type ReactNode } from 'react'
import { Bike, Car, Package, CheckCircle2, ChevronRight, Hand, Navigation2, Power, Radar, Star, TrendingUp, Volume2, VolumeX, History, Wallet } from 'lucide-react'
import { Spinner } from '@/components/Spinner'
import { toast } from '@/lib/toast'

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
    rides, deliveries = 0, candidacies, hasAccepted, acceptedIsDelivery = false, incoming = [], goTab,
    vehicleLabel, vehicles, pricingLabel, tariffLines, reviewsAvg, reviewsCount, ridesDone,
    alertSound, onToggleAlert, voiceNav, onToggleVoice, deliveryRadius, onDeliveryRadius,
    debt, invite, onDeliveries, onEarnings,
}: {
    colors: any
    driverStatus: 'inactive' | 'incomplete' | 'active'
    driverModeActive: boolean
    togglingMode: boolean
    onToggleMode: () => void
    missingCount: number
    onContinueSignup: () => void
    /** corridas de passageiro/objeto/animal esperando */
    rides: number
    /** entregas de LOJA abertas (pedidos de loja que o motorista pode entregar) */
    deliveries?: number
    /** a corrida aceita é uma entrega de loja (leva à Central de entregas) */
    acceptedIsDelivery?: boolean
    /** as mais recentes dos dois tipos, juntas */
    incoming?: { id: string; kind: 'ride' | 'delivery'; title: string; sub: string; price: number | null; at: string }[]
    candidacies: number
    hasAccepted: boolean
    goTab: (t: Tab) => void
    vehicleLabel: string | null
    // Veículos cadastrados (um por tipo), com a foto de cada um
    vehicles: { id: string; label: string; photoUrl: string | null }[]
    pricingLabel: string
    // Valores da tarifa em linguagem simples (as mesmas duas linhas da aba Tarifa)
    tariffLines: string[]
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
    /** Abre a Central de entregas (/entregas): entregas das lojas, mochila e rota guiada */
    onDeliveries?: () => void
    /** Abre os Ganhos (/ganhos) */
    onEarnings?: () => void
}) {
    const soft = `${colors.border}30`
    const stateColor = (driverModeActive && driverStatus === 'active') ? '#16a34a' : driverStatus === 'incomplete' ? '#ca8a04' : colors.textSecondary
    // `driverStatus`: 'inactive' = modo DESLIGADO; 'incomplete' = modo ligado mas falta cadastro; 'active' = modo ligado e cadastro pronto.
    // ONLINE = ligado e pronto; OFFLINE = desligado (nada de corrida, aviso nem contagem); o resto é cadastro por completar.
    const online = driverModeActive && driverStatus === 'active'
    const offline = !driverModeActive
    const stateLabel = online ? 'Online' : offline ? 'Offline' : 'Cadastro incompleto'
    const stateText = online
        ? 'Você vê os pedidos em tempo real, recebe aviso de corrida nova e aparece no mapa do passageiro assim que se candidata.'
        : offline ? 'Você não recebe avisos nem vê pedidos. Ligue o modo motorista para começar.'
        : `Falta completar o cadastro (${missingCount} ${missingCount === 1 ? 'item' : 'itens'}) para receber corridas.`

    const section = (title: string, children: ReactNode, sub?: string) => (
        <section>
            <h2 className="text-lg font-black leading-tight" style={{ color: colors.textPrimary }}>{title}</h2>
            {sub && <p className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>{sub}</p>}
            <div className="mt-3">{children}</div>
        </section>
    )
    const row = (icon: ReactNode, title: string, value: ReactNode, onClick: () => void, warn = false, photoUrl?: string | null, multiline = false) => (
        <button onClick={onClick} className="w-full rounded-2xl p-3.5 flex items-center gap-3 text-left transition active:scale-[0.99]" style={{ background: soft }}>
            {photoUrl ? (
                <img src={photoUrl} alt="" className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
            ) : (
                <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: warn ? '#eab30822' : `${ORANGE}1f`, color: warn ? '#ca8a04' : ORANGE }}>{icon}</span>
            )}
            <span className="min-w-0 flex-1">
                <span className="block text-sm font-black" style={{ color: colors.textPrimary }}>{title}</span>
                <span className={`block text-xs mt-0.5 ${multiline ? 'leading-snug' : 'truncate'}`} style={{ color: warn ? '#ca8a04' : colors.textSecondary }}>{value}</span>
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

            {/* 1. Modo motorista: o estado em uma olhada (online, offline ou cadastro) */}
            <section className="rounded-3xl p-4" style={{ background: online ? '#16a34a14' : driverStatus === 'incomplete' ? '#eab30818' : soft, border: `1.5px solid ${online ? '#16a34a55' : driverStatus === 'incomplete' ? '#eab30855' : colors.border}` }}>
                <div className="flex items-center gap-3">
                    <span className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 text-white" style={{ background: online ? '#16a34a' : driverStatus === 'incomplete' ? '#eab308' : 'rgba(120,120,120,0.6)' }}><Car size={24} /></span>
                    <span className="min-w-0 flex-1">
                        <span className="block text-lg font-black leading-tight" style={{ color: colors.textPrimary }}>Modo motorista</span>
                        <span className="inline-flex items-center gap-1.5 text-xs mt-0.5 font-black" style={{ color: stateColor }}>
                            <span className={`w-2 h-2 rounded-full ${online ? 'animate-pulse' : ''}`} style={{ background: stateColor }} />{stateLabel}
                        </span>
                    </span>
                    <Switch on={driverModeActive} color="#16a34a" label="Modo motorista" onClick={onToggleMode} busy={togglingMode} />
                </div>
                <p className="mt-3 text-xs leading-snug" style={{ color: colors.textSecondary }}>{stateText}</p>
                {online && (rides > 0 || deliveries > 0) && (
                    <div className="mt-3 flex flex-wrap gap-2">
                        {rides > 0 && <button onClick={() => goTab('solicitacoes')} className="h-8 px-3 rounded-full text-xs font-black text-white" style={{ background: ORANGE }}>{rides} {rides === 1 ? 'corrida esperando' : 'corridas esperando'}</button>}
                        {deliveries > 0 && onDeliveries && <button onClick={onDeliveries} className="h-8 px-3 rounded-full text-xs font-black text-white" style={{ background: '#16a34a' }}>{deliveries} {deliveries === 1 ? 'entrega de loja' : 'entregas de lojas'}</button>}
                    </div>
                )}
                {driverStatus === 'incomplete' && (
                    <button onClick={onContinueSignup} className="mt-3 w-full h-11 rounded-full text-sm font-black text-white transition active:scale-[0.98]" style={{ background: ORANGE }}>Continuar cadastro</button>
                )}
            </section>

            {/* Atalhos: os MESMOS itens das abas do painel (menos o próprio Painel) + Ganhos; os selos seguem as abas (corridas só aparecem online) */}
            <div className="grid grid-cols-4 gap-2 -mt-3">
                {([
                    ...(onEarnings ? [{ k: 'ganhos', label: 'Ganhos', icon: Wallet, go: onEarnings, badge: 0, badgeColor: ORANGE, empty: null as string | null }] : []),
                    ...(onDeliveries ? [{ k: 'entregas', label: 'Entregas', icon: Bike, go: onDeliveries, badge: 0, badgeColor: ORANGE, empty: null as string | null }] : []),
                    // "Corrida aceita" e "Me candidatei" aparecem SEMPRE (a grade mostra todas as abas); sem nada nelas o botão fica esmaecido e avisa em vez de abrir uma aba vazia
                    { k: 'aceita', label: 'Corrida aceita', icon: CheckCircle2, go: () => (acceptedIsDelivery && onDeliveries ? onDeliveries() : goTab('aceita')), badge: 0, badgeColor: '#16a34a', empty: hasAccepted ? null : 'Você não tem corrida aceita agora.' },
                    { k: 'solicitacoes', label: 'Solicitações', icon: Radar, go: () => goTab('solicitacoes'), badge: driverModeActive ? rides + deliveries : 0, badgeColor: '#ef4444', empty: null as string | null },
                    { k: 'candidaturas', label: 'Me candidatei', icon: Hand, go: () => goTab('candidaturas'), badge: candidacies, badgeColor: '#ef4444', empty: candidacies > 0 || hasAccepted ? null : 'Você não tem candidaturas pendentes.' },
                    { k: 'veiculo', label: 'Veículo', icon: Car, go: () => goTab('veiculo'), badge: driverStatus === 'incomplete' ? (missingCount || 1) : 0, badgeColor: '#eab308', empty: null as string | null },
                    { k: 'tarifa', label: 'Tarifa', icon: TrendingUp, go: () => goTab('plano'), badge: 0, badgeColor: ORANGE, empty: null as string | null },
                    { k: 'avaliacoes', label: 'Avaliações', icon: Star, go: () => goTab('avaliacoes'), badge: 0, badgeColor: ORANGE, empty: null as string | null },
                ]).map((it) => {
                    const Icon = it.icon
                    return (
                        <button
                            key={it.k}
                            onClick={() => (it.empty ? toast.info(it.empty) : it.go())}
                            aria-disabled={!!it.empty}
                            className="relative rounded-2xl py-3 px-1 flex flex-col items-center gap-1.5 transition active:scale-95"
                            style={{ background: soft, opacity: it.empty ? 0.5 : 1 }}
                        >
                            {it.badge > 0 && <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black text-white flex items-center justify-center" style={{ background: it.badgeColor }}>{it.badge > 99 ? '99+' : it.badge}</span>}
                            <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${ORANGE}1f`, color: ORANGE }}><Icon size={18} /></span>
                            <span className="text-[11px] font-black leading-tight text-center" style={{ color: colors.textPrimary }}>{it.label}</span>
                        </button>
                    )
                })}
            </div>

            {/* 2. Agora */}
            {section('Agora', (
                <div className="flex flex-col gap-2.5">
                    {hasAccepted && (
                        <button onClick={() => (acceptedIsDelivery && onDeliveries ? onDeliveries() : goTab('aceita'))} className="w-full rounded-2xl p-3.5 flex items-center gap-3 text-left transition active:scale-[0.99]" style={{ background: '#16a34a18', border: '1.5px solid #16a34a66' }}>
                            <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-white" style={{ background: '#16a34a' }}>{acceptedIsDelivery ? <Package size={20} /> : <CheckCircle2 size={20} />}</span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-sm font-black" style={{ color: colors.textPrimary }}>{acceptedIsDelivery ? 'Você tem uma entrega em andamento' : 'Você tem uma corrida aceita'}</span>
                                <span className="block text-xs" style={{ color: '#16a34a' }}>Toque para abrir e continuar</span>
                            </span>
                            <ChevronRight size={16} style={{ color: '#16a34a' }} />
                        </button>
                    )}
                    {driverModeActive && <div className="grid grid-cols-2 gap-2.5">
                        {([
                            { id: 'solicitacoes' as Tab | 'entregas', n: rides, label: 'Corridas', hint: rides === 1 ? 'passageiro esperando' : 'esperando você', icon: Radar },
                            ...(onDeliveries ? [{ id: 'entregas' as Tab | 'entregas', n: deliveries, label: 'Entregas de lojas', hint: deliveries === 1 ? 'pedido para entregar' : 'pedidos para entregar', icon: Package }] : []),
                            { id: 'candidaturas' as Tab | 'entregas', n: candidacies, label: 'Me candidatei', hint: 'aguardando resposta', icon: Hand },
                        ]).map((t) => {
                            const Icon = t.icon
                            return (
                                <button key={t.id} onClick={() => (t.id === 'entregas' ? onDeliveries?.() : goTab(t.id as Tab))} className="rounded-2xl p-3.5 text-left transition active:scale-[0.98]" style={{ background: soft }}>
                                    <span className="flex items-center justify-between">
                                        <span className="text-3xl font-black leading-none" style={{ color: t.n > 0 ? ORANGE : colors.textPrimary }}>{t.n}</span>
                                        <Icon size={18} style={{ color: colors.textSecondary }} />
                                    </span>
                                    <span className="block text-sm font-black mt-2" style={{ color: colors.textPrimary }}>{t.label}</span>
                                    <span className="block text-[11px]" style={{ color: colors.textSecondary }}>{t.hint}</span>
                                </button>
                            )
                        })}
                    </div>}
                    {/* MODO DESLIGADO: nada de corrida, entrega nem contagem — só o convite para ficar online */}
                    {!driverModeActive && (
                        <div className="rounded-2xl p-4 flex flex-col items-center text-center gap-1.5" style={{ background: soft }}>
                            <span className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: `${colors.border}55`, color: colors.textSecondary }}><Power size={22} /></span>
                            <span className="text-sm font-black" style={{ color: colors.textPrimary }}>Você está offline</span>
                            <span className="text-xs leading-snug" style={{ color: colors.textSecondary }}>Corridas e entregas só aparecem, e os avisos só chegam, com o modo motorista ligado.</span>
                            <button onClick={onToggleMode} disabled={togglingMode} className="mt-1.5 h-10 px-6 rounded-full text-sm font-black text-white transition active:scale-95 disabled:opacity-60" style={{ background: '#16a34a' }}>
                                Ficar online
                            </button>
                        </div>
                    )}
                    {/* As mais recentes dos dois tipos juntas: corrida de passageiro e entrega de loja */}
                    {driverModeActive && incoming.length > 0 && (
                        <div className="flex flex-col gap-1.5">
                            <span className="text-[11px] font-black uppercase tracking-wide" style={{ color: colors.textSecondary }}>Chegando agora</span>
                            {incoming.map((it) => (
                                <button key={it.id} onClick={() => (it.kind === 'delivery' && onDeliveries ? onDeliveries() : goTab('solicitacoes'))} className="w-full rounded-2xl px-3 py-2.5 flex items-center gap-3 text-left transition active:scale-[0.99]" style={{ background: soft }}>
                                    <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-white" style={{ background: it.kind === 'delivery' ? '#16a34a' : ORANGE }}>{it.kind === 'delivery' ? <Package size={17} /> : <Car size={17} />}</span>
                                    <span className="min-w-0 flex-1">
                                        <span className="flex items-center gap-1.5"><span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full" style={{ background: it.kind === 'delivery' ? '#16a34a22' : `${ORANGE}22`, color: it.kind === 'delivery' ? '#16a34a' : ORANGE }}>{it.kind === 'delivery' ? 'Entrega' : 'Corrida'}</span><span className="text-sm font-black truncate" style={{ color: colors.textPrimary }}>{it.title}</span></span>
                                        <span className="block text-xs truncate" style={{ color: colors.textSecondary }}>{it.sub}</span>
                                    </span>
                                    {it.price != null && <span className="text-sm font-black flex-shrink-0" style={{ color: '#16a34a' }}>R$ {it.price.toFixed(2).replace('.', ',')}</span>}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            ))}

            {/* 3. Seu cadastro de motorista */}
            {section('Seu cadastro de motorista', (
                <div className="flex flex-col gap-2.5">
                    {driverStatus === 'incomplete' || vehicles.length === 0
                        ? row(<Car size={20} />, 'Veículo', driverStatus === 'incomplete' ? `Falta: ${missingCount} ${missingCount === 1 ? 'item' : 'itens'}` : (vehicleLabel || 'Cadastre seu veículo'), () => goTab('veiculo'), true, vehicles[0]?.photoUrl)
                        : vehicles.map((v) => <Fragment key={v.id}>{row(<Car size={20} />, 'Veículo', v.label, () => goTab('veiculo'), false, v.photoUrl)}</Fragment>)}
                    {row(<TrendingUp size={20} />, 'Tarifa', (
                        <>
                            <span className="block font-bold" style={{ color: colors.textPrimary }}>{pricingLabel}</span>
                            {tariffLines.map((l, i) => <span key={i} className="block">{l}</span>)}
                        </>
                    ), () => goTab('plano'), false, null, true)}
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
