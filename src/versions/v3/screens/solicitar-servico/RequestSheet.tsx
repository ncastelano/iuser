// src/versions/v3/screens/solicitar-servico/RequestSheet.tsx
//
// "Não achou? Peça um serviço": o pedido compacto, numa folha por cima do mapa — serviço (com "Outro" pra o que não
// está na lista), local, descrição e fotos, e um botão fixo que diz o que falta. A regra (o que falta, rascunho,
// envio, geocodificação) mora em modules/service-requests.
'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, Briefcase, Building2, Camera, Check, CheckCircle2, ChevronRight, History, LocateFixed, MapPin, Plus, Search, Send, X } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { addRecentServiceLocation, getRecentServiceLocations, type RecentServiceLocation } from '@/lib/recentServiceLocations'
import { createSquareImage } from '@/lib/image'
import { notifyServiceRequestsChanged } from '@/lib/serviceBoard'
import { SERVICE_TYPES, SERVICE_ICON_OPTIONS, getServiceIcon, getServiceLabel, type ServiceType } from '@/lib/serviceTypes'
import { usePopularCustomServices } from '@/hooks/usePopularCustomServices'
import { Spinner } from '@/components/Spinner'
import {
    MAX_PHOTOS, missingFields, splitAddress, shortAddress, searchAddress, saveDraft, loadDraft, clearDraft, submitServiceRequest,
    type AddressHit,
} from '@/modules/service-requests'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

export interface Place { address: string; coords: [number, number] | null }
interface PhotoItem { file: File; preview: string }

