'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { toast } from 'sonner'
import { Car, Navigation, X, Radio, Ban } from 'lucide-react'
import { shortAddress } from '@/lib/serviceBoard'
import { Spinner } from '@/components/Spinner'
import { notifyRideStatus } from '@/lib/notifyRideStatus'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

interface AcceptedRide {
    id: string
    requesterName: string
    price: number | null
    originAddress: string
}

// Global, montado em providers.tsx: mostra o dialog "corrida aceita" pro
// motorista em qualquer página do app assim que o passageiro aceita a
// proposta dele — não depende de estar em /aceitar-corridas ou /pedir-motorista.
export function RideAcceptedDialog() {
    const { colors } = useTheme()
    const router = useRouter()
    const [pending, setPending] = useState<AcceptedRide[]>([])
    const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
    const [departing, setDeparting] = useState(false)
    const [cancelling, setCancelling] = useState(false)
    const [syncOn, setSyncOn] = useState(false)
    const [togglingSync, setTogglingSync] = useState(false)

    const userIdRef = useRef<string | null>(null)
    const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

    const checkAccepted = useCallback(async () => {
        const userId = userIdRef.current
        if (!userId) return

        const { data: rides } = await supabase
            .from('ride_requests')
            .select('id, requester_id, origin_address')
            .eq('driver_id', userId)
            .eq('status', 'accepted')
            .eq('driver_en_route', false)

        if (!rides || rides.length === 0) {
            setPending([])
            return
        }

        const rideIds = rides.map((r) => r.id)
        const requesterIds = Array.from(new Set(rides.map((r) => r.requester_id)))

        const [{ data: profiles }, { data: applications }] = await Promise.all([
            supabase.from('profiles').select('id, name, profileSlug').in('id', requesterIds),
            supabase
                .from('ride_applications')
                .select('ride_request_id, proposed_price')
                .eq('applicant_id', userId)
                .in('ride_request_id', rideIds)
                .eq('status', 'accepted'),
        ])

        const profilesById = new Map((profiles || []).map((p) => [p.id, p]))
        const priceByRide = new Map((applications || []).map((a) => [a.ride_request_id, a.proposed_price]))

        setPending(
            rides.map((r) => {
                const p = profilesById.get(r.requester_id)
                return {
                    id: r.id,
                    requesterName: p?.name || (p?.profileSlug ? `@${p.profileSlug}` : 'Passageiro'),
                    price: priceByRide.get(r.id) ?? null,
                    originAddress: r.origin_address,
                }
            })
        )
    }, [])

    const cleanup = useCallback(() => {
        if (channelRef.current) {
            supabase.removeChannel(channelRef.current)
            channelRef.current = null
        }
        if (pollRef.current) {
            clearInterval(pollRef.current)
            pollRef.current = null
        }
    }, [])

    const connectChannel = useCallback((userId: string) => {
        if (channelRef.current) supabase.removeChannel(channelRef.current)
        const channel = supabase.channel(`ride-accepted-${userId}-${Date.now()}`)
        channel
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'ride_requests', filter: `driver_id=eq.${userId}` },
                () => checkAccepted()
            )
            .subscribe()
        channelRef.current = channel
    }, [checkAccepted])

    // Evita mais um listener global de auth (onAuthStateChange) disputando o
    // lock do token junto com ProfileContext/OrderNotification/PushNotification
    // — em vez disso, cada ciclo de poll confere o usuário atual via getUser()
    // e só reconecta o canal realtime se a conta tiver mudado.
    useEffect(() => {
        let cancelled = false

        const tick = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (cancelled) return

            if (!user) {
                userIdRef.current = null
                setPending([])
                return
            }

            if (userIdRef.current !== user.id) {
                userIdRef.current = user.id
                connectChannel(user.id)
            }
            checkAccepted()

            const { data: pricing } = await supabase
                .from('driver_pricing')
                .select('live_location_sync')
                .eq('driver_id', user.id)
                .maybeSingle()
            if (!cancelled) setSyncOn(!!pricing?.live_location_sync)
        }

        tick()
        pollRef.current = setInterval(tick, 8000)

        return () => {
            cancelled = true
            cleanup()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const current = pending.find((r) => !dismissedIds.has(r.id))

    const handleDepart = async () => {
        if (!current) return
        setDeparting(true)
        try {
            await supabase
                .from('ride_requests')
                .update({ driver_en_route: true, driver_departed_at: new Date().toISOString() })
                .eq('id', current.id)
            notifyRideStatus(current.id, 'en_route')
            setPending((prev) => prev.filter((r) => r.id !== current.id))
            // Leva o motorista direto pra tela da corrida — /aceitar-corridas já
            // troca sozinho pra aba "Corrida aceita" assim que detecta a corrida.
            router.push('/aceitar-corridas')
        } finally {
            setDeparting(false)
        }
    }

    const handleDismiss = () => {
        if (!current) return
        setDismissedIds((prev) => new Set(prev).add(current.id))
    }

    const handleCancel = async () => {
        if (!current || !userIdRef.current) return
        const driverId = userIdRef.current
        setCancelling(true)
        try {
            const { error } = await supabase
                .from('ride_requests')
                .update({ status: 'cancelled', cancelled_by: 'driver' })
                .eq('id', current.id)
                .eq('driver_id', driverId)
            if (error) throw error
            toast.success('Corrida cancelada.')
            notifyRideStatus(current.id, 'cancelled')
            setPending((prev) => prev.filter((r) => r.id !== current.id))
        } catch (err: any) {
            toast.error('Erro ao cancelar: ' + (err.message || 'tente novamente'))
        } finally {
            setCancelling(false)
        }
    }

    const handleToggleSync = async () => {
        const userId = userIdRef.current
        if (!userId) return
        setTogglingSync(true)
        const next = !syncOn
        try {
            const { error } = await supabase
                .from('driver_pricing')
                .update({ live_location_sync: next })
                .eq('driver_id', userId)
            if (error) throw error
            setSyncOn(next)
        } catch (err: any) {
            toast.error('Erro ao atualizar sincronização: ' + (err.message || 'tente novamente'))
        } finally {
            setTogglingSync(false)
        }
    }

    if (!current) return null

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div
                className="relative w-full max-w-sm rounded-3xl p-6 shadow-2xl text-center"
                style={{ background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
            >
                <button
                    onClick={handleDismiss}
                    className="absolute right-4 top-4 p-1.5 rounded-full"
                    style={{ background: `${colors.border}40`, color: colors.textPrimary }}
                    aria-label="Fechar"
                >
                    <X size={16} />
                </button>

                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: GRADIENT }}>
                    <Car size={28} color="#fff" />
                </div>

                <h3 className="text-lg font-black mb-1">Corrida aceita!</h3>
                <p className="text-sm mb-1" style={{ color: colors.textPrimary }}>
                    {current.requesterName} aceitou sua proposta
                    {current.price != null && (
                        <> de <strong>R$ {current.price.toFixed(2)}</strong></>
                    )}
                </p>
                <p className="text-xs mb-5" style={{ color: colors.textSecondary }}>
                    e está esperando você em {shortAddress(current.originAddress)}
                </p>

                <button
                    onClick={handleDepart}
                    disabled={departing}
                    className="w-full py-3.5 rounded-full font-black text-sm uppercase tracking-wide flex items-center justify-center gap-2 disabled:opacity-70"
                    style={{ background: GRADIENT, color: '#ffffff' }}
                >
                    {departing ? <Spinner size={16} /> : <><Navigation size={16} /> Ir para o ponto de partida</>}
                </button>

                <button
                    onClick={handleToggleSync}
                    disabled={togglingSync}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl mt-3 transition-all disabled:opacity-60"
                    style={{
                        background: syncOn ? '#f9731620' : `${colors.border}30`,
                        border: `1px solid ${syncOn ? '#f9731660' : colors.border}`,
                    }}
                >
                    <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center" style={{ background: syncOn ? '#f97316' : `${colors.border}40` }}>
                        {togglingSync ? <Spinner size={14} color={syncOn ? '#ffffff' : colors.textPrimary} /> : <Radio size={14} color={syncOn ? '#ffffff' : colors.textPrimary} />}
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                        <span className="text-xs font-bold block" style={{ color: colors.textPrimary }}>Sincronização para motorista</span>
                        <p className="text-[10px] mt-0.5 opacity-70" style={{ color: colors.textPrimary }}>
                            {syncOn ? 'Ativada — o passageiro vê sua posição em tempo real' : 'Ative pra o passageiro acompanhar sua chegada ao vivo'}
                        </p>
                    </div>
                    <div className="flex-shrink-0 w-10 h-6 rounded-full relative transition-all" style={{ background: syncOn ? '#f97316' : colors.border }}>
                        <div className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all" style={{ left: syncOn ? 18 : 2 }} />
                    </div>
                </button>

                <button
                    onClick={handleCancel}
                    disabled={cancelling}
                    className="w-full py-2.5 mt-2 rounded-full font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-60"
                    style={{ color: '#ef4444', border: '1px solid #ef444440' }}
                >
                    {cancelling ? <Spinner size={12} /> : <><Ban size={13} /> Cancelar corrida</>}
                </button>
            </div>
        </div>
    )
}
