// src/app/(main)/inicio/sections/ServiceSeekers.tsx
//
// "Quem procura serviço": os pedidos de serviço abertos de TODO mundo (inclusive
// os da própria pessoa), pra qualquer um ver que tem gente precisando e poder
// pedir o seu também. Candidatar-se continua em /procurar-servico (exige plano
// Prestador); aqui é só a vitrine.
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MapPin, Plus, Eye } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { useNavProgressStore } from '@/store/useNavProgressStore'
import { BoardItem, fetchOpenBoardItems, getItemIcon, getItemLabel, shortAddress } from '@/lib/serviceBoard'
import { HOME_GRADIENT } from './HomeSectionKit'

function whenAsked(iso: string): string {
    const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
    if (minutes < 1) return 'pediu agora'
    if (minutes < 60) return `pediu há ${minutes} min`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `pediu há ${hours}h`
    const days = Math.floor(hours / 24)
    return `pediu há ${days} ${days === 1 ? 'dia' : 'dias'}`
}

// Em vitrine pública, só rua/bairro — o número fica pra quem for atender.
function publicPlace(address: string): string {
    return shortAddress(address).replace(/[,\s]+\d+\s*\w*$/, '')
}

export default function ServiceSeekers({ limit = 8 }: { limit?: number }) {
    const { colors } = useTheme()
    const router = useRouter()
    const startNavProgress = useNavProgressStore((s) => s.start)
    const { userId } = useProfile()
    const [items, setItems] = useState<BoardItem[] | null>(null)

    useEffect(() => {
        let cancelled = false
        fetchOpenBoardItems(limit).then((rows) => { if (!cancelled) setItems(rows) })
        return () => { cancelled = true }
    }, [limit])

    const go = (path: string) => { startNavProgress(); router.push(path) }

    if (items === null) return null

    return (
        <div>
            <h3 className="text-sm font-black mb-0.5" style={{ color: colors.textPrimary }}>Quem procura serviço</h3>
            <p className="text-xs mb-3 opacity-60" style={{ color: colors.textPrimary }}>
                {items.length > 0 ? 'Pessoas precisando de um profissional agora' : 'Ninguém pediu ainda — seja o primeiro'}
            </p>

            <div className="flex gap-3 overflow-x-auto pb-1">
                {items.map((item) => {
                    const Icon = getItemIcon(item)
                    const mine = item.requester_id === userId
                    const who = mine ? 'Você' : item.requester?.name?.split(' ')[0] || (item.requester?.profileSlug ? `@${item.requester.profileSlug}` : 'Alguém')
                    return (
                        <div
                            key={item.id}
                            className="flex-shrink-0 w-64 rounded-2xl p-3.5 flex flex-col gap-2"
                            style={{
                                background: colors.surface,
                                border: `1px solid ${mine ? colors.accent : colors.border}`,
                                boxShadow: colors.shadow,
                            }}
                        >
                            <div className="flex items-center gap-2">
                                {item.requester?.avatarUrl ? (
                                    <img src={item.requester.avatarUrl} className="w-7 h-7 rounded-full object-cover flex-shrink-0" alt="" />
                                ) : (
                                    <span className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-black" style={{ background: HOME_GRADIENT, color: '#fff' }}>
                                        {who.charAt(0).toUpperCase()}
                                    </span>
                                )}
                                <div className="min-w-0 flex-1">
                                    <p className="text-xs font-bold truncate" style={{ color: colors.textPrimary }}>{who}</p>
                                    <p className="text-[10px]" style={{ color: colors.textSecondary }}>{whenAsked(item.created_at)}</p>
                                </div>
                                {mine && (
                                    <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: `${colors.accent}20`, color: colors.accent }}>
                                        seu pedido
                                    </span>
                                )}
                                <span
                                    className="flex items-center gap-1 text-[10px] flex-shrink-0"
                                    style={{ color: colors.textSecondary }}
                                    title={`${item.view_count} ${item.view_count === 1 ? 'pessoa viu' : 'pessoas viram'} este pedido`}
                                >
                                    <Eye size={11} />
                                    {item.view_count}
                                </span>
                            </div>

                            <div className="flex items-center gap-2.5">
                                <span className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: HOME_GRADIENT, color: '#fff' }}>
                                    <Icon size={18} />
                                </span>
                                <div className="min-w-0">
                                    <p className="text-sm font-black truncate" style={{ color: colors.textPrimary }}>Procura {getItemLabel(item).toLowerCase()}</p>
                                    <p className="text-[11px] flex items-center gap-1 truncate" style={{ color: colors.textSecondary }}>
                                        <MapPin size={10} className="flex-shrink-0" />
                                        {publicPlace(item.location_address)}
                                    </p>
                                </div>
                            </div>

                            {item.description && (
                                <p className="text-xs line-clamp-2" style={{ color: colors.textSecondary }}>{item.description}</p>
                            )}

                            {!mine && (
                                <button
                                    onClick={() => go(`/procurar-servico?pedido=${item.id}`)}
                                    className="mt-auto w-full py-2 rounded-full text-[11px] font-black uppercase tracking-wider transition-all active:scale-95"
                                    style={{ background: `${colors.accent}15`, color: colors.accent, border: `1px solid ${colors.border}` }}
                                >
                                    Quero fazer esse serviço
                                </button>
                            )}
                        </div>
                    )
                })}
            </div>

            {/* Fora do carrossel de propósito: com muitos pedidos o botão ficaria
                lá no fim da rolagem e ninguém veria. */}
            <button
                onClick={() => go('/solicitar-servico')}
                className="mt-3 w-full flex items-center justify-center gap-2 py-3 rounded-full font-black text-sm transition-all hover:scale-[1.02] active:scale-95"
                style={{ background: HOME_GRADIENT, color: '#fff', boxShadow: '0 4px 12px #f9731640' }}
            >
                <Plus size={16} />
                Precisa de um serviço? Peça o seu
            </button>
        </div>
    )
}
