// src/components/SacolaButton.tsx
'use client'

import { ShoppingCart, Clock, ChefHat, CheckCircle2, Star } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTheme } from '@/app/theme'

interface StatusCounts {
    pending: number
    preparing: number
    ready: number
    reviews: number
}

interface SacolaButtonProps {
    totalItems: number
    statusCounts?: StatusCounts
    animate?: boolean
    onClick?: () => void
}

export default function SacolaButton({ totalItems, statusCounts, animate = false, onClick }: SacolaButtonProps) {
    const router = useRouter()
    const { colors } = useTheme()

    const handleClick = () => {
        if (onClick) {
            onClick()
        } else {
            router.push('/sacola')
        }
    }

    const showStatus =
        statusCounts &&
        (statusCounts.pending > 0 ||
            statusCounts.preparing > 0 ||
            statusCounts.ready > 0 ||
            statusCounts.reviews > 0)

    return (
        <button
            onClick={handleClick}
            style={{
                background: `linear-gradient(135deg, ${colors.accent}, ${colors.accent}dd)`,
                color: colors.accentText,
                border: 'none',
                borderRadius: 32,
                padding: '16px 28px',
                fontWeight: 800,
                fontSize: 18,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                boxShadow: `0 12px 40px ${colors.accent}80`,
                cursor: 'pointer',
                transition: 'transform 0.2s',
                position: 'relative',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.05)')}
            onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        >
            <ShoppingCart size={24} />
            Sacola

            {/* Badge de itens no canto superior direito */}
            {totalItems > 0 && (
                <span
                    style={{
                        position: 'absolute',
                        top: -6,
                        right: -6,
                        minWidth: 22,
                        height: 22,
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 10,
                        fontWeight: 800,
                        background: '#10b981',
                        color: '#ffffff',
                        border: '2px solid #ffffff',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                        transform: animate ? 'scale(1.3)' : 'scale(1)',
                        transition: 'transform 0.2s ease',
                        padding: '0 4px',
                    }}
                >
                    {totalItems}
                </span>
            )}

            {/* Status badges centralizados na parte inferior do botão */}
            {showStatus && (
                <div
                    style={{
                        position: 'absolute',
                        bottom: -10,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        display: 'flex',
                        gap: 4,
                        justifyContent: 'center',
                        flexWrap: 'nowrap',
                    }}
                >
                    {statusCounts.pending > 0 && (
                        <span style={{
                            background: '#3b82f6',
                            color: 'white',
                            borderRadius: 999,
                            padding: '2px 8px',
                            fontSize: 10,
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 3,
                            lineHeight: '16px',
                            border: '2px solid #ffffff',
                            boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                        }}>
                            <Clock size={10} /> {statusCounts.pending}
                        </span>
                    )}
                    {statusCounts.preparing > 0 && (
                        <span style={{
                            background: '#eab308',
                            color: 'white',
                            borderRadius: 999,
                            padding: '2px 8px',
                            fontSize: 10,
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 3,
                            lineHeight: '16px',
                            border: '2px solid #ffffff',
                            boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                        }}>
                            <ChefHat size={10} /> {statusCounts.preparing}
                        </span>
                    )}
                    {statusCounts.ready > 0 && (
                        <span style={{
                            background: '#a855f7',
                            color: 'white',
                            borderRadius: 999,
                            padding: '2px 8px',
                            fontSize: 10,
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 3,
                            lineHeight: '16px',
                            border: '2px solid #ffffff',
                            boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                        }}>
                            <CheckCircle2 size={10} /> {statusCounts.ready}
                        </span>
                    )}
                    {statusCounts.reviews > 0 && (
                        <span style={{
                            background: '#000000ff',
                            color: '#ffffff',
                            borderRadius: 999,
                            padding: '2px 8px',
                            fontSize: 10,
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 3,
                            lineHeight: '16px',
                            border: '2px solid #ffffff',
                            boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                        }}>
                            <Star size={10} color="#ffe600ff" /> {statusCounts.reviews}
                        </span>
                    )}
                </div>
            )}
        </button>
    )
}