// src/app/(main)/inicio/sections/HireAService.tsx
'use client'

import { ReactNode, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Wrench, PaintRoller, Leaf, Zap, Sparkles, Hammer, MapPin } from 'lucide-react'
import { useTheme } from '@/app/theme'
import { getRecentServiceLocations, RecentServiceLocation } from '@/lib/recentServiceLocations'

// ===== GRADIENTE FIXO LARANJA-VERMELHO =====
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

const SERVICE_SHORTCUTS = [
    { id: 'pintor', label: 'Pintor', icon: PaintRoller },
    { id: 'encanador', label: 'Encanador', icon: Wrench },
    { id: 'jardineiro', label: 'Jardineiro', icon: Leaf },
    { id: 'eletricista', label: 'Eletricista', icon: Zap },
    { id: 'diarista', label: 'Diarista', icon: Sparkles },
    { id: 'montador', label: 'Montador', icon: Hammer },
]

function shortAddress(address: string): string {
    const firstPart = address.split(',')[0].trim()
    return firstPart.length > 24 ? firstPart.substring(0, 22) + '...' : firstPart
}

/* ─── Helper para converter hex em RGB ─── */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const clean = hex.replace('#', '')
    const bigint = parseInt(clean, 16)
    return {
        r: (bigint >> 16) & 255,
        g: (bigint >> 8) & 255,
        b: bigint & 255,
    }
}

interface HireAServiceProps {
    dragHandle?: ReactNode
}

export default function HireAService({ dragHandle }: HireAServiceProps) {
    const { colors } = useTheme()
    const router = useRouter()
    const [recentLocations, setRecentLocations] = useState<RecentServiceLocation[]>([])

    useEffect(() => {
        setRecentLocations(getRecentServiceLocations().slice(0, 3))
    }, [])

    const goToLocation = (location: RecentServiceLocation) => {
        const params = new URLSearchParams({ local: location.address })
        if (location.coords) {
            params.set('lng', String(location.coords[0]))
            params.set('lat', String(location.coords[1]))
        }
        router.push(`/pedir-servico?${params.toString()}`)
    }

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
                            <Wrench size={28} />
                        </div>

                        <div>
                            <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>
                                Pedir um serviço
                            </h3>
                            <p className="text-sm mt-1" style={{ color: colors.textSecondary }}>
                                Pintor, encanador, jardineiro e mais
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={() => router.push('/pedir-servico')}
                        className="flex items-center justify-center gap-2 px-6 py-3 rounded-full font-bold text-sm transition-all shadow-lg whitespace-nowrap hover:scale-105 active:scale-95"
                        style={buttonStyle}
                    >
                        <Wrench size={16} />
                        pedir serviço
                    </button>
                </div>

                {/* Atalhos por tipo de serviço */}
                <div className="flex flex-wrap gap-2 mt-4">
                    {SERVICE_SHORTCUTS.map((service) => {
                        const Icon = service.icon
                        return (
                            <button
                                key={service.id}
                                onClick={() => router.push(`/pedir-servico?tipo=${service.id}`)}
                                className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold transition-all hover:scale-105 active:scale-95"
                                style={{
                                    background: `${colors.border}30`,
                                    border: `1px solid ${colors.border}`,
                                    color: colors.textPrimary,
                                }}
                            >
                                <Icon size={14} />
                                {service.label}
                            </button>
                        )
                    })}
                </div>

                {/* Últimos locais usados */}
                {recentLocations.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                        {recentLocations.map((location) => (
                            <button
                                key={location.address}
                                onClick={() => goToLocation(location)}
                                className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold transition-all hover:scale-105 active:scale-95"
                                style={{
                                    background: `${colors.border}30`,
                                    border: `1px solid ${colors.border}`,
                                    color: colors.textPrimary,
                                }}
                            >
                                <MapPin size={14} />
                                {shortAddress(location.address)}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </section>
    )
}
