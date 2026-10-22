// src/app/(main)/inicio/sections/MyServiceApplications.tsx
//
// "Quais serviços me inscrevi": os pedidos de serviço dos outros em que a
// pessoa se inscreveu como profissional, com a situação de cada inscrição.
'use client'

import { useRouter } from 'next/navigation'
import { MapPin, CheckCircle2, Clock, HeartCrack } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { useNavProgressStore } from '@/store/useNavProgressStore'
import { getServiceIcon, getRequestTitle } from '@/lib/serviceTypes'
import { MyApplication } from '@/hooks/useMyServiceApplications'
import { HOME_GRADIENT, HomeSectionHeader } from './HomeSectionKit'
import PlanAvatarRing from '@/components/PlanAvatarRing'
import ServiceExchangePanel from '@/components/ServiceExchangePanel'
import { useMyServiceApplications } from '@/hooks/useMyServiceApplications'

function appliedAgo(iso: string): string {
    const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
    if (minutes < 1) return 'agora'
    if (minutes < 60) return `há ${minutes} min`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `há ${hours}h`
    const days = Math.floor(hours / 24)
    return `há ${days} ${days === 1 ? 'dia' : 'dias'}`
}

function shortAddress(address: string): string {
    // Só rua/bairro: o número fica com quem foi escolhido.
    return address.split(',')[0].trim().replace(/[,\s]+\d+\s*\w*$/, '')
}

