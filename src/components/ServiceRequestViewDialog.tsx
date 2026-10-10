// src/components/ServiceRequestViewDialog.tsx
//
// "Ver o pedido": o card de um pedido de serviço aberto em tamanho grande — foto inteira (com as outras em miniatura),
// quem pediu, onde, descrição e o botão de se candidatar. Abrir já conta como visita no pedido (o banco ignora o dono
// e a mesma pessoa repetida em 30 min). Usado na home ("Quem procura serviço") e em /procurar-servico.
'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { X, MapPin, Eye, Briefcase, Check } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import PlanAvatarRing from '@/components/PlanAvatarRing'
import { getRequestTitle } from '@/lib/serviceTypes'
import { askedAgo, getItemIcon, getItemLabel, shortAddress, type BoardItem } from '@/lib/serviceBoard'
import { trackServiceRequestView } from '@/lib/trackServiceRequestView'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

// Em vitrine pública, só rua/bairro — o número fica pra quem for atender.
function publicPlace(address: string): string {
    return shortAddress(address).replace(/[,\s]+\d+\s*\w*$/, '')
}

interface Props {
    item: BoardItem
    isMine: boolean
    applied: boolean
    onApply?: () => void
    onClose: () => void
}

export default function ServiceRequestViewDialog({ item, isMine, applied, onApply, onClose }: Props) {
    const { colors } = useTheme()
    const router = useRouter()
    const [mounted, setMounted] = useState(false)
    const [photoIdx, setPhotoIdx] = useState(0)

    useEffect(() => {
        setMounted(true)
        // Abrir o pedido já conta como visita
        if (!isMine) trackServiceRequestView(item.id)
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        const prev = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [item.id])

    if (!mounted) return null

    const Icon = getItemIcon(item)
    const label = getItemLabel(item)
    const title = getRequestTitle(item.description, item.service_type, item.custom_service)
    const photos = item.photo_urls || []
    const photo = photos[photoIdx] || null
    const who = item.requester?.profileSlug ? `@${item.requester.profileSlug}` : item.requester?.name || 'Alguém'
    const place = isMine ? shortAddress(item.location_address) : publicPlace(item.location_address)
    const views = item.view_count || 0

    return createPortal(
        <div
            className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.6)' }}
            onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
            role="dialog"
            aria-label="Detalhes do pedido"
        >
            <div
                className="relative w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl"
                style={{ background: colors.surface, border: `1px solid ${colors.border}`, boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}
            >
                {/* Foto grande, inteira */}
                <div className="relative w-full" style={{ background: GRADIENT }}>
                    {photo ? (
                        <>
                            <img src={photo} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover scale-125 blur-2xl opacity-70" />
                            <img src={photo} alt={title} className="relative w-full h-auto max-h-[52dvh] object-contain" />
                        </>
                    ) : (
                        <div className="w-full h-48 flex items-center justify-center"><Icon size={64} color="rgba(255,255,255,0.9)" /></div>
                    )}
                    <button
                        onClick={onClose}
                        aria-label="Fechar"
                        className="absolute top-3 right-3 w-10 h-10 rounded-full flex items-center justify-center text-white"
                        style={{ background: 'rgba(0,0,0,0.55)' }}
                    >
                        <X size={20} />
                    </button>
                    <span className="absolute left-3 top-3 flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wide text-white" style={{ background: GRADIENT }}>
                        <Icon size={12} />
                        {label}
                    </span>
                </div>

                {photos.length > 1 && (
                    <div className="flex gap-2 overflow-x-auto px-4 pt-3">
                        {photos.map((p, i) => (
                            <button
                                key={p + i}
                                onClick={() => setPhotoIdx(i)}
                                aria-label={`Foto ${i + 1}`}
                                className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0"
                                style={{ border: `2px solid ${i === photoIdx ? '#f97316' : 'transparent'}`, opacity: i === photoIdx ? 1 : 0.7 }}
                            >
                                <img src={p} alt="" className="w-full h-full object-cover" />
                            </button>
                        ))}
                    </div>
                )}

                <div className="p-4 flex flex-col gap-3">
                    <h2 className="text-xl font-black leading-tight" style={{ color: colors.textPrimary }}>{title}</h2>

                    {/* Quem pediu */}
                    <button
                        onClick={() => { if (item.requester?.profileSlug) router.push(`/${item.requester.profileSlug}`) }}
                        className="flex items-center gap-2.5 text-left"
                    >
                        <PlanAvatarRing userId={item.requester_id} linkToProfile={false}>
                            {item.requester?.avatarUrl ? (
                                <img src={item.requester.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover" />
                            ) : (
                                <span className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-black" style={{ background: GRADIENT }}>
                                    {who.replace('@', '').charAt(0).toUpperCase()}
                                </span>
                            )}
                        </PlanAvatarRing>
                        <span className="min-w-0">
                            <span className="block text-sm font-black truncate" style={{ color: colors.textPrimary }}>{isMine ? 'Você' : who}</span>
                            <span className="block text-[11px]" style={{ color: colors.textSecondary }}>{askedAgo(item.created_at)}</span>
                        </span>
                    </button>

                    <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: colors.textSecondary }}>
                        <span className="flex items-center gap-1"><MapPin size={13} />{place}</span>
                        <span className="flex items-center gap-1"><Eye size={13} />{views} {views === 1 ? 'visita' : 'visitas'}</span>
                    </div>

                    {item.description && (
                        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words" style={{ color: colors.textPrimary }}>{item.description}</p>
                    )}

                    {isMine ? (
                        <p className="text-sm font-bold text-center py-2" style={{ color: colors.textSecondary }}>Este pedido é seu</p>
                    ) : applied ? (
                        <div className="w-full py-3.5 rounded-full text-sm font-black flex items-center justify-center gap-2" style={{ background: '#16a34a1a', color: '#16a34a' }}>
                            <Check size={16} /> Você já se inscreveu
                        </div>
                    ) : onApply ? (
                        <button
                            onClick={onApply}
                            className="w-full py-3.5 rounded-full text-sm font-black flex items-center justify-center gap-2 text-white transition hover:scale-[1.01] active:scale-95"
                            style={{ background: GRADIENT, boxShadow: '0 6px 16px #f9731655' }}
                        >
                            <Briefcase size={16} /> Quero fazer esse serviço
                        </button>
                    ) : null}
                </div>
            </div>
        </div>,
        document.body
    )
}
