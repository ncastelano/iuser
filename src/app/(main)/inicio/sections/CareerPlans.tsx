// src/app/(main)/inicio/sections/CareerPlans.tsx
'use client'

import { useRouter } from 'next/navigation'
import { Car, Briefcase, Store, Users, CheckCircle2, Circle, Sparkles } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { useActivePlans } from '@/hooks/useActivePlans'
import { hexToRgb } from '@/lib/color'

// ===== GRADIENTE FIXO LARANJA-VERMELHO =====
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

const ITEMS = [
    { key: 'hasDriver', icon: Car, label: 'Motorista' },
    { key: 'hasProvider', icon: Briefcase, label: 'Prestador de serviço' },
    { key: 'hasStore', icon: Store, label: 'Loja' },
    { key: 'hasRecruiter', icon: Users, label: 'Recrutador' },
] as const

export default function CareerPlans() {
    const { colors } = useTheme()
    const router = useRouter()
    const { userId } = useProfile()
    const { loading, hasDriver, hasProvider, hasStore, hasRecruiter } = useActivePlans(userId)

    const status: Record<string, boolean> = { hasDriver, hasProvider, hasStore, hasRecruiter }
    const activeCount = ITEMS.filter((item) => status[item.key]).length

    const surfaceRgb = hexToRgb(colors.surface)

    return (
        <section>
            <div
                className="rounded-2xl p-6"
                style={{
                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: `1px solid ${colors.border}`,
                    boxShadow: colors.shadow,
                }}
            >
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div
                            className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ background: GRADIENT, color: '#ffffff', boxShadow: `0 4px 12px #f9731640` }}
                        >
                            <Sparkles size={28} />
                        </div>

                        <div>
                            <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>
                                Planos iUser
                            </h3>
                            <p className="text-sm mt-1" style={{ color: colors.textPrimary }}>
                                {userId
                                    ? activeCount > 0
                                        ? `Você já tem ${activeCount} plano${activeCount > 1 ? 's' : ''} ativo${activeCount > 1 ? 's' : ''}. Veja o que mais dá pra liberar.`
                                        : 'Assine pra virar motorista, prestador, lojista ou recrutador na plataforma.'
                                    : 'Entre pra ver quais planos já tem e o que ainda falta liberar.'}
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={() => router.push('/planos')}
                        className="flex items-center justify-center gap-2 px-6 py-3 rounded-full font-bold text-sm transition-all shadow-lg whitespace-nowrap hover:scale-105 active:scale-95 flex-shrink-0"
                        style={{
                            background: GRADIENT,
                            color: '#ffffff',
                            border: 'none',
                            boxShadow: `0 4px 12px #f9731640`,
                        }}
                    >
                        <Sparkles size={16} />
                        Ver planos
                    </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-5">
                    {ITEMS.map(({ key, icon: Icon, label }) => {
                        const active = !loading && status[key]
                        return (
                            <div
                                key={key}
                                className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
                                style={{
                                    background: active ? '#22c55e20' : `${colors.border}30`,
                                    border: `1px solid ${active ? '#22c55e60' : colors.border}`,
                                }}
                            >
                                <Icon size={15} style={{ color: active ? '#16a34a' : colors.textSecondary, flexShrink: 0 }} />
                                <span
                                    className="text-[11px] font-bold flex-1 truncate"
                                    style={{ color: active ? '#16a34a' : colors.textSecondary }}
                                >
                                    {label}
                                </span>
                                {active ? (
                                    <CheckCircle2 size={14} style={{ color: '#16a34a', flexShrink: 0 }} />
                                ) : (
                                    <Circle size={14} style={{ color: colors.textSecondary, opacity: 0.4, flexShrink: 0 }} />
                                )}
                            </div>
                        )
                    })}
                </div>
            </div>
        </section>
    )
}
