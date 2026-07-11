// src/app/(main)/ButtonCreateStoreHome.tsx
'use client'

import { useRouter } from 'next/navigation'
import { Store, Sparkles } from 'lucide-react'
import { useTheme } from '@/app/theme'

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

interface ButtonCreateStoreHomeProps {
    profileSlug?: string | null
    loading?: boolean
    onClick?: () => void
}

export default function ButtonCreateStoreHome({
    profileSlug,
    loading,
    onClick,
}: ButtonCreateStoreHomeProps) {
    const router = useRouter()
    const { colors } = useTheme()

    const handleClick = () => {
        if (profileSlug && !loading) {
            router.push('/criar-loja')
        } else {
            onClick?.()
        }
    }

    const surfaceRgb = hexToRgb(colors.surface)

    return (
        <div
            className="rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4"
            style={{
                background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                border: `1px solid ${colors.border}`,
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
            }}
        >
            <div className="flex items-center gap-4">
                {/* Ícone da loja com gradiente do accent */}
                <div
                    className="w-14 h-14 rounded-xl flex items-center justify-center"
                    style={{
                        background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})`,
                        color: colors.accentText,
                    }}
                >
                    <Store size={28} />
                </div>
                <div>
                    <h3
                        className="text-lg font-black"
                        style={{ color: colors.textPrimary }}
                    >
                        Tenha sua própria loja no iUser
                    </h3>
                    <p className="text-sm mt-1" style={{ color: colors.textSecondary }}>
                        Venda produtos, gerencie serviços e conquiste clientes.
                    </p>
                </div>
            </div>
            <button
                onClick={handleClick}
                className="px-6 py-3 rounded-full font-bold text-sm flex items-center gap-2 transition-all hover:scale-105 active:scale-95 shadow-lg"
                style={{
                    background: colors.accent,
                    color: colors.accentText,
                    boxShadow: `0 4px 14px ${colors.accent}60`,
                }}
            >
                <Sparkles size={16} />
                Criar minha loja
            </button>
        </div>
    )
}