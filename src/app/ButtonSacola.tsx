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
        <div style={{ position: 'relative', width: 56, height: 56, display: 'inline-flex' }}>
            <button
                onClick={handleClick}
                className="w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-transform duration-200 hover:scale-110 active:scale-95"
                style={{
                    background: `linear-gradient(135deg, ${colors.accent}, ${colors.accent}dd)`,
                    color: colors.accentText,
                    border: `2px solid ${colors.border}`,
                    boxShadow: `0 8px 24px ${colors.accent}60`,
                    position: 'relative',
                    width: '100%',
                    height: '100%',
                }}
                aria-label="Ir para a sacola"
            >
                <ShoppingCart size={24} />

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
            </button>

            {/* Badges de status posicionados absolutamente abaixo do botão */}
            {showStatus && (
                <div
                    style={{
                        position: 'absolute',
                        top: '100%',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        marginTop: 4,
                        display: 'flex',
                        gap: 4,
                        whiteSpace: 'nowrap',
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
        </div>
    )
}