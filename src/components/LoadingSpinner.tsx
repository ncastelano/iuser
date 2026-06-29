'use client'

import { useEffect, useState, useRef } from 'react'
import { useTheme } from '@/app/theme'

type LoadingSpinnerProps = {
    message?: string
    showDots?: boolean
    background?: string   // opcional: força uma cor de fundo (ex: "black")
}

const adjustBrightness = (hex: string, percent: number): string => {
    const num = parseInt(hex.replace('#', ''), 16)
    const r = Math.min(255, Math.max(0, (num >> 16) + percent))
    const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + percent))
    const b = Math.min(255, Math.max(0, (num & 0x0000ff) + percent))
    return `#${(1 << 24 | (r << 16) | (g << 8) | b).toString(16).slice(1)}`
}

const fallbackColors = {
    surface: '#f9fafb',
    textSecondary: '#4b5563',
    accent: '#f97316',
    accentLight: '#fdba74',
    background: '#ffffff',
}

export function LoadingSpinner({ message = 'Carregando...', showDots = true, background }: LoadingSpinnerProps) {
    const { colors: themeColors } = useTheme()
    const [mounted, setMounted] = useState(false)

    // Garante cores válidas mesmo antes da hidratação
    const colors = themeColors ?? fallbackColors
    const { textSecondary, accent, accentLight, background: themeBackground } = colors

    const [scaleStates, setScaleStates] = useState({
        orbit1: [false, false, false],
        orbit2: [false, false, false],
        orbit3: [false],
    })

    const [crossStates, setCrossStates] = useState({
        vertical: { active: true, direction: 1, size: 1, offset: 0, duration: 3 },
        horizontal: { active: true, direction: 1, size: 1, offset: 0, duration: 3 },
        diagonal: { active: true, direction: 1, size: 1, offset: 0, duration: 3 },
    })

    const speedsRef = useRef({
        vertical: 3,
        horizontal: 3,
        diagonal: 3,
    })

    useEffect(() => {
        setMounted(true)

        speedsRef.current = {
            vertical: 2 + Math.random() * 2,
            horizontal: 2 + Math.random() * 2,
            diagonal: 2 + Math.random() * 2,
        }

        const randomizeScales = () => {
            setScaleStates({
                orbit1: [Math.random() > 0.5, Math.random() > 0.5, Math.random() > 0.5],
                orbit2: [Math.random() > 0.5, Math.random() > 0.5, Math.random() > 0.5],
                orbit3: [Math.random() > 0.5],
            })

            const allCrosses = ['vertical', 'horizontal', 'diagonal']
            const shuffled = allCrosses.sort(() => Math.random() - 0.5)
            const activeCrosses = shuffled.slice(0, Math.floor(Math.random() * 3))

            speedsRef.current = {
                vertical: 2 + Math.random() * 2,
                horizontal: 2 + Math.random() * 2,
                diagonal: 2 + Math.random() * 2,
            }

            setCrossStates({
                vertical: {
                    active: activeCrosses.includes('vertical'),
                    direction: Math.random() > 0.5 ? 1 : -1,
                    size: Math.random() > 0.5 ? 2.5 : 0.4,
                    offset: Math.random() * 30 - 15,
                    duration: speedsRef.current.vertical,
                },
                horizontal: {
                    active: activeCrosses.includes('horizontal'),
                    direction: Math.random() > 0.5 ? 1 : -1,
                    size: Math.random() > 0.5 ? 2.5 : 0.4,
                    offset: Math.random() * 30 - 15,
                    duration: speedsRef.current.horizontal,
                },
                diagonal: {
                    active: activeCrosses.includes('diagonal'),
                    direction: Math.random() > 0.5 ? 1 : -1,
                    size: Math.random() > 0.5 ? 2.5 : 0.4,
                    offset: Math.random() * 30 - 15,
                    duration: speedsRef.current.diagonal,
                },
            })
        }

        randomizeScales()
        const interval = setInterval(randomizeScales, 3000)
        return () => clearInterval(interval)
    }, [])

    if (!mounted) return null

    // Define o fundo: se 'background' for passado, usa-o; senão, usa o fundo do tema
    const bgStyle = background
        ? { background }
        : { background: themeBackground }

    // Cores derivadas do tema
    const primaryParticle = accent
    const secondaryParticle = accentLight
    const darkerAccent = adjustBrightness(accent, -30)
    const lighterAccent = adjustBrightness(accent, 40)

    return (
        <div className="min-h-screen flex items-center justify-center relative overflow-hidden" style={bgStyle}>
            <div className="relative z-10 flex flex-col items-center gap-8">
                {/* Animação orbital + logo */}
                <div className="relative animate-[float_3s_ease-in-out_infinite]">
                    {/* Órbitas */}
                    <div className="absolute inset-0 w-32 h-32 -m-6 animate-[spin_4s_linear_infinite]">
                        <div
                            className={`absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full transition-all duration-700 ${scaleStates.orbit1[0] ? 'scale-[2.5]' : 'scale-100'}`}
                            style={{ background: primaryParticle, boxShadow: `0 0 10px ${primaryParticle}80` }}
                        />
                        <div
                            className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full transition-all duration-700 ${scaleStates.orbit1[1] ? 'scale-[3]' : 'scale-100'}`}
                            style={{ background: darkerAccent, boxShadow: `0 0 10px ${darkerAccent}80` }}
                        />
                        <div
                            className={`absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full transition-all duration-700 ${scaleStates.orbit1[2] ? 'scale-[2]' : 'scale-100'}`}
                            style={{ background: secondaryParticle, boxShadow: `0 0 10px ${secondaryParticle}80` }}
                        />
                    </div>

                    <div className="absolute inset-0 w-28 h-28 -m-4 animate-[spin_5s_linear_infinite_reverse]">
                        <div
                            className={`absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full transition-all duration-700 ${scaleStates.orbit2[0] ? 'scale-[2.5]' : 'scale-100'}`}
                            style={{ background: lighterAccent, boxShadow: `0 0 10px ${lighterAccent}80` }}
                        />
                        <div
                            className={`absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full transition-all duration-700 ${scaleStates.orbit2[1] ? 'scale-[0.3]' : 'scale-100'}`}
                            style={{ background: primaryParticle, boxShadow: `0 0 10px ${primaryParticle}80` }}
                        />
                        <div
                            className={`absolute top-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full transition-all duration-700 ${scaleStates.orbit2[2] ? 'scale-[3]' : 'scale-100'}`}
                            style={{ background: darkerAccent, boxShadow: `0 0 10px ${darkerAccent}80` }}
                        />
                    </div>

                    <div className="absolute inset-0 w-24 h-24 -m-2 animate-[spin_3.5s_linear_infinite]">
                        <div
                            className={`absolute top-0 right-0 w-1.5 h-1.5 rounded-full transition-all duration-700 ${scaleStates.orbit3[0] ? 'scale-[2.5]' : 'scale-100'}`}
                            style={{ background: secondaryParticle, boxShadow: `0 0 10px ${secondaryParticle}80` }}
                        />
                    </div>

                    {/* Ícone central */}
                    <div className="relative z-10">
                        <div
                            className="absolute inset-0 w-20 h-20 rounded-full blur-xl opacity-50 animate-[pulse_2s_ease-in-out_infinite]"
                            style={{
                                background: `linear-gradient(135deg, ${primaryParticle}, ${darkerAccent})`,
                            }}
                        />
                        <div
                            className="w-20 h-20 rounded-full flex items-center justify-center relative ring-2 ring-white/80 ring-offset-2 ring-offset-orange-50"
                            style={{
                                background: `linear-gradient(135deg, ${primaryParticle}, ${darkerAccent})`,
                                boxShadow: `0 0 30px ${primaryParticle}66, 0 0 60px ${darkerAccent}33`,
                            }}
                        >
                            <img
                                src="/logotransparente.png"
                                alt="iUser"
                                className="h-10 w-10 object-contain rounded-full drop-shadow-lg relative z-20"
                            />
                        </div>
                    </div>

                    {/* Bolinhas que atravessam */}
                    {crossStates.vertical.active && (
                        <div
                            className="absolute inset-0 flex items-center justify-center overflow-hidden z-30 pointer-events-none"
                            style={{ transform: `translateX(${crossStates.vertical.offset}px)` }}
                        >
                            <div
                                className="w-1.5 h-1.5 rounded-full transition-all duration-700"
                                style={{
                                    background: primaryParticle,
                                    boxShadow: `0 0 10px ${primaryParticle}80`,
                                    animationName: 'crossVertical',
                                    animationDuration: `${crossStates.vertical.duration}s`,
                                    animationTimingFunction: 'ease-in-out',
                                    animationIterationCount: 'infinite',
                                    animationDirection: crossStates.vertical.direction === 1 ? 'normal' : 'reverse',
                                    transform: `scale(${crossStates.vertical.size})`,
                                }}
                            />
                        </div>
                    )}
                    {crossStates.horizontal.active && (
                        <div
                            className="absolute inset-0 flex items-center justify-center overflow-hidden z-30 pointer-events-none"
                            style={{ transform: `translateY(${crossStates.horizontal.offset}px)` }}
                        >
                            <div
                                className="w-1.5 h-1.5 rounded-full transition-all duration-700"
                                style={{
                                    background: secondaryParticle,
                                    boxShadow: `0 0 10px ${secondaryParticle}80`,
                                    animationName: 'crossHorizontal',
                                    animationDuration: `${crossStates.horizontal.duration}s`,
                                    animationTimingFunction: 'ease-in-out',
                                    animationIterationCount: 'infinite',
                                    animationDirection: crossStates.horizontal.direction === 1 ? 'normal' : 'reverse',
                                    transform: `scale(${crossStates.horizontal.size})`,
                                }}
                            />
                        </div>
                    )}
                    {crossStates.diagonal.active && (
                        <div
                            className="absolute inset-0 flex items-center justify-center overflow-hidden z-30 pointer-events-none"
                            style={{ transform: `translate(${crossStates.diagonal.offset}px, ${-crossStates.diagonal.offset}px)` }}
                        >
                            <div
                                className="w-1.5 h-1.5 rounded-full transition-all duration-700"
                                style={{
                                    background: darkerAccent,
                                    boxShadow: `0 0 10px ${darkerAccent}80`,
                                    animationName: 'crossDiagonal',
                                    animationDuration: `${crossStates.diagonal.duration}s`,
                                    animationTimingFunction: 'ease-in-out',
                                    animationIterationCount: 'infinite',
                                    animationDirection: crossStates.diagonal.direction === 1 ? 'normal' : 'reverse',
                                    transform: `scale(${crossStates.diagonal.size})`,
                                }}
                            />
                        </div>
                    )}
                </div>

                {/* Mensagem de texto */}
                {message && (
                    <p className="text-sm font-bold animate-pulse" style={{ color: textSecondary }}>
                        {message}
                    </p>
                )}
            </div>

            <style jsx>{`
                @keyframes float {
                    0%, 100% { transform: translateY(0px); }
                    50% { transform: translateY(-10px); }
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                @keyframes spin_reverse {
                    from { transform: rotate(360deg); }
                    to { transform: rotate(0deg); }
                }
                @keyframes pulse {
                    0%, 100% { opacity: 0.5; transform: scale(1); }
                    50% { opacity: 0.8; transform: scale(1.1); }
                }
                @keyframes crossVertical {
                    0% { transform: translateY(-50px); opacity: 0; }
                    20% { opacity: 1; }
                    80% { opacity: 1; }
                    100% { transform: translateY(50px); opacity: 0; }
                }
                @keyframes crossHorizontal {
                    0% { transform: translateX(-50px); opacity: 0; }
                    20% { opacity: 1; }
                    80% { opacity: 1; }
                    100% { transform: translateX(50px); opacity: 0; }
                }
                @keyframes crossDiagonal {
                    0% { transform: translate(-35px, -35px); opacity: 0; }
                    20% { opacity: 1; }
                    80% { opacity: 1; }
                    100% { transform: translate(35px, 35px); opacity: 0; }
                }
            `}</style>
        </div>
    )
}