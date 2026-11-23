// src/components/v3/DriverPanelHome.tsx
//
// A aba "Painel" de /canal-do-motorista na interface 3.0, separada por tema: (1) o modo motorista (liga/desliga e o que falta),
// (2) o que está acontecendo agora (corrida aceita, solicitações, candidaturas), (3) o seu cadastro de motorista (veículo, tarifa,
// avaliações, corridas feitas) e (4) as preferências (som, voz, raio das entregas). Só apresentação: o estado e as ações vêm da página.
'use client'

import { type ReactNode } from 'react'
import { Bike, Car, Package, CheckCircle2, ChevronRight, Hand, Navigation2, Power, Radar, Star, Volume2, VolumeX, History, Wallet } from 'lucide-react'
import { Spinner } from '@/components/Spinner'

const ORANGE = '#f97316'

type Tab = 'painel' | 'cadastro' | 'veiculo' | 'plano' | 'avaliacoes' | 'solicitacoes' | 'candidaturas' | 'aceita'

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
    debt, invite, outdoor, onDeliveries, onEarnings,
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
    /** Outdoor dos motoristas (o ranking) */
    outdoor?: ReactNode
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
                {driverStatus === 'incomplete' && (
                    <button onClick={onContinueSignup} className="mt-3 w-full h-11 rounded-full text-sm font-black text-white transition active:scale-[0.98]" style={{ background: ORANGE }}>Continuar cadastro</button>
                )}
            </section>

            {/* Ganhos (as entregas estão em "Agora" e na barra de baixo) */}
            {onEarnings && (
                <button onClick={onEarnings} className="-mt-3 h-12 rounded-2xl flex items-center justify-center gap-2 text-sm font-black transition active:scale-[0.98]" style={{ background: soft, color: colors.textPrimary }}><Wallet size={18} style={{ color: ORANGE }} /> Meus ganhos</button>
            )}

            {/* 2. Agora */}
            {section('Agora', (
                <div className="flex flex-col gap-2.5">
                    {hasAccepted && (
                        <button onClick={() => goTab('aceita')} className="w-full rounded-2xl p-3.5 flex items-center gap-3 text-left transition active:scale-[0.99]" style={{ background: '#16a34a18', border: '1.5px solid #16a34a66' }}>
                            <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-white" style={{ background: '#16a34a' }}>{acceptedIsDelivery ? <Package size={20} /> : <CheckCircle2 size={20} />}</span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-sm font-black" style={{ color: colors.textPrimary }}>{acceptedIsDelivery ? 'Você tem uma entrega em andamento' : 'Você tem uma corrida aceita'}</span>
                                <span className="block text-xs" style={{ color: '#16a34a' }}>Toque para abrir e continuar</span>
                            </span>
                            <ChevronRight size={16} style={{ color: '#16a34a' }} />
                        </button>
                    )}
                    {driverModeActive && <div className="grid grid-cols-3 gap-2">
                        {([
                            { id: 'solicitacoes' as Tab | 'entregas', n: rides, label: 'Corridas', hint: rides === 1 ? 'passageiro esperando' : 'esperando você', icon: Radar },
                            ...(onDeliveries ? [{ id: 'entregas' as Tab | 'entregas', n: deliveries, label: 'Entregas', hint: deliveries === 1 ? 'pedido para entregar' : 'pedidos para entregar', icon: Package }] : []),
                            { id: 'candidaturas' as Tab | 'entregas', n: candidacies, label: 'Me candidatei', hint: 'aguardando resposta', icon: Hand },
                        ]).map((t) => {
                            const Icon = t.icon
                            return (
                                <button key={t.id} onClick={() => (t.id === 'entregas' ? onDeliveries?.() : goTab(t.id as Tab))} className="rounded-2xl p-3 text-left transition active:scale-[0.98]" style={{ background: soft }}>
                                    <span className="flex items-center justify-between">
                                        <span className="text-2xl font-black leading-none" style={{ color: t.n > 0 ? ORANGE : colors.textPrimary }}>{t.n}</span>
                                        <Icon size={18} style={{ color: colors.textSecondary }} />
                                    </span>
                                    <span className="block text-[13px] font-black mt-1.5 truncate" style={{ color: colors.textPrimary }}>{t.label}</span>
                                    <span className="block text-[10.5px] leading-tight" style={{ color: colors.textSecondary }}>{t.hint}</span>
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

            {/* 3. Meu cadastro: tudo à vista (cada veículo, a tarifa inteira, a nota e as corridas); tocar abre a aba Meu cadastro */}
            {section('Meu cadastro', (
                <button onClick={() => goTab('cadastro')} className="w-full rounded-2xl p-3.5 flex flex-col gap-3 text-left transition active:scale-[0.99]" style={{ background: driverStatus === 'incomplete' ? '#eab30818' : soft }}>
                    {(vehicles.length ? vehicles : [{ id: 'none', label: vehicleLabel || 'Cadastre seu veículo', photoUrl: null }]).map((v) => (
                        <span key={v.id} className="flex items-center gap-3">
                            {v.photoUrl
                                ? <img src={v.photoUrl} alt="" className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
                                : <span className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${ORANGE}1f`, color: ORANGE }}><Car size={24} /></span>}
                            <span className="min-w-0 flex-1">
                                <span className="block text-[11px] font-black uppercase tracking-wide" style={{ color: colors.textSecondary }}>Veículo</span>
                                <span className="block text-sm font-black leading-snug" style={{ color: colors.textPrimary }}>{v.label}</span>
                            </span>
                            <ChevronRight size={16} style={{ color: colors.textSecondary }} />
                        </span>
                    ))}
                    <span className="block rounded-xl p-2.5" style={{ background: `${colors.border}30` }}>
                        <span className="block text-[11px] font-black uppercase tracking-wide" style={{ color: colors.textSecondary }}>Tarifa</span>
                        <span className="block text-sm font-black" style={{ color: colors.textPrimary }}>{pricingLabel}</span>
                        {tariffLines.map((l, i) => <span key={i} className="block text-xs leading-snug mt-0.5" style={{ color: colors.textSecondary }}>{l}</span>)}
                    </span>
                    <span className="grid grid-cols-2 gap-2">
                        <span className="rounded-xl p-2.5" style={{ background: `${colors.border}30` }}>
                            <span className="flex items-center gap-1 text-lg font-black leading-none" style={{ color: colors.textPrimary }}><Star size={15} style={{ color: '#eab308', fill: '#eab308' }} />{reviewsCount > 0 && reviewsAvg != null ? reviewsAvg.toFixed(1).replace('.', ',') : '–'}</span>
                            <span className="block text-[11px] mt-1" style={{ color: colors.textSecondary }}>{reviewsCount} {reviewsCount === 1 ? 'avaliação' : 'avaliações'}</span>
                        </span>
                        <span className="rounded-xl p-2.5" style={{ background: `${colors.border}30` }}>
                            <span className="flex items-center gap-1 text-lg font-black leading-none" style={{ color: colors.textPrimary }}><History size={15} style={{ color: ORANGE }} />{ridesDone}</span>
                            <span className="block text-[11px] mt-1" style={{ color: colors.textSecondary }}>{ridesDone === 1 ? 'corrida feita' : 'corridas feitas'}</span>
                        </span>
                    </span>
                    {driverStatus === 'incomplete' && <span className="text-xs font-black" style={{ color: '#ca8a04' }}>Falta: {missingCount} {missingCount === 1 ? 'item' : 'itens'} para completar</span>}
                </button>
            ), 'Veículo, tarifa e avaliações')}

            {outdoor}

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