export default function RequestSheet({ initialType, initialPlace, locating, onLocate, onClose }: {
    initialType: ServiceType | null
    /** Onde a pessoa está (ou o endereço vindo de um atalho) — vira o local do pedido */
    initialPlace: Place | null
    locating: boolean
    onLocate: () => void
    onClose: () => void
}) {
    const router = useRouter()
    const { colors } = useTheme()
    const soft = `${colors.border}40`

    const [serviceType, setServiceType] = useState<ServiceType | null>(initialType)
    const [customService, setCustomService] = useState('')
    const [customIcon, setCustomIcon] = useState<string | null>(null)
    const [iconsOpen, setIconsOpen] = useState(false)
    const [place, setPlace] = useState<Place>(initialPlace || { address: '', coords: null })
    const [needsAccess, setNeedsAccess] = useState(false)
    const [accessNotes, setAccessNotes] = useState('')
    const [description, setDescription] = useState('')
    const [photos, setPhotos] = useState<PhotoItem[]>([])
    const [submitting, setSubmitting] = useState(false)
    const [sent, setSent] = useState(false)

    const [searchOpen, setSearchOpen] = useState(false)
    const [suggestions, setSuggestions] = useState<AddressHit[]>([])
    const [highlighted, setHighlighted] = useState(-1)
    const [searching, setSearching] = useState(false)
    const [recent, setRecent] = useState<RecentServiceLocation[]>([])
    const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const photoInput = useRef<HTMLInputElement>(null)
    const popularCustom = usePopularCustomServices()

    // O local da pessoa chega depois (a localização demora): só preenche enquanto o campo está vazio
    useEffect(() => {
        if (initialPlace && !place.address) setPlace(initialPlace)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialPlace])

    // Volta do login: restaura o rascunho (as fotos não sobrevivem ao redirect)
    useEffect(() => {
        setRecent(getRecentServiceLocations())
        const draft = loadDraft()
        if (!draft) return
        clearDraft()
        if (draft.serviceType) setServiceType(draft.serviceType)
        if (typeof draft.customService === 'string') setCustomService(draft.customService)
        if (typeof draft.customIcon === 'string') setCustomIcon(draft.customIcon)
        if (draft.location) setPlace(draft.location)
        if (typeof draft.locationNeedsAccess === 'boolean') setNeedsAccess(draft.locationNeedsAccess)
        if (typeof draft.locationAccessNotes === 'string') setAccessNotes(draft.locationAccessNotes)
        if (typeof draft.description === 'string') setDescription(draft.description)
        toast.info('Continuando de onde você parou. Adicione as fotos de novo.')
    }, [])

    useEffect(() => () => { photos.forEach((p) => URL.revokeObjectURL(p.preview)) }, [])  // eslint-disable-line react-hooks/exhaustive-deps

    const onAddressInput = (value: string) => {
        setPlace({ address: value, coords: null })
        if (searchTimer.current) clearTimeout(searchTimer.current)
        if (value.trim().length < 3) { setSuggestions([]); return }
        searchTimer.current = setTimeout(async () => {
            setSearching(true)
            setSuggestions(await searchAddress(value))
            setSearching(false)
        }, 350)
    }
    useEffect(() => { setHighlighted(-1) }, [suggestions])

    const pick = (p: Place) => {
        setPlace(p)
        addRecentServiceLocation(p)
        setRecent(getRecentServiceLocations())
        setSuggestions([])
        setSearchOpen(false)
    }

    const addPhotos = async (files: File[]) => {
        const room = MAX_PHOTOS - photos.length
        if (room <= 0) { toast.error(`Máximo de ${MAX_PHOTOS} fotos`); return }
        if (files.length > room) toast.error(`Só cabem mais ${room} foto${room === 1 ? '' : 's'}`)
        try {
            const squares = await Promise.all(files.slice(0, room).map((f) => createSquareImage(f, 500)))
            setPhotos((prev) => [...prev, ...squares.map((f) => ({ file: f, preview: URL.createObjectURL(f) }))])
        } catch {
            toast.error('Erro ao processar imagem')
        }
    }
    const removePhoto = (i: number) => setPhotos((prev) => {
        if (prev[i]) URL.revokeObjectURL(prev[i].preview)
        return prev.filter((_, idx) => idx !== i)
    })

    const missing = missingFields({ serviceType, customService, address: place.address, description, photoCount: photos.length })
    const ready = missing.length === 0
    const selectedLabel = serviceType ? getServiceLabel(serviceType, customService) : null

    const send = async () => {
        if (!ready || !serviceType) return
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            saveDraft({ serviceType, customService, customIcon, location: place, locationNeedsAccess: needsAccess, locationAccessNotes: accessNotes, description })
            router.push(`/login?redirect=${encodeURIComponent('/solicitar-servico')}`)
            return
        }
        setSubmitting(true)
        try {
            await submitServiceRequest(supabase, user.id, {
                serviceType, customService, customIcon, address: place.address, needsAccess, accessNotes, description, photos: photos.map((p) => p.file),
            })
            notifyServiceRequestsChanged()
            setSent(true)
        } catch (err: any) {
            toast.error('Erro ao enviar pedido: ' + (err?.message || 'tente novamente'))
        } finally {
            setSubmitting(false)
        }
    }

    const chip = (key: string, label: string, Icon: any, active: boolean, onClick: () => void) => (
        <button
            key={key}
            onClick={onClick}
            className="h-10 pl-2 pr-3.5 rounded-full flex items-center gap-2 text-[13px] font-black whitespace-nowrap transition active:scale-95"
            style={active ? { background: GRADIENT, color: '#fff' } : { background: soft, color: colors.textPrimary }}
        >
            <span className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={active ? { background: 'rgba(255,255,255,0.25)' } : { background: GRADIENT, color: '#fff' }}>
                <Icon size={13} />
            </span>
            <span className="first-letter:uppercase">{label}</span>
        </button>
    )

    const Num = ({ n, done }: { n: number; done: boolean }) => (
        <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black text-white flex-shrink-0" style={{ background: done ? '#16a34a' : GRADIENT }}>
            {done ? <Check size={11} strokeWidth={3.5} /> : n}
        </span>
    )

    const frame = 'fixed inset-x-0 bottom-0 z-30 flex flex-col'
    const frameStyle = { top: 'var(--shell-top, 0px)', background: colors.background } as const
    const addr = splitAddress(place.address)

    // ===== enviado =====
    if (sent) {
        return (
            <div className={`${frame} items-center justify-center px-6 text-center gap-3`} style={frameStyle}>
                <span className="w-20 h-20 rounded-full flex items-center justify-center text-white" style={{ background: GRADIENT }}><CheckCircle2 size={40} /></span>
                <h1 className="text-2xl font-black" style={{ color: colors.textPrimary }}>Pedido enviado!</h1>
                <p className="text-sm max-w-xs" style={{ color: colors.textSecondary }}>
                    Assim que um profissional se candidatar, você recebe uma notificação e escolhe com quem fechar.
                </p>
                <div className="w-full max-w-xs flex flex-col gap-2 mt-3">
                    <button onClick={() => router.push('/meus-servicos')} className="h-12 rounded-full font-black text-sm text-white flex items-center justify-center gap-2" style={{ background: GRADIENT }}>
                        Acompanhar meus pedidos <ChevronRight size={18} />
                    </button>
                    <button onClick={onClose} className="h-12 rounded-full font-black text-sm" style={{ background: soft, color: colors.textPrimary }}>
                        Voltar ao mapa
                    </button>
                </div>
            </div>
        )
    }

    // ===== busca de endereço =====
    if (searchOpen) {
        return (
            <div className={frame} style={{ ...frameStyle, zIndex: 35 }}>
                <div className="flex items-center gap-2 px-4 pt-4 pb-2">
                    <button onClick={() => { setSearchOpen(false); setSuggestions([]) }} aria-label="Fechar" className="flex-shrink-0 rounded-full flex items-center justify-center" style={{ width: 46, height: 46, background: soft, color: colors.textPrimary }}>
                        <ArrowLeft size={20} />
                    </button>
                    <div className="flex-1 min-w-0 flex items-center gap-2 px-4 rounded-full" style={{ height: 46, background: soft }}>
                        <Search size={17} className="flex-shrink-0" style={{ color: colors.textSecondary }} />
                        <input
                            autoFocus
                            value={place.address}
                            onChange={(e) => onAddressInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (!suggestions.length) return
                                if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted((i) => (i < suggestions.length - 1 ? i + 1 : 0)) }
                                else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlighted((i) => (i > 0 ? i - 1 : suggestions.length - 1)) }
                                else if (e.key === 'Enter' && highlighted >= 0) { e.preventDefault(); pick({ address: suggestions[highlighted].place_name, coords: suggestions[highlighted].center }) }
                            }}
                            placeholder="Onde é o serviço?"
                            className="flex-1 min-w-0 bg-transparent text-sm focus:outline-none"
                            style={{ color: colors.textPrimary }}
                        />
                        {place.address && <button onClick={() => onAddressInput('')} aria-label="Limpar" style={{ color: colors.textSecondary }}><X size={16} /></button>}
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto px-4 pb-6">
                    <button onClick={() => { onLocate(); setSearchOpen(false); setSuggestions([]) }} className="w-full flex items-center gap-3 py-3 text-left">
                        <span className="w-9 h-9 rounded-full flex items-center justify-center text-white flex-shrink-0" style={{ background: GRADIENT }}><LocateFixed size={17} /></span>
                        <span className="text-sm font-black" style={{ color: colors.textPrimary }}>Usar minha localização atual</span>
                    </button>
                    {searching && <div className="flex justify-center py-5"><Spinner size={20} color={colors.textSecondary} /></div>}
                    {suggestions.map((s, i) => (
                        <button key={`${s.place_name}-${i}`} onClick={() => pick({ address: s.place_name, coords: s.center })} className="w-full flex items-start gap-3 py-3 text-left rounded-xl" style={{ background: i === highlighted ? `${colors.accent}15` : undefined }}>
                            <MapPin size={17} className="mt-0.5 flex-shrink-0" style={{ color: colors.textSecondary }} />
                            <span className="text-sm font-semibold" style={{ color: colors.textPrimary }}>{s.place_name}</span>
                        </button>
                    ))}
                    {suggestions.length === 0 && !searching && recent.length > 0 && (
                        <>
                            <p className="text-[11px] font-black uppercase tracking-wider mt-3 mb-1" style={{ color: colors.textSecondary }}>Usados antes</p>
                            {recent.map((r) => (
                                <button key={r.address} onClick={() => pick({ address: r.address, coords: r.coords })} className="w-full flex items-center gap-3 py-3 text-left">
                                    <History size={16} className="flex-shrink-0" style={{ color: '#ef4444' }} />
                                    <span className="min-w-0">
                                        <span className="block text-sm font-black truncate" style={{ color: colors.textPrimary }}>{shortAddress(r.address, 40)}</span>
                                        <span className="block text-[11px] truncate" style={{ color: colors.textSecondary }}>{splitAddress(r.address).area}</span>
                                    </span>
                                </button>
                            ))}
                        </>
                    )}
                </div>
            </div>
        )
    }

    // ===== o pedido =====
    return (
        <div className={frame} style={frameStyle}>
            <div className="flex items-center gap-3 px-4 pt-4 pb-3">
                <button onClick={onClose} aria-label="Voltar ao mapa" className="flex-shrink-0 rounded-full flex items-center justify-center transition active:scale-95" style={{ width: 46, height: 46, background: soft, color: colors.textPrimary }}>
                    <ArrowLeft size={20} />
                </button>
                <div className="min-w-0">
                    <h1 className="text-xl font-black leading-tight" style={{ color: colors.textPrimary }}>Pedir um serviço</h1>
                    <p className="text-xs" style={{ color: colors.textSecondary }}>Os profissionais da região recebem e mandam propostas</p>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-28">
                <div className="max-w-lg mx-auto">
                    {/* 1 · Serviço */}
                    <section>
                        <h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider mb-2" style={{ color: colors.textSecondary }}>
                            <Num n={1} done={!missing.includes('serviço')} /> Qual serviço
                        </h2>
                        <div className="grid grid-flow-col grid-rows-2 auto-cols-max gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 pb-1">
                            {SERVICE_TYPES.filter((t) => t.id !== 'outro').map((t) => chip(t.id, t.label, t.icon, serviceType === t.id, () => { setServiceType(t.id); setCustomService('') }))}
                            {popularCustom.map((s) => chip(`c:${s.label}`, s.label, getServiceIcon('outro', s.icon), serviceType === 'outro' && customService === s.label, () => {
                                setServiceType('outro'); setCustomService(s.label); setCustomIcon(s.icon)
                            }))}
                            {chip('outro', 'Outro', Plus, serviceType === 'outro' && !popularCustom.some((s) => s.label === customService), () => {
                                setServiceType('outro'); setCustomService(''); setCustomIcon(null)
                            })}
                        </div>
                        {serviceType === 'outro' && (
                            <div className="mt-2.5">
                                <div className="flex items-center gap-2 rounded-full pl-1.5 pr-4" style={{ height: 46, background: soft }}>
                                    <button onClick={() => setIconsOpen((v) => !v)} aria-label="Escolher ícone" className="w-9 h-9 rounded-full flex items-center justify-center text-white flex-shrink-0" style={{ background: GRADIENT }}>
                                        {(() => { const I = getServiceIcon('outro', customIcon || 'briefcase') || Briefcase; return <I size={17} /> })()}
                                    </button>
                                    <input
                                        autoFocus
                                        value={customService}
                                        onChange={(e) => setCustomService(e.target.value)}
                                        placeholder="Que serviço você procura?"
                                        className="flex-1 min-w-0 bg-transparent text-sm focus:outline-none"
                                        style={{ color: colors.textPrimary }}
                                    />
                                </div>
                                {iconsOpen && (
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                        {SERVICE_ICON_OPTIONS.map((o) => {
                                            const I = o.icon
                                            const active = (customIcon || 'briefcase') === o.key
                                            return (
                                                <button key={o.key} title={o.label} aria-label={o.label} onClick={() => { setCustomIcon(o.key); setIconsOpen(false) }}
                                                    className="w-9 h-9 rounded-xl flex items-center justify-center" style={active ? { background: GRADIENT, color: '#fff' } : { background: soft, color: colors.textSecondary }}>
                                                    <I size={16} />
                                                </button>
                                            )
                                        })}
                                    </div>
                                )}
                                <p className="text-[11px] mt-1.5 px-1" style={{ color: colors.textSecondary }}>Quando mais de 2 pessoas pedirem o mesmo serviço, ele entra na lista pra todo mundo.</p>
                            </div>
                        )}
                    </section>

                    {/* 2 · Onde */}
                    <section className="mt-5">
                        <h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider mb-2" style={{ color: colors.textSecondary }}>
                            <Num n={2} done={!missing.includes('endereço')} /> Onde
                        </h2>
                        <div className="flex items-center gap-2 rounded-3xl p-1.5 pl-4" style={{ background: soft }}>
                            <button onClick={() => setSearchOpen(true)} className="flex-1 min-w-0 flex items-center gap-2.5 text-left py-1.5">
                                <MapPin size={18} className="flex-shrink-0" style={{ color: '#ef4444' }} />
                                <span className="min-w-0">
                                    <span className="block text-sm font-black truncate" style={{ color: place.address ? colors.textPrimary : colors.textSecondary }}>
                                        {locating && !place.address ? 'Localizando...' : place.address ? addr.street : 'Endereço do serviço'}
                                    </span>
                                    {addr.area && <span className="block text-[11px] truncate" style={{ color: colors.textSecondary }}>{addr.area}</span>}
                                </span>
                            </button>
                            <button onClick={onLocate} aria-label="Usar minha localização" className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-white" style={{ background: GRADIENT }}>
                                {locating ? <Spinner size={16} /> : <LocateFixed size={17} />}
                            </button>
                        </div>
                        <div className="mt-2 rounded-2xl px-3 py-2" style={{ background: soft }}>
                            <button onClick={() => { setNeedsAccess((v) => !v); if (needsAccess) setAccessNotes('') }} className="w-full flex items-center gap-2 text-left">
                                <Building2 size={15} className="flex-shrink-0" style={{ color: '#ef4444' }} />
                                <span className="flex-1 text-xs font-black" style={{ color: colors.textPrimary }}>É condomínio fechado?</span>
                                <span className="w-10 h-6 rounded-full p-0.5 transition-colors flex-shrink-0" style={{ background: needsAccess ? '#16a34a' : colors.border }}>
                                    <span className="block w-5 h-5 rounded-full bg-white transition-transform shadow" style={{ transform: needsAccess ? 'translateX(16px)' : 'none' }} />
                                </span>
                            </button>
                            {needsAccess && (
                                <input value={accessNotes} onChange={(e) => setAccessNotes(e.target.value)} autoFocus placeholder="Número da casa, apartamento ou quadra"
                                    className="w-full mt-2 h-10 px-3 rounded-xl text-sm focus:outline-none" style={{ background: colors.surface, color: colors.textPrimary }} />
                            )}
                        </div>
                    </section>

                    {/* 3 · Detalhes */}
                    <section className="mt-5">
                        <h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider mb-2" style={{ color: colors.textSecondary }}>
                            <Num n={3} done={!missing.includes('descrição') && !missing.includes('foto')} /> Detalhes
                            <span className="ml-auto font-bold normal-case tracking-normal">{photos.length}/{MAX_PHOTOS} fotos</span>
                        </h2>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={3}
                            placeholder="Descreva o que você precisa (o que, onde, urgência...)"
                            className="w-full px-4 py-3 rounded-3xl text-sm focus:outline-none resize-none"
                            style={{ background: soft, color: colors.textPrimary }}
                        />
                        <div className="mt-2 flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4">
                            <button onClick={() => photoInput.current?.click()} className="flex-shrink-0 w-16 h-16 rounded-2xl flex flex-col items-center justify-center gap-0.5 transition active:scale-95"
                                style={{ background: soft, color: colors.textSecondary, border: `1.5px dashed ${colors.border}` }}>
                                {photos.length === 0 ? <Camera size={19} /> : <Plus size={19} />}
                                <span className="text-[9px] font-black">{photos.length === 0 ? 'Foto *' : 'Mais'}</span>
                            </button>
                            {photos.map((p, i) => (
                                <div key={p.preview} className="relative flex-shrink-0 w-16 h-16 rounded-2xl overflow-hidden">
                                    <img src={p.preview} alt="" className="w-full h-full object-cover" />
                                    <button onClick={() => removePhoto(i)} aria-label="Remover foto" className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full flex items-center justify-center text-white" style={{ background: 'rgba(0,0,0,0.6)' }}>
                                        <X size={11} />
                                    </button>
                                </div>
                            ))}
                            <input ref={photoInput} type="file" accept="image/*" multiple className="hidden"
                                onChange={(e) => { const f = Array.from(e.target.files || []); if (f.length) addPhotos(f); e.target.value = '' }} />
                        </div>
                    </section>
                </div>
            </div>

            {/* Botão fixo: diz o que falta; pronto, envia */}
            <div className="absolute inset-x-0 bottom-0 px-4 pb-4 pt-6 pointer-events-none" style={{ background: `linear-gradient(to top, ${colors.background} 55%, transparent)` }}>
                <div className="max-w-lg mx-auto pointer-events-auto">
                    <button
                        onClick={send}
                        disabled={!ready || submitting}
                        className="w-full h-14 rounded-full font-black text-sm flex items-center justify-center gap-2 transition active:scale-[0.98]"
                        style={{ background: ready ? GRADIENT : colors.border, color: ready ? '#fff' : colors.textSecondary, boxShadow: ready ? '0 8px 24px #f9731655' : 'none' }}
                    >
                        {submitting ? <Spinner size={18} /> : <Send size={17} />}
                        {ready ? (selectedLabel ? `Pedir ${selectedLabel.toLowerCase()}` : 'Pedir serviço') : `Falta: ${missing.length > 2 ? `${missing.slice(0, 2).join(', ')} e mais ${missing.length - 2}` : missing.join(', ')}`}
                    </button>
                </div>
            </div>
        </div>
    )
}
