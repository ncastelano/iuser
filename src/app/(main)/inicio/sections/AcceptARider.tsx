// src/app/(main)/inicio/sections/AcceptARider.tsx
'use client'

import { ReactNode, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useNavProgressStore } from '@/store/useNavProgressStore'
import { Car, Settings2, CheckCircle2, Navigation } from 'lucide-react'
import { useTheme } from '@/app/theme'
import { supabase } from '@/lib/supabase/client'
import { hexToRgb } from '@/lib/color'

// ===== GRADIENTE FIXO LARANJA-VERMELHO =====
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

function shortAddress(address: string): string {
    const firstPart = address.split(',')[0].trim()
    return firstPart.length > 24 ? firstPart.substring(0, 22) + '...' : firstPart
}

interface AcceptedRideStatus {
    id: string
    origin_address: string
    destination_address: string
    driver_en_route: boolean
    requesterName: string | null
    requesterSlug: string | null
    proposedPrice: number | null
}

interface AcceptARiderProps {
    dragHandle?: ReactNode
    // Dispara quando o motorista está com uma corrida aceita em andamento —
    // a home usa isso pra subir esse componente na frente de Categorias
    // enquanto durar, do mesmo jeito que o Motorista Particular já faz.
    onUrgentChange?: (urgent: boolean) => void
}

