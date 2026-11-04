// src/components/ServiceRequestViewDialog.tsx
//
// "Ver o pedido": o card de um pedido de serviço aberto em tamanho grande — foto inteira (com as outras em miniatura),
// quem pediu, onde, descrição e o botão de se candidatar. Abrir já conta como visita no pedido (o banco ignora o dono
// e a mesma pessoa repetida em 30 min). Usado na home ("Quem procura serviço") e em /procurar-servico.
'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { X, MapPin, Eye, Briefcase, Check, ZoomIn, ChevronLeft, ChevronRight } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import ServiceRequestShareButton from '@/components/ServiceRequestShareButton'
import PlanAvatarRing from '@/components/PlanAvatarRing'
import { getRequestTitle } from '@/lib/serviceTypes'
import { askedAgo, getItemIcon, getItemLabel, shortAddress, type BoardItem } from '@/lib/serviceBoard'
import { trackServiceRequestView } from '@/lib/trackServiceRequestView'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

// Em vitrine pública, só rua/bairro — o número fica pra quem for atender.
function publicPlace(address: string): string {
    return shortAddress(address).replace(/[,\s]+\d+\s*\w*$/, '')
}

/** Foto ampliada: toque na foto para dar zoom (e arraste para ver o resto), toque de novo para voltar; setas trocam de foto; fundo, X ou Esc fecham. */
function PhotoZoom({ photos, index, onIndex, onClose, alt }: { photos: string[]; index: number; onIndex: (i: number) => void; onClose: () => void; alt: string }) {
    const [zoomed, setZoomed] = useState(false)
    useEffect(() => { setZoomed(false) }, [index])
    return createPortal(
        <div className="fixed inset-0 z-[200] flex flex-col" style={{ background: 'rgba(0,0,0,0.92)' }} role="dialog" aria-label="Foto ampliada">
            <div className="flex items-center justify-between px-4 pt-3 pb-2 text-white flex-shrink-0">
                <span className="text-xs font-bold opacity-80">{photos.length > 1 ? `${index + 1} de ${photos.length}` : ''}</span>
                <button onClick={onClose} aria-label="Fechar foto" className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.18)' }}><X size={20} /></button>
            </div>
            <div className="relative flex-1 min-h-0 overflow-auto flex" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
                <img
                    src={photos[index]}
                    alt={alt}
                    onClick={() => setZoomed((z) => !z)}
                    className="m-auto select-none"
                    style={zoomed ? { width: '260%', maxWidth: 'none', height: 'auto', cursor: 'zoom-out' } : { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', cursor: 'zoom-in' }}
                    draggable={false}
                />
            </div>
            <p className="text-center text-[11px] text-white/70 py-2 flex-shrink-0">{zoomed ? 'Arraste para ver · toque para voltar' : 'Toque na foto para dar zoom'}</p>
            {photos.length > 1 && (
                <>
                    <button onClick={() => onIndex((index - 1 + photos.length) % photos.length)} aria-label="Foto anterior" className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center text-white" style={{ background: 'rgba(255,255,255,0.18)' }}><ChevronLeft size={22} /></button>
                    <button onClick={() => onIndex((index + 1) % photos.length)} aria-label="Próxima foto" className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center text-white" style={{ background: 'rgba(255,255,255,0.18)' }}><ChevronRight size={22} /></button>
                </>
            )}
        </div>,
        document.body,
    )
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
    const [zoomIdx, setZoomIdx] = useState<number | null>(null)
    const zoomRef = useRef<number | null>(null)
    zoomRef.current = zoomIdx

    useEffect(() => {
        setMounted(true)
        // Abrir o pedido já conta como visita
        if (!isMine) trackServiceRequestView(item.id)
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (zoomRef.current !== null) setZoomIdx(null); else onClose() } }
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
    const fullText = (item.description || '').trim()
    const hasText = fullText.length > 0
    // letra do texto: quanto menos texto, maior (como num status de texto)
    const textSize = fullText.length <= 50 ? 'text-3xl' : fullText.length <= 120 ? 'text-2xl' : fullText.length <= 260 ? 'text-xl' : 'text-base'
    const photos = item.photo_urls || []
    const photo = photos[photoIdx] || null
    const who = item.requester?.profileSlug ? `@${item.requester.profileSlug}` : item.requester?.name || 'Alguém'
    const place = isMine ? shortAddress(item.location_address) : publicPlace(item.location_address)
    const views = item.view_count || 0

    return createPortal(
        <>
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
                {/* Fechar: fica no topo mesmo rolando */}
                <div className="sticky top-0 z-10 h-0 flex justify-end pr-3 pt-3">
                    <button onClick={onClose} aria-label="Fechar" className="w-10 h-10 rounded-full flex items-center justify-center text-white" style={{ background: 'rgba(0,0,0,0.55)' }}>
                        <X size={20} />
                    </button>
                </div>

                {/* Como o status do WhatsApp: com TEXTO, o texto toma o espaço (inteiro, sem cortar, letra maior quanto menor o texto); sem texto, a FOTO é o topo.
                    Sem texto e sem foto, o tipo do serviço faz o papel de título. Nada de bloco colorido com ícone. */}
                {hasText ? (
                    <div className="pl-5 pr-14 pt-4 pb-3">
                        <p className={`${textSize} ${fullText.length <= 120 ? 'font-black' : 'font-bold'} leading-tight whitespace-pre-wrap break-words`} style={{ color: colors.textPrimary }}>{fullText}</p>
                    </div>
                ) : photo ? (
                    <div className="relative w-full overflow-hidden" style={{ background: '#0b0b0f' }}>
                        <img src={photo} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover scale-125 blur-2xl opacity-60" />
                        <button type="button" onClick={() => setZoomIdx(photoIdx)} aria-label="Ampliar a foto" className="relative block w-full">
                            <img src={photo} alt={title} className="w-full h-auto max-h-[60dvh] object-contain" />
                            <span className="absolute left-3 bottom-3 w-9 h-9 rounded-full flex items-center justify-center text-white" style={{ background: 'rgba(0,0,0,0.55)' }}><ZoomIn size={18} /></span>
                        </button>
                    </div>
                ) : (
                    <div className="pl-5 pr-14 pt-4 pb-3">
                        <p className="text-3xl font-black leading-tight break-words" style={{ color: colors.textPrimary }}>{label}</p>
                    </div>
                )}

                {/* Fotos: com texto, vêm logo depois dele; sem texto, a primeira já é o topo e as miniaturas escolhem qual ver */}
                {hasText && photos.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto px-5 pb-3" style={{ scrollbarWidth: 'none' }}>
                        {photos.map((p, i) => (
                            <button key={p + i} type="button" onClick={() => setZoomIdx(i)} aria-label={`Ampliar a foto ${i + 1}`} className="relative flex-shrink-0 w-24 h-24 rounded-2xl overflow-hidden active:scale-95 transition" style={{ border: `1px solid ${colors.border}` }}>
                                <img src={p} alt={`Foto ${i + 1} de ${title}`} className="w-full h-full object-cover" />
                                <span className="absolute right-1.5 bottom-1.5 w-6 h-6 rounded-full flex items-center justify-center text-white" style={{ background: 'rgba(0,0,0,0.55)' }}><ZoomIn size={13} /></span>
                            </button>
                        ))}
                    </div>
                )}
                {!hasText && photos.length > 1 && (
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

                <div className="p-4 pt-1 flex flex-col gap-3">
                    {/* Quem pediu: avatar + @ + "pediu há…" e, à direita, as visitas num selo */}
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => { if (item.requester?.profileSlug) router.push(`/${item.requester.profileSlug}`) }}
                            className="flex items-center gap-3 text-left min-w-0 flex-1"
                        >
                            <PlanAvatarRing userId={item.requester_id} linkToProfile={false}>
                                {item.requester?.avatarUrl ? (
                                    <img src={item.requester.avatarUrl} alt="" className="w-11 h-11 rounded-full object-cover" />
                                ) : (
                                    <span className="w-11 h-11 rounded-full flex items-center justify-center text-white text-base font-black" style={{ background: GRADIENT }}>
                                        {who.replace('@', '').charAt(0).toUpperCase()}
                                    </span>
                                )}
                            </PlanAvatarRing>
                            <span className="min-w-0">
                                <span className="block text-[15px] font-black leading-tight truncate" style={{ color: colors.textPrimary }}>{isMine ? 'Você' : who}</span>
                                <span className="block text-xs mt-0.5" style={{ color: colors.textSecondary }}>{askedAgo(item.created_at)}</span>
                            </span>
                        </button>
                        <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full flex-shrink-0" style={{ background: `${colors.border}30`, color: colors.textSecondary }} title="Quantas pessoas abriram este pedido">
                            <Eye size={14} />{views} {views === 1 ? 'visita' : 'visitas'}
                        </span>
                    </div>

                    {/* Etiquetas: o tipo do serviço e o lugar, lado a lado */}
                    <div className="flex flex-wrap gap-2">
                        {(hasText || photo) && (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black" style={{ background: `${colors.accent}18`, color: colors.accent }}><Icon size={13} /> {label}</span>
                        )}
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold max-w-full" style={{ background: `${colors.border}30`, color: colors.textPrimary }}><MapPin size={13} className="flex-shrink-0" /><span className="truncate">{place}</span></span>
                    </div>

                    <ServiceRequestShareButton item={item} size={44} label="Compartilhar" className="w-full" />

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
                            <Briefcase size={16} /> Quero me inscrever
                        </button>
                    ) : null}
                </div>
            </div>
        </div>
        {zoomIdx !== null && <PhotoZoom photos={photos} index={zoomIdx} onIndex={setZoomIdx} onClose={() => setZoomIdx(null)} alt={title} />}
        </>,
        document.body
    )
}
