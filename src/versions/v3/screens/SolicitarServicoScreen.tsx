// src/versions/v3/screens/SolicitarServicoScreen.tsx
//
// /solicitar-servico na interface 3.0: tudo numa tela só, compacta — serviço, local (mapa + endereço no MESMO cartão)
// e detalhes (descrição + fotos) — com um botão fixo embaixo que diz o que ainda falta. Sem etapas, sem "voltar" em
// cada passo e sem confirmação extra (a tela já mostra tudo o que será enviado). Abaixo, os profissionais que já
// atendem aquele serviço. A regra (o que falta, rascunho, envio, geocodificação) mora em modules/service-requests.
// A 2.0 segue com a página antiga (app/(main)/solicitar-servico).
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { toast } from 'sonner'
import {
    ArrowLeft, Briefcase, Building2, Camera, Check, CheckCircle2, ChevronRight, History, LocateFixed, MapPin, Plus, Search, Send,
    Store as StoreIcon, X,
} from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { getCurrentPosition as getNativeCurrentPosition } from '@/lib/nativeGeolocation'
import { addRecentServiceLocation, getRecentServiceLocations, type RecentServiceLocation } from '@/lib/recentServiceLocations'
import { createSquareImage } from '@/lib/image'
import { notifyServiceRequestsChanged } from '@/lib/serviceBoard'
import { SERVICE_TYPES, SERVICE_ICON_OPTIONS, getServiceIcon, getServiceLabel, type ServiceType } from '@/lib/serviceTypes'
import { usePopularCustomServices } from '@/hooks/usePopularCustomServices'
import { Spinner } from '@/components/Spinner'
import {
    MAX_PHOTOS, missingFields, splitAddress, shortAddress, reverseGeocode, searchAddress, saveDraft, loadDraft, clearDraft,
    submitServiceRequest, loadPublishedServices, type AddressHit, type PublishedService,
} from '@/modules/service-requests'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'
const DEFAULT_CENTER: [number, number] = [-63.9039, -8.7612] // Porto Velho

interface Place { address: string; coords: [number, number] | null }
interface PhotoItem { file: File; preview: string }