export default function AcceptARider({ dragHandle, onUrgentChange }: AcceptARiderProps) {
    const { colors } = useTheme()
    const router = useRouter()
    const startNavProgress = useNavProgressStore((s) => s.start)
    const [hasPricing, setHasPricing] = useState<boolean | null>(null)
    const [acceptedRide, setAcceptedRide] = useState<AcceptedRideStatus | null>(null)

    useEffect(() => {
        let active = true
        let channel: ReturnType<typeof supabase.channel> | null = null
        let userId: string | null = null

        const loadRide = async () => {
            if (!userId) return

            const { data: order } = await supabase
                .from('ride_requests')
                .select('id, requester_id, origin_address, destination_address, driver_en_route')
                .eq('driver_id', userId)
                .eq('status', 'accepted')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle()

            if (!active) return
            if (!order) {
                setAcceptedRide(null)
                return
            }

            const [{ data: requester }, { data: application }] = await Promise.all([
                supabase.from('profiles').select('name, profileSlug').eq('id', order.requester_id).maybeSingle(),
                supabase
                    .from('ride_applications')
                    .select('proposed_price')
                    .eq('ride_request_id', order.id)
                    .eq('applicant_id', userId)
                    .eq('status', 'accepted')
                    .maybeSingle(),
            ])
            if (!active) return

            setAcceptedRide({
                id: order.id,
                origin_address: order.origin_address,
                destination_address: order.destination_address,
                driver_en_route: order.driver_en_route,
                requesterName: requester?.name || null,
                requesterSlug: requester?.profileSlug || null,
                proposedPrice: application?.proposed_price ?? null,
            })
        }

        const init = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!active) return
            if (!user) {
                setHasPricing(false)
                return
            }
            userId = user.id

            const { data: pricing } = await supabase
                .from('driver_pricing')
                .select('id')
                .eq('driver_id', user.id)
                .maybeSingle()
            if (!active) return
            setHasPricing(!!pricing)

            await loadRide()

            // Tempo real: aceite, "a caminho" e finalização/cancelamento são
            // todos UPDATE nesta própria linha — um canal cobre tudo.
            channel = supabase
                .channel(`canal-motorista-${user.id}`)
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table: 'ride_requests', filter: `driver_id=eq.${user.id}` },
                    () => loadRide()
                )
                .subscribe()
        }

        init()
        const poll = setInterval(loadRide, 15000)
        return () => {
            active = false
            clearInterval(poll)
            if (channel) supabase.removeChannel(channel)
        }
    }, [])

    useEffect(() => {
        onUrgentChange?.(!!acceptedRide)
        return () => { onUrgentChange?.(false) }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [acceptedRide])

    const surfaceRgb = hexToRgb(colors.surface)

    const buttonStyle = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        padding: '0.75rem 1.5rem',
        borderRadius: '9999px',
        fontSize: '0.875rem',
        fontWeight: 700,
        transition: 'all 0.2s',
        background: GRADIENT,
        color: '#ffffff',
        border: 'none',
        boxShadow: `0 4px 12px #f9731640`,
        cursor: 'pointer',
    }

    const goToPainel = () => { startNavProgress(); router.push('/painel-motorista') }
    const goToCorridas = () => { startNavProgress(); router.push('/aceitar-corridas') }

    return (
        <section>
            <div
                className="rounded-2xl p-6 relative"
                style={{
                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: `1px solid ${colors.border}`,
                    boxShadow: colors.shadow,
                    transform: 'translateZ(0)',
                    willChange: 'transform',
                }}
            >
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        {dragHandle && <div>{dragHandle}</div>}

                        <div
                            className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{
                                background: GRADIENT,
                                color: '#ffffff',
                                boxShadow: `0 4px 12px #f9731640`,
                            }}
                        >
                            <Car size={28} />
                        </div>

                        <div>
                            <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>
                                Canal do Motorista
                            </h3>
                            <p className="text-sm mt-1" style={{ color: colors.textPrimary }}>
                                Defina sua tarifa e aceite corridas disponíveis
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-col items-stretch sm:items-end gap-2 w-full sm:w-auto">
                        <div className="flex flex-row flex-nowrap gap-2 justify-center sm:justify-end">
                            <button
                                onClick={goToPainel}
                                className="flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-3 rounded-full font-bold text-xs sm:text-sm transition-all whitespace-nowrap hover:scale-105 active:scale-95 flex-1 sm:flex-none min-w-0"
                                style={buttonStyle}
                            >
                                <Settings2 size={16} className="flex-shrink-0" />
                                painel do motorista
                            </button>

                            {hasPricing && (
                                <button
                                    onClick={goToCorridas}
                                    className="flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-6 py-3 rounded-full font-bold text-xs sm:text-sm transition-all shadow-lg whitespace-nowrap hover:scale-105 active:scale-95 flex-1 sm:flex-none min-w-0"
                                    style={buttonStyle}
                                >
                                    <Car size={16} className="flex-shrink-0" />
                                    ver corridas
                                </button>
                            )}
                        </div>

                        {hasPricing === false && (
                            <button
                                onClick={goToPainel}
                                className="text-xs font-bold text-right"
                                style={{ color: '#f97316' }}
                            >
                                Habilite seu valor de corrida para ver corridas
                            </button>
                        )}
                    </div>
                </div>

                {acceptedRide && (
                    <button
                        onClick={goToCorridas}
                        className="w-full mt-4 p-3 rounded-xl text-left transition-all hover:scale-[1.01]"
                        style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}` }}
                    >
                        <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                            <span
                                className="flex items-center gap-1.5 text-xs font-black"
                                style={{ color: acceptedRide.driver_en_route ? '#22c55e' : '#f97316' }}
                            >
                                {acceptedRide.driver_en_route ? <Navigation size={13} /> : <CheckCircle2 size={13} />}
                                {acceptedRide.driver_en_route ? 'A caminho do ponto de partida' : 'Corrida aceita — aguardando você sair'}
                            </span>
                            {acceptedRide.proposedPrice != null && (
                                <span className="text-[10px] font-black" style={{ color: '#f97316' }}>
                                    R$ {acceptedRide.proposedPrice.toFixed(2)}
                                </span>
                            )}
                        </div>
                        <p className="text-[10px] font-bold mb-1" style={{ color: colors.textSecondary }}>
                            {acceptedRide.requesterName || (acceptedRide.requesterSlug ? `@${acceptedRide.requesterSlug}` : 'Passageiro')}
                        </p>
                        <span className="text-xs" style={{ color: colors.textPrimary }}>
                            {shortAddress(acceptedRide.origin_address)} → {shortAddress(acceptedRide.destination_address)}
                        </span>
                    </button>
                )}
            </div>
        </section>
    )
}
