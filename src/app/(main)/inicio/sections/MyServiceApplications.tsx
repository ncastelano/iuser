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
import { HOME_GRADIENT } from './HomeSectionKit'
import { HomeSubheading } from './HomeSubheading'

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
            <HomeSubheading
                title="Quais serviços me inscrevi"
                subtitle={chosen > 0
                    ? `Você foi escolhido em ${chosen} ${chosen === 1 ? 'serviço' : 'serviços'}!`
                    : `${items.length} ${items.length === 1 ? 'inscrição' : 'inscrições'} — a gente avisa quando responderem`}
            />

            <div className="flex gap-3 overflow-x-auto pb-1">
                {items.map((item) => {
                    const Icon = getServiceIcon(item.serviceType)
                    return (
                        <div
                            key={item.applicationId}
                            onClick={() => { startNavProgress(); router.push(`/procurar-servico?pedido=${item.requestId}`) }}
                            className="flex-shrink-0 w-64 rounded-3xl overflow-hidden flex flex-col cursor-pointer transition-transform hover:scale-[1.02] active:scale-[0.99]"
                            style={{
                                background: colors.surface,
                                border: `1px solid ${item.status === 'accepted' ? '#22c55e' : colors.border}`,
                                boxShadow: colors.shadow,
                                opacity: item.status === 'rejected' ? 0.7 : 1,
                            }}
                        >
                            <div className="relative h-28 w-full" style={{ background: item.photoUrl ? colors.border : HOME_GRADIENT }}>
                                {item.photoUrl ? (
                                    <img src={item.photoUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                        <Icon size={40} color="rgba(255,255,255,0.85)" />
                                    </div>
                                )}
                                <div className="absolute inset-x-0 bottom-0 h-14 pointer-events-none" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.65), transparent)' }} />
                                <span className="absolute left-3 bottom-2.5 text-sm font-black text-white drop-shadow">{item.serviceLabel}</span>
                            </div>

                            <div className="p-3.5 flex flex-col gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                    {item.requesterAvatarUrl ? (
                                        <img src={item.requesterAvatarUrl} className="w-6 h-6 rounded-full object-cover flex-shrink-0" alt="" />
                                    ) : (
                                        <span className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-black text-white" style={{ background: HOME_GRADIENT }}>
                                            {(item.requesterName || '?').charAt(0).toUpperCase()}
                                        </span>
                                    )}
                                    <span className="text-xs font-bold truncate" style={{ color: colors.textPrimary }}>
                                        {item.requesterName ? `${item.requesterName.split(' ')[0]} procura` : 'Alguém procura'}
                                    </span>
                                    <span className="text-[10px] ml-auto whitespace-nowrap" style={{ color: colors.textSecondary }}>
                                        inscrito {appliedAgo(item.appliedAt)}
                                    </span>
                                </div>

                                <p className="text-[11px] flex items-center gap-1 truncate" style={{ color: colors.textSecondary }}>
                                    <MapPin size={10} className="flex-shrink-0" />
                                    {shortAddress(item.locationAddress)}
                                </p>

                                {item.status === 'accepted' ? (
                                    <div className="flex items-center gap-2 rounded-xl px-2.5 py-2" style={{ background: '#22c55e18' }}>
                                        <CheckCircle2 size={15} color="#22c55e" className="flex-shrink-0" />
                                        <span className="text-xs font-bold" style={{ color: '#16a34a' }}>Você foi escolhido!</span>
                                    </div>
                                ) : item.status === 'rejected' ? (
                                    <div className="flex items-center gap-2 rounded-xl px-2.5 py-2" style={{ background: `${colors.border}30` }}>
                                        <HeartCrack size={15} className="flex-shrink-0" style={{ color: colors.textSecondary }} />
                                        <span className="text-xs font-bold" style={{ color: colors.textSecondary }}>Não foi dessa vez</span>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 rounded-xl px-2.5 py-2" style={{ background: `${colors.accent}15` }}>
                                        <Clock size={14} className="flex-shrink-0" style={{ color: colors.accent }} />
                                        <span className="text-xs font-bold leading-tight" style={{ color: colors.accent }}>Inscrição enviada. Esperando a resposta.</span>
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
