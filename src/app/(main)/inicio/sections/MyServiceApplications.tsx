// src/app/(main)/inicio/sections/MyServiceApplications.tsx
//
// "Quais serviços me inscrevi": os pedidos de serviço dos outros em que a
// pessoa se inscreveu como profissional, com a situação de cada inscrição.
'use client'

import { useRouter } from 'next/navigation'
import { MapPin, CheckCircle2, Clock, HeartCrack } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { useNavProgressStore } from '@/store/useNavProgressStore'
import { getServiceIcon } from '@/lib/serviceTypes'
import { MyApplication } from '@/hooks/useMyServiceApplications'
import { HOME_GRADIENT, HomeSectionHeader } from './HomeSectionKit'
import PlanAvatarRing from '@/components/PlanAvatarRing'

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

            <div className="flex gap-3 overflow-x-auto pb-1">
                {items.map((item) => {
                    const Icon = getServiceIcon(item.serviceType)
                    const who = item.requesterName?.split(' ')[0] || 'Alguém'
                    const go = () => { startNavProgress(); router.push(`/procurar-servico?pedido=${item.requestId}`) }
                    // Mesmo desenho do card de "Quem procura serviço": quem pediu e há quanto tempo,
                    // foto + o que procura + onde, descrição e, embaixo, a situação da inscrição.
                    return (
                        <div
                            key={item.applicationId}
                            onClick={go}
                            className="flex-shrink-0 w-64 rounded-2xl p-3.5 flex flex-col gap-2 cursor-pointer"
                            style={{
                                background: colors.surface,
                                border: `1px solid ${item.status === 'accepted' ? '#22c55e' : colors.border}`,
                                boxShadow: colors.shadow,
                                opacity: item.status === 'rejected' ? 0.7 : 1,
                            }}
                        >
                            <div className="flex items-center gap-2">
                                <PlanAvatarRing userId={item.requesterId}>
                                    {item.requesterAvatarUrl ? (
                                        <img src={item.requesterAvatarUrl} className="w-7 h-7 rounded-full object-cover flex-shrink-0" alt="" />
                                    ) : (
                                        <span className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-black" style={{ background: HOME_GRADIENT, color: '#fff' }}>
                                            {who.charAt(0).toUpperCase()}
                                        </span>
                                    )}
                                </PlanAvatarRing>
                                <div className="min-w-0 flex-1">
                                    <p className="text-xs font-bold truncate" style={{ color: colors.textPrimary }}>{who}</p>
                                    <p className="text-[10px] whitespace-nowrap" style={{ color: colors.textSecondary }}>inscrito {appliedAgo(item.appliedAt)}</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <span
                                    className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 overflow-hidden"
                                    style={{ background: item.photoUrl ? colors.border : HOME_GRADIENT, color: '#fff' }}
                                >
                                    {item.photoUrl ? (
                                        <img src={item.photoUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                                    ) : (
                                        <Icon size={22} />
                                    )}
                                </span>
                                <div className="min-w-0">
                                    <p className="text-sm font-black truncate" style={{ color: colors.textPrimary }}>Procura {item.serviceLabel.toLowerCase()}</p>
                                    <p className="text-[11px] flex items-center gap-1 truncate" style={{ color: colors.textSecondary }}>
                                        <MapPin size={10} className="flex-shrink-0" />
                                        {shortAddress(item.locationAddress)}
                                    </p>
                                </div>
                            </div>

                            {item.description && (
                                <p className="text-xs line-clamp-2" style={{ color: colors.textSecondary }}>{item.description}</p>
                            )}

                            {item.status === 'accepted' ? (
                                <div className="mt-auto w-full flex items-center justify-center gap-2 py-3 rounded-full font-black text-sm" style={{ background: '#22c55e18', color: '#16a34a', border: '1px solid #22c55e55' }}>
                                    <CheckCircle2 size={16} />
                                    Você foi escolhido!
                                </div>
                            ) : item.status === 'rejected' ? (
                                <div className="mt-auto w-full flex items-center justify-center gap-2 py-3 rounded-full font-black text-sm" style={{ background: `${colors.border}30`, color: colors.textSecondary }}>
                                    <HeartCrack size={16} />
                                    Não foi dessa vez
                                </div>
                            ) : (
                                <div className="mt-auto w-full flex items-center justify-center gap-2 py-3 rounded-full font-black text-xs text-center leading-tight" style={{ background: `${colors.accent}15`, color: colors.accent, border: `1px solid ${colors.accent}40` }}>
                                    <Clock size={15} className="flex-shrink-0" />
                                    Inscrição enviada. Esperando a resposta.
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