export default function MyServiceApplications({ items }: { items: MyApplication[] }) {
    const { colors } = useTheme()
    const router = useRouter()
    const startNavProgress = useNavProgressStore((s) => s.start)
    const { reload } = useMyServiceApplications()

    if (items.length === 0) return null

    const chosen = items.filter((i) => i.status === 'accepted').length

    return (
        <div>
            <HomeSectionHeader
                action={<span />}
                title="Quais serviços me inscrevi"
                subtitle={chosen > 0
                    ? `Você foi escolhido em ${chosen} ${chosen === 1 ? 'serviço' : 'serviços'}!`
                    : `${items.length} ${items.length === 1 ? 'inscrição' : 'inscrições'} — a gente avisa quando responderem`}
            />

            {/* Padding com margem negativa: folga pro brilho da borda pulsante e a sombra não serem cortados pela rolagem */}
            <div className="flex gap-3 overflow-x-auto px-2 -mx-2 pt-3 pb-4 -mt-3 -mb-3 snap-x">
                {items.map((item) => {
                    const Icon = getServiceIcon(item.serviceType)
                    const who = item.requesterSlug ? `@${item.requesterSlug}` : item.requesterName?.split(' ')[0] || 'Alguém'
                    const pulsing = item.status === 'accepted' && !item.completedAt
                    const photo = item.photoUrl
                    const title = getRequestTitle(item.description, item.serviceType, item.serviceLabel)
                    const go = () => { startNavProgress(); router.push(`/procurar-servico?pedido=${item.requestId}`) }
                    // Mesmo desenho do card de "Quem procura serviço": com foto, a foto inteira em cima e o título embaixo;
                    // sem foto, o cartão é o próprio texto do pedido. Embaixo, a situação da inscrição.
                    return (
                        <div
                            key={item.applicationId}
                            onClick={go}
                            // Escolhido e ainda por fazer: mesma borda verde pulsante do card em "Seus pedidos em aberto"
                            className={`snap-start flex-shrink-0 w-60 rounded-3xl overflow-hidden flex flex-col cursor-pointer ${pulsing ? 'hired-pulse-border' : ''}`}
                            style={{
                                background: colors.surface,
                                ...(pulsing ? {} : {
                                    border: `1px solid ${item.status === 'accepted' ? '#22c55e' : colors.border}`,
                                    boxShadow: colors.shadow,
                                }),
                                opacity: item.status === 'rejected' ? 0.7 : 1,
                            }}
                        >
                            {photo && (
                                <div className="relative h-36 w-full overflow-hidden flex-shrink-0" style={{ background: '#0b1220' }}>
                                    <img src={photo} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover scale-125 blur-xl opacity-60" loading="lazy" />
                                    <img src={photo} alt={title} className="relative w-full h-full object-contain" loading="lazy" />
                                </div>
                            )}

                            <div className={`flex flex-col gap-2 flex-1 ${photo ? 'p-3.5' : 'p-4'}`} style={photo ? undefined : { background: `${colors.accent}10` }}>
                                <div className="flex items-center justify-between gap-2">
                                    <span className="self-start flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${colors.accent}18`, color: colors.accent }}>
                                        <Icon size={11} />
                                        {item.serviceLabel}
                                    </span>
                                    <span className="text-[10px] flex-shrink-0 whitespace-nowrap" style={{ color: colors.textSecondary }}>inscrito {appliedAgo(item.appliedAt)}</span>
                                </div>

                                {/* O que a pessoa pediu é o foco: sem foto fica bem maior */}
                                <p
                                    className={`${photo ? 'text-sm' : 'text-[17px]'} font-black leading-snug flex-1`}
                                    title={title}
                                    style={{ color: colors.textPrimary, display: '-webkit-box', WebkitLineClamp: photo ? 2 : 6, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                                >
                                    {title}
                                </p>

                                <div className="flex items-center justify-between gap-2 text-[11px]" style={{ color: colors.textSecondary }}>
                                    <span className="flex items-center gap-1 min-w-0">
                                        <MapPin size={11} className="flex-shrink-0" />
                                        <span className="truncate">{shortAddress(item.locationAddress)}</span>
                                    </span>
                                </div>

                                <div className="flex items-center gap-1.5 text-[11px] min-w-0" style={{ color: colors.textSecondary }}>
                                    <span className="flex items-center gap-1.5 min-w-0">
                                        <PlanAvatarRing userId={item.requesterId}>
                                            {item.requesterAvatarUrl ? (
                                                <img src={item.requesterAvatarUrl} className="w-4 h-4 rounded-full object-cover flex-shrink-0" alt="" />
                                            ) : (
                                                <span className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 text-[8px] font-black" style={{ background: HOME_GRADIENT, color: '#fff' }}>
                                                    {who.replace('@', '').charAt(0).toUpperCase()}
                                                </span>
                                            )}
                                        </PlanAvatarRing>
                                        <span className="truncate font-bold">{who}</span>
                                    </span>
                                </div>

                            {item.status === 'accepted' ? (
                                <div className="mt-auto flex flex-col gap-1">
                                    <div className="w-full flex items-center justify-center gap-2 py-3 rounded-full font-black text-sm" style={{ background: '#22c55e18', color: '#16a34a', border: '1px solid #22c55e55' }}>
                                        <CheckCircle2 size={16} />
                                        {item.completedAt ? 'Serviço feito' : 'Você foi escolhido!'}
                                    </div>
                                    {item.requesterId && (
                                        <ServiceExchangePanel
                                            applicationId={item.applicationId}
                                            role="provider"
                                            counterpartId={item.requesterId}
                                            counterpartSlug={item.requesterSlug}
                                            serviceTitle={item.description?.slice(0, 60) || item.serviceLabel}
                                            onChanged={reload}
                                        />
                                    )}
                                </div>
                            ) : item.status === 'rejected' ? (
                                <div className="mt-auto w-full flex items-center justify-center gap-2 py-3 rounded-full font-black text-sm" style={{ background: `${colors.border}30`, color: colors.textSecondary }}>
                                    <HeartCrack size={16} />
                                    Não foi dessa vez
                                </div>
                            ) : (
                                <div className="mt-auto w-full flex items-center justify-center gap-2 py-3 rounded-full font-black text-xs text-center leading-tight" style={{ background: `${colors.accent}15`, color: colors.accent, border: `1px solid ${colors.accent}40` }}>
                                    <Clock size={15} className="flex-shrink-0" />
                                    Aguardando resposta
                                </div>
                            )}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
