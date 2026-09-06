// app/(main)/aceitar-corridas/page.tsx
'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useProfile } from '@/app/contexts/ProfileContext'
import { useTheme } from '@/app/theme'
import Header from '@/app/Header'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import LoginAndRegister from '../LoginAndRegister'
import { toast } from 'sonner'
import { MapPin, Star, Pencil, X, Package, Users } from 'lucide-react'
import { Spinner } from '@/components/Spinner'
import { shortAddress } from '@/lib/serviceBoard'
import { getAvatarUrl } from '@/lib/avatar'
import { computeSuggestedPrice } from '@/lib/driverPricing'
import { getProfileRideRatingsBatch, ProfileRideRating } from '@/lib/rideReviews'
import { VEHICLE_TYPE_LABELS, VehicleType } from '@/lib/rideVehicle'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'
const APPLICATION_WINDOW_MS = 2 * 60 * 1000
const REFRESH_INTERVAL_MS = 15000

interface RideRow {
    id: string
    requester_id: string
    ride_type: 'pessoa' | 'objeto'
    origin_address: string
    destination_address: string
    notes: string | null
    passenger_count: number
    vehicle_type: VehicleType
    object_description: string | null
    distance_km: number | null
    duration_min: number | null
    applications_close_at: string
    created_at: string
}

interface RideCardData extends RideRow {
    requesterName: string | null
    requesterSlug: string | null
    requesterAvatarUrl: string | undefined
    requesterRating: ProfileRideRating
    suggestedPrice: number
    hasDistance: boolean
}

