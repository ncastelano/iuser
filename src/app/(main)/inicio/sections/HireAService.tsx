// src/app/(main)/inicio/sections/HireAService.tsx
'use client'

import { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useNavProgressStore } from '@/store/useNavProgressStore'
import { Wrench, Megaphone } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import MyOpenServiceRequests from '@/components/MyOpenServiceRequests'
import { hexToRgb } from '@/lib/color'

// ===== GRADIENTE FIXO LARANJA-VERMELHO =====
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

interface HireAServiceProps {
    dragHandle?: ReactNode
}

export default function HireAService({ dragHandle }: HireAServiceProps) {
    const { colors } = useTheme()
    const router = useRouter()
    const startNavProgress = useNavProgressStore((s) => s.start)
    const { profileSlug } = useProfile()

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
        whiteSpace: 'nowrap' as const,
    }

    const outlineButtonStyle = {
        ...buttonStyle,
        background: 'transparent',
        color: colors.accent,
        border: `2px solid ${colors.accent}`,
        boxShadow: 'none',
    }

    // Publicar leva pro próprio perfil (onde fica "Meus serviços publicados",
    // no ProfileDashboard) — sem perfil ainda (visitante), manda pro login.
    const goPublish = () => {
        startNavProgress()
        router.push(profileSlug ? `/${profileSlug}` : '/login')
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
                                Solicitar ou Publicar um serviço
                            </h3>
                            <p className="text-sm mt-1" style={{ color: colors.textPrimary }}>
                                Encontre um profissional ou anuncie o serviço que você presta
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-row flex-wrap gap-2 justify-center sm:justify-end">
                        <button
                            onClick={() => { startNavProgress(); router.push('/solicitar-servico') }}
                            className="flex items-center justify-center gap-2 px-6 py-3 rounded-full font-bold text-sm transition-all shadow-lg hover:scale-105 active:scale-95"
                            style={buttonStyle}
                        >
                            <Wrench size={16} />
                            solicitar serviço
                        </button>
                        <button
                            onClick={goPublish}
                            className="flex items-center justify-center gap-2 px-6 py-3 rounded-full font-bold text-sm transition-all hover:scale-105 active:scale-95"
                            style={outlineButtonStyle}
                        >
                            <Megaphone size={16} />
                            publicar serviço
                        </button>
                    </div>
                </div>

                {/* Meus pedidos de serviço em aberto, com os candidatos de cada um */}
                <div className="mt-4">
                    <MyOpenServiceRequests limit={3} />
                </div>
            </div>
        </section>
    )
}
