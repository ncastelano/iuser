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
    totalValue?: number
    statusCounts?: StatusCounts
    animate?: boolean
    onClick?: () => void
}

export default function SacolaButton({
    totalItems,
    totalValue,
    statusCounts,
    animate = false,
    onClick
}: SacolaButtonProps) {
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

    const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

    return (
        <div style={{ position: 'relative', width: 56, height: 56, display: 'inline-flex' }}>
            <button
                onClick={handleClick}
                className="w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-transform duration-200 hover:scale-110 active:scale-95"
                style={{
                    background: GRADIENT,
                    color: '#ffffff',
                    borderTop: '2px solid #f97316',
                    borderRight: '2px solid #f97316',
                    borderBottom: '2px solid #f97316',
                    borderLeft: '2px solid #f97316',
                    boxShadow: `0 8px 24px #f9731660`,
                    position: 'relative',
                    width: '100%',
                    height: '100%',
                }}
                aria-label="Ir para a sacola"
            >
                <ShoppingCart size={24} />

                {totalItems > 0 && (
                    <div
                        style={{
                            position: 'absolute',
                            top: -6,
                            left: '50%',
                            transform: 'translateX(-50%)',
                            display: 'flex',
                            gap: 2,
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 'auto',
                            maxWidth: 'calc(100% + 16px)',
                        }}
                    >
                        {/* Badge - Quantidade (REDONDO) */}
                        <span
                            style={{
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
                                borderTop: '2px solid #ffffff',
                                borderRight: '2px solid #ffffff',
                                borderBottom: '2px solid #ffffff',
                                borderLeft: '2px solid #ffffff',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                                transform: animate ? 'scale(1.3)' : 'scale(1)',
                                transition: 'transform 0.2s ease',
                                padding: '0 6px',
                                flexShrink: 0,
                            }}
                        >
                            {totalItems}
                        </span>

                        {/* Badge - Valor Total (REDONDO) */}
                        {totalValue && totalValue > 0 && (
                            <span
                                style={{
                                    minWidth: 22,
                                    height: 22,
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: 8,
                                    fontWeight: 700,
                                    background: '#10b981',
                                    color: '#ffffff',
                                    borderTop: '2px solid #ffffff',
                                    borderRight: '2px solid #ffffff',
                                    borderBottom: '2px solid #ffffff',
                                    borderLeft: '2px solid #ffffff',
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                                    padding: '0 6px',
                                    lineHeight: 1,
                                    transform: animate ? 'scale(1.2)' : 'scale(1)',
                                    transition: 'transform 0.2s ease 0.1s',
                                    whiteSpace: 'nowrap',
                                    flexShrink: 0,
                                }}
                            >
                                R${totalValue.toFixed(0)}
                            </span>
                        )}
                    </div>
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
                            borderTop: '2px solid #ffffff',
                            borderRight: '2px solid #ffffff',
                            borderBottom: '2px solid #ffffff',
                            borderLeft: '2px solid #ffffff',
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
                            borderTop: '2px solid #ffffff',
                            borderRight: '2px solid #ffffff',
                            borderBottom: '2px solid #ffffff',
                            borderLeft: '2px solid #ffffff',
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
                            borderTop: '2px solid #ffffff',
                            borderRight: '2px solid #ffffff',
                            borderBottom: '2px solid #ffffff',
                            borderLeft: '2px solid #ffffff',
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
                            borderTop: '2px solid #ffffff',
                            borderRight: '2px solid #ffffff',
                            borderBottom: '2px solid #ffffff',
                            borderLeft: '2px solid #ffffff',
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