export default function AceitarCorridasPage() {
    const router = useRouter()
    const { avatarUrl, bgMode, customBgUrl, profileSlug, loading: profileLoading } = useProfile()
    const { colors } = useTheme()

    const [loading, setLoading] = useState(true)
    const [showLogin, setShowLogin] = useState(false)
    const [checkingPricing, setCheckingPricing] = useState(false)
    const [rides, setRides] = useState<RideCardData[]>([])
    const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set())
    const [applyingId, setApplyingId] = useState<string | null>(null)
    const [customPriceFor, setCustomPriceFor] = useState<string | null>(null)
    const [customPriceValue, setCustomPriceValue] = useState('')
    const [now, setNow] = useState(Date.now())

    const load = useCallback(async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            setShowLogin(true)
            setLoading(false)
            return
        }
        setShowLogin(false)

        setCheckingPricing(true)
        const { data: pricing } = await supabase
            .from('driver_pricing')
            .select('base_distance_km, base_fee, price_per_km_after_base')
            .eq('driver_id', user.id)
            .maybeSingle()
        setCheckingPricing(false)

        if (!pricing) {
            router.replace('/painel-motorista?next=/aceitar-corridas')
            return
        }

        const { data: myApplications } = await supabase
            .from('ride_applications')
            .select('ride_request_id')
            .eq('applicant_id', user.id)
        const appliedIds = new Set((myApplications || []).map((a) => a.ride_request_id))

        const { data: openRides } = await supabase
            .from('ride_requests')
            .select('id, requester_id, ride_type, origin_address, destination_address, notes, passenger_count, vehicle_type, object_description, distance_km, duration_min, applications_close_at, created_at')
            .eq('status', 'pending')
            .neq('requester_id', user.id)
            .gt('applications_close_at', new Date().toISOString())
            .order('created_at', { ascending: false })

        const openList = (openRides || []).filter((r) => !appliedIds.has(r.id))

        if (openList.length === 0) {
            setRides([])
            setLoading(false)
            return
        }

        const requesterIds = Array.from(new Set(openList.map((r) => r.requester_id)))
        const [{ data: profiles }, ratingsMap] = await Promise.all([
            supabase.from('profiles').select('id, name, profileSlug, avatar_url').in('id', requesterIds),
            getProfileRideRatingsBatch(supabase, requesterIds),
        ])
        const profilesById = new Map((profiles || []).map((p) => [p.id, p]))

        const pricingShape = {
            baseDistanceKm: pricing.base_distance_km,
            baseFee: pricing.base_fee,
            pricePerKmAfterBase: pricing.price_per_km_after_base,
        }

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

        setRides(cards)
        setLoading(false)
    }, [router])

    useEffect(() => {
        load()
    }, [load])

    useEffect(() => {
        const poll = setInterval(load, REFRESH_INTERVAL_MS)
        const tick = setInterval(() => setNow(Date.now()), 1000)
        return () => {
            clearInterval(poll)
            clearInterval(tick)
        }
    }, [load])

    const handleLoginSuccess = () => {
        setShowLogin(false)
        setLoading(true)
        load()
    }

    const visibleRides = useMemo(
        () => rides.filter((r) => !skippedIds.has(r.id) && new Date(r.applications_close_at).getTime() > now),
        [rides, skippedIds, now]
    )

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
            setRides((prev) => prev.filter((r) => r.id !== ride.id))
            setCustomPriceFor(null)
        } catch (err: any) {
            toast.error('Erro ao se candidatar: ' + (err.message || 'tente novamente'))
        } finally {
            setApplyingId(null)
        }
    }

    const skipRide = (rideId: string) => {
        setSkippedIds((prev) => new Set(prev).add(rideId))
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
                    onBack={() => router.push('/procurar-servico')}
                    greeting={`Olá, ${profileLoading ? '...' : profileSlug ? `@${profileSlug}` : 'Visitante'}`}
                    avatarUrl={avatarUrl}
                    loading={profileLoading}
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

                    {!loading && !showLogin && visibleRides.length === 0 && (
                        <div
                            className="rounded-2xl p-6 text-center"
                            style={{ background: colors.surface, border: `1px solid ${colors.border}`, boxShadow: colors.shadow }}
                        >
                            <p className="text-sm" style={{ color: colors.textSecondary }}>
                                Nenhuma corrida disponível no momento.
                            </p>
                        </div>
                    )}

                    {!loading && !showLogin && visibleRides.length > 0 && (
                        <div className="flex flex-col gap-3">
                            {visibleRides.map((ride) => {
                                const remainingMs = Math.max(0, new Date(ride.applications_close_at).getTime() - now)
                                const progress = Math.min(1, remainingMs / APPLICATION_WINDOW_MS)
                                const remainingSec = Math.ceil(remainingMs / 1000)
                                const isApplying = applyingId === ride.id
                                const isEditingPrice = customPriceFor === ride.id

                                return (
                                    <div
                                        key={ride.id}
                                        className="rounded-2xl p-4 overflow-hidden relative"
                                        style={{ background: colors.surface, border: `1px solid ${colors.border}`, boxShadow: colors.shadow }}
                                    >
                                        {/* Barra de progresso da janela de candidatura */}
                                        <div className="absolute top-0 left-0 h-1 w-full" style={{ background: `${colors.border}40` }}>
                                            <div
                                                className="h-full transition-all"
                                                style={{ width: `${progress * 100}%`, background: GRADIENT }}
                                            />
                                        </div>

                                        <div className="flex items-center justify-between mb-2 mt-1">
                                            <span
                                                className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full"
                                                style={{ background: `${colors.accent}15`, color: colors.accent }}
                                            >
                                                {VEHICLE_TYPE_LABELS[ride.vehicle_type]}
                                            </span>
                                            <span className="text-[10px] font-bold" style={{ color: colors.textSecondary }}>
                                                {remainingSec}s
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
                                            ) : ride.passenger_count > 1 ? (
                                                <span>{ride.passenger_count} passageiros</span>
                                            ) : null}
                                        </div>

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
                                                    {isApplying ? <Spinner size={14} /> : `Aceitar por R$ ${ride.suggestedPrice.toFixed(2)}`}
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
                </section>
            </main>
        </div>
    )
}
