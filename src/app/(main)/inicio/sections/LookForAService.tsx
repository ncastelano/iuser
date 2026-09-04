// src/app/(main)/inicio/sections/LookForAService.tsx
'use client'

import { ReactNode, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Briefcase, MapPin } from 'lucide-react'
import { useTheme } from '@/app/theme'
import {
    BoardItem,
    fetchOpenBoardItems,
    getItemAddress,
    getItemIcon,
    getItemLabel,
    itemKey,
    relativeTime,
} from '@/lib/serviceBoard'

// ===== GRADIENTE FIXO LARANJA-VERMELHO =====
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

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

interface LookForAServiceProps {
    dragHandle?: ReactNode
    onBreveStatusChange?: (isBreve: boolean) => void
}

export default function LookForAService({ dragHandle, onBreveStatusChange }: LookForAServiceProps) {
    const { colors } = useTheme()
    const router = useRouter()
    const [openItems, setOpenItems] = useState<BoardItem[]>([])

    useEffect(() => {
        onBreveStatusChange?.(false)
    }, [onBreveStatusChange])

    useEffect(() => {
        fetchOpenBoardItems(10).then(setOpenItems).catch(() => setOpenItems([]))
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

    return (
        <section>
            <div
                className="rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4 relative"
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
                        <Briefcase size={28} />
                    </div>

                    <div>
                        <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>
                            Pedidos de serviço abertos
                        </h3>
                        <p className="text-sm mt-1" style={{ color: colors.textSecondary }}>
                            Candidate-se e comece a ganhar dinheiro
                        </p>
                    </div>
                </div>

                <button
                    onClick={() => router.push('/procurar-servico')}
                    className="flex items-center justify-center gap-2 px-6 py-3 rounded-full font-bold text-sm transition-all shadow-lg whitespace-nowrap hover:scale-105 active:scale-95"
                    style={buttonStyle}
                >
                    <Briefcase size={16} />
                    ver serviços
                </button>
            </div>

            {openItems.length > 0 && (
                <div className="flex gap-3 overflow-x-auto pb-1 pt-3 -mx-1 px-1 scrollbar-hide">
                    {openItems.map((item) => {
                        const Icon = getItemIcon(item)
                        return (
                            <button
                                key={itemKey(item)}
                                onClick={() => router.push('/procurar-servico')}
                                className="text-left rounded-2xl p-3 flex-shrink-0 w-48 transition-transform hover:scale-[1.02]"
                                style={{
                                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                                    backdropFilter: 'blur(12px)',
                                    WebkitBackdropFilter: 'blur(12px)',
                                    border: `1px solid ${colors.border}`,
                                    boxShadow: colors.shadow,
                                }}
                            >
                                <div className="flex items-center gap-2">
                                    <div
                                        className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                                        style={{ background: GRADIENT, color: '#ffffff' }}
                                    >
                                        <Icon size={14} />
                                    </div>
                                    <span className="text-xs font-black truncate flex-1" style={{ color: colors.textPrimary }}>
                                        {getItemLabel(item)}
                                    </span>
                                </div>
                                <span className="flex items-center gap-1 text-[10px] mt-1.5" style={{ color: colors.textSecondary }}>
                                    <MapPin size={10} className="flex-shrink-0" />
                                    <span className="truncate">{getItemAddress(item)}</span>
                                </span>
                                <span className="text-[9px] mt-1 block" style={{ color: colors.textSecondary }}>
                                    {relativeTime(item.created_at)}
                                </span>
                            </button>
                        )
                    })}
                </div>
            )}
        </section>
    )
}
