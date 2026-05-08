// components/LoadingSpinner.tsx

import AnimatedBackground from '@/components/AnimatedBackground'
import { useEffect, useState, useRef } from 'react'

type LoadingSpinnerProps = {
    message?: string
    showDots?: boolean
}

export function LoadingSpinner({ message = 'Carregando...', showDots = true }: LoadingSpinnerProps) {
    const [mounted, setMounted] = useState(false)

    // Estado para controlar quais bolinhas crescem/diminuem
    const [scaleStates, setScaleStates] = useState({
        orbit1: [false, false, false],
        orbit2: [false, false, false],
        orbit3: [false],
    })

    // Estado para controlar as travessias aleatórias
    const [crossStates, setCrossStates] = useState({
        vertical: { active: true, direction: 1, size: 1, offset: 0, duration: 3 },
        horizontal: { active: true, direction: 1, size: 1, offset: 0, duration: 3 },
        diagonal: { active: true, direction: 1, size: 1, offset: 0, duration: 3 },
    })

    // Pre-computar velocidades no primeiro render do cliente
    const speedsRef = useRef({
        vertical: 3,
        horizontal: 3,
        diagonal: 3,
    })

    useEffect(() => {
        setMounted(true)

        // Calcular velocidades apenas no cliente
        speedsRef.current = {
            vertical: 2 + Math.random() * 2,
            horizontal: 2 + Math.random() * 2,
            diagonal: 2 + Math.random() * 2,
        }

        const randomizeScales = () => {
            setScaleStates({
                orbit1: [
                    Math.random() > 0.5,
                    Math.random() > 0.5,
                    Math.random() > 0.5,
                ],
                orbit2: [
                    Math.random() > 0.5,
                    Math.random() > 0.5,
                    Math.random() > 0.5,
                ],
                orbit3: [
                    Math.random() > 0.5,
                ],
            })

            // Escolher 0, 1 ou 2 bolinhas para passar na frente
            const frontCount = Math.floor(Math.random() * 3)
            const allCrosses = ['vertical', 'horizontal', 'diagonal']
            const shuffled = allCrosses.sort(() => Math.random() - 0.5)
            const activeCrosses = shuffled.slice(0, frontCount)

            // Novas velocidades
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

    // Não renderizar nada até o cliente estar pronto (evita hidratação)
    if (!mounted) return null

    return (
        <div className="min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-yellow-50 flex items-center justify-center relative overflow-hidden">
            <AnimatedBackground />

            <div className="relative z-10 flex flex-col items-center gap-8">
                {/* Container principal com efeito de flutuação */}
                <div className="relative animate-[float_3s_ease-in-out_infinite]">
                    {/* Órbita 1 - Externa (3 bolinhas) */}
                    <div className="absolute inset-0 w-32 h-32 -m-6 animate-[spin_4s_linear_infinite]">
                        <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 bg-orange-500 rounded-full shadow-lg shadow-orange-500/50 transition-all duration-700 ${scaleStates.orbit1[0] ? 'scale-[2.5]' : 'scale-100'}`} />
                        <div className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-red-500 rounded-full shadow-lg shadow-red-500/50 transition-all duration-700 ${scaleStates.orbit1[1] ? 'scale-[3]' : 'scale-100'}`} />
                        <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-amber-500 rounded-full shadow-lg shadow-amber-500/50 transition-all duration-700 ${scaleStates.orbit1[2] ? 'scale-[2]' : 'scale-100'}`} />
                    </div>

                    {/* Órbita 2 - Média reversa (3 bolinhas) */}
                    <div className="absolute inset-0 w-28 h-28 -m-4 animate-[spin_5s_linear_infinite_reverse]">
                        <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-yellow-500 rounded-full shadow-lg shadow-yellow-500/50 transition-all duration-700 ${scaleStates.orbit2[0] ? 'scale-[2.5]' : 'scale-100'}`} />
                        <div className={`absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-orange-600 rounded-full shadow-lg shadow-orange-600/50 transition-all duration-700 ${scaleStates.orbit2[1] ? 'scale-[0.3]' : 'scale-100'}`} />
                        <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-rose-400 rounded-full shadow-lg shadow-rose-400/50 transition-all duration-700 ${scaleStates.orbit2[2] ? 'scale-[3]' : 'scale-100'}`} />
                    </div>

                    {/* Órbita 3 - Interna (1 bolinha) */}
                    <div className="absolute inset-0 w-24 h-24 -m-2 animate-[spin_3.5s_linear_infinite]">
                        <div className={`absolute top-0 right-0 w-1.5 h-1.5 bg-orange-400 rounded-full shadow-lg shadow-orange-400/50 transition-all duration-700 ${scaleStates.orbit3[0] ? 'scale-[2.5]' : 'scale-100'}`} />
                    </div>

                    {/* Container do ícone com gradiente */}
                    <div className="relative z-10">
                        {/* Efeito de brilho atrás do ícone */}
                        <div className="absolute inset-0 w-20 h-20 bg-gradient-to-r from-orange-500 to-red-500 rounded-full blur-xl opacity-50 animate-[pulse_2s_ease-in-out_infinite]" />

                        {/* Ícone principal */}
                        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-orange-400 via-orange-500 to-red-600 flex items-center justify-center relative shadow-[0_0_30px_rgba(251,146,60,0.4),0_0_60px_rgba(239,68,68,0.2)] ring-2 ring-white/80 ring-offset-2 ring-offset-orange-50">
                            <img
                                src="/logo.png"
                                alt="iUser"
                                className="h-10 w-10 object-contain rounded-full drop-shadow-lg relative z-20"
                            />
                        </div>
                    </div>

                    {/* Bolinhas que atravessam na frente da logo (z-30) */}
                    {crossStates.vertical.active && (
                        <div
                            className="absolute inset-0 flex items-center justify-center overflow-hidden z-30 pointer-events-none"
                            style={{
                                transform: `translateX(${crossStates.vertical.offset}px)`,
                            }}
                        >
                            <div
                                className="w-1.5 h-1.5 bg-gradient-to-b from-orange-400 to-red-500 rounded-full shadow-lg shadow-orange-500/50 transition-all duration-700"
                                style={{
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
                            style={{
                                transform: `translateY(${crossStates.horizontal.offset}px)`,
                            }}
                        >
                            <div
                                className="w-1.5 h-1.5 bg-gradient-to-r from-yellow-400 to-amber-500 rounded-full shadow-lg shadow-yellow-500/50 transition-all duration-700"
                                style={{
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
                            style={{
                                transform: `translate(${crossStates.diagonal.offset}px, ${-crossStates.diagonal.offset}px)`,
                            }}
                        >
                            <div
                                className="w-1.5 h-1.5 bg-gradient-to-br from-rose-400 to-red-500 rounded-full shadow-lg shadow-rose-500/50 transition-all duration-700"
                                style={{
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