export default function SolicitarServicoScreen() {
    const router = useRouter()
    const { colors } = useTheme()

    const [serviceType, setServiceType] = useState<ServiceType | null>(null)
    const [customService, setCustomService] = useState('')
    const [customIcon, setCustomIcon] = useState<string | null>(null)
    const [iconsOpen, setIconsOpen] = useState(false)
    const [location, setLocation] = useState<Place>({ address: '', coords: null })
    const [needsAccess, setNeedsAccess] = useState(false)
    const [accessNotes, setAccessNotes] = useState('')
    const [description, setDescription] = useState('')
    const [photos, setPhotos] = useState<PhotoItem[]>([])
    const [submitting, setSubmitting] = useState(false)
    const [submitted, setSubmitted] = useState(false)

    const [searchOpen, setSearchOpen] = useState(false)
    const [suggestions, setSuggestions] = useState<AddressHit[]>([])
    const [highlighted, setHighlighted] = useState(-1)
    const [searching, setSearching] = useState(false)
    const [locating, setLocating] = useState(false)
    const [recent, setRecent] = useState<RecentServiceLocation[]>([])
    const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const photoInput = useRef<HTMLInputElement>(null)

    const popularCustom = usePopularCustomServices()
    const [published, setPublished] = useState<PublishedService[]>([])

    // ----- mapa (só a prévia do local; toque abre a busca) -----
    const mapBox = useRef<HTMLDivElement | null>(null)
    const mapRef = useRef<mapboxgl.Map | null>(null)
    const markerRef = useRef<mapboxgl.Marker | null>(null)
    const [mapReady, setMapReady] = useState(false)

    useEffect(() => {
        if (!mapBox.current) return
        const map = new mapboxgl.Map({
            container: mapBox.current,
            style: 'mapbox://styles/mapbox/streets-v12',
            center: DEFAULT_CENTER,
            zoom: 12,
            interactive: false,
            attributionControl: false,
        })
        map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right')
        map.on('load', () => setMapReady(true))
        mapRef.current = map
        return () => { map.remove(); mapRef.current = null }
    }, [])

    useEffect(() => {
        const map = mapRef.current
        if (!mapReady || !map) return
        markerRef.current?.remove()
        markerRef.current = null
        if (!location.coords) return
        const el = document.createElement('div')
        el.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 24 24" fill="#f97316" stroke="white" stroke-width="1.6"><path d="M12 22s8-7.58 8-13a8 8 0 1 0-16 0c0 5.42 8 13 8 13z"/><circle cx="12" cy="9" r="2.6" fill="white" stroke="none"/></svg>'
        markerRef.current = new mapboxgl.Marker({ element: el, anchor: 'bottom' }).setLngLat(location.coords).addTo(map)
        map.flyTo({ center: location.coords, zoom: 15, duration: 700 })
    }, [mapReady, location.coords])

    // ----- localização atual -----
    const useMyLocation = useCallback(() => {
        setLocating(true)
        getNativeCurrentPosition(
            async (pos) => {
                const coords: [number, number] = [pos.coords.longitude, pos.coords.latitude]
                const address = await reverseGeocode(coords[0], coords[1])
                setLocation({ address: address || `${coords[1].toFixed(4)}, ${coords[0].toFixed(4)}`, coords })
                setLocating(false)
            },
            () => {
                toast.error('Não conseguimos acessar sua localização', { description: 'Toque no mapa e escreva o endereço do serviço.', duration: 5000 })
                setLocating(false)
            },
            { enableHighAccuracy: true, timeout: 10000 },
        )
    }, [])

    // ----- início: recentes, vitrine, atalho por URL e rascunho -----
    const gotAddressFromUrl = useRef(false)
    useEffect(() => {
        setRecent(getRecentServiceLocations())
        loadPublishedServices(supabase).then(setPublished).catch(() => {})

        const params = new URLSearchParams(window.location.search)
        const tipo = params.get('tipo')
        if (SERVICE_TYPES.some((t) => t.id === tipo)) setServiceType(tipo as ServiceType)
        const local = params.get('local')
        const lat = params.get('lat')
        const lng = params.get('lng')
        if (local) {
            gotAddressFromUrl.current = true
            setLocation({ address: local, coords: lat && lng ? [parseFloat(lng), parseFloat(lat)] : null })
        }

        const draft = loadDraft()
        if (draft) {
            clearDraft()
            if (draft.serviceType) setServiceType(draft.serviceType)
            if (typeof draft.customService === 'string') setCustomService(draft.customService)
            if (typeof draft.customIcon === 'string') setCustomIcon(draft.customIcon)
            if (draft.location) { gotAddressFromUrl.current = true; setLocation(draft.location) }
            if (typeof draft.locationNeedsAccess === 'boolean') setNeedsAccess(draft.locationNeedsAccess)
            if (typeof draft.locationAccessNotes === 'string') setAccessNotes(draft.locationAccessNotes)
            if (typeof draft.description === 'string') setDescription(draft.description)
            toast.info('Continuando de onde você parou. Adicione as fotos de novo.')
        }
    }, [])

    useEffect(() => {
        if (mapReady && !location.address && !gotAddressFromUrl.current) useMyLocation()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mapReady])

    useEffect(() => () => { photos.forEach((p) => URL.revokeObjectURL(p.preview)) }, [])  // eslint-disable-line react-hooks/exhaustive-deps

    // ----- busca de endereço -----
    const onAddressInput = (value: string) => {
        setLocation({ address: value, coords: null })
        if (searchTimer.current) clearTimeout(searchTimer.current)
        if (value.trim().length < 3) { setSuggestions([]); return }
        searchTimer.current = setTimeout(async () => {
            setSearching(true)
            setSuggestions(await searchAddress(value))
            setSearching(false)
        }, 350)
    }
    useEffect(() => { setHighlighted(-1) }, [suggestions])

    const pickPlace = (place: Place) => {
        setLocation(place)
        addRecentServiceLocation(place)
        setRecent(getRecentServiceLocations())
        setSuggestions([])
        setSearchOpen(false)
    }

    // ----- fotos -----
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

    // ----- envio -----
    const missing = missingFields({ serviceType, customService, address: location.address, description, photoCount: photos.length })
    const ready = missing.length === 0

    const send = async () => {
        if (!ready || !serviceType) return
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            saveDraft({ serviceType, customService, customIcon, location, locationNeedsAccess: needsAccess, locationAccessNotes: accessNotes, description })
            router.push(`/login?redirect=${encodeURIComponent('/solicitar-servico')}`)
            return
        }
        setSubmitting(true)
        try {
            await submitServiceRequest(supabase, user.id, {
                serviceType, customService, customIcon, address: location.address, needsAccess, accessNotes, description, photos: photos.map((p) => p.file),
            })
            notifyServiceRequestsChanged()
            setSubmitted(true)
        } catch (err: any) {
            toast.error('Erro ao enviar pedido: ' + (err?.message || 'tente novamente'))
        } finally {
            setSubmitting(false)
        }
    }

    const reset = () => {
        photos.forEach((p) => URL.revokeObjectURL(p.preview))
        setSubmitted(false); setServiceType(null); setCustomService(''); setCustomIcon(null); setIconsOpen(false)
        setNeedsAccess(false); setAccessNotes(''); setDescription(''); setPhotos([])
    }

    // ----- derivados -----
    const selectedLabel = serviceType ? getServiceLabel(serviceType, customService) : null
    const shown = useMemo(() => {
        const list = serviceType && serviceType !== 'outro' ? published.filter((s) => s.serviceType === serviceType) : serviceType ? [] : published
        return list.slice(0, 12)
    }, [published, serviceType])

    const soft = `${colors.border}40`
    const back = () => (window.history.length > 1 ? router.back() : router.push('/'))

    // ===== pedido enviado =====
    if (submitted) {
        return (
            <div className="max-w-md mx-auto pt-10 pb-6 flex flex-col items-center text-center gap-3">
                <span className="w-20 h-20 rounded-full flex items-center justify-center text-white" style={{ background: GRADIENT }}><CheckCircle2 size={40} /></span>
                <h1 className="text-2xl font-black" style={{ color: colors.textPrimary }}>Pedido enviado!</h1>
                <p className="text-sm" style={{ color: colors.textSecondary }}>
                    Assim que um profissional se candidatar, você recebe uma notificação e escolhe com quem fechar.
                </p>
                <button onClick={() => router.push('/meus-servicos')} className="mt-3 w-full h-12 rounded-full font-black text-sm text-white flex items-center justify-center gap-2" style={{ background: GRADIENT }}>
                    Acompanhar meus pedidos <ChevronRight size={18} />
                </button>
                <button onClick={reset} className="w-full h-12 rounded-full font-black text-sm" style={{ background: soft, color: colors.textPrimary }}>
                    Fazer outro pedido
                </button>
            </div>
        )
    }

    // ===== tela =====
    const pill = (active: boolean) => (active
        ? { background: GRADIENT, color: '#fff' }
        : { background: soft, color: colors.textPrimary })

    const chip = (key: string, label: string, Icon: any, active: boolean, onClick: () => void) => (
        <button
            key={key}
            onClick={onClick}
            className="h-10 pl-2 pr-3.5 rounded-full flex items-center gap-2 text-[13px] font-black whitespace-nowrap transition active:scale-95"
            style={pill(active)}
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

    const addr = splitAddress(location.address)
    const serviceDone = !missing.includes('serviço')
    const placeDone = !missing.includes('endereço')
    const detailsDone = !missing.includes('descrição') && !missing.includes('foto')

    return (
        <div className="max-w-lg mx-auto pb-24">
            {/* Cabeçalho: voltar + o que é esta tela */}
            <div className="flex items-center gap-3">
                <button onClick={back} aria-label="Voltar" className="flex-shrink-0 rounded-full flex items-center justify-center transition active:scale-95" style={{ width: 46, height: 46, background: soft, color: colors.textPrimary }}>
                    <ArrowLeft size={20} />
                </button>
                <div className="min-w-0">
                    <h1 className="text-xl font-black leading-tight" style={{ color: colors.textPrimary }}>Precisa de um profissional?</h1>
                    <p className="text-xs" style={{ color: colors.textSecondary }}>Conte o que precisa e receba propostas</p>
                </div>
            </div>

            {/* 1 · Serviço */}
            <section className="mt-5">
                <h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider mb-2" style={{ color: colors.textSecondary }}>
                    <Num n={1} done={serviceDone} /> Qual serviço
                </h2>
                <div className="grid grid-flow-col grid-rows-2 auto-cols-max gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 pb-1">
                    {SERVICE_TYPES.filter((t) => t.id !== 'outro').map((t) => chip(t.id, t.label, t.icon, serviceType === t.id, () => {
                        setServiceType(t.id); setCustomService('')
                    }))}
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
                            <button
                                onClick={() => setIconsOpen((v) => !v)}
                                aria-label="Escolher ícone"
                                className="w-9 h-9 rounded-full flex items-center justify-center text-white flex-shrink-0"
                                style={{ background: GRADIENT }}
                            >
                                {(() => { const I = getServiceIcon('outro', customIcon || 'briefcase') || Briefcase; return <I size={17} /> })()}
                            </button>
                            <input
                                autoFocus
                                value={customService}
                                onChange={(e) => setCustomService(e.target.value)}
                                placeholder="Qual serviço você precisa?"
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

            {/* 2 · Local: mapa + endereço num cartão só */}
            <section className="mt-5">
                <h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider mb-2" style={{ color: colors.textSecondary }}>
                    <Num n={2} done={placeDone} /> Onde
                </h2>
                <div className="rounded-3xl overflow-hidden" style={{ background: soft }}>
                    <div className="relative cursor-pointer" style={{ height: 132 }} onClick={() => setSearchOpen(true)}>
                        <div ref={mapBox} className="w-full h-full" />
                        {!location.coords && (
                            <span className="absolute inset-0 flex items-center justify-center text-xs font-black pointer-events-none" style={{ background: 'rgba(255,255,255,0.35)', color: '#111' }}>
                                {locating ? 'Localizando...' : 'Toque para informar o endereço'}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2 p-1.5 pl-3">
                        <button onClick={() => setSearchOpen(true)} className="flex-1 min-w-0 flex items-center gap-2.5 text-left py-1.5">
                            <MapPin size={18} className="flex-shrink-0" style={{ color: '#ef4444' }} />
                            <span className="min-w-0">
                                <span className="block text-sm font-black truncate" style={{ color: location.address ? colors.textPrimary : colors.textSecondary }}>
                                    {location.address ? addr.street : 'Endereço do serviço'}
                                </span>
                                {addr.area && <span className="block text-[11px] truncate" style={{ color: colors.textSecondary }}>{addr.area}</span>}
                            </span>
                        </button>
                        <button onClick={useMyLocation} aria-label="Usar minha localização" className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-white" style={{ background: GRADIENT }}>
                            {locating ? <Spinner size={16} /> : <LocateFixed size={17} />}
                        </button>
                    </div>
                </div>

                {/* Condomínio fechado: um interruptor, e o campo só aparece se ligar */}
                <div className="mt-2 rounded-2xl px-3 py-2" style={{ background: soft }}>
                    <button onClick={() => { setNeedsAccess((v) => !v); if (needsAccess) setAccessNotes('') }} className="w-full flex items-center gap-2 text-left">
                        <Building2 size={15} className="flex-shrink-0" style={{ color: '#ef4444' }} />
                        <span className="flex-1 text-xs font-black" style={{ color: colors.textPrimary }}>É condomínio fechado?</span>
                        <span className="w-10 h-6 rounded-full p-0.5 transition-colors flex-shrink-0" style={{ background: needsAccess ? '#16a34a' : colors.border }}>
                            <span className="block w-5 h-5 rounded-full bg-white transition-transform shadow" style={{ transform: needsAccess ? 'translateX(16px)' : 'none' }} />
                        </span>
                    </button>
                    {needsAccess && (
                        <input
                            value={accessNotes}
                            onChange={(e) => setAccessNotes(e.target.value)}
                            autoFocus
                            placeholder="Número da casa, apartamento ou quadra"
                            className="w-full mt-2 h-10 px-3 rounded-xl text-sm focus:outline-none"
                            style={{ background: colors.surface, color: colors.textPrimary }}
                        />
                    )}
                </div>
            </section>

            {/* 3 · Detalhes: descrição + fotos */}
            <section className="mt-5">
                <h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider mb-2" style={{ color: colors.textSecondary }}>
                    <Num n={3} done={detailsDone} /> Detalhes
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
                    <button
                        onClick={() => photoInput.current?.click()}
                        className="flex-shrink-0 w-16 h-16 rounded-2xl flex flex-col items-center justify-center gap-0.5 transition active:scale-95"
                        style={{ background: soft, color: colors.textSecondary, border: `1.5px dashed ${colors.border}` }}
                    >
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
                    <input
                        ref={photoInput}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => { const f = Array.from(e.target.files || []); if (f.length) addPhotos(f); e.target.value = '' }}
                    />
                </div>
            </section>

            {/* Quem já atende (some quando não há ninguém) */}
            {shown.length > 0 && (
                <section className="mt-6">
                    <h2 className="text-xs font-black uppercase tracking-wider mb-2" style={{ color: colors.textSecondary }}>
                        {selectedLabel && serviceType !== 'outro' ? `${selectedLabel} na plataforma` : 'Já atendem no iUser'}
                    </h2>
                    <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4">
                        {shown.map((s) => (
                            <button
                                key={s.id}
                                onClick={() => s.targetSlug && router.push(`/${s.targetSlug}`)}
                                className="flex-shrink-0 w-44 rounded-2xl p-2 flex items-center gap-2 text-left transition active:scale-95"
                                style={{ background: soft }}
                            >
                                <span className={`w-11 h-11 overflow-hidden flex-shrink-0 flex items-center justify-center text-white font-black ${s.kind === 'store' ? 'rounded-xl' : 'rounded-full'}`} style={{ background: GRADIENT }}>
                                    {s.imageUrl || s.avatarUrl ? <img src={(s.imageUrl || s.avatarUrl)!} alt="" className="w-full h-full object-cover" /> : s.name.charAt(0)}
                                </span>
                                <span className="min-w-0">
                                    <span className="block text-xs font-black truncate" style={{ color: colors.textPrimary }}>{s.name}</span>
                                    <span className="flex items-center gap-1 text-[10px] truncate" style={{ color: colors.textSecondary }}>
                                        {s.kind === 'store' && <StoreIcon size={10} className="flex-shrink-0" />}
                                        <span className="truncate">{s.ownerName}</span>
                                    </span>
                                </span>
                            </button>
                        ))}
                    </div>
                </section>
            )}

            {/* Botão fixo: diz o que falta; pronto, envia */}
            <div className="fixed inset-x-0 bottom-0 z-30 px-4 pb-4 pt-6 pointer-events-none" style={{ background: `linear-gradient(to top, ${colors.background} 55%, transparent)` }}>
                <div className="max-w-lg mx-auto pointer-events-auto">
                    <button
                        onClick={send}
                        disabled={!ready || submitting}
                        className="w-full h-14 rounded-full font-black text-sm text-white flex items-center justify-center gap-2 transition active:scale-[0.98] disabled:opacity-100"
                        style={{ background: ready ? GRADIENT : colors.border, color: ready ? '#fff' : colors.textSecondary, boxShadow: ready ? '0 8px 24px #f9731655' : 'none' }}
                    >
                        {submitting ? <Spinner size={18} /> : <Send size={17} />}
                        {ready ? (selectedLabel ? `Pedir ${selectedLabel.toLowerCase()}` : 'Pedir profissional') : `Falta: ${missing.join(', ')}`}
                    </button>
                </div>
            </div>

            {/* Busca de endereço: cobre a página (abaixo da barra) */}
            {searchOpen && (
                <div className="fixed inset-x-0 bottom-0 z-30 flex flex-col" style={{ top: 'var(--shell-top, 0px)', background: colors.background }}>
                    <div className="flex items-center gap-2 px-4 pt-4 pb-2">
                        <button onClick={() => { setSearchOpen(false); setSuggestions([]) }} aria-label="Fechar" className="flex-shrink-0 rounded-full flex items-center justify-center" style={{ width: 46, height: 46, background: soft, color: colors.textPrimary }}>
                            <ArrowLeft size={20} />
                        </button>
                        <div className="flex-1 min-w-0 flex items-center gap-2 px-4 rounded-full" style={{ height: 46, background: soft }}>
                            <Search size={17} className="flex-shrink-0" style={{ color: colors.textSecondary }} />
                            <input
                                autoFocus
                                value={location.address}
                                onChange={(e) => onAddressInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (!suggestions.length) return
                                    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted((i) => (i < suggestions.length - 1 ? i + 1 : 0)) }
                                    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlighted((i) => (i > 0 ? i - 1 : suggestions.length - 1)) }
                                    else if (e.key === 'Enter' && highlighted >= 0) { e.preventDefault(); pickPlace({ address: suggestions[highlighted].place_name, coords: suggestions[highlighted].center }) }
                                }}
                                placeholder="Onde é o serviço?"
                                className="flex-1 min-w-0 bg-transparent text-sm focus:outline-none"
                                style={{ color: colors.textPrimary }}
                            />
                            {location.address && (
                                <button onClick={() => onAddressInput('')} aria-label="Limpar" style={{ color: colors.textSecondary }}><X size={16} /></button>
                            )}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto px-4 pb-6">
                        <button
                            onClick={() => { useMyLocation(); setSearchOpen(false); setSuggestions([]) }}
                            className="w-full flex items-center gap-3 py-3 text-left"
                        >
                            <span className="w-9 h-9 rounded-full flex items-center justify-center text-white flex-shrink-0" style={{ background: GRADIENT }}><LocateFixed size={17} /></span>
                            <span className="text-sm font-black" style={{ color: colors.textPrimary }}>Usar minha localização atual</span>
                        </button>

                        {searching && <div className="flex justify-center py-5"><Spinner size={20} color={colors.textSecondary} /></div>}

                        {suggestions.map((s, i) => (
                            <button
                                key={`${s.place_name}-${i}`}
                                onClick={() => pickPlace({ address: s.place_name, coords: s.center })}
                                className="w-full flex items-start gap-3 py-3 text-left rounded-xl"
                                style={{ background: i === highlighted ? `${colors.accent}15` : undefined }}
                            >
                                <MapPin size={17} className="mt-0.5 flex-shrink-0" style={{ color: colors.textSecondary }} />
                                <span className="text-sm font-semibold" style={{ color: colors.textPrimary }}>{s.place_name}</span>
                            </button>
                        ))}

                        {suggestions.length === 0 && !searching && recent.length > 0 && (
                            <>
                                <p className="text-[11px] font-black uppercase tracking-wider mt-3 mb-1" style={{ color: colors.textSecondary }}>Usados antes</p>
                                {recent.map((r) => (
                                    <button key={r.address} onClick={() => pickPlace({ address: r.address, coords: r.coords })} className="w-full flex items-center gap-3 py-3 text-left">
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
            )}
        </div>
    )
}
