// app/(main)/minhas-corridas/page.tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useProfile } from '@/app/contexts/ProfileContext'
import { useTheme } from '@/app/theme'
import Header from '@/app/Header'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import LoginAndRegister from '../LoginAndRegister'
import { toast } from 'sonner'
import { MapPin, CheckCircle2 } from 'lucide-react'
import { Spinner } from '@/components/Spinner'
import { shortAddress } from '@/lib/serviceBoard'
import { getAvatarUrl } from '@/lib/avatar'
import { haversineKm } from '@/lib/mapboxRoute'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'
const FINISH_RADIUS_METERS = 100

interface AcceptedRide {
    id: string
    origin_address: string
    destination_address: string
    destination_lat: number | null
    destination_lng: number | null
    requesterName: string | null
    requesterSlug: string | null
    requesterAvatarUrl: string | undefined
}

export default function MinhasCorridasPage() {
    const router = useRouter()
    const { avatarUrl, bgMode, customBgUrl, profileSlug, loading: profileLoading } = useProfile()
    const { colors } = useTheme()

    const [loading, setLoading] = useState(true)
    const [showLogin, setShowLogin] = useState(false)
    const [rides, setRides] = useState<AcceptedRide[]>([])
    const [finishingId, setFinishingId] = useState<string | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            setShowLogin(true)
            setLoading(false)
            return
        }
        setShowLogin(false)

        const { data: myRides } = await supabase
            .from('ride_requests')
            .select('id, requester_id, origin_address, destination_address, destination_lat, destination_lng')
            .eq('driver_id', user.id)
            .eq('status', 'accepted')
            .order('created_at', { ascending: false })

        if (!myRides || myRides.length === 0) {
            setRides([])
            setLoading(false)
            return
        }

        const requesterIds = Array.from(new Set(myRides.map((r) => r.requester_id)))
        const { data: profiles } = await supabase
            .from('profiles')
            .select('id, name, profileSlug, avatar_url')
            .in('id', requesterIds)
        const profilesById = new Map((profiles || []).map((p) => [p.id, p]))

        setRides(
            myRides.map((r) => {
                const p = profilesById.get(r.requester_id)
                return {
                    id: r.id,
                    origin_address: r.origin_address,
                    destination_address: r.destination_address,
                    destination_lat: r.destination_lat,
                    destination_lng: r.destination_lng,
                    requesterName: p?.name || null,
                    requesterSlug: p?.profileSlug || null,
                    requesterAvatarUrl: getAvatarUrl(supabase, p?.avatar_url),
                }
            })
        )
        setLoading(false)
    }, [])

    useEffect(() => {
        load()
    }, [load])

    const handleLoginSuccess = () => {
        setShowLogin(false)
        load()
    }

    const finalizeRide = async (ride: AcceptedRide) => {
        if (ride.destination_lat == null || ride.destination_lng == null) {
            toast.error('Não dá pra confirmar a chegada: esse pedido não tem coordenadas de destino.')
            return
        }
        if (!navigator.geolocation) {
            toast.error('Geolocalização não disponível neste dispositivo.')
            return
        }

        setFinishingId(ride.id)
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const distanceMeters = haversineKm(
                    [pos.coords.longitude, pos.coords.latitude],
                    [ride.destination_lng as number, ride.destination_lat as number]
                ) * 1000

                if (distanceMeters > FINISH_RADIUS_METERS) {
                    toast.error(`Você está a ${Math.round(distanceMeters)} m do destino. Chegue a até ${FINISH_RADIUS_METERS} m pra concluir.`)
                    setFinishingId(null)
                    return
                }

                const { data: { user } } = await supabase.auth.getUser()
                if (!user) { setFinishingId(null); return }

                try {
                    const { error } = await supabase
                        .from('ride_requests')
                        .update({ status: 'completed' })
                        .eq('id', ride.id)
                        .eq('driver_id', user.id)
                    if (error) throw error
                    toast.success('Corrida finalizada!')
                    setRides((prev) => prev.filter((r) => r.id !== ride.id))
                } catch (err: any) {
                    toast.error('Erro ao finalizar corrida: ' + (err.message || 'tente novamente'))
                } finally {
                    setFinishingId(null)
                }
            },
            () => {
                toast.error('Não conseguimos confirmar sua localização. Ative o GPS pra concluir a corrida.')
                setFinishingId(null)
            },
            { enableHighAccuracy: true, timeout: 10000 }
        )
    }

    return (
        <div className="relative min-h-dvh" style={{ background: colors.background }}>
            <div className="fixed inset-0 z-0">
                <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
            </div>

            <main className="relative z-10 min-h-dvh">
                <Header
                    title="Minhas corridas"
                    showBack={true}
                    onBack={() => router.push('/procurar-servico')}
                    greeting={`Olá, ${profileLoading ? '...' : profileSlug ? `@${profileSlug}` : 'Visitante'}`}
                    avatarUrl={avatarUrl}
                    loading={profileLoading}
                />

                <section className="px-4 md:px-6 mt-4 pb-24 max-w-lg mx-auto">
                    {loading && (
                        <div className="flex justify-center py-10">
                            <Spinner size={24} color={colors.textSecondary} />
                        </div>
                    )}

                    {!loading && showLogin && (
                        <LoginAndRegister onLoginSuccess={handleLoginSuccess} />
                    )}

                    {!loading && !showLogin && rides.length === 0 && (
                        <div
                            className="rounded-2xl p-6 text-center"
                            style={{ background: colors.surface, border: `1px solid ${colors.border}`, boxShadow: colors.shadow }}
                        >
                            <p className="text-sm" style={{ color: colors.textSecondary }}>
                                Nenhuma corrida aceita no momento.
                            </p>
                        </div>
                    )}

                    {!loading && !showLogin && rides.length > 0 && (
                        <div className="flex flex-col gap-3">
                            {rides.map((ride) => (
                                <div
                                    key={ride.id}
                                    className="rounded-2xl p-4"
                                    style={{ background: colors.surface, border: `1px solid ${colors.border}`, boxShadow: colors.shadow }}
                                >
                                    <div className="flex items-center gap-2 mb-2">
                                        {ride.requesterAvatarUrl ? (
                                            <img src={ride.requesterAvatarUrl} className="w-8 h-8 rounded-full object-cover flex-shrink-0" alt="" />
                                        ) : (
                                            <span className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: GRADIENT }} />
                                        )}
                                        <p className="text-xs font-black" style={{ color: colors.textPrimary }}>
                                            {ride.requesterName || (ride.requesterSlug ? `@${ride.requesterSlug}` : 'Passageiro')}
                                        </p>
                                    </div>
                                    <div className="flex items-start gap-2 text-xs mb-3" style={{ color: colors.textSecondary }}>
                                        <MapPin size={12} className="flex-shrink-0 mt-0.5" />
                                        <span>{shortAddress(ride.origin_address)} → {shortAddress(ride.destination_address)}</span>
                                    </div>
                                    <button
                                        onClick={() => finalizeRide(ride)}
                                        disabled={finishingId === ride.id}
                                        className="w-full py-2.5 rounded-full text-xs font-black uppercase tracking-wider transition-all disabled:opacity-70 flex items-center justify-center gap-2"
                                        style={{ background: GRADIENT, color: '#fff' }}
                                    >
                                        {finishingId === ride.id ? <Spinner size={14} /> : (<><CheckCircle2 size={14} /> Finalizar corrida</>)}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </main>
        </div>
    )
}
