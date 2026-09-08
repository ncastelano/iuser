// app/(main)/aceitar-corridas/page.tsx
'use client'

import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useProfile } from '@/app/contexts/ProfileContext'
import { useTheme } from '@/app/theme'
import Header, { type Tab } from '@/app/Header'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import LoginAndRegister from '../LoginAndRegister'
import LocationPicker from '../LocationPicker'
import { toast } from 'sonner'
import { MapPin, Star, Pencil, X, Package, Users, CalendarClock, PawPrint, Car, CheckCircle2, Navigation, Ban, Flag } from 'lucide-react'
import { Spinner } from '@/components/Spinner'
import { shortAddress } from '@/lib/serviceBoard'
import { getAvatarUrl } from '@/lib/avatar'
import { computeSuggestedPrice, getEffectivePricing, DriverPricing } from '@/lib/driverPricing'
import { getProfileRideRatingsBatch, ProfileRideRating } from '@/lib/rideReviews'
import { VehicleType } from '@/lib/rideVehicle'
import { buildRideSpecRows } from '@/lib/rideSpecs'
import { getDriverCancelQuota, describeDriverCancelQuota } from '@/lib/rideCancellation'
import { haversineKm } from '@/lib/mapboxRoute'
import RideMiniMap from './RideMiniMap'
import RideMapDialog from './RideMapDialog'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'
const REFRESH_INTERVAL_MS = 15000

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
    notes: string | null
    passenger_count: number
    vehicle_type: VehicleType
    object_description: string | null
    object_is_sensitive: boolean
    pet_description: string | null
    has_child: boolean
    children_count: number | null
    child_age: string | null
    child_needs_car_seat: boolean | null
    has_shopping: boolean
    bag_count: number | null
    has_extra_object: boolean
    extra_object_description: string | null
    has_pet: boolean
    has_special_needs: boolean
    special_needs_description: string | null
    distance_km: number | null
    duration_min: number | null
    scheduled_for: string | null
    created_at: string
    origin_lat: number | null
    origin_lng: number | null
    destination_lat: number | null
    destination_lng: number | null
    applicant_count: number
}

const MAX_CANDIDATES = 5

interface RideCardData extends RideRow {
    requesterName: string | null
    requesterSlug: string | null
    requesterAvatarUrl: string | undefined
    requesterRating: ProfileRideRating
    suggestedPrice: number
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
    origin_address: string
    destination_address: string
    origin_lat: number | null
    origin_lng: number | null
    destination_lat: number | null
    destination_lng: number | null
    distance_km: number | null
    duration_min: number | null
    driver_en_route: boolean
    requesterName: string | null
    requesterSlug: string | null
    requesterAvatarUrl: string | undefined
    requesterRating: ProfileRideRating
    proposedPrice: number | null
}

