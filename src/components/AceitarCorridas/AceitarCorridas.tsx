// components/AceitarCorridas/AceitarCorridas.tsx
//
// Conteúdo de /aceitar-corridas (corridas disponíveis, "Me candidatei" e
// corrida aceita). Usado pela página /aceitar-corridas (completa, com
// Header e fundo) e embutido no /painel-motorista (embedded: sem Header,
// com a aba controlada pelo painel).
'use client'

import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { getCurrentPosition as getNativeCurrentPosition, watchPosition as watchNativePosition } from '@/lib/nativeGeolocation'
import { useProfile } from '@/app/contexts/ProfileContext'
import { useTheme } from '@/app/contexts/theme'
import Header, { type Tab } from '@/components/Header'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import LoginAndRegister from '@/components/LoginAndRegister/LoginAndRegister'
import LocationPicker from '@/components/LocationPicker'
import { toast } from 'sonner'
import { MapPin, Star, Pencil, X, Package, CalendarClock, PawPrint, Car, CheckCircle2, Navigation, Ban, Flag, Share2, AlertCircle, Map as MapIcon, LocateFixed } from 'lucide-react'
import { Spinner } from '@/components/Spinner'
import { loadPlatformTariffs } from '@/lib/platformTariffs'
import { shortAddress } from '@/lib/serviceBoard'
import { getAvatarUrl } from '@/lib/avatar'
import { computeSuggestedPrice, computeConditionExtras, computePickupFee, fetchPricePerMinuteMap, getEffectivePricing, getCustomPricing, PLATFORM_DEFAULT_PRICING_BY_VEHICLE, DriverPricing, type RideConditionFlags } from '@/lib/driverPricing'
import { playRideAlertSound, playNotificationSound } from '@/lib/rideAlertSound'
import { useVoiceNavigation } from '@/lib/voiceNavigation'
import { getProfileRideRatingsBatch, ProfileRideRating } from '@/lib/rideReviews'
import { VehicleType, VehicleKind, VEHICLE_TYPE_LABELS, ridesAcceptableForVehicleKind, rideAcceptsAnyVehicle, kindForRideType } from '@/lib/rideVehicle'

// Ícone do marcador "Você" no mapa: o veículo cadastrado que serve essa
// corrida (moto/bicicleta são exclusivos; "qualquer" usa o que o motorista
// tem, na ordem carro > moto > bicicleta).
function vehicleIconForRide(rideVehicleType: VehicleType, myKinds: VehicleKind[]): VehicleKind {
    if (rideVehicleType === 'moto' || rideVehicleType === 'bicicleta') return rideVehicleType
    if (rideVehicleType === 'qualquer') {
        return (['carro', 'moto', 'bicicleta'] as const).find((k) => myKinds.includes(k)) || 'carro'
    }
    return 'carro'
}
import { buildRideSpecRows } from '@/lib/rideSpecs'
import { notifyRideStatus } from '@/lib/notifyRideStatus'
import { handleShareLink } from '@/lib/share'
import { computeExtraTaskFee, EXTRA_TASK_FEE_TIERS } from '@/lib/extraTaskFees'
import { haversineKm } from '@/lib/mapboxRoute'
import RideChat from '@/components/RideChat'
import { DRIVER_CHAT_QUICK_REPLIES } from '@/lib/rideChatQuickReplies'
import { useActivePlans } from '@/hooks/useActivePlans'
import DriverDebtBanner from '@/components/DriverDebtBanner'
import RideMiniMap from '@/app/(main)/aceitar-corridas/RideMiniMap'
import RideMapDialog from '@/app/(main)/aceitar-corridas/RideMapDialog'
import { RideOfferCard } from './RideOfferCard'
import { VehicleRequiredDialog } from '@/components/VehicleRequiredDialog'
import { submitRideApplication } from '@/lib/rideApplication'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'
const REFRESH_INTERVAL_MS = 15000

// Ícone da aba "Me candidatei": sempre no verde-limão do botão "Candidatar-se"
// (não no branco que o Header aplica normalmente aos ícones de aba), pra não
// ficar idêntico ao ícone de avatar sem foto.
export function CandidateiTabIcon({ size }: { size?: number }) {
    return <CheckCircle2 size={size} color="#a3e635" />
}

