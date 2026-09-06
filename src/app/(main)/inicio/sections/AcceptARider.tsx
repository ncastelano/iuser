// src/app/(main)/inicio/sections/AcceptARider.tsx
'use client'

import { ReactNode, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useNavProgressStore } from '@/store/useNavProgressStore'
import { Car, Settings2 } from 'lucide-react'
import { useTheme } from '@/app/theme'
import { supabase } from '@/lib/supabase/client'
import { hexToRgb } from '@/lib/color'

// ===== GRADIENTE FIXO LARANJA-VERMELHO =====
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

interface AcceptARiderProps {
    dragHandle?: ReactNode
}

export default function AcceptARider({ dragHandle }: AcceptARiderProps) {
    const { colors } = useTheme()
    const router = useRouter()
    const startNavProgress = useNavProgressStore((s) => s.start)
    const [hasPricing, setHasPricing] = useState<boolean | null>(null)

    useEffect(() => {
        let active = true
        supabase.auth.getUser().then(async ({ data: { user } }) => {
            if (!user) {
                if (active) setHasPricing(false)
                return
            }
            const { data } = await supabase
                .from('driver_pricing')
                .select('id')
                .eq('driver_id', user.id)
                .maybeSingle()
            if (active) setHasPricing(!!data)
        })
        return () => { active = false }
    }, [])

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
                        <div className="flex flex-wrap gap-2 justify-center sm:justify-end">
                            <button
                                onClick={goToPainel}
                                className="flex items-center justify-center gap-2 px-5 py-3 rounded-full font-bold text-sm transition-all whitespace-nowrap hover:scale-105 active:scale-95"
                                style={{
                                    background: `${colors.border}30`,
                                    border: `1px solid ${colors.border}`,
                                    color: colors.textPrimary,
                                }}
                            >
                                <Settings2 size={16} />
                                painel do motorista
                            </button>

                            {hasPricing && (
                                <button
                                    onClick={goToCorridas}
                                    className="flex items-center justify-center gap-2 px-6 py-3 rounded-full font-bold text-sm transition-all shadow-lg whitespace-nowrap hover:scale-105 active:scale-95"
                                    style={buttonStyle}
                                >
                                    <Car size={16} />
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
            </div>
        </section>
    )
}