export default function AceitarCorridasPage() {
    const router = useRouter()
    const { avatarUrl, bgMode, customBgUrl, profileSlug, loading: profileLoading } = useProfile()
    const { colors } = useTheme()

    const [loading, setLoading] = useState(true)
    const [showLogin, setShowLogin] = useState(false)
    const [checkingPricing, setCheckingPricing] = useState(false)
    const [activeTab, setActiveTab] = useState<'servicos' | 'candidatos' | 'aceita'>('servicos')
    const [rides, setRides] = useState<RideCardData[]>([])
    const [myPricing, setMyPricing] = useState<DriverPricing | null>(null)
    const [candidacies, setCandidacies] = useState<CandidacyCardData[]>([])
    const [acceptedRide, setAcceptedRide] = useState<AcceptedRideDetail | null>(null)
    const [departing, setDeparting] = useState(false)
    const [finishing, setFinishing] = useState(false)
    const [cancellingAccepted, setCancellingAccepted] = useState(false)
    const lastAcceptedRideIdRef = useRef<string | null>(null)
    const [withdrawingId, setWithdrawingId] = useState<string | null>(null)
    const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set())
    const [applyingId, setApplyingId] = useState<string | null>(null)
    const [customPriceFor, setCustomPriceFor] = useState<string | null>(null)
    const [customPriceValue, setCustomPriceValue] = useState('')
    const [driverCoords, setDriverCoords] = useState<[number, number] | null>(null)
    const [liveLocationSync, setLiveLocationSync] = useState(false)
    const [mapDialogRideId, setMapDialogRideId] = useState<string | null>(null)

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
        if (!liveLocationSync || !navigator.geolocation) return

        const watchId = navigator.geolocation.watchPosition(
            (pos) => setDriverCoords([pos.coords.longitude, pos.coords.latitude]),
            () => { /* sem permissão: mapa mostra só o trajeto partida → chegada */ },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
        )

        return () => navigator.geolocation.clearWatch(watchId)
    }, [liveLocationSync])

    const load = useCallback(async () => {
        const { data: { user } } = await supabase.auth.getUser()
        userIdRef.current = user?.id ?? null
        if (!user) {
            setShowLogin(true)
            setLoading(false)
            return
        }
        setShowLogin(false)

        setCheckingPricing(true)
        const [{ data: pricing }, { data: profile }] = await Promise.all([
            supabase
                .from('driver_pricing')
                .select('pricing_mode, base_distance_km, base_fee, price_per_km_after_base')
                .eq('driver_id', user.id)
                .maybeSingle(),
            supabase
                .from('profiles')
                .select('address, address_number, address_complement, store_lat, store_lng')
                .eq('id', user.id)
                .maybeSingle(),
        ])
        setCheckingPricing(false)

        if (!pricing) {
            router.replace('/painel-motorista?next=/aceitar-corridas')
            return
        }

        // Consulta separada e best-effort: se a coluna ainda não existir (migração
        // pendente), isso não pode derrubar a checagem de tarifa acima.
        supabase
            .from('driver_pricing')
            .select('live_location_sync')
            .eq('driver_id', user.id)
            .maybeSingle()
            .then(({ data }) => {
                const syncOn = !!data?.live_location_sync
                setLiveLocationSync(syncOn)
                // Enquanto a sincronização ao vivo não está ligada, a posição
                // exibida é sempre a localização definida em "Definir local"
                // desta conta — nunca a de outra conta nem um GPS "grudado".
                if (!syncOn) {
                    setDriverCoords(
                        profile?.store_lat != null && profile?.store_lng != null
                            ? [profile.store_lng, profile.store_lat]
                            : null
                    )
                }
            })

        setSavedLocation(
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

        const { data: myApplicationRows } = await supabase
            .from('ride_applications')
            .select('id, ride_request_id, proposed_price')
            .eq('applicant_id', user.id)
            .eq('status', 'pending')
        const myApplications = myApplicationRows || []
        const appliedIds = new Set(myApplications.map((a) => a.ride_request_id))

        const { data: openRides } = await supabase
            .from('ride_requests')
            .select('id, requester_id, ride_type, origin_address, destination_address, notes, passenger_count, vehicle_type, object_description, object_is_sensitive, pet_description, has_child, children_count, child_age, child_needs_car_seat, has_shopping, bag_count, has_extra_object, extra_object_description, has_pet, has_special_needs, special_needs_description, distance_km, duration_min, scheduled_for, created_at, origin_lat, origin_lng, destination_lat, destination_lng')
            .eq('status', 'pending')
            .neq('requester_id', user.id)
            .order('scheduled_for', { ascending: true, nullsFirst: true })
            .order('created_at', { ascending: false })

        const candidateRides = (openRides || []).filter((r) => !appliedIds.has(r.id))

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
                .select('id, requester_id, ride_type, origin_address, destination_address, notes, passenger_count, vehicle_type, object_description, object_is_sensitive, pet_description, has_child, children_count, child_age, child_needs_car_seat, has_shopping, bag_count, has_extra_object, extra_object_description, has_pet, has_special_needs, special_needs_description, distance_km, duration_min, scheduled_for, created_at, origin_lat, origin_lng, destination_lat, destination_lng')
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

        const pricingShape = getEffectivePricing(pricing)
        setMyPricing(pricingShape)

        const cards: RideCardData[] = openList.map((r) => {
            const p = profilesById.get(r.requester_id)
            const hasDistance = r.distance_km != null
            const suggestedPrice = hasDistance
                ? computeSuggestedPrice(r.distance_km!, pricingShape)
                : pricingShape.baseFee
            return {
                ...r,
                requesterName: p?.name || null,
                requesterSlug: p?.profileSlug || null,
                requesterAvatarUrl: getAvatarUrl(supabase, p?.avatar_url),
                requesterRating: ratingsMap.get(r.requester_id) || { avg: 0, count: 0 },
                suggestedPrice,
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

        setRides(cards)
        setCandidacies(candidacyCards)

        // Corrida aceita, se houver — o motorista tem no máximo uma por vez,
        // já que o passageiro só pode ter um pedido ativo (ver migração
        // ride_requests_one_active_per_requester), e o driver_id só é
        // definido no momento em que o pedido dele vira "accepted".
        const { data: acceptedRow } = await supabase
            .from('ride_requests')
            .select('id, requester_id, origin_address, destination_address, origin_lat, origin_lng, destination_lat, destination_lng, distance_km, duration_min, driver_en_route')
            .eq('driver_id', user.id)
            .eq('status', 'accepted')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

        let acceptedDetail: AcceptedRideDetail | null = null
        if (acceptedRow) {
            const [{ data: reqProfile }, { data: acceptedApp }, requesterRatings] = await Promise.all([
                supabase.from('profiles').select('name, profileSlug, avatar_url').eq('id', acceptedRow.requester_id).maybeSingle(),
                supabase.from('ride_applications').select('proposed_price').eq('ride_request_id', acceptedRow.id).eq('applicant_id', user.id).eq('status', 'accepted').maybeSingle(),
                getProfileRideRatingsBatch(supabase, [acceptedRow.requester_id]),
            ])
            acceptedDetail = {
                id: acceptedRow.id,
                origin_address: acceptedRow.origin_address,
                destination_address: acceptedRow.destination_address,
                origin_lat: acceptedRow.origin_lat,
                origin_lng: acceptedRow.origin_lng,
                destination_lat: acceptedRow.destination_lat,
                destination_lng: acceptedRow.destination_lng,
                distance_km: acceptedRow.distance_km,
                duration_min: acceptedRow.duration_min,
                driver_en_route: acceptedRow.driver_en_route,
                requesterName: reqProfile?.name || null,
                requesterSlug: reqProfile?.profileSlug || null,
                requesterAvatarUrl: getAvatarUrl(supabase, reqProfile?.avatar_url),
                requesterRating: requesterRatings.get(acceptedRow.requester_id) || { avg: 0, count: 0 },
                proposedPrice: acceptedApp?.proposed_price ?? null,
            }
        }

        // Assim que uma corrida vira aceita, o layout muda pra essa aba
        // automaticamente; quando ela sai de aceita (cancelada/concluída),
        // volta pra "Corridas em abertos" se ainda estava nela.
        if (acceptedDetail && lastAcceptedRideIdRef.current !== acceptedDetail.id) {
            lastAcceptedRideIdRef.current = acceptedDetail.id
            setActiveTab('aceita')
        } else if (!acceptedDetail && lastAcceptedRideIdRef.current != null) {
            lastAcceptedRideIdRef.current = null
            setActiveTab((prev) => (prev === 'aceita' ? 'servicos' : prev))
        }
        setAcceptedRide(acceptedDetail)

        setLoading(false)
    }, [router])

    useEffect(() => {
        load()
    }, [load])

    useEffect(() => {
        const poll = setInterval(load, REFRESH_INTERVAL_MS)
        return () => clearInterval(poll)
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
                label: 'Corridas em abertos',
                icon: MapPin,
                onClick: () => setActiveTab('servicos'),
                isActive: activeTab === 'servicos',
                badge: rides.length > 0 ? { count: rides.length } : null,
            },
            {
                id: 'candidatos',
                label: 'Me candidatei',
                icon: Users,
                onClick: () => setActiveTab('candidatos'),
                isActive: activeTab === 'candidatos',
                badge: candidacies.length > 0 ? { count: candidacies.length } : null,
            },
        )

        return tabs
    }, [activeTab, rides.length, candidacies.length, acceptedRide])

    const applyToRide = async (ride: RideCardData, price: number) => {
        if (price <= 0) {
            toast.error('Informe um valor válido')
            return
        }
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        setApplyingId(ride.id)
        try {
            const { error } = await supabase.from('ride_applications').insert({
                ride_request_id: ride.id,
                applicant_id: user.id,
                proposed_price: price,
            })
            if (error) throw error
            toast.success('Candidatura enviada!')
            setCustomPriceFor(null)
            load()
        } catch (err: any) {
            if (err.code === '42501' || err.code === 'PGRST301') {
                toast.error('Essa corrida já atingiu o limite de candidatos.')
                setRides((prev) => prev.filter((r) => r.id !== ride.id))
            } else {
                toast.error('Erro ao se candidatar: ' + (err.message || 'tente novamente'))
            }
        } finally {
            setApplyingId(null)
        }
    }

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
            setAcceptedRide((prev) => (prev ? { ...prev, driver_en_route: true } : prev))
        } catch (err: any) {
            toast.error('Erro ao confirmar saída: ' + (err.message || 'tente novamente'))
        } finally {
            setDeparting(false)
        }
    }

    // Só deixa concluir com o motorista fisicamente perto do destino — evita
    // finalizar a corrida antes de realmente chegar lá.
    const FINISH_RADIUS_METERS = 100

    const finishAcceptedRide = async () => {
        if (!acceptedRide) return
        if (acceptedRide.destination_lat == null || acceptedRide.destination_lng == null) {
            toast.error('Não dá pra confirmar a chegada: esse pedido não tem coordenadas de destino.')
            return
        }
        if (!navigator.geolocation) {
            toast.error('Geolocalização não disponível neste dispositivo.')
            return
        }

        setFinishing(true)
        navigator.geolocation.getCurrentPosition(
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
            const quota = await getDriverCancelQuota(supabase, user.id)
            if (!quota.allowed) {
                toast.error(describeDriverCancelQuota(quota))
                return
            }
            const { error } = await supabase
                .from('ride_requests')
                .update({ status: 'cancelled', cancelled_by: 'driver' })
                .eq('id', acceptedRide.id)
                .eq('driver_id', user.id)
            if (error) throw error
            toast.success('Corrida cancelada.')
            lastAcceptedRideIdRef.current = null
            setAcceptedRide(null)
            setActiveTab('servicos')
        } catch (err: any) {
            toast.error('Erro ao cancelar: ' + (err.message || 'tente novamente'))
        } finally {
            setCancellingAccepted(false)
        }
    }

    return (
        <div className="relative min-h-dvh" style={{ background: colors.background }}>
            <div className="fixed inset-0 z-0">
                <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
            </div>

            <main className="relative z-10 min-h-dvh">
                <Header
                    title="Aceitar corrida"
                    showBack={true}
                    onBack={() => router.back()}
                    greeting={`Olá, ${profileLoading ? '...' : profileSlug ? `@${profileSlug}` : 'Visitante'}`}
                    avatarUrl={avatarUrl}
                    loading={profileLoading}
                    tabs={headerTabs}
                    locationElement={
                        <button
                            onClick={() => setShowLocationDialog(true)}
                            disabled={isSavingLocation}
                            className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-black/10 hover:bg-black/20 transition disabled:opacity-50"
                            style={{ color: liveLocationSync ? '#f97316' : colors.textPrimary }}
                        >
                            {liveLocationSync ? <Car size={14} /> : null}
                            {isSavingLocation
                                ? 'Salvando...'
                                : savedLocation
                                    ? formatAddress(savedLocation.address, savedLocation.addressNumber)
                                    : 'Definir local'
                            }
                        </button>
                    }
                />

                <section className="px-4 md:px-6 mt-4 pb-24 max-w-lg mx-auto">
                    {(loading || checkingPricing) && (
                        <div className="flex justify-center py-10">
                            <Spinner size={24} color={colors.textSecondary} />
                        </div>
                    )}

                    {!loading && showLogin && (
                        <LoginAndRegister onLoginSuccess={handleLoginSuccess} />
                    )}

                    {!loading && !showLogin && activeTab === 'servicos' && visibleRides.length === 0 && (
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
                                const isApplying = applyingId === ride.id
                                const isEditingPrice = customPriceFor === ride.id

                                return (
                                    <div
                                        key={ride.id}
                                        className="rounded-2xl p-4 overflow-hidden relative"
                                        style={{ background: colors.surface, border: `1px solid ${colors.border}`, boxShadow: colors.shadow }}
                                    >
                                        <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                {buildRideSpecRows(ride).map((spec, i) => (
                                                    <span
                                                        key={i}
                                                        className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full"
                                                        style={{ background: `${colors.accent}15`, color: colors.accent }}
                                                        title={`${spec.label}: ${spec.value}`}
                                                    >
                                                        {spec.label}: {spec.value}
                                                    </span>
                                                ))}
                                            </div>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                {ride.applicant_count > 0 && (
                                                    <span className="text-[9px] font-bold" style={{ color: colors.textSecondary }}>
                                                        {ride.applicant_count}/{MAX_CANDIDATES} candidatos
                                                    </span>
                                                )}
                                                {ride.scheduled_for ? (
                                                    <span className="flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full" style={{ background: '#8b5cf615', color: '#8b5cf6' }}>
                                                        <CalendarClock size={11} />
                                                        {formatScheduledFor(ride.scheduled_for)}
                                                    </span>
                                                ) : (
                                                    <span className="text-[10px] font-bold" style={{ color: colors.textSecondary }}>
                                                        {relativeTime(ride.created_at)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 mb-2">
                                            {ride.requesterAvatarUrl ? (
                                                <img src={ride.requesterAvatarUrl} className="w-8 h-8 rounded-full object-cover flex-shrink-0" alt="" />
                                            ) : (
                                                <span className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: GRADIENT }}>
                                                    <Users size={14} color="#fff" />
                                                </span>
                                            )}
                                            <div className="min-w-0">
                                                <p className="text-xs font-black truncate" style={{ color: colors.textPrimary }}>
                                                    {ride.requesterName || (ride.requesterSlug ? `@${ride.requesterSlug}` : 'Passageiro')}
                                                </p>
                                                {ride.requesterRating.count > 0 && (
                                                    <span className="flex items-center gap-1 text-[10px]" style={{ color: colors.textSecondary }}>
                                                        <Star size={10} className="fill-current" style={{ color: '#eab308' }} />
                                                        {ride.requesterRating.avg.toFixed(2)} ({ride.requesterRating.count})
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {ride.origin_lat != null && ride.origin_lng != null && ride.destination_lat != null && ride.destination_lng != null && (
                                            <RideMiniMap
                                                originLat={ride.origin_lat}
                                                originLng={ride.origin_lng}
                                                destLat={ride.destination_lat}
                                                destLng={ride.destination_lng}
                                                driverLat={driverCoords ? driverCoords[1] : null}
                                                driverLng={driverCoords ? driverCoords[0] : null}
                                                onExpand={() => setMapDialogRideId(ride.id)}
                                            />
                                        )}

                                        <div className="flex items-start gap-2 text-xs mb-1" style={{ color: colors.textSecondary }}>
                                            <MapPin size={12} className="flex-shrink-0 mt-0.5" />
                                            <span>{shortAddress(ride.origin_address)} → {shortAddress(ride.destination_address)}</span>
                                        </div>

                                        <div className="flex items-center gap-2 text-[11px] mb-2" style={{ color: colors.textSecondary }}>
                                            {ride.hasDistance ? (
                                                <span>{ride.distance_km!.toFixed(1)} km · {Math.round(ride.duration_min || 0)} min</span>
                                            ) : (
                                                <span>Distância não calculada</span>
                                            )}
                                            {ride.ride_type === 'objeto' ? (
                                                <span className="flex items-center gap-1"><Package size={11} /> {ride.object_description || 'Objeto'}</span>
                                            ) : ride.ride_type === 'animal' ? (
                                                <span className="flex items-center gap-1"><PawPrint size={11} /> {ride.pet_description || 'Animal'}</span>
                                            ) : ride.passenger_count > 1 ? (
                                                <span>{ride.passenger_count} passageiros</span>
                                            ) : null}
                                        </div>

                                        {myPricing && (
                                            <p className="text-[10px] font-bold mb-2" style={{ color: colors.textSecondary }}>
                                                Sua tarifa: até {myPricing.baseDistanceKm} km R$ {myPricing.baseFee.toFixed(2)}, + R$ {myPricing.pricePerKmAfterBase.toFixed(2)}/km
                                                {ride.hasDistance && ride.distance_km ? ` · R$ ${(ride.suggestedPrice / ride.distance_km).toFixed(2)}/km nesta corrida` : ''}
                                            </p>
                                        )}

                                        {isEditingPrice ? (
                                            <div className="flex items-center gap-2 mt-2">
                                                <input
                                                    type="number"
                                                    autoFocus
                                                    value={customPriceValue}
                                                    onChange={(e) => setCustomPriceValue(e.target.value)}
                                                    placeholder="Valor (R$)"
                                                    className="flex-1 p-2 rounded-full border text-sm"
                                                    style={{ background: colors.background, borderColor: colors.border, color: colors.textPrimary }}
                                                />
                                                <button
                                                    onClick={() => applyToRide(ride, parseFloat(customPriceValue) || 0)}
                                                    disabled={isApplying}
                                                    className="px-4 py-2 rounded-full text-xs font-black"
                                                    style={{ background: GRADIENT, color: '#fff' }}
                                                >
                                                    {isApplying ? <Spinner size={12} /> : 'Enviar'}
                                                </button>
                                                <button
                                                    onClick={() => { setCustomPriceFor(null); setCustomPriceValue('') }}
                                                    className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                                                    style={{ background: `${colors.border}30`, color: colors.textSecondary }}
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        ) : (
                                            <>
                                                <button
                                                    onClick={() => applyToRide(ride, ride.suggestedPrice)}
                                                    disabled={isApplying}
                                                    className="w-full mt-1 py-2.5 rounded-full text-xs font-black uppercase tracking-wider transition-all disabled:opacity-70 flex items-center justify-center gap-2"
                                                    style={{ background: '#a3e635', color: '#1a2e05' }}
                                                >
                                                    {isApplying ? <Spinner size={14} /> : `Candidatar-se por R$ ${ride.suggestedPrice.toFixed(2)}`}
                                                </button>

                                                {ride.hasDistance && (
                                                    <div className="flex items-center gap-1.5 mt-2">
                                                        <span className="text-[9px]" style={{ color: colors.textSecondary }}>Ofereça sua tarifa:</span>
                                                        {[1, 2, 3].map((extra) => (
                                                            <button
                                                                key={extra}
                                                                onClick={() => applyToRide(ride, ride.suggestedPrice + extra)}
                                                                disabled={isApplying}
                                                                className="px-2.5 py-1 rounded-full text-[10px] font-bold flex-1"
                                                                style={{ background: `${colors.border}30`, color: colors.textPrimary, border: `1px solid ${colors.border}` }}
                                                            >
                                                                R$ {(ride.suggestedPrice + extra).toFixed(0)}
                                                            </button>
                                                        ))}
                                                        <button
                                                            onClick={() => { setCustomPriceFor(ride.id); setCustomPriceValue(ride.suggestedPrice.toFixed(2)) }}
                                                            className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                                                            style={{ background: `${colors.border}30`, color: colors.textSecondary }}
                                                            title="Valor personalizado"
                                                        >
                                                            <Pencil size={12} />
                                                        </button>
                                                    </div>
                                                )}

                                                <button
                                                    onClick={() => skipRide(ride.id)}
                                                    className="w-full mt-2 py-2 rounded-full text-[11px] font-bold"
                                                    style={{ background: 'transparent', color: colors.textSecondary }}
                                                >
                                                    Pular
                                                </button>
                                            </>
                                        )}
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

                                return (
                                    <div
                                        key={ride.applicationId}
                                        className="rounded-2xl p-4 overflow-hidden relative"
                                        style={{ background: colors.surface, border: `1px solid ${colors.border}`, boxShadow: colors.shadow }}
                                    >
                                        <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                {buildRideSpecRows(ride).map((spec, i) => (
                                                    <span
                                                        key={i}
                                                        className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full"
                                                        style={{ background: `${colors.accent}15`, color: colors.accent }}
                                                        title={`${spec.label}: ${spec.value}`}
                                                    >
                                                        {spec.label}: {spec.value}
                                                    </span>
                                                ))}
                                            </div>
                                            <span className="flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: '#eab30815', color: '#eab308' }}>
                                                Aguardando decisão
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-2 mb-2">
                                            {ride.requesterAvatarUrl ? (
                                                <img src={ride.requesterAvatarUrl} className="w-8 h-8 rounded-full object-cover flex-shrink-0" alt="" />
                                            ) : (
                                                <span className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: GRADIENT }}>
                                                    <Users size={14} color="#fff" />
                                                </span>
                                            )}
                                            <div className="min-w-0">
                                                <p className="text-xs font-black truncate" style={{ color: colors.textPrimary }}>
                                                    {ride.requesterName || (ride.requesterSlug ? `@${ride.requesterSlug}` : 'Passageiro')}
                                                </p>
                                                {ride.requesterRating.count > 0 && (
                                                    <span className="flex items-center gap-1 text-[10px]" style={{ color: colors.textSecondary }}>
                                                        <Star size={10} className="fill-current" style={{ color: '#eab308' }} />
                                                        {ride.requesterRating.avg.toFixed(2)} ({ride.requesterRating.count})
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {ride.origin_lat != null && ride.origin_lng != null && ride.destination_lat != null && ride.destination_lng != null && (
                                            <RideMiniMap
                                                originLat={ride.origin_lat}
                                                originLng={ride.origin_lng}
                                                destLat={ride.destination_lat}
                                                destLng={ride.destination_lng}
                                                driverLat={driverCoords ? driverCoords[1] : null}
                                                driverLng={driverCoords ? driverCoords[0] : null}
                                                onExpand={() => setMapDialogRideId(ride.id)}
                                            />
                                        )}

                                        <div className="flex items-start gap-2 text-xs mb-1" style={{ color: colors.textSecondary }}>
                                            <MapPin size={12} className="flex-shrink-0 mt-0.5" />
                                            <span>{shortAddress(ride.origin_address)} → {shortAddress(ride.destination_address)}</span>
                                        </div>

                                        <div className="flex items-center gap-2 text-[11px] mb-2" style={{ color: colors.textSecondary }}>
                                            {ride.hasDistance ? (
                                                <span>{ride.distance_km!.toFixed(1)} km · {Math.round(ride.duration_min || 0)} min</span>
                                            ) : (
                                                <span>Distância não calculada</span>
                                            )}
                                        </div>

                                        <p className="text-sm font-black mb-2" style={{ color: '#f97316' }}>
                                            {ride.myProposedPrice != null ? `Sua proposta: R$ ${ride.myProposedPrice.toFixed(2)}` : 'Proposta enviada'}
                                        </p>

                                        <button
                                            onClick={() => withdrawApplication(ride.applicationId)}
                                            disabled={isWithdrawing}
                                            className="w-full py-2.5 rounded-full text-xs font-black uppercase tracking-wider transition-all disabled:opacity-70 flex items-center justify-center gap-2"
                                            style={{ background: `${colors.border}30`, color: colors.textSecondary, border: `1px solid ${colors.border}` }}
                                        >
                                            {isWithdrawing ? <Spinner size={14} /> : <>Sair da candidatura</>}
                                        </button>
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
                                    {acceptedRide.driver_en_route ? 'A caminho' : 'Aceita'}
                                </span>
                            </div>

                            <div className="flex items-center gap-2 mb-2">
                                {acceptedRide.requesterAvatarUrl ? (
                                    <img src={acceptedRide.requesterAvatarUrl} className="w-8 h-8 rounded-full object-cover flex-shrink-0" alt="" />
                                ) : (
                                    <span className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: GRADIENT }}>
                                        <Users size={14} color="#fff" />
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
                                    driverLat={driverCoords ? driverCoords[1] : null}
                                    driverLng={driverCoords ? driverCoords[0] : null}
                                    onExpand={() => setMapDialogRideId(acceptedRide.id)}
                                />
                            )}

                            <div className="flex items-start gap-2 text-xs mb-1" style={{ color: colors.textSecondary }}>
                                <MapPin size={12} className="flex-shrink-0 mt-0.5" />
                                <span>{shortAddress(acceptedRide.origin_address)} → {shortAddress(acceptedRide.destination_address)}</span>
                            </div>

                            <div className="flex items-center gap-2 text-[11px] mb-2" style={{ color: colors.textSecondary }}>
                                {acceptedRide.distance_km != null ? (
                                    <span>{acceptedRide.distance_km.toFixed(1)} km · {Math.round(acceptedRide.duration_min || 0)} min</span>
                                ) : (
                                    <span>Distância não calculada</span>
                                )}
                            </div>

                            <p className="text-sm font-black mb-3" style={{ color: '#f97316' }}>
                                {acceptedRide.proposedPrice != null ? `Valor combinado: R$ ${acceptedRide.proposedPrice.toFixed(2)}` : 'Valor não definido'}
                            </p>

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

                            <button
                                onClick={finishAcceptedRide}
                                disabled={finishing}
                                className="w-full mt-2 py-2.5 rounded-full text-xs font-black uppercase tracking-wider transition-all disabled:opacity-70 flex items-center justify-center gap-2"
                                style={{ background: '#22c55e', color: '#fff' }}
                            >
                                {finishing ? <Spinner size={14} /> : <><Flag size={14} /> Concluir corrida</>}
                            </button>

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
                        driverLat={driverCoords ? driverCoords[1] : null}
                        driverLng={driverCoords ? driverCoords[0] : null}
                        onClose={() => setMapDialogRideId(null)}
                    />
                )
            })()}
        </div>
    )
}