function formatScheduledFor(iso: string): string {
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function formatAddress(address: string, addressNumber?: string): string {
    if (!address) return 'Definir local'

    const displayAddress = addressNumber ? `${address.split(',')[0]}, ${addressNumber}` : address
    const firstPart = displayAddress.split(',')[0].trim()
    const match = firstPart.match(/^(.+?)(\s+\d+)/)

    if (match) {
        let result = match[0].trim()
        result = result
            .replace(/^Avenida\s/, 'Av. ')
            .replace(/^Rua\s/, 'R. ')
            .replace(/^Travessa\s/, 'Tv. ')
            .replace(/^Praça\s/, 'Pç. ')
            .replace(/^Alameda\s/, 'Al. ')
            .replace(/^Rodovia\s/, 'Rod. ')
            .replace(/^Estrada\s/, 'Estr. ')

        if (result.length > 28) {
            return result.substring(0, 25) + '...'
        }
        return result
    }

    if (firstPart.length > 28) {
        return firstPart.substring(0, 25) + '...'
    }
    return firstPart
}

const liveLocationCache: Map<string, string> = new Map()

// Endereço da posição ao vivo (GPS), pra mostrar no cabeçalho no lugar do
// endereço salvo enquanto "Sincronização para motorista" está ativada.
async function reverseGeocodeLiveLocation(lat: number, lng: number): Promise<string | null> {
    const key = `${lat.toFixed(4)},${lng.toFixed(4)}`
    if (liveLocationCache.has(key)) return liveLocationCache.get(key)!

    try {
        const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`,
            { headers: { 'User-Agent': 'iUserApp/1.0', 'Accept-Language': 'pt-BR' } }
        )
        if (!res.ok) throw new Error('Erro')
        const data = await res.json()
        const address = data?.address
        const street = address?.road || address?.street || ''
        const number = address?.house_number || ''
        const formatted = street ? (number ? `${street}, ${number}` : street) : (data.display_name || null)
        if (formatted) liveLocationCache.set(key, formatted)
        return formatted
    } catch {
        return null
    }
}

function relativeTime(iso: string): string {
    const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
    if (minutes < 1) return 'agora'
    if (minutes < 60) return `há ${minutes} min`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `há ${hours}h`
    return `há ${Math.floor(hours / 24)}d`
}

interface RideRow {
    id: string
    requester_id: string
    ride_type: 'pessoa' | 'objeto' | 'animal'
    origin_address: string
    destination_address: string
    origin_complement: string | null
    destination_complement: string | null
    notes: string | null
    passenger_count: number
    vehicle_type: VehicleType
    object_description: string | null
    object_is_sensitive: boolean
    delivery_location: 'portaria' | 'area_interna' | 'apartamento' | null
    payment_method: 'dinheiro' | 'pix' | 'cartao' | null
    cash_change_for: number | null
    card_is_contactless: boolean | null
    origin_needs_access: boolean | null
    origin_access_notes: string | null
    destination_needs_access: boolean | null
    destination_access_notes: string | null
    pet_description: string | null
    has_child: boolean
    children_count: number | null
    child_age: string | null
    child_needs_car_seat: boolean | null
    has_shopping: boolean
    bag_count: number | null
    grocery_bag_size: 'pequeno' | 'medio' | 'grande' | null
    has_extra_object: boolean
    extra_object_description: string | null
    has_pet: boolean
    pet_weight_range: 'ate_5kg' | '5_a_15kg' | '15_a_30kg' | 'acima_30kg' | null
    pet_has_carrier: boolean | null
    has_special_needs: boolean
    special_needs_description: string | null
    special_needs_wheelchair: boolean
    special_needs_wheelchair_type: 'dobravel' | 'grande' | null
    special_needs_visual_impairment: boolean
    has_guide_dog: boolean
    distance_km: number | null
    duration_min: number | null
    scheduled_for: string | null
    created_at: string
    origin_lat: number | null
    origin_lng: number | null
    destination_lat: number | null
    destination_lng: number | null
    stop1_address: string | null
    stop1_complement: string | null
    stop1_lat: number | null
    stop1_lng: number | null
    stop2_address: string | null
    stop2_complement: string | null
    stop2_lat: number | null
    stop2_lng: number | null
    offered_price: number | null
    order_id: string | null
    store_id: string | null
    applicant_count: number
}

// Junta stop1/stop2 num array pro RideMiniMap/RideMapDialog (0 a 2 paradas,
// só as que têm coordenada preenchida, na ordem).
function rideStopsOf(ride: { stop1_lat: number | null; stop1_lng: number | null; stop2_lat: number | null; stop2_lng: number | null }): { lat: number; lng: number }[] {
    const stops: { lat: number; lng: number }[] = []
    if (ride.stop1_lat != null && ride.stop1_lng != null) stops.push({ lat: ride.stop1_lat, lng: ride.stop1_lng })
    if (ride.stop2_lat != null && ride.stop2_lng != null) stops.push({ lat: ride.stop2_lat, lng: ride.stop2_lng })
    return stops
}

const MAX_CANDIDATES = 5

interface RideCardData extends RideRow {
    requesterName: string | null
    requesterSlug: string | null
    requesterAvatarUrl: string | undefined
    requesterRating: ProfileRideRating
    suggestedPrice: number
    platformPrice: number
    customPrice: number | null
    tariff: DriverPricing
    storeName: string | null
    hasDistance: boolean
}

interface CandidacyCardData extends RideRow {
    requesterName: string | null
    requesterSlug: string | null
    requesterAvatarUrl: string | undefined
    requesterRating: ProfileRideRating
    applicationId: string
    myProposedPrice: number | null
    hasDistance: boolean
}

interface AcceptedRideDetail {
    id: string
    vehicle_type: VehicleType
    origin_address: string
    destination_address: string
    origin_complement: string | null
    destination_complement: string | null
    origin_lat: number | null
    origin_lng: number | null
    destination_lat: number | null
    destination_lng: number | null
    stop1_address: string | null
    stop1_complement: string | null
    stop1_lat: number | null
    stop1_lng: number | null
    stop1_reached_at: string | null
    stop2_address: string | null
    stop2_complement: string | null
    stop2_lat: number | null
    stop2_lng: number | null
    stop2_reached_at: string | null
    distance_km: number | null
    duration_min: number | null
    driver_en_route: boolean
    driver_arrived_at: string | null
    ride_started_at: string | null
    requesterName: string | null
    requesterSlug: string | null
    requesterAvatarUrl: string | undefined
    requesterRating: ProfileRideRating
    proposedPrice: number | null
    extra_task_minutes: number | null
    extra_task_fee: number | null
    extra_task_description: string | null
}

export type AceitarCorridasTab = 'servicos' | 'candidatos' | 'aceita'

export interface AceitarCorridasProps {
    // Embutido no /painel-motorista: sem Header/fundo, aba controlada de fora.
    embedded?: boolean
    tab?: AceitarCorridasTab
    onTabChange?: (tab: AceitarCorridasTab) => void
    // Contagens/estado pras abas do painel (badges e "Corrida aceita").
    onSummaryChange?: (summary: { rides: number; candidacies: number; hasAccepted: boolean }) => void
    // Sair da tela (ex: recusou a sincronização) — no painel volta pra aba Painel.
    onLeave?: () => void
    // Abrir o cadastro de veículo (no painel: troca pra aba Meu veículo).
    onRegisterVehicle?: () => void
}

export default function AceitarCorridas({ embedded = false, tab, onTabChange, onSummaryChange, onLeave, onRegisterVehicle }: AceitarCorridasProps = {}) {
    const router = useRouter()
    // ?ride=<id> (clique num card do Canal do Motorista na home): rola até o card
    // dessa corrida e destaca; ?tab=candidatos abre em "Me candidatei".
    const searchParams = useSearchParams()
    const focusRideId = searchParams.get('ride')
    const focusTab = searchParams.get('tab')
    const [highlightRideId, setHighlightRideId] = useState<string | null>(null)
    const focusedRef = useRef(false)
    const { userId: contextUserId, avatarUrl, bgMode, customBgUrl, profileSlug, loading: profileLoading } = useProfile()
    const { colors } = useTheme()
    const { loading: plansLoading, hasDriver } = useActivePlans(contextUserId)

    const [loading, setLoading] = useState(true)
    const [showLogin, setShowLogin] = useState(false)
    const [innerTab, setInnerTab] = useState<AceitarCorridasTab>(focusTab === 'candidatos' ? 'candidatos' : 'servicos')
    const activeTab = tab ?? innerTab
    const setActiveTab = useCallback((next: AceitarCorridasTab) => {
        setInnerTab(next)
        onTabChange?.(next)
    }, [onTabChange])
    const activeTabRef = useRef(activeTab)
    activeTabRef.current = activeTab
    const [rides, setRides] = useState<RideCardData[]>([])
    const knownRideIdsRef = useRef<Set<string>>(new Set())
    const firstLoadDoneRef = useRef(false)
    const alertSoundRef = useRef(true)
    const [voiceNavEnabled, setVoiceNavEnabled] = useState(true)
    const [candidacies, setCandidacies] = useState<CandidacyCardData[]>([])
    const [acceptedRide, setAcceptedRide] = useState<AcceptedRideDetail | null>(null)
    const [myVehicleKinds, setMyVehicleKinds] = useState<VehicleKind[]>(['carro'])
    const [hasVehicle, setHasVehicle] = useState<boolean | null>(null)
    const [showVehicleDialog, setShowVehicleDialog] = useState(false)
    const [departing, setDeparting] = useState(false)
    const [arriving, setArriving] = useState(false)
    const [starting, setStarting] = useState(false)
    const [showExtraTaskForm, setShowExtraTaskForm] = useState(false)
    const [extraTaskMinutesInput, setExtraTaskMinutesInput] = useState('')
    const [extraTaskDescriptionInput, setExtraTaskDescriptionInput] = useState('')
    const [savingExtraTask, setSavingExtraTask] = useState(false)
    const [finishing, setFinishing] = useState(false)
    const [arrivingStop, setArrivingStop] = useState(false)
    const [cancellingAccepted, setCancellingAccepted] = useState(false)
    const lastAcceptedRideIdRef = useRef<string | null>(null)
    const [withdrawingId, setWithdrawingId] = useState<string | null>(null)
    const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set())
    const [applyingId, setApplyingId] = useState<string | null>(null)
    const [customPriceFor, setCustomPriceFor] = useState<string | null>(null)
    const [customPriceValue, setCustomPriceValue] = useState('')
    const [driverCoords, setDriverCoords] = useState<[number, number] | null>(null)
    const [liveLocationSync, setLiveLocationSync] = useState(false)
    const [liveLocationLabel, setLiveLocationLabel] = useState<string | null>(null)
    const liveLocationDebounceRef = useRef<NodeJS.Timeout | null>(null)
    // Pedido automático de localização: sem ela a Tarifa iUser não consegue somar a
    // distância do motorista até a partida (ver "Pedimos sua localização" na lista).
    const gpsFixRef = useRef(false)
    const gpsWatchRef = useRef<{ clear: () => void } | null>(null)
    const [gpsStatus, setGpsStatus] = useState<'asking' | 'granted' | 'denied' | 'unavailable'>('asking')
    const requestGps = useCallback(() => {
        gpsWatchRef.current?.clear()
        setGpsStatus(gpsFixRef.current ? 'granted' : 'asking')
        gpsWatchRef.current = watchNativePosition(
            (pos) => {
                gpsFixRef.current = true
                setGpsStatus('granted')
                setDriverCoords([pos.coords.longitude, pos.coords.latitude])
            },
            (err) => {
                if (gpsFixRef.current) return
                setGpsStatus(err.code === 1 ? 'denied' : 'unavailable')
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
        )
    }, [])
    useEffect(() => {
        requestGps()
        return () => gpsWatchRef.current?.clear()
    }, [requestGps])
    const [mapDialogRideId, setMapDialogRideId] = useState<string | null>(null)
    // Km/tempo de cada trecho, calculados pelo mini mapa de cada card.
    const [routeInfoById, setRouteInfoById] = useState<Record<string, { toPickupKm: number | null; toPickupMin: number | null; tripKm: number; tripMin: number }>>({})

    // ===== DIALOG "ATIVAR SINCRONIZAÇÃO" AO ENTRAR NA PÁGINA =====
    // Pra aceitar corridas o motorista precisa estar com a sincronização
    // ligada — em vez de deixar isso implícito (só ligava sozinho ao
    // candidatar-se numa corrida), pergunta logo na entrada da página.
    const [showSyncPrompt, setShowSyncPrompt] = useState(false)
    const [activatingSync, setActivatingSync] = useState(false)
    const syncPromptedRef = useRef(false)

    const [savedLocation, setSavedLocation] = useState<{ lat: number; lng: number; address: string; addressNumber?: string; addressComplement?: string } | null>(null)
    const [showLocationDialog, setShowLocationDialog] = useState(false)
    const [isSavingLocation, setIsSavingLocation] = useState(false)
    const userIdRef = useRef<string | null>(null)

    // ===== SUA LOCALIZAÇÃO, PRA DESENHAR "VOCÊ → PARTIDA" NO MAPA DE CADA PEDIDO =====
    // Fonte da verdade é a localização definida em "Definir local" (LocationPicker,
    // salva em profiles.store_lat/lng) — é ela que o load() abaixo aplica a cada
    // 15s. Só quando "Sincronização para motorista" está ativada é que o GPS ao
    // vivo assume e vai atualizando continuamente por cima (a persistência em
    // driver_pricing pro passageiro acompanhar é feita globalmente pelo
    // DriverLiveLocationBroadcaster, montado em providers.tsx).
    useEffect(() => {
        if (!liveLocationSync) return

        const watch = watchNativePosition(
            (pos) => setDriverCoords([pos.coords.longitude, pos.coords.latitude]),
            () => { /* sem permissão: mapa mostra só o trajeto partida → chegada */ },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
        )

        return () => watch.clear()
    }, [liveLocationSync])

    // ===== "CHEGANDO": avisa o passageiro (push com som) quando o motorista chega perto =====
    // Fase 1 (a caminho da partida): perto do ponto de partida. Fase 2 (corrida
    // iniciada): perto do destino — no caso de objeto, é o "seu objeto está chegando".
    // Uma vez por fase e por corrida.
    const APPROACH_RADIUS_METERS = 300
    const approachNotifiedRef = useRef<Set<string>>(new Set())
    useEffect(() => {
        if (!acceptedRide) return
        const ride = acceptedRide
        const phase = ride.ride_started_at ? 'approaching_destination' : (ride.driver_en_route && !ride.driver_arrived_at) ? 'approaching_pickup' : null
        if (!phase) return
        const target = phase === 'approaching_destination'
            ? [ride.destination_lng, ride.destination_lat]
            : [ride.origin_lng, ride.origin_lat]
        if (target[0] == null || target[1] == null) return
        const key = `iuser-approach:${ride.id}:${phase}`
        try { if (sessionStorage.getItem(key)) return } catch { /* sem sessionStorage */ }
        if (approachNotifiedRef.current.has(key)) return

        const watch = watchNativePosition(
            (pos) => {
                if (approachNotifiedRef.current.has(key)) return
                const meters = haversineKm([pos.coords.longitude, pos.coords.latitude], target as [number, number]) * 1000
                if (meters <= APPROACH_RADIUS_METERS) {
                    approachNotifiedRef.current.add(key)
                    try { sessionStorage.setItem(key, '1') } catch { /* ok */ }
                    notifyRideStatus(ride.id, phase)
                    watch.clear()
                }
            },
            () => { /* sem GPS: só não avisa a aproximação */ },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
        )
        return () => watch.clear()
    }, [acceptedRide?.id, acceptedRide?.driver_en_route, acceptedRide?.driver_arrived_at, acceptedRide?.ride_started_at])

    // ===== ORIENTAÇÃO POR VOZ: fala as manobras a caminho da partida, e
    // depois a caminho da chegada. Com paradas, a "chegada" vira uma sequência
    // de pernas — 1ª parada (se não confirmada), 2ª parada (idem), destino
    // final — a voz sempre mira na próxima ainda não confirmada. "Chegou na
    // parada" é o motorista confirmando pelo botão (arriveAtStop), não a voz
    // detectando sozinha. =====
    const voiceNavPhase: 'pickup' | 'trip' | null = !acceptedRide
        ? null
        : acceptedRide.ride_started_at
            ? 'trip'
            : acceptedRide.driver_en_route && !acceptedRide.driver_arrived_at
                ? 'pickup'
                : null

    interface TripLeg { kind: 'stop1' | 'stop2' | 'destination'; lat: number; lng: number }
    const tripLegs: TripLeg[] = []
    if (acceptedRide?.stop1_lat != null && acceptedRide?.stop1_lng != null && !acceptedRide.stop1_reached_at) {
        tripLegs.push({ kind: 'stop1', lat: acceptedRide.stop1_lat, lng: acceptedRide.stop1_lng })
    }
    if (acceptedRide?.stop2_lat != null && acceptedRide?.stop2_lng != null && !acceptedRide.stop2_reached_at) {
        tripLegs.push({ kind: 'stop2', lat: acceptedRide.stop2_lat, lng: acceptedRide.stop2_lng })
    }
    if (acceptedRide?.destination_lat != null && acceptedRide?.destination_lng != null) {
        tripLegs.push({ kind: 'destination', lat: acceptedRide.destination_lat, lng: acceptedRide.destination_lng })
    }
    const currentTripLeg = voiceNavPhase === 'trip' ? tripLegs[0] || null : null

    const voiceNavTarget: [number, number] | null =
        voiceNavPhase === 'pickup' && acceptedRide?.origin_lat != null && acceptedRide?.origin_lng != null
            ? [acceptedRide.origin_lng, acceptedRide.origin_lat]
            : currentTripLeg
                ? [currentTripLeg.lng, currentTripLeg.lat]
                : null

    const voiceNavIntro = (() => {
        if (!currentTripLeg || !acceptedRide) return undefined
        if (currentTripLeg.kind === 'stop1') {
            const hasSecond = acceptedRide.stop2_lat != null && acceptedRide.stop2_lng != null
            const first = acceptedRide.stop1_address ? shortAddress(acceptedRide.stop1_address) : 'perto dali'
            return hasSecond
                ? `Iniciando orientação por voz. Você tem 2 paradas antes do destino final. Primeira parada em ${first}.`
                : `Iniciando orientação por voz. Você tem uma parada em ${first} antes do destino final.`
        }
        if (currentTripLeg.kind === 'stop2') {
            const second = acceptedRide.stop2_address ? shortAddress(acceptedRide.stop2_address) : 'perto dali'
            return `Parada concluída. Segunda parada em ${second}.`
        }
        // destination: só anuncia "seguindo pro destino" se veio de alguma parada
        const hadAnyStop = acceptedRide.stop1_lat != null
        return hadAnyStop ? 'Parada concluída. Seguindo para o destino final.' : undefined
    })()

    useVoiceNavigation({
        enabled: voiceNavEnabled,
        active: !!voiceNavPhase && !!voiceNavTarget,
        driverCoords,
        targetCoords: voiceNavTarget,
        legKey: acceptedRide && voiceNavPhase ? `${acceptedRide.id}-${voiceNavPhase}-${currentTripLeg?.kind || 'none'}` : null,
        introMessage: voiceNavIntro,
    })

    // Nome exibido no cabeçalho enquanto sincronizado: o do local ao vivo
    // (GPS), não o do local salvo — só busca de novo quando a posição muda.
    useEffect(() => {
        if (!liveLocationSync || !driverCoords) {
            setLiveLocationLabel(null)
            return
        }

        if (liveLocationDebounceRef.current) clearTimeout(liveLocationDebounceRef.current)
        liveLocationDebounceRef.current = setTimeout(async () => {
            const [lng, lat] = driverCoords
            const label = await reverseGeocodeLiveLocation(lat, lng)
            if (label) setLiveLocationLabel(label)
        }, 800)

        return () => {
            if (liveLocationDebounceRef.current) clearTimeout(liveLocationDebounceRef.current)
        }
    }, [liveLocationSync, driverCoords])

    const load = useCallback(async () => {
        userIdRef.current = contextUserId
        // Tarifa da plataforma vem do banco (Admin → Tarifas): carrega antes de calcular os preços
        await loadPlatformTariffs(supabase)
        // Visitante (sem login) também vê as corridas, com a Tarifa iUser e todos os
        // tipos de veículo; o login só é pedido na hora de se candidatar.
        if (contextUserId) setShowLogin(false)
        const noRow = Promise.resolve({ data: null }) as unknown as PromiseLike<{ data: any }>

        const [{ data: pricingRow }, { data: profile }, { data: vehicleRows }] = await Promise.all([
            !contextUserId ? noRow : supabase
                .from('driver_pricing')
                .select('pricing_mode, base_distance_km, base_fee, price_per_km_after_base, extra_fee_pessoa, extra_fee_animal, extra_fee_objeto, extra_fee_condominio, extra_fee_compras, extra_fee_necessidade_especial, extra_fee_pet_sem_caixa, extra_fee_entrega_interna, extra_fee_ar_condicionado, alert_sound_enabled, voice_navigation_enabled')
                .eq('driver_id', contextUserId)
                .maybeSingle(),
            !contextUserId ? noRow : supabase
                .from('profiles')
                .select('address, address_number, address_complement, store_lat, store_lng')
                .eq('id', contextUserId)
                .maybeSingle(),
            !contextUserId ? Promise.resolve({ data: [] as any[] }) as unknown as PromiseLike<{ data: any[] }> : supabase
                .from('driver_vehicles')
                .select('vehicle_kind')
                .eq('driver_id', contextUserId),
        ])

        // Qualquer pessoa vê as corridas disponíveis, mesmo sem ter completado o
        // cadastro de motorista: sem tarifa própria o valor sai pela Tarifa iUser,
        // e sem veículo cadastrado aparecem as corridas de todos os tipos.
        const pricePerMinute = contextUserId ? (await fetchPricePerMinuteMap(supabase, [contextUserId])).get(contextUserId) ?? null : null
        const pricing = pricingRow ? { ...pricingRow, price_per_minute: pricePerMinute } : {
            pricing_mode: 'platform' as const,
            base_distance_km: null, base_fee: null, price_per_km_after_base: null,
            extra_fee_pessoa: null, extra_fee_animal: null, extra_fee_objeto: null,
            extra_fee_condominio: null, extra_fee_compras: null, extra_fee_necessidade_especial: null,
            extra_fee_pet_sem_caixa: null, extra_fee_entrega_interna: null, extra_fee_ar_condicionado: null,
            alert_sound_enabled: true, voice_navigation_enabled: true,
        }

        // Motorista pode ter vários veículos (carro, moto, bicicleta) e vê as
        // corridas de todos eles. Sem cadastro de veículo (conta antiga, de
        // antes dessa coluna existir) cai no padrão "carro".
        alertSoundRef.current = pricing.alert_sound_enabled !== false
        setVoiceNavEnabled(pricing.voice_navigation_enabled !== false)
        const vehicleKinds = (vehicleRows || []).map((v) => v.vehicle_kind as VehicleKind)
        const hasRegisteredVehicle = vehicleKinds.length > 0
        setHasVehicle(contextUserId ? hasRegisteredVehicle : null)
        if (!hasRegisteredVehicle) vehicleKinds.push('carro')
        const acceptableVehicleTypes = new Set<VehicleType>(
            hasRegisteredVehicle
                ? vehicleKinds.flatMap((k) => ridesAcceptableForVehicleKind(k))
                : ['carro', 'van', 'van-grande', 'moto', 'bicicleta', 'qualquer']
        )
        setMyVehicleKinds(vehicleKinds)

        // Consulta separada e best-effort: se a coluna ainda não existir (migração
        // pendente), isso não pode derrubar a checagem de tarifa acima.
        if (contextUserId) supabase
            .from('driver_pricing')
            .select('live_location_sync')
            .eq('driver_id', contextUserId)
            .maybeSingle()
            .then(({ data }) => {
                const syncOn = !!data?.live_location_sync
                setLiveLocationSync(syncOn)
                if (!syncPromptedRef.current) {
                    syncPromptedRef.current = true
                    // Só pergunta pra quem já tem cadastro de motorista (driver_pricing);
                    // quem está só vendo as corridas não é barrado por esse aviso.
                    if (!syncOn && data) setShowSyncPrompt(true)
                }
                // Enquanto a sincronização ao vivo não está ligada, a posição
                // exibida é sempre a localização definida em "Definir local"
                // desta conta — nunca a de outra conta nem um GPS "grudado".
                if (!syncOn && !gpsFixRef.current) {
                    setDriverCoords(
                        profile?.store_lat != null && profile?.store_lng != null
                            ? [profile.store_lng, profile.store_lat]
                            : null
                    )
                }
            })

        if (contextUserId) setSavedLocation(
            profile?.store_lat != null && profile?.store_lng != null
                ? {
                    lat: profile.store_lat,
                    lng: profile.store_lng,
                    address: profile.address || 'Local salvo',
                    addressNumber: profile.address_number || '',
                    addressComplement: profile.address_complement || '',
                }
                : null
        )

        const { data: myApplicationRows } = contextUserId
            ? await supabase
                .from('ride_applications')
                .select('id, ride_request_id, proposed_price')
                .eq('applicant_id', contextUserId)
                .eq('status', 'pending')
            : { data: [] as { id: string; ride_request_id: string; proposed_price: number | null }[] }
        const myApplications = myApplicationRows || []
        const appliedIds = new Set(myApplications.map((a) => a.ride_request_id))

        let openRidesQuery = supabase
            .from('ride_requests')
            .select('id, requester_id, ride_type, origin_address, destination_address, origin_complement, destination_complement, notes, passenger_count, vehicle_type, object_description, object_is_sensitive, pet_description, has_child, children_count, child_age, child_needs_car_seat, has_shopping, bag_count, has_extra_object, extra_object_description, has_pet, pet_weight_range, pet_has_carrier, has_special_needs, special_needs_description, special_needs_wheelchair, special_needs_wheelchair_type, special_needs_visual_impairment, has_guide_dog, delivery_location, payment_method, cash_change_for, card_is_contactless, origin_needs_access, origin_access_notes, destination_needs_access, destination_access_notes, grocery_bag_size, wants_air_conditioning, distance_km, duration_min, scheduled_for, created_at, origin_lat, origin_lng, destination_lat, destination_lng, stop1_address, stop1_complement, stop1_lat, stop1_lng, stop2_address, stop2_complement, stop2_lat, stop2_lng, offered_price, order_id, store_id')
            .eq('status', 'pending')
        if (contextUserId) openRidesQuery = openRidesQuery.neq('requester_id', contextUserId)
        const { data: openRides } = await openRidesQuery
            .order('scheduled_for', { ascending: true, nullsFirst: true })
            .order('created_at', { ascending: false })

        const candidateRides = (openRides || []).filter((r) => !appliedIds.has(r.id) && (rideAcceptsAnyVehicle(r.vehicle_type) || acceptableVehicleTypes.has(r.vehicle_type)))

        // Consulta separada e best-effort: se a coluna ainda não existir (migração
        // pendente), isso não pode derrubar o quadro de corridas inteiro — só
        // deixa de aplicar o limite de 5 candidatos até a migração rodar.
        const countById = new Map<string, number>()
        if (candidateRides.length > 0) {
            const { data: counts } = await supabase
                .from('ride_requests')
                .select('id, applicant_count')
                .in('id', candidateRides.map((r) => r.id))
            for (const c of counts || []) countById.set(c.id, c.applicant_count as number)
        }

        const openList = candidateRides
            .filter((r) => (countById.get(r.id) ?? 0) < MAX_CANDIDATES)
            .map((r) => ({ ...r, applicant_count: countById.get(r.id) ?? 0 }))

        // Minhas candidaturas em aberto — some daqui assim que a corrida deixa
        // de estar pendente (seja porque eu fui aceito, outro motorista foi
        // aceito, ou o pedido foi cancelado).
        let myRideRows: Omit<RideRow, 'applicant_count'>[] = []
        if (myApplications.length > 0) {
            const { data } = await supabase
                .from('ride_requests')
                .select('id, requester_id, ride_type, origin_address, destination_address, origin_complement, destination_complement, notes, passenger_count, vehicle_type, object_description, object_is_sensitive, pet_description, has_child, children_count, child_age, child_needs_car_seat, has_shopping, bag_count, has_extra_object, extra_object_description, has_pet, pet_weight_range, pet_has_carrier, has_special_needs, special_needs_description, special_needs_wheelchair, special_needs_wheelchair_type, special_needs_visual_impairment, has_guide_dog, delivery_location, payment_method, cash_change_for, card_is_contactless, origin_needs_access, origin_access_notes, destination_needs_access, destination_access_notes, grocery_bag_size, wants_air_conditioning, distance_km, duration_min, scheduled_for, created_at, origin_lat, origin_lng, destination_lat, destination_lng, stop1_address, stop1_complement, stop1_lat, stop1_lng, stop2_address, stop2_complement, stop2_lat, stop2_lng, offered_price, order_id, store_id')
                .in('id', myApplications.map((a) => a.ride_request_id))
                .eq('status', 'pending')
            myRideRows = data || []
        }

        const requesterIds = Array.from(new Set([...openList, ...myRideRows].map((r) => r.requester_id)))
        const [{ data: profiles }, ratingsMap] = requesterIds.length > 0
            ? await Promise.all([
                supabase.from('profiles').select('id, name, profileSlug, avatar_url').in('id', requesterIds),
                getProfileRideRatingsBatch(supabase, requesterIds),
            ])
            : [{ data: [] as { id: string; name: string | null; profileSlug: string | null; avatar_url: string | null }[] }, new Map<string, ProfileRideRating>()]
        const profilesById = new Map((profiles || []).map((p) => [p.id, p]))

        const storeIds = Array.from(new Set(openList.map((r) => r.store_id).filter(Boolean))) as string[]
        const storeNamesById = new Map<string, string>()
        if (storeIds.length > 0) {
            const { data: storeRows } = await supabase.from('stores').select('id, name').in('id', storeIds)
            for (const st of storeRows || []) storeNamesById.set(st.id, st.name)
        }

        const cards: RideCardData[] = openList.map((r) => {
            const p = profilesById.get(r.requester_id)
            const hasDistance = r.distance_km != null
            const rideKind = kindForRideType(r.vehicle_type)
            const pricingShape = getEffectivePricing(pricing, rideKind)
            const conditionFlags: RideConditionFlags = {
                origin_needs_access: r.origin_needs_access,
                destination_needs_access: r.destination_needs_access,
                is_grocery_shopping: r.has_shopping,
                has_special_needs: r.has_special_needs,
                special_needs_wheelchair: r.special_needs_wheelchair,
                special_needs_visual_impairment: r.special_needs_visual_impairment,
                has_guide_dog: r.has_guide_dog,
                pet_has_carrier: r.pet_has_carrier,
                delivery_location: r.delivery_location,
                wants_air_conditioning: r.wants_air_conditioning,
            }
            const priceWith = (shape: DriverPricing) => hasDistance
                ? computeSuggestedPrice(r.distance_km!, shape, r.ride_type, conditionFlags, r.duration_min)
                : shape.baseFee
                    + shape.extraFees[r.ride_type as 'pessoa' | 'animal' | 'objeto']
                    + computeConditionExtras(conditionFlags, shape.conditionExtraFees)
            const platformPrice = priceWith(PLATFORM_DEFAULT_PRICING_BY_VEHICLE[rideKind])
            const customShape = getCustomPricing(pricing, rideKind)
            const customPrice = customShape ? priceWith(customShape) : null
            // Frete definido pela loja (entrega iUser) vale como preço sugerido.
            const suggestedPrice = r.offered_price != null ? Number(r.offered_price) : priceWith(pricingShape)
            return {
                ...r,
                requesterName: p?.name || null,
                requesterSlug: p?.profileSlug || null,
                requesterAvatarUrl: getAvatarUrl(supabase, p?.avatar_url),
                requesterRating: ratingsMap.get(r.requester_id) || { avg: 0, count: 0 },
                suggestedPrice,
                platformPrice,
                customPrice,
                tariff: pricingShape,
                storeName: r.store_id ? (storeNamesById.get(r.store_id) || null) : null,
                hasDistance,
            }
        })

        const applicationByRideId = new Map(myApplications.map((a) => [a.ride_request_id, a]))
        const candidacyCards: CandidacyCardData[] = myRideRows.map((r) => {
            const p = profilesById.get(r.requester_id)
            const application = applicationByRideId.get(r.id)
            return {
                ...r,
                applicant_count: 0,
                requesterName: p?.name || null,
                requesterSlug: p?.profileSlug || null,
                requesterAvatarUrl: getAvatarUrl(supabase, p?.avatar_url),
                requesterRating: ratingsMap.get(r.requester_id) || { avg: 0, count: 0 },
                applicationId: application?.id || '',
                myProposedPrice: application?.proposed_price ?? null,
                hasDistance: r.distance_km != null,
            }
        })

        // Corrida nova desde a última leitura: toca o alerta (se o motorista
        // não silenciou em /painel-motorista). A primeira leitura só marca o
        // que já existia, sem tocar.
        const newIds = cards.filter((c) => !knownRideIdsRef.current.has(c.id))
        if (knownRideIdsRef.current.size > 0 || firstLoadDoneRef.current) {
            if (newIds.length > 0) {
                if (alertSoundRef.current) playRideAlertSound()
                toast.info(newIds.length === 1 ? 'Nova corrida disponível!' : `${newIds.length} novas corridas disponíveis!`)
            }
        }
        knownRideIdsRef.current = new Set(cards.map((c) => c.id))
        firstLoadDoneRef.current = true

        setRides(cards)
        setCandidacies(candidacyCards)

        // Corrida aceita, se houver — o motorista tem no máximo uma por vez,
        // já que o passageiro só pode ter um pedido ativo (ver migração
        // ride_requests_one_active_per_requester), e o driver_id só é
        // definido no momento em que o pedido dele vira "accepted".
        const { data: acceptedRow } = !contextUserId ? { data: null as any } : await supabase
            .from('ride_requests')
            .select('id, requester_id, vehicle_type, origin_address, destination_address, origin_complement, destination_complement, origin_lat, origin_lng, destination_lat, destination_lng, stop1_address, stop1_complement, stop1_lat, stop1_lng, stop1_reached_at, stop2_address, stop2_complement, stop2_lat, stop2_lng, stop2_reached_at, distance_km, duration_min, driver_en_route, driver_arrived_at, ride_started_at, extra_task_minutes, extra_task_fee, extra_task_description')
            .eq('driver_id', contextUserId)
            .eq('status', 'accepted')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

        let acceptedDetail: AcceptedRideDetail | null = null
        if (acceptedRow) {
            const [{ data: reqProfile }, { data: acceptedApp }, requesterRatings] = await Promise.all([
                supabase.from('profiles').select('name, profileSlug, avatar_url').eq('id', acceptedRow.requester_id).maybeSingle(),
                supabase.from('ride_applications').select('proposed_price').eq('ride_request_id', acceptedRow.id).eq('applicant_id', contextUserId).eq('status', 'accepted').maybeSingle(),
                getProfileRideRatingsBatch(supabase, [acceptedRow.requester_id]),
            ])
            acceptedDetail = {
                id: acceptedRow.id,
                vehicle_type: acceptedRow.vehicle_type,
                origin_address: acceptedRow.origin_address,
                destination_address: acceptedRow.destination_address,
                origin_complement: acceptedRow.origin_complement,
                destination_complement: acceptedRow.destination_complement,
                origin_lat: acceptedRow.origin_lat,
                origin_lng: acceptedRow.origin_lng,
                destination_lat: acceptedRow.destination_lat,
                destination_lng: acceptedRow.destination_lng,
                stop1_address: acceptedRow.stop1_address,
                stop1_complement: acceptedRow.stop1_complement,
                stop1_lat: acceptedRow.stop1_lat,
                stop1_lng: acceptedRow.stop1_lng,
                stop1_reached_at: acceptedRow.stop1_reached_at,
                stop2_address: acceptedRow.stop2_address,
                stop2_complement: acceptedRow.stop2_complement,
                stop2_lat: acceptedRow.stop2_lat,
                stop2_lng: acceptedRow.stop2_lng,
                stop2_reached_at: acceptedRow.stop2_reached_at,
                distance_km: acceptedRow.distance_km,
                duration_min: acceptedRow.duration_min,
                driver_en_route: acceptedRow.driver_en_route,
                driver_arrived_at: acceptedRow.driver_arrived_at,
                ride_started_at: acceptedRow.ride_started_at,
                requesterName: reqProfile?.name || null,
                requesterSlug: reqProfile?.profileSlug || null,
                requesterAvatarUrl: getAvatarUrl(supabase, reqProfile?.avatar_url),
                requesterRating: requesterRatings.get(acceptedRow.requester_id) || { avg: 0, count: 0 },
                proposedPrice: acceptedApp?.proposed_price ?? null,
                extra_task_minutes: acceptedRow.extra_task_minutes,
                extra_task_fee: acceptedRow.extra_task_fee,
                extra_task_description: acceptedRow.extra_task_description,
            }
        }

        // Assim que uma corrida vira aceita, o layout muda pra essa aba
        // automaticamente; quando ela sai de aceita (cancelada/concluída),
        // volta pra "Corridas em abertos" se ainda estava nela.
        if (acceptedDetail && lastAcceptedRideIdRef.current !== acceptedDetail.id) {
            lastAcceptedRideIdRef.current = acceptedDetail.id
            setActiveTab('aceita')
            // O redirecionamento automático pra /aceitar-corridas/mapa ao
            // aceitar mora só em RideAcceptedDialog (global, em
            // providers.tsx) — de lá funciona em qualquer página do app,
            // não só quando essa tela específica está aberta e faz poll.
        } else if (!acceptedDetail && lastAcceptedRideIdRef.current != null) {
            // A corrida saiu de "aceita" sem ser pelo botão do motorista: se o
            // passageiro a finalizou, toca o som de fim de corrida.
            const goneId = lastAcceptedRideIdRef.current
            supabase.from('ride_requests').select('status').eq('id', goneId).maybeSingle().then(({ data: gone }) => {
                if (gone?.status === 'completed') {
                    playNotificationSound('completed')
                    toast.success('Corrida finalizada pelo passageiro!')
                }
            })
            lastAcceptedRideIdRef.current = null
            if (activeTabRef.current === 'aceita') setActiveTab('servicos')
        }
        setAcceptedRide(acceptedDetail)

        setLoading(false)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [router, contextUserId, embedded])

    useEffect(() => {
        if (profileLoading) return
        load()
    }, [profileLoading, load])

    useEffect(() => {
        const poll = setInterval(load, REFRESH_INTERVAL_MS)
        return () => clearInterval(poll)
    }, [load])

    // Corrida nova entra na hora (sem esperar o próximo ciclo de leitura).
    useEffect(() => {
        const channel = supabase
            .channel('aceitar-corridas-new-rides')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ride_requests' }, () => { load() })
            .subscribe()
        return () => { supabase.removeChannel(channel) }
    }, [load])

    const handleLoginSuccess = () => {
        setShowLogin(false)
        setLoading(true)
        load()
    }

    const visibleRides = useMemo(
        () => rides.filter((r) => !skippedIds.has(r.id)),
        [rides, skippedIds]
    )

    const headerTabs: Tab[] = useMemo((): any[] => {
        const tabs: any[] = []

        // Corrida aceita vem primeiro — quem tem uma corrida ativa precisa
        // vê-la assim que entra na tela, não procurar nas outras abas.
        if (acceptedRide) {
            tabs.push({
                id: 'aceita',
                label: 'Corrida aceita',
                icon: CheckCircle2,
                onClick: () => setActiveTab('aceita'),
                isActive: activeTab === 'aceita',
                badge: null,
            })
        }

        tabs.push(
            {
                id: 'servicos',
                label: 'Solicitações de motorista',
                icon: Car,
                onClick: () => setActiveTab('servicos'),
                isActive: activeTab === 'servicos',
                badge: rides.length > 0 ? { count: rides.length } : null,
            },
            {
                id: 'candidatos',
                label: 'Me candidatei',
                icon: CandidateiTabIcon,
                onClick: () => setActiveTab('candidatos'),
                isActive: activeTab === 'candidatos',
                badge: candidacies.length > 0 ? { count: candidacies.length } : null,
            },
        )

        return tabs
    }, [activeTab, rides.length, candidacies.length, acceptedRide, setActiveTab])

    // Avisa o painel (quando embutido) pra ele montar as mesmas abas com os badges.
    useEffect(() => {
        onSummaryChange?.({ rides: rides.length, candidacies: candidacies.length, hasAccepted: !!acceptedRide })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rides.length, candidacies.length, !!acceptedRide])

    const applyToRide = async (ride: RideCardData, price: number) => {
        if (price <= 0) {
            toast.error('Informe um valor válido')
            return
        }
        if (!contextUserId) {
            toast.info('Entre na sua conta para se candidatar a essa corrida.')
            setShowLogin(true)
            return
        }
        if (hasVehicle === false) {
            setShowVehicleDialog(true)
            return
        }
        if (!plansLoading && !hasDriver) {
            toast.error('Assine o plano Motorista ou o Combo pra se candidatar.', {
                action: { label: 'Ver planos', onClick: () => router.push('/planos?plan=motorista') },
            })
            return
        }
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        setApplyingId(ride.id)
        try {
            await submitRideApplication(user.id, ride.id, price)

            toast.success('Candidatura enviada!')
            setCustomPriceFor(null)
            await load()
            setActiveTab('candidatos')
        } catch (err: any) {
            if (err.code === '42501' || err.code === 'PGRST301') {
                if (!hasDriver) {
                    toast.error('Assine o plano Motorista ou o Combo pra se candidatar.')
                } else {
                    toast.error('Essa corrida já atingiu o limite de candidatos.')
                    setRides((prev) => prev.filter((r) => r.id !== ride.id))
                }
            } else {
                toast.error('Erro ao se candidatar: ' + (err.message || 'tente novamente'))
            }
        } finally {
            setApplyingId(null)
        }
    }

    // Rola até o card da corrida clicada na home (uma vez, quando ela aparecer na lista).
    useEffect(() => {
        if (!focusRideId || focusedRef.current || loading) return
        const el = document.getElementById(`ride-card-${focusRideId}`)
        if (!el) return
        focusedRef.current = true
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setHighlightRideId(focusRideId)
        setTimeout(() => setHighlightRideId(null), 3000)
    }, [focusRideId, loading, rides, candidacies, activeTab])

    const skipRide = (rideId: string) => {
        setSkippedIds((prev) => new Set(prev).add(rideId))
    }

    const handleLocationSave = async (location: {
        lat: number
        lng: number
        address: string
        addressNumber?: string
        addressComplement?: string
    }) => {
        setIsSavingLocation(true)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { error } = await supabase
                .from('profiles')
                .upsert({
                    id: user.id,
                    address: location.address,
                    address_number: location.addressNumber || null,
                    address_complement: location.addressComplement || null,
                    store_lat: location.lat,
                    store_lng: location.lng,
                }, { onConflict: 'id', ignoreDuplicates: false })

            if (error) throw error

            setSavedLocation(location)
            setDriverCoords([location.lng, location.lat])
            setShowLocationDialog(false)
        } catch (err: any) {
            toast.error('Erro ao salvar localização: ' + (err.message || 'tente novamente'))
        } finally {
            setIsSavingLocation(false)
        }
    }

    const withdrawApplication = async (applicationId: string) => {
        setWithdrawingId(applicationId)
        try {
            const { error } = await supabase.from('ride_applications').delete().eq('id', applicationId)
            if (error) throw error
            toast.success('Você saiu da candidatura.')
            setCandidacies((prev) => prev.filter((c) => c.applicationId !== applicationId))
        } catch (err: any) {
            toast.error('Erro ao sair da candidatura: ' + (err.message || 'tente novamente'))
        } finally {
            setWithdrawingId(null)
        }
    }

    const departToPickup = async () => {
        if (!acceptedRide) return
        setDeparting(true)
        try {
            const { error } = await supabase
                .from('ride_requests')
                .update({ driver_en_route: true, driver_departed_at: new Date().toISOString() })
                .eq('id', acceptedRide.id)
            if (error) throw error
            notifyRideStatus(acceptedRide.id, 'en_route')
            setAcceptedRide((prev) => (prev ? { ...prev, driver_en_route: true } : prev))
        } catch (err: any) {
            toast.error('Erro ao confirmar saída: ' + (err.message || 'tente novamente'))
        } finally {
            setDeparting(false)
        }
    }

    const arriveAtPickup = async () => {
        if (!acceptedRide) return
        setArriving(true)
        try {
            const { error } = await supabase
                .from('ride_requests')
                .update({ driver_arrived_at: new Date().toISOString() })
                .eq('id', acceptedRide.id)
            if (error) throw error
            notifyRideStatus(acceptedRide.id, 'arrived')
            setAcceptedRide((prev) => (prev ? { ...prev, driver_arrived_at: new Date().toISOString() } : prev))
        } catch (err: any) {
            toast.error('Erro ao confirmar chegada: ' + (err.message || 'tente novamente'))
        } finally {
            setArriving(false)
        }
    }

    const startRide = async () => {
        if (!acceptedRide) return
        setStarting(true)
        try {
            const { error } = await supabase
                .from('ride_requests')
                .update({ ride_started_at: new Date().toISOString() })
                .eq('id', acceptedRide.id)
            if (error) throw error
            notifyRideStatus(acceptedRide.id, 'started')
            setAcceptedRide((prev) => (prev ? { ...prev, ride_started_at: new Date().toISOString() } : prev))
        } catch (err: any) {
            toast.error('Erro ao iniciar corrida: ' + (err.message || 'tente novamente'))
        } finally {
            setStarting(false)
        }
    }

    const saveExtraTask = async () => {
        if (!acceptedRide) return
        const minutes = parseInt(extraTaskMinutesInput, 10)
        if (!minutes || minutes <= 0) {
            toast.error('Informe quantos minutos a tarefa levou')
            return
        }
        const fee = computeExtraTaskFee(minutes)
        setSavingExtraTask(true)
        try {
            const { error } = await supabase
                .from('ride_requests')
                .update({
                    extra_task_minutes: minutes,
                    extra_task_fee: fee,
                    extra_task_description: extraTaskDescriptionInput.trim() || null,
                })
                .eq('id', acceptedRide.id)
            if (error) throw error
            setAcceptedRide((prev) => (prev ? { ...prev, extra_task_minutes: minutes, extra_task_fee: fee, extra_task_description: extraTaskDescriptionInput.trim() || null } : prev))
            setShowExtraTaskForm(false)
            toast.success(`Tarefa extra registrada: R$ ${fee.toFixed(2)}`)
        } catch (err: any) {
            toast.error('Erro ao registrar tarefa extra: ' + (err.message || 'tente novamente'))
        } finally {
            setSavingExtraTask(false)
        }
    }

    const removeExtraTask = async () => {
        if (!acceptedRide) return
        setSavingExtraTask(true)
        try {
            const { error } = await supabase
                .from('ride_requests')
                .update({ extra_task_minutes: null, extra_task_fee: null, extra_task_description: null })
                .eq('id', acceptedRide.id)
            if (error) throw error
            setAcceptedRide((prev) => (prev ? { ...prev, extra_task_minutes: null, extra_task_fee: null, extra_task_description: null } : prev))
            setExtraTaskMinutesInput('')
            setExtraTaskDescriptionInput('')
        } catch (err: any) {
            toast.error('Erro ao remover tarefa extra: ' + (err.message || 'tente novamente'))
        } finally {
            setSavingExtraTask(false)
        }
    }

    // Só deixa concluir com o motorista fisicamente perto do destino — evita
    // finalizar a corrida antes de realmente chegar lá.
    const FINISH_RADIUS_METERS = 100

    // Confirmação de chegada numa parada (1ª ou 2ª) — mesma trava por GPS de
    // "cheguei ao destino". Precisa disso feito antes de poder concluir a corrida.
    const arriveAtStop = async (stopNumber: 1 | 2) => {
        if (!acceptedRide) return
        const lat = stopNumber === 1 ? acceptedRide.stop1_lat : acceptedRide.stop2_lat
        const lng = stopNumber === 1 ? acceptedRide.stop1_lng : acceptedRide.stop2_lng
        if (lat == null || lng == null) return
        setArrivingStop(true)
        getNativeCurrentPosition(
            async (pos) => {
                const distanceMeters = haversineKm(
                    [pos.coords.longitude, pos.coords.latitude],
                    [lng as number, lat as number]
                ) * 1000
                if (distanceMeters > FINISH_RADIUS_METERS) {
                    toast.error(`Você está a ${Math.round(distanceMeters)} m da parada. Chegue a até ${FINISH_RADIUS_METERS} m pra confirmar.`)
                    setArrivingStop(false)
                    return
                }
                try {
                    const now = new Date().toISOString()
                    const field = stopNumber === 1 ? 'stop1_reached_at' : 'stop2_reached_at'
                    const { error } = await supabase
                        .from('ride_requests')
                        .update({ [field]: now })
                        .eq('id', acceptedRide.id)
                    if (error) throw error
                    setAcceptedRide((prev) => (prev ? { ...prev, [field]: now } : prev))
                    toast.success('Parada confirmada!')
                } catch (err: any) {
                    toast.error('Erro ao confirmar a parada: ' + (err.message || 'tente novamente'))
                } finally {
                    setArrivingStop(false)
                }
            },
            () => {
                toast.error('Não conseguimos confirmar sua localização. Ative o GPS pra confirmar a parada.')
                setArrivingStop(false)
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        )
    }

    const finishAcceptedRide = async () => {
        if (!acceptedRide) return
        if (!acceptedRide.ride_started_at) {
            toast.error('Inicie a corrida antes de concluir.')
            return
        }
        if (acceptedRide.stop1_lat != null && acceptedRide.stop1_lng != null && !acceptedRide.stop1_reached_at) {
            toast.error('Confirme a chegada na 1ª parada antes de concluir a corrida.')
            return
        }
        if (acceptedRide.stop2_lat != null && acceptedRide.stop2_lng != null && !acceptedRide.stop2_reached_at) {
            toast.error('Confirme a chegada na 2ª parada antes de concluir a corrida.')
            return
        }
        if (acceptedRide.destination_lat == null || acceptedRide.destination_lng == null) {
            toast.error('Não dá pra confirmar a chegada: esse pedido não tem coordenadas de destino.')
            return
        }
        setFinishing(true)
        getNativeCurrentPosition(
            async (pos) => {
                const distanceMeters = haversineKm(
                    [pos.coords.longitude, pos.coords.latitude],
                    [acceptedRide.destination_lng as number, acceptedRide.destination_lat as number]
                ) * 1000

                if (distanceMeters > FINISH_RADIUS_METERS) {
                    toast.error(`Você está a ${Math.round(distanceMeters)} m do destino. Chegue a até ${FINISH_RADIUS_METERS} m pra concluir.`)
                    setFinishing(false)
                    return
                }

                const { data: { user } } = await supabase.auth.getUser()
                if (!user) { setFinishing(false); return }

                try {
                    const { error } = await supabase
                        .from('ride_requests')
                        .update({ status: 'completed' })
                        .eq('id', acceptedRide.id)
                        .eq('driver_id', user.id)
                    if (error) throw error
                    toast.success('Corrida finalizada!')
                    playNotificationSound('completed')
                    notifyRideStatus(acceptedRide.id, 'completed')
                    lastAcceptedRideIdRef.current = null
                    setAcceptedRide(null)
                    setActiveTab('servicos')
                } catch (err: any) {
                    toast.error('Erro ao finalizar corrida: ' + (err.message || 'tente novamente'))
                } finally {
                    setFinishing(false)
                }
            },
            () => {
                toast.error('Não conseguimos confirmar sua localização. Ative o GPS pra concluir a corrida.')
                setFinishing(false)
            },
            { enableHighAccuracy: true, timeout: 10000 }
        )
    }

    const cancelAcceptedRide = async () => {
        if (!acceptedRide) return
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        setCancellingAccepted(true)
        try {
            const { error } = await supabase
                .from('ride_requests')
                .update({ status: 'cancelled', cancelled_by: 'driver' })
                .eq('id', acceptedRide.id)
                .eq('driver_id', user.id)
            if (error) throw error
            toast.success('Corrida cancelada.')
            notifyRideStatus(acceptedRide.id, 'cancelled')
            lastAcceptedRideIdRef.current = null
            setAcceptedRide(null)
            setActiveTab('servicos')
        } catch (err: any) {
            toast.error('Erro ao cancelar: ' + (err.message || 'tente novamente'))
        } finally {
            setCancellingAccepted(false)
        }
    }

    const handleActivateSync = useCallback(async () => {
        setActivatingSync(true)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return
            const { error } = await supabase.from('driver_pricing').update({ live_location_sync: true }).eq('driver_id', user.id)
            if (error) throw error
            setLiveLocationSync(true)
            setShowSyncPrompt(false)
        } catch (err: any) {
            toast.error('Erro ao ativar sincronização: ' + (err.message || 'tente novamente'))
        } finally {
            setActivatingSync(false)
        }
    }, [])

    const handleDeclineSync = useCallback(() => {
        setShowSyncPrompt(false)
        if (embedded) onLeave?.()
        else router.back()
    }, [router, embedded, onLeave])

    const locationButton = (

                        <button
                            onClick={() => setShowLocationDialog(true)}
                            disabled={isSavingLocation}
                            className="flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full bg-black/10 hover:bg-black/20 transition disabled:opacity-50"
                            style={{ color: colors.textPrimary }}
                        >
                            {liveLocationSync && <span className="live-pulse-dot" aria-hidden="true" />}
                            {isSavingLocation
                                ? 'Salvando...'
                                : liveLocationSync
                                    ? (liveLocationLabel ? formatAddress(liveLocationLabel) : 'Localizando...')
                                    : savedLocation
                                        ? formatAddress(savedLocation.address, savedLocation.addressNumber)
                                        : 'Definir local'
                            }
                        </button>
    )

    return (
        <div className={embedded ? '' : 'relative min-h-dvh'} style={embedded ? undefined : { background: colors.background }}>
            {!embedded && (
                <div className="fixed inset-0 z-0">
                    <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
                </div>
            )}

            <main className={embedded ? '' : 'relative z-10 min-h-dvh'}>
                {!embedded && (
                    <Header
                        title="Aceitar corrida"
                        showBack={true}
                        onBack={() => router.back()}
                        greeting={`Olá, ${profileLoading ? '...' : profileSlug ? `@${profileSlug}` : 'Visitante'}`}
                        avatarUrl={avatarUrl}
                        loading={profileLoading}
                        tabs={headerTabs}
                        locationElement={locationButton}
                    />
                )}

                <section className={embedded ? 'flex flex-col gap-3' : 'px-4 md:px-6 mt-4 pb-24 max-w-lg mx-auto'}>
                    {embedded && !loading && !showLogin && <div className="flex justify-end">{locationButton}</div>}

                    {!loading && showLogin && (
                        <LoginAndRegister onLoginSuccess={handleLoginSuccess} />
                    )}

                    {!loading && !showLogin && !!contextUserId && !plansLoading && !hasDriver && (
                        <div
                            className="rounded-2xl p-3.5 flex items-center gap-3"
                            style={{ background: colors.surface, border: `1px solid ${colors.border}`, boxShadow: colors.shadow }}
                        >
                            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: GRADIENT, color: '#fff' }}>
                                <Car size={18} />
                            </div>
                            <p className="flex-1 min-w-0 text-xs" style={{ color: colors.textSecondary }}>
                                Você pode ver as corridas. Pra se candidatar, assine o plano <strong style={{ color: colors.textPrimary }}>Motorista</strong> ou o <strong style={{ color: colors.textPrimary }}>Combo</strong>.
                            </p>
                            <button
                                onClick={() => router.push('/planos?plan=motorista')}
                                className="px-3.5 py-2 rounded-full font-black text-[11px] flex-shrink-0"
                                style={{ background: GRADIENT, color: '#fff' }}
                            >
                                Ver planos
                            </button>
                        </div>
                    )}

                    {!loading && !showLogin && (
                    <>
                    {hasDriver && <DriverDebtBanner userId={contextUserId} />}

                    {/* Por que pedimos a localização: a Tarifa iUser soma a distância até a partida */}
                    {activeTab === 'servicos' && gpsStatus !== 'granted' && (
                        <div
                            className="rounded-2xl p-3.5 flex items-start gap-3"
                            style={{ background: '#f9731612', border: '1px solid #f9731640' }}
                        >
                            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: GRADIENT, color: '#fff' }}>
                                {gpsStatus === 'asking' ? <Spinner size={18} color="#fff" /> : <LocateFixed size={18} />}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-black" style={{ color: colors.textPrimary }}>
                                    {gpsStatus === 'asking' ? 'Localizando você...' : 'Precisamos da sua localização'}
                                </p>
                                <p className="text-xs mt-0.5 leading-snug" style={{ color: colors.textSecondary }}>
                                    Usamos sua localização para ajustar o valor da <strong style={{ color: colors.textPrimary }}>Tarifa iUser</strong>: se você estiver longe do ponto de partida, somamos esse deslocamento ao valor para você não perder dinheiro rodando até o passageiro.
                                </p>
                                {gpsStatus === 'asking' && (
                                    <p className="text-[11px] mt-1" style={{ color: colors.textSecondary }}>Permita a localização quando o navegador perguntar.</p>
                                )}
                                {gpsStatus !== 'asking' && (
                                    <>
                                        <p className="text-[11px] mt-1" style={{ color: colors.textSecondary }}>
                                            {gpsStatus === 'denied'
                                                ? 'A localização está bloqueada. Libere nas configurações do navegador (ou do app) e toque abaixo.'
                                                : 'Não conseguimos obter sua localização agora.'}
                                        </p>
                                        <button
                                            onClick={requestGps}
                                            className="mt-2 px-4 py-2 rounded-full text-xs font-black"
                                            style={{ background: GRADIENT, color: '#fff' }}
                                        >
                                            Permitir localização
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                    {activeTab === 'servicos' && visibleRides.length === 0 && (
                        <div
                            className="rounded-2xl p-6 text-center"
                            style={{ background: colors.surface, border: `1px solid ${colors.border}`, boxShadow: colors.shadow }}
                        >
                            <p className="text-sm" style={{ color: colors.textSecondary }}>
                                Nenhuma corrida disponível no momento.
                            </p>
                        </div>
                    )}

                    {!loading && !showLogin && activeTab === 'servicos' && visibleRides.length > 0 && (
                        <div className="flex flex-col gap-3">
                            {visibleRides.map((ride) => {
                                const info = routeInfoById[ride.id]
                                // Tarifa iUser = tarifa da corrida + deslocamento até a partida (km × valor/km + minutos × valor/min do veículo)
                                const platformShape = PLATFORM_DEFAULT_PRICING_BY_VEHICLE[kindForRideType(ride.vehicle_type)]
                                const pickupKm = gpsStatus === 'granted'
                                    ? (info?.toPickupKm ?? (driverCoords && ride.origin_lat != null && ride.origin_lng != null
                                        ? haversineKm(driverCoords, [ride.origin_lng, ride.origin_lat])
                                        : null))
                                    : null
                                const pickupAmount = pickupKm != null ? computePickupFee(platformShape, pickupKm, info?.toPickupMin) : 0
                                const pickup = pickupKm != null
                                    ? { state: 'ready' as const, km: pickupKm, amount: pickupAmount }
                                    : { state: (gpsStatus === 'asking' ? 'waiting' : 'missing') as 'waiting' | 'missing' }
                                return (
                                    <div
                                        key={ride.id}
                                        id={`ride-card-${ride.id}`}
                                        className="rounded-2xl p-3.5 overflow-hidden relative transition-shadow duration-500"
                                        style={{ background: colors.surface, border: `1px solid ${highlightRideId === ride.id ? '#f97316' : colors.border}`, boxShadow: highlightRideId === ride.id ? '0 0 0 3px #f9731655' : colors.shadow }}
                                    >
                                        <RideOfferCard
                                            ride={ride}
                                            requester={{ name: ride.requesterName, slug: ride.requesterSlug, avatarUrl: ride.requesterAvatarUrl, rating: ride.requesterRating }}
                                            storeName={ride.storeName}
                                            platformPrice={ride.platformPrice + (pickup.state === 'ready' ? pickup.amount : 0)}
                                            pickup={pickup}
                                            customPrice={ride.customPrice}
                                            applying={applyingId === ride.id}
                                            onApply={(price) => applyToRide(ride, price)}
                                            toPickup={{ km: info?.toPickupKm ?? null, min: info?.toPickupMin ?? null, hasGps: driverCoords != null }}
                                            trip={{ km: info?.tripKm ?? ride.distance_km, min: info?.tripMin ?? ride.duration_min }}
                                            onSkip={() => skipRide(ride.id)}
                                            miniMap={ride.origin_lat != null && ride.origin_lng != null && ride.destination_lat != null && ride.destination_lng != null ? (
                                                <RideMiniMap
                                                    compact
                                                    originLat={ride.origin_lat}
                                                    originLng={ride.origin_lng}
                                                    destLat={ride.destination_lat}
                                                    destLng={ride.destination_lng}
                                                    stops={rideStopsOf(ride)}
                                                    driverLat={driverCoords ? driverCoords[1] : null}
                                                    driverLng={driverCoords ? driverCoords[0] : null}
                                                    onExpand={() => router.push(`/aceitar-corridas/mapa?ride=${ride.id}`)}
                                                    onInfo={(i) => setRouteInfoById((prev) => ({ ...prev, [ride.id]: i }))}
                                                />
                                            ) : null}
                                        />
                                    </div>
                                )
                            })}
                        </div>
                    )}

                    {!loading && !showLogin && activeTab === 'candidatos' && candidacies.length === 0 && (
                        <div
                            className="rounded-2xl p-6 text-center"
                            style={{ background: colors.surface, border: `1px solid ${colors.border}`, boxShadow: colors.shadow }}
                        >
                            <p className="text-sm" style={{ color: colors.textSecondary }}>
                                Você ainda não se candidatou a nenhuma corrida.
                            </p>
                        </div>
                    )}

                    {!loading && !showLogin && activeTab === 'candidatos' && candidacies.length > 0 && (
                        <div className="flex flex-col gap-3">
                            {candidacies.map((ride) => {
                                const isWithdrawing = withdrawingId === ride.applicationId
                                const info = routeInfoById[ride.id]
                                return (
                                    <div
                                        key={ride.applicationId}
                                        id={`ride-card-${ride.id}`}
                                        className="rounded-2xl p-3.5 overflow-hidden relative transition-shadow duration-500"
                                        style={{ background: colors.surface, border: `1px solid ${highlightRideId === ride.id ? '#f97316' : colors.border}`, boxShadow: highlightRideId === ride.id ? '0 0 0 3px #f9731655' : colors.shadow }}
                                    >
                                        <RideOfferCard
                                            ride={ride}
                                            requester={{ name: ride.requesterName, slug: ride.requesterSlug, avatarUrl: ride.requesterAvatarUrl, rating: ride.requesterRating }}
                                            storeName={null}
                                            toPickup={{ km: info?.toPickupKm ?? null, min: info?.toPickupMin ?? null, hasGps: driverCoords != null }}
                                            trip={{ km: info?.tripKm ?? ride.distance_km, min: info?.tripMin ?? ride.duration_min }}
                                            miniMap={ride.origin_lat != null && ride.origin_lng != null && ride.destination_lat != null && ride.destination_lng != null ? (
                                                <RideMiniMap
                                                    compact
                                                    transition={false}
                                                    originLat={ride.origin_lat}
                                                    originLng={ride.origin_lng}
                                                    destLat={ride.destination_lat}
                                                    destLng={ride.destination_lng}
                                                    stops={rideStopsOf(ride)}
                                                    driverLat={driverCoords ? driverCoords[1] : null}
                                                    driverLng={driverCoords ? driverCoords[0] : null}
                                                    onExpand={() => setMapDialogRideId(ride.id)}
                                                    onInfo={(i) => setRouteInfoById((prev) => ({ ...prev, [ride.id]: i }))}
                                                />
                                            ) : null}
                                            footer={(
                                                <div className="flex flex-col gap-2">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="text-[11px] font-black px-2 py-0.5 rounded-full" style={{ background: '#eab30815', color: '#eab308' }}>
                                                            Aguardando decisão
                                                        </span>
                                                        <span className="text-sm font-black" style={{ color: '#f97316' }}>
                                                            {ride.myProposedPrice != null ? `Sua proposta: R$ ${ride.myProposedPrice.toFixed(2).replace('.', ',')}` : 'Proposta enviada'}
                                                        </span>
                                                    </div>
                                                    <button
                                                        onClick={() => withdrawApplication(ride.applicationId)}
                                                        disabled={isWithdrawing}
                                                        className="w-full py-2 rounded-full text-xs font-bold transition-all disabled:opacity-70 flex items-center justify-center gap-2"
                                                        style={{ background: `${colors.border}30`, color: colors.textSecondary, border: `1px solid ${colors.border}` }}
                                                    >
                                                        {isWithdrawing ? <Spinner size={14} /> : <>Sair da candidatura</>}
                                                    </button>
                                                </div>
                                            )}
                                        />
                                    </div>
                                )
                            })}
                        </div>
                    )}

                    {!loading && !showLogin && activeTab === 'aceita' && acceptedRide && (
                        <div
                            className="rounded-2xl p-4 overflow-hidden relative"
                            style={{ background: colors.surface, border: `1px solid ${colors.border}`, boxShadow: colors.shadow }}
                        >
                            <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                                <span
                                    className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full"
                                    style={{ background: '#22c55e15', color: '#22c55e' }}
                                >
                                    <CheckCircle2 size={11} />
                                    {acceptedRide.ride_started_at ? 'Em andamento' : acceptedRide.driver_arrived_at ? 'Chegou' : acceptedRide.driver_en_route ? 'A caminho' : 'Aceita'}
                                </span>
                                <button
                                    onClick={() => handleShareLink({
                                        title: 'Acompanhe esta corrida no iUser',
                                        text: 'Acompanhe o status desta corrida em tempo real.',
                                        url: `${window.location.origin}/acompanhar-corrida/${acceptedRide.id}`,
                                    })}
                                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold flex-shrink-0"
                                    style={{ background: `${colors.border}30`, color: colors.textPrimary, border: `1px solid ${colors.border}` }}
                                >
                                    <Share2 size={11} />
                                    Compartilhar
                                </button>
                            </div>

                            <div className="flex items-center gap-2 mb-2">
                                {acceptedRide.requesterAvatarUrl ? (
                                    <img src={acceptedRide.requesterAvatarUrl} className="w-8 h-8 rounded-full object-cover flex-shrink-0" alt="" />
                                ) : (
                                    <span className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-black" style={{ background: GRADIENT, color: '#fff' }}>
                                        {(acceptedRide.requesterName || acceptedRide.requesterSlug || '?').charAt(0).toUpperCase()}
                                    </span>
                                )}
                                <div className="min-w-0">
                                    <p className="text-xs font-black truncate" style={{ color: colors.textPrimary }}>
                                        {acceptedRide.requesterName || (acceptedRide.requesterSlug ? `@${acceptedRide.requesterSlug}` : 'Passageiro')}
                                    </p>
                                    {acceptedRide.requesterRating.count > 0 && (
                                        <span className="flex items-center gap-1 text-[10px]" style={{ color: colors.textSecondary }}>
                                            <Star size={10} className="fill-current" style={{ color: '#eab308' }} />
                                            {acceptedRide.requesterRating.avg.toFixed(2)} ({acceptedRide.requesterRating.count})
                                        </span>
                                    )}
                                </div>
                            </div>

                            {acceptedRide.origin_lat != null && acceptedRide.origin_lng != null && acceptedRide.destination_lat != null && acceptedRide.destination_lng != null && (
                                <RideMiniMap
                                    originLat={acceptedRide.origin_lat}
                                    originLng={acceptedRide.origin_lng}
                                    destLat={acceptedRide.destination_lat}
                                    destLng={acceptedRide.destination_lng}
                                    stops={rideStopsOf(acceptedRide)}
                                    driverLat={driverCoords ? driverCoords[1] : null}
                                    driverLng={driverCoords ? driverCoords[0] : null}
                                    onExpand={() => router.push('/aceitar-corridas/mapa')}
                                />
                            )}

                            <div className="flex items-start gap-2 text-xs mb-1" style={{ color: colors.textSecondary }}>
                                <MapPin size={12} className="flex-shrink-0 mt-0.5" />
                                <span>{shortAddress(acceptedRide.origin_address)}{acceptedRide.stop1_address ? ` → ${shortAddress(acceptedRide.stop1_address)}` : ''}{acceptedRide.stop2_address ? ` → ${shortAddress(acceptedRide.stop2_address)}` : ''} → {shortAddress(acceptedRide.destination_address)}</span>
                            </div>
                            {(acceptedRide.origin_complement || acceptedRide.stop1_complement || acceptedRide.stop2_complement || acceptedRide.destination_complement) && (
                                <div className="flex flex-col gap-0.5 text-[11px] mb-2" style={{ color: colors.textSecondary }}>
                                    {acceptedRide.origin_complement && (
                                        <span>📍 Origem: {acceptedRide.origin_complement}</span>
                                    )}
                                    {acceptedRide.stop1_complement && (
                                        <span>🚩 Parada 1: {acceptedRide.stop1_complement}</span>
                                    )}
                                    {acceptedRide.stop2_complement && (
                                        <span>🚩 Parada 2: {acceptedRide.stop2_complement}</span>
                                    )}
                                    {acceptedRide.destination_complement && (
                                        <span>📍 Destino: {acceptedRide.destination_complement}</span>
                                    )}
                                </div>
                            )}

                            <div className="flex items-center gap-2 text-[11px] mb-2" style={{ color: colors.textSecondary }}>
                                {acceptedRide.distance_km != null ? (
                                    <span>{acceptedRide.distance_km.toFixed(1)} km · {Math.round(acceptedRide.duration_min || 0)} min</span>
                                ) : (
                                    <span>Distância não calculada</span>
                                )}
                            </div>

                            <p className="text-sm font-black mb-1" style={{ color: '#f97316' }}>
                                {acceptedRide.proposedPrice != null ? `Valor combinado: R$ ${acceptedRide.proposedPrice.toFixed(2)}` : 'Valor não definido'}
                            </p>

                            {acceptedRide.extra_task_fee != null ? (
                                <div className="flex items-center justify-between gap-2 flex-wrap mb-3 px-3 py-2 rounded-xl" style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}` }}>
                                    <span className="text-xs" style={{ color: colors.textSecondary }}>
                                        + Tarefa extra ({acceptedRide.extra_task_minutes} min{acceptedRide.extra_task_description ? ` — ${acceptedRide.extra_task_description}` : ''}): <strong style={{ color: colors.textPrimary }}>R$ {acceptedRide.extra_task_fee.toFixed(2)}</strong>
                                    </span>
                                    <button onClick={removeExtraTask} disabled={savingExtraTask} className="text-[10px] font-bold" style={{ color: '#ef4444' }}>
                                        Remover
                                    </button>
                                </div>
                            ) : showExtraTaskForm ? (
                                <div className="mb-3 px-3 py-2.5 rounded-xl" style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}` }}>
                                    <span className="text-xs font-bold block mb-1.5" style={{ color: colors.textPrimary }}>Registrar tarefa extra</span>
                                    <p className="text-[10px] mb-2" style={{ color: colors.textSecondary }}>
                                        {EXTRA_TASK_FEE_TIERS.map((t) => `${t.label}: R$ ${t.fee.toFixed(2)}`).join(' · ')}
                                    </p>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        value={extraTaskMinutesInput}
                                        onChange={(e) => setExtraTaskMinutesInput(e.target.value.replace(/[^0-9]/g, ''))}
                                        placeholder="Quantos minutos levou?"
                                        className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none mb-2"
                                        style={{ background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                                    />
                                    <input
                                        type="text"
                                        value={extraTaskDescriptionInput}
                                        onChange={(e) => setExtraTaskDescriptionInput(e.target.value)}
                                        placeholder="O que foi? (opcional) Ex: subiu no apartamento"
                                        className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none mb-2"
                                        style={{ background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                                    />
                                    {extraTaskMinutesInput && Number(extraTaskMinutesInput) > 0 && (
                                        <p className="text-xs font-black mb-2" style={{ color: '#f97316' }}>
                                            Valor: R$ {computeExtraTaskFee(Number(extraTaskMinutesInput)).toFixed(2)}
                                        </p>
                                    )}
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setShowExtraTaskForm(false)}
                                            className="flex-1 py-2 rounded-lg text-xs font-bold"
                                            style={{ background: colors.surface, color: colors.textSecondary, border: `1px solid ${colors.border}` }}
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            onClick={saveExtraTask}
                                            disabled={savingExtraTask}
                                            className="flex-1 py-2 rounded-lg text-xs font-bold disabled:opacity-60"
                                            style={{ background: GRADIENT, color: '#fff' }}
                                        >
                                            {savingExtraTask ? <Spinner size={12} /> : 'Salvar'}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setShowExtraTaskForm(true)}
                                    className="text-[11px] font-bold mb-3 text-left"
                                    style={{ color: colors.accent }}
                                >
                                    + Registrar tarefa extra (subir, esperar, carregar)
                                </button>
                            )}

                            {!acceptedRide.driver_en_route && (
                                <button
                                    onClick={departToPickup}
                                    disabled={departing}
                                    className="w-full py-2.5 rounded-full text-xs font-black uppercase tracking-wider transition-all disabled:opacity-70 flex items-center justify-center gap-2"
                                    style={{ background: GRADIENT, color: '#fff' }}
                                >
                                    {departing ? <Spinner size={14} /> : <><Navigation size={14} /> Ir para o ponto de partida</>}
                                </button>
                            )}

                            {acceptedRide.driver_en_route && !acceptedRide.driver_arrived_at && (
                                <button
                                    onClick={arriveAtPickup}
                                    disabled={arriving}
                                    className="w-full py-2.5 rounded-full text-xs font-black uppercase tracking-wider transition-all disabled:opacity-70 flex items-center justify-center gap-2"
                                    style={{ background: GRADIENT, color: '#fff' }}
                                >
                                    {arriving ? <Spinner size={14} /> : <><MapPin size={14} /> Cheguei ao ponto de partida</>}
                                </button>
                            )}

                            {acceptedRide.driver_arrived_at && !acceptedRide.ride_started_at && (
                                <button
                                    onClick={startRide}
                                    disabled={starting}
                                    className="w-full py-2.5 rounded-full text-xs font-black uppercase tracking-wider transition-all disabled:opacity-70 flex items-center justify-center gap-2"
                                    style={{ background: GRADIENT, color: '#fff' }}
                                >
                                    {starting ? <Spinner size={14} /> : <><Navigation size={14} /> Iniciar corrida</>}
                                </button>
                            )}

                            {(() => {
                                const hasStop1 = acceptedRide.stop1_lat != null && acceptedRide.stop1_lng != null
                                const stop1Done = !hasStop1 || !!acceptedRide.stop1_reached_at
                                const hasStop2 = acceptedRide.stop2_lat != null && acceptedRide.stop2_lng != null
                                const stop2Done = !hasStop2 || !!acceptedRide.stop2_reached_at
                                return (
                                    <>
                                        {acceptedRide.ride_started_at && hasStop1 && !stop1Done && (
                                            <button
                                                onClick={() => arriveAtStop(1)}
                                                disabled={arrivingStop}
                                                className="w-full mt-2 py-2.5 rounded-full text-xs font-black uppercase tracking-wider transition-all disabled:opacity-70 flex items-center justify-center gap-2"
                                                style={{ background: '#eab308', color: '#fff' }}
                                            >
                                                {arrivingStop ? <Spinner size={14} /> : <><MapPin size={14} /> Cheguei na 1ª parada</>}
                                            </button>
                                        )}

                                        {acceptedRide.ride_started_at && stop1Done && hasStop2 && !stop2Done && (
                                            <button
                                                onClick={() => arriveAtStop(2)}
                                                disabled={arrivingStop}
                                                className="w-full mt-2 py-2.5 rounded-full text-xs font-black uppercase tracking-wider transition-all disabled:opacity-70 flex items-center justify-center gap-2"
                                                style={{ background: '#eab308', color: '#fff' }}
                                            >
                                                {arrivingStop ? <Spinner size={14} /> : <><MapPin size={14} /> Cheguei na 2ª parada</>}
                                            </button>
                                        )}

                                        {acceptedRide.ride_started_at && stop1Done && stop2Done && (
                                            <button
                                                onClick={finishAcceptedRide}
                                                disabled={finishing}
                                                className="w-full mt-2 py-2.5 rounded-full text-xs font-black uppercase tracking-wider transition-all disabled:opacity-70 flex items-center justify-center gap-2"
                                                style={{ background: '#22c55e', color: '#fff' }}
                                            >
                                                {finishing ? <Spinner size={14} /> : <><Flag size={14} /> Cheguei ao destino</>}
                                            </button>
                                        )}
                                    </>
                                )
                            })()}

                            <button
                                onClick={cancelAcceptedRide}
                                disabled={cancellingAccepted}
                                className="w-full mt-2 py-2 rounded-full text-[11px] font-bold disabled:opacity-60 flex items-center justify-center gap-1.5"
                                style={{ color: '#ef4444', border: '1px solid #ef444440' }}
                            >
                                {cancellingAccepted ? <Spinner size={12} /> : <><Ban size={12} /> Cancelar corrida</>}
                            </button>
                        </div>
                    )}

                    {!loading && !showLogin && activeTab === 'aceita' && acceptedRide && (
                        <div className="mt-3">
                            <RideChat rideId={acceptedRide.id} quickReplies={DRIVER_CHAT_QUICK_REPLIES} />
                        </div>
                    )}
                    </>
                    )}
                </section>

                {showLocationDialog && (
                    <LocationPicker
                        initialLocation={savedLocation ? {
                            lat: savedLocation.lat,
                            lng: savedLocation.lng,
                            address: savedLocation.address,
                            addressNumber: savedLocation.addressNumber || '',
                            addressComplement: savedLocation.addressComplement || '',
                        } : null}
                        onSave={handleLocationSave}
                        onClose={() => setShowLocationDialog(false)}
                    />
                )}
            </main>

            {mapDialogRideId && (() => {
                const ride = rides.find((r) => r.id === mapDialogRideId) || candidacies.find((c) => c.id === mapDialogRideId) || (acceptedRide?.id === mapDialogRideId ? acceptedRide : undefined)
                if (!ride || ride.origin_lat == null || ride.origin_lng == null || ride.destination_lat == null || ride.destination_lng == null) {
                    return null
                }
                return (
                    <RideMapDialog
                        originLat={ride.origin_lat}
                        originLng={ride.origin_lng}
                        destLat={ride.destination_lat}
                        destLng={ride.destination_lng}
                        stops={rideStopsOf(ride)}
                        driverLat={driverCoords ? driverCoords[1] : null}
                        driverLng={driverCoords ? driverCoords[0] : null}
                        vehicleKind={vehicleIconForRide(ride.vehicle_type, myVehicleKinds)}
                        onClose={() => setMapDialogRideId(null)}
                    />
                )
            })()}

            {showVehicleDialog && (
                <VehicleRequiredDialog
                    onClose={() => setShowVehicleDialog(false)}
                    onRegister={() => {
                        setShowVehicleDialog(false)
                        if (onRegisterVehicle) onRegisterVehicle()
                        else router.push('/painel-motorista?aba=veiculo&veiculo=carro')
                    }}
                />
            )}

            {showSyncPrompt && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div
                        className="w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-5"
                        style={{ background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#22c55e20' }}>
                                <AlertCircle size={20} style={{ color: '#22c55e' }} />
                            </div>
                            <h2 className="text-lg font-black" style={{ color: colors.textPrimary }}>
                                Ativar sincronização
                            </h2>
                        </div>

                        <p className="text-xs font-medium" style={{ color: colors.textSecondary }}>
                            Para aceitar corridas você precisa ativar a <strong>sincronização para motorista</strong> — é ela que mostra sua localização em tempo real pros passageiros. Ativar agora?
                        </p>

                        <div className="flex gap-2 pt-2">
                            <button
                                onClick={handleDeclineSync}
                                disabled={activatingSync}
                                className="flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all hover:scale-[1.02] disabled:opacity-60"
                                style={{ background: `${colors.surface}88`, color: colors.textPrimary, border: `1px solid ${colors.border}` }}
                            >
                                Não
                            </button>
                            <button
                                onClick={handleActivateSync}
                                disabled={activatingSync}
                                className="flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all hover:scale-[1.02] disabled:opacity-60 flex items-center justify-center gap-2"
                                style={{ background: '#22c55e', color: '#ffffff', boxShadow: '0 4px 14px rgba(34, 197, 94, 0.4)' }}
                            >
                                {activatingSync ? <Spinner size={14} color="#ffffff" /> : 'Sim'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style jsx>{`
                .live-pulse-dot {
                    display: inline-block;
                    width: 8px;
                    height: 8px;
                    border-radius: 9999px;
                    background: #22c55e;
                    animation: livePulseDot 1.4s ease-in-out infinite;
                }
                @keyframes livePulseDot {
                    0%, 100% { transform: scale(0.7); opacity: 0.6; }
                    50% { transform: scale(1.2); opacity: 1; }
                }
            `}</style>
        </div>
    )
